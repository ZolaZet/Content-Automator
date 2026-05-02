import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateSettingsBody } from "@workspace/api-zod";

const router = Router();

async function ensureSettings() {
  const rows = await db.select().from(settingsTable);
  if (rows.length === 0) {
    const [created] = await db.insert(settingsTable).values({
      emailNotificationsEnabled: false,
      dailyScheduleTime: "08:00",
    }).returning();
    return created;
  }
  return rows[0];
}

router.get("/settings", async (_req, res) => {
  const settings = await ensureSettings();
  res.json({
    notificationEmail: settings.notificationEmail ?? null,
    supabaseUrl: settings.supabaseUrl ?? null,
    supabaseTableName: settings.supabaseTableName ?? null,
    dailyScheduleTime: settings.dailyScheduleTime ?? null,
    emailNotificationsEnabled: settings.emailNotificationsEnabled,
  });
});

router.put("/settings", async (req, res) => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const current = await ensureSettings();
  const updates: Record<string, unknown> = {};
  const data = parsed.data;

  if (data.notificationEmail !== undefined) updates.notificationEmail = data.notificationEmail;
  if (data.supabaseUrl !== undefined) updates.supabaseUrl = data.supabaseUrl;
  if (data.supabaseAnonKey !== undefined) updates.supabaseAnonKey = data.supabaseAnonKey;
  if (data.supabaseTableName !== undefined) updates.supabaseTableName = data.supabaseTableName;
  if (data.dailyScheduleTime !== undefined) updates.dailyScheduleTime = data.dailyScheduleTime;
  if (data.emailNotificationsEnabled !== undefined) updates.emailNotificationsEnabled = data.emailNotificationsEnabled;

  const [updated] = await db
    .update(settingsTable)
    .set(updates)
    .where(eq(settingsTable.id, current.id))
    .returning();

  res.json({
    notificationEmail: updated.notificationEmail ?? null,
    supabaseUrl: updated.supabaseUrl ?? null,
    supabaseTableName: updated.supabaseTableName ?? null,
    dailyScheduleTime: updated.dailyScheduleTime ?? null,
    emailNotificationsEnabled: updated.emailNotificationsEnabled,
  });
});

export default router;
