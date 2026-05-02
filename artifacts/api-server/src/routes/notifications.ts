import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListNotificationsQueryParams,
  MarkNotificationReadParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/notifications", async (req, res) => {
  const query = ListNotificationsQueryParams.safeParse(req.query);
  const unread = query.success ? query.data.unread : undefined;

  const rows = unread === true
    ? await db.select().from(notificationsTable).where(eq(notificationsTable.read, false))
    : await db.select().from(notificationsTable);

  res.json(
    rows
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        read: n.read,
        contentId: n.contentId ?? null,
        createdAt: n.createdAt,
      }))
  );
});

router.post("/notifications/:id/read", async (req, res) => {
  const params = MarkNotificationReadParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [updated] = await db
    .update(notificationsTable)
    .set({ read: true })
    .where(eq(notificationsTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({
    id: updated.id,
    title: updated.title,
    message: updated.message,
    type: updated.type,
    read: updated.read,
    contentId: updated.contentId ?? null,
    createdAt: updated.createdAt,
  });
});

export default router;
