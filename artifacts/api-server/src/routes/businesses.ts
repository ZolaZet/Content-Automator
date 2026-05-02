import { Router } from "express";
import { db } from "@workspace/db";
import { businessesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListBusinessesQueryParams,
  CreateBusinessBody,
  UpdateBusinessParams,
  UpdateBusinessBody,
  GetBusinessParams,
  DeleteBusinessParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/businesses", async (req, res) => {
  const query = ListBusinessesQueryParams.safeParse(req.query);
  const status = query.success ? query.data.status : undefined;

  const rows = status
    ? await db.select().from(businessesTable).where(eq(businessesTable.status, status))
    : await db.select().from(businessesTable);

  res.json(
    rows.map((b) => ({
      id: b.id,
      name: b.name,
      website: b.website ?? null,
      province: b.province ?? null,
      industry: b.industry ?? null,
      notes: b.notes ?? null,
      status: b.status,
      addedAt: b.addedAt,
    }))
  );
});

router.post("/businesses", async (req, res) => {
  const parsed = CreateBusinessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [created] = await db
    .insert(businessesTable)
    .values({ ...parsed.data, status: "pending" })
    .returning();

  res.status(201).json({
    id: created.id,
    name: created.name,
    website: created.website ?? null,
    province: created.province ?? null,
    industry: created.industry ?? null,
    notes: created.notes ?? null,
    status: created.status,
    addedAt: created.addedAt,
  });
});

router.get("/businesses/:id", async (req, res) => {
  const params = GetBusinessParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [row] = await db.select().from(businessesTable).where(eq(businessesTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({
    id: row.id,
    name: row.name,
    website: row.website ?? null,
    province: row.province ?? null,
    industry: row.industry ?? null,
    notes: row.notes ?? null,
    status: row.status,
    addedAt: row.addedAt,
  });
});

router.patch("/businesses/:id", async (req, res) => {
  const params = UpdateBusinessParams.safeParse({ id: Number(req.params.id) });
  const body = UpdateBusinessBody.safeParse(req.body);

  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (body.data.name !== undefined) updates.name = body.data.name;
  if (body.data.website !== undefined) updates.website = body.data.website;
  if (body.data.province !== undefined) updates.province = body.data.province;
  if (body.data.industry !== undefined) updates.industry = body.data.industry;
  if (body.data.notes !== undefined) updates.notes = body.data.notes;
  if (body.data.status !== undefined) updates.status = body.data.status;

  const [updated] = await db
    .update(businessesTable)
    .set(updates)
    .where(eq(businessesTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({
    id: updated.id,
    name: updated.name,
    website: updated.website ?? null,
    province: updated.province ?? null,
    industry: updated.industry ?? null,
    notes: updated.notes ?? null,
    status: updated.status,
    addedAt: updated.addedAt,
  });
});

router.delete("/businesses/:id", async (req, res) => {
  const params = DeleteBusinessParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  await db.delete(businessesTable).where(eq(businessesTable.id, params.data.id));
  res.status(204).send();
});

export default router;
