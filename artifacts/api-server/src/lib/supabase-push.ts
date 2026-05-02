import { db } from "@workspace/db";
import { settingsTable, contentTable, businessesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export interface SupabasePushPayload {
  business_name: string;
  founder_name: string | null;
  founder_bio: string | null;
  standout_product: string | null;
  product_description: string | null;
  business_description: string | null;
  location: string | null;
  made_in_sa: string | null;
  call_to_action: string | null;
  website_url: string | null;
  scheduled_date: string | null;
  published_at: string;
}

export async function pushToSupabase(contentId: number): Promise<boolean> {
  const [settings] = await db.select().from(settingsTable);

  if (!settings?.supabaseUrl || !settings?.supabaseAnonKey || !settings?.supabaseTableName) {
    logger.warn({ contentId }, "Supabase not configured, skipping push");
    return false;
  }

  const [content] = await db.select().from(contentTable).where(eq(contentTable.id, contentId));
  if (!content) {
    logger.warn({ contentId }, "Content not found for Supabase push");
    return false;
  }

  const [business] = await db.select().from(businessesTable).where(eq(businessesTable.id, content.businessId));

  const payload: SupabasePushPayload = {
    business_name: business?.name ?? "Unknown",
    founder_name: content.founderName ?? null,
    founder_bio: content.founderBio ?? null,
    standout_product: content.standoutProduct ?? null,
    product_description: content.productDescription ?? null,
    business_description: content.businessDescription ?? null,
    location: content.location ?? null,
    made_in_sa: content.madeInSA ?? null,
    call_to_action: content.callToAction ?? null,
    website_url: content.websiteUrl ?? null,
    scheduled_date: content.scheduledDate ?? null,
    published_at: new Date().toISOString(),
  };

  const url = `${settings.supabaseUrl.replace(/\/$/, "")}/rest/v1/${settings.supabaseTableName}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": settings.supabaseAnonKey,
        "Authorization": `Bearer ${settings.supabaseAnonKey}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error({ contentId, status: response.status, body }, "Supabase push failed");
      return false;
    }

    logger.info({ contentId, table: settings.supabaseTableName }, "Pushed content to Supabase successfully");
    return true;
  } catch (err) {
    logger.error({ err, contentId }, "Supabase push threw an error");
    return false;
  }
}
