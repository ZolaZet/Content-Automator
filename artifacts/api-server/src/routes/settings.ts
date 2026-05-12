import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateSettingsBody, TestSupabaseConnectionBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

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

function buildSettingsResponse(settings: Awaited<ReturnType<typeof ensureSettings>>) {
  return {
    notificationEmail: settings.notificationEmail ?? null,
    supabaseUrl: settings.supabaseUrl ?? null,
    supabaseTableName: settings.supabaseTableName ?? null,
    dailyScheduleTime: settings.dailyScheduleTime ?? null,
    emailNotificationsEnabled: settings.emailNotificationsEnabled,
    supabaseConfigured: !!(settings.supabaseUrl && settings.supabaseAnonKey),
  };
}

router.get("/settings", async (_req, res) => {
  const settings = await ensureSettings();
  res.json(buildSettingsResponse(settings));
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

  res.json(buildSettingsResponse(updated));
});

// Test a Supabase connection before saving
router.post("/settings/test-supabase", async (req, res) => {
  const parsed = TestSupabaseConnectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ connected: false, error: "Invalid request body" });
    return;
  }

  const { supabaseUrl, supabaseAnonKey } = parsed.data;

  try {
    // Normalize URL – strip trailing slashes
    const base = supabaseUrl.replace(/\/+$/, "");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const testRes = await fetch(`${base}/rest/v1/`, {
      signal: controller.signal,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    });
    clearTimeout(timer);

    // Supabase returns 200 (or 400 for missing table, but still reachable) when credentials are valid
    // 401 means invalid key; anything else means connectivity issue
    if (testRes.status === 401) {
      res.json({ connected: false, error: "Invalid API key — check your Supabase Anon Key" });
      return;
    }

    // Extract the project ref from the URL (https://<ref>.supabase.co)
    let projectRef: string | null = null;
    try {
      const hostname = new URL(base).hostname; // e.g. xyzabc.supabase.co
      projectRef = hostname.split(".")[0] ?? null;
    } catch {
      // ignore parse errors
    }

    logger.info({ projectRef, status: testRes.status }, "Supabase connection test succeeded");
    res.json({ connected: true, projectRef });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection failed";
    logger.warn({ err }, "Supabase connection test failed");
    res.json({ connected: false, error: msg.includes("abort") ? "Connection timed out" : msg });
  }
});

export default router;
