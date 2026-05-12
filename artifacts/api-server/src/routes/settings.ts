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

    // Extract the project ref from the URL (https://<ref>.supabase.co)
    let projectRef: string | null = null;
    try {
      const hostname = new URL(base).hostname; // e.g. xyzabc.supabase.co
      projectRef = hostname.split(".")[0] ?? null;
    } catch {
      res.json({ connected: false, error: "Invalid Project URL — it should look like https://abcxyz.supabase.co" });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    // Use /auth/v1/settings — always accessible with the anon (publishable) key on any Supabase project
    const testRes = await fetch(`${base}/auth/v1/settings`, {
      signal: controller.signal,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    });
    clearTimeout(timer);

    logger.info({ projectRef, status: testRes.status }, "Supabase connection test result");

    if (testRes.status === 401 || testRes.status === 403) {
      // Try to get more detail from the response body
      let detail = "";
      try {
        const body = await testRes.json() as { message?: string };
        detail = body.message ? `: ${body.message}` : "";
      } catch { /* ignore */ }
      res.json({
        connected: false,
        error: `Invalid API key${detail}. Use the 'anon' / 'publishable' key from Supabase → Settings → API, not the service_role secret.`,
      });
      return;
    }

    if (testRes.status === 404) {
      res.json({ connected: false, error: "Project not found — check your Project URL" });
      return;
    }

    if (!testRes.ok && testRes.status !== 400) {
      res.json({ connected: false, error: `Unexpected response from Supabase (HTTP ${testRes.status})` });
      return;
    }

    res.json({ connected: true, projectRef });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection failed";
    logger.warn({ err }, "Supabase connection test failed");
    const friendly = msg.toLowerCase().includes("abort")
      ? "Connection timed out — check your Project URL"
      : msg.toLowerCase().includes("fetch")
      ? "Could not reach Supabase — check your Project URL"
      : msg;
    res.json({ connected: false, error: friendly });
  }
});

export default router;
