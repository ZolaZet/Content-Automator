import { Router } from "express";
import { db } from "@workspace/db";
import {
  contentTable,
  businessesTable,
  notificationsTable,
  activityTable,
  settingsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListContentQueryParams,
  GetContentParams,
  UpdateContentParams,
  UpdateContentBody,
  ApproveContentParams,
  RejectContentParams,
  RejectContentBody,
} from "@workspace/api-zod";
import { generateContentForBusiness, pickNextBusiness, regenerateContentEntry } from "../lib/ai-generator";
import { logger } from "../lib/logger";
import { pushToSupabase } from "../lib/supabase-push";
import { chatWithContent } from "../lib/content-chat";

const router = Router();

function serializeContent(c: typeof contentTable.$inferSelect, businessName: string) {
  return {
    id: c.id,
    businessId: c.businessId,
    businessName,
    founderName: c.founderName ?? null,
    founderBio: c.founderBio ?? null,
    standoutProduct: c.standoutProduct ?? null,
    productDescription: c.productDescription ?? null,
    businessDescription: c.businessDescription ?? null,
    location: c.location ?? null,
    madeInSA: c.madeInSA ?? null,
    callToAction: c.callToAction ?? null,
    websiteUrl: c.websiteUrl ?? null,
    status: c.status,
    rejectionNote: c.rejectionNote ?? null,
    researchSources: c.researchSources ? (JSON.parse(c.researchSources) as string[]) : null,
    generatedAt: c.generatedAt ?? null,
    approvedAt: c.approvedAt ?? null,
    publishedAt: c.publishedAt ?? null,
    scheduledDate: c.scheduledDate ?? null,
  };
}

router.get("/content", async (req, res) => {
  const query = ListContentQueryParams.safeParse(req.query);
  const status = query.success ? query.data.status : undefined;

  const rows = await db.select().from(contentTable);
  const businesses = await db.select().from(businessesTable);
  const bizMap = new Map(businesses.map((b) => [b.id, b.name]));

  const filtered = status ? rows.filter((r) => r.status === status) : rows;

  res.json(
    filtered
      .sort((a, b) => {
        const aTime = a.generatedAt ? new Date(a.generatedAt).getTime() : 0;
        const bTime = b.generatedAt ? new Date(b.generatedAt).getTime() : 0;
        return bTime - aTime;
      })
      .map((c) => serializeContent(c, bizMap.get(c.businessId) ?? "Unknown"))
  );
});

router.get("/content/:id", async (req, res) => {
  const params = GetContentParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [row] = await db.select().from(contentTable).where(eq(contentTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.id, row.businessId));
  res.json(serializeContent(row, biz?.name ?? "Unknown"));
});

router.patch("/content/:id", async (req, res) => {
  const params = UpdateContentParams.safeParse({ id: Number(req.params.id) });
  const body = UpdateContentBody.safeParse(req.body);

  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  // Fetch current row so we know what status to transition from
  const [current] = await db.select().from(contentTable).where(eq(contentTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const updates: Record<string, unknown> = {};
  const d = body.data;
  if (d.founderName !== undefined) updates.founderName = d.founderName;
  if (d.founderBio !== undefined) updates.founderBio = d.founderBio;
  if (d.standoutProduct !== undefined) updates.standoutProduct = d.standoutProduct;
  if (d.productDescription !== undefined) updates.productDescription = d.productDescription;
  if (d.businessDescription !== undefined) updates.businessDescription = d.businessDescription;
  if (d.location !== undefined) updates.location = d.location;
  if (d.madeInSA !== undefined) updates.madeInSA = d.madeInSA;
  if (d.callToAction !== undefined) updates.callToAction = d.callToAction;
  if (d.websiteUrl !== undefined) updates.websiteUrl = d.websiteUrl;

  // Saving content in pending_review moves it to draft
  if (current.status === "pending_review") {
    updates.status = "draft";
  }

  const [updated] = await db
    .update(contentTable)
    .set(updates)
    .where(eq(contentTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.id, updated.businessId));
  res.json(serializeContent(updated, biz?.name ?? "Unknown"));
});

router.post("/content/:id/approve", async (req, res) => {
  const params = ApproveContentParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [row] = await db.select().from(contentTable).where(eq(contentTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.id, row.businessId));

  // Human sign-off only — no Supabase push yet
  const [updated] = await db
    .update(contentTable)
    .set({ status: "approved", approvedAt: new Date() })
    .where(eq(contentTable.id, params.data.id))
    .returning();

  await db.insert(notificationsTable).values({
    title: "Content approved",
    message: `Content for "${biz?.name ?? "business"}" has been approved and is ready to publish.`,
    type: "approved",
    contentId: updated.id,
  });

  await db.insert(activityTable).values({
    type: "content_approved",
    description: `Content approved for ${biz?.name ?? "business"}`,
  });

  res.json(serializeContent(updated, biz?.name ?? "Unknown"));
});

router.post("/content/:id/publish", async (req, res) => {
  const params = ApproveContentParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [row] = await db.select().from(contentTable).where(eq(contentTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.id, row.businessId));

  const [updated] = await db
    .update(contentTable)
    .set({ status: "published", publishedAt: new Date() })
    .where(eq(contentTable.id, params.data.id))
    .returning();

  // Mark the business itself as published so it appears in the Published list
  await db.update(businessesTable)
    .set({ status: "published" })
    .where(eq(businessesTable.id, row.businessId));

  await db.insert(notificationsTable).values({
    title: "Content published",
    message: `Content for "${biz?.name ?? "business"}" has been published.`,
    type: "published",
    contentId: updated.id,
  });

  await db.insert(activityTable).values({
    type: "content_published",
    description: `Content published for ${biz?.name ?? "business"}`,
  });

  // Try to push to Supabase in the background — failure doesn't affect the published status
  pushToSupabase(params.data.id).then(pushed => {
    if (pushed) {
      logger.info({ contentId: params.data.id }, "Content pushed to Supabase successfully");
    }
  }).catch(err => {
    logger.warn({ err, contentId: params.data.id }, "Supabase push failed silently");
  });

  res.json(serializeContent(updated, biz?.name ?? "Unknown"));
});

router.post("/content/:id/reject", async (req, res) => {
  const params = RejectContentParams.safeParse({ id: Number(req.params.id) });
  const body = RejectContentBody.safeParse(req.body ?? {});

  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const note = body.success ? (body.data.note ?? null) : null;

  const [row] = await db.select().from(contentTable).where(eq(contentTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.id, row.businessId));

  const [updated] = await db
    .update(contentTable)
    .set({ status: "rejected", rejectionNote: note })
    .where(eq(contentTable.id, params.data.id))
    .returning();

  await db.insert(notificationsTable).values({
    title: "Content rejected",
    message: `Content for "${biz?.name ?? "business"}" was rejected.${note ? ` Reason: ${note}` : ""}`,
    type: "rejected",
    contentId: updated.id,
  });

  await db.insert(activityTable).values({
    type: "content_rejected",
    description: `Content rejected for ${biz?.name ?? "business"}`,
  });

  res.json(serializeContent(updated, biz?.name ?? "Unknown"));
});

router.delete("/content/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db.select().from(contentTable).where(eq(contentTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  await db.delete(contentTable).where(eq(contentTable.id, id));
  res.status(204).send();
});

router.post("/content/:id/regenerate", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const updated = await regenerateContentEntry(id);
    const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.id, updated.businessId));
    res.json(serializeContent(updated, biz?.name ?? "Unknown"));
  } catch (err) {
    logger.error({ err, id }, "Regeneration failed");
    res.status(500).json({ error: "Regeneration failed" });
  }
});

router.post("/content/:id/chat", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const { message, currentContent } = req.body as { message: string; currentContent?: Record<string, unknown> };
  if (!message) { res.status(400).json({ error: "message is required" }); return; }

  const result = await chatWithContent(id, message, currentContent ?? {});
  res.json(result);
});

router.post("/content/generate", async (req, res) => {
  try {
    const businessId = await pickNextBusiness();
    if (!businessId) {
      res.status(400).json({ error: "No pending businesses available for content generation" });
      return;
    }

    const content = await generateContentForBusiness(businessId);
    const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.id, content.businessId));
    res.json(serializeContent(content, biz?.name ?? "Unknown"));
  } catch (err) {
    logger.error({ err }, "Content generation failed");
    res.status(500).json({ error: "Content generation failed" });
  }
});

export default router;
