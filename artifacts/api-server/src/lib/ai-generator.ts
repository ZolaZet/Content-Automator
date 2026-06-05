import { db } from "@workspace/db";
import { businessesTable, contentTable, notificationsTable, activityTable, settingsTable } from "@workspace/db";
import { eq, notInArray } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "./logger";
import { sendContentReadyEmail } from "./mailer";
import { researchBusinessWithAI } from "./web-research";

const JSON_SCHEMA = `{
  "founderName": "Full name of the business founder",
  "founderBio": "2-3 sentence bio about the founder's story and passion (max 80 words)",
  "standoutProduct": "Name of their most notable/standout product",
  "productDescription": "2-3 sentence description of the standout product and what makes it special (max 80 words)",
  "businessDescription": "2-3 sentence description of the business and its mission (max 80 words)",
  "location": "City and province where the business operates",
  "madeInSA": "One compelling sentence about why buying this South African-made product matters",
  "callToAction": "Short, punchy call to action (max 10 words, e.g. 'Discover their handcrafted collection today')",
  "websiteUrl": "Website URL if known, otherwise null"
}`;

function buildPrompt(
  business: { name: string; website?: string | null; province?: string | null; industry?: string | null; notes?: string | null },
  research: string,
): string {
  const researchSection = research
    ? `\n\n--- LIVE WEB RESEARCH (use this for accurate facts) ---\n${research}\n--- END RESEARCH ---`
    : "";

  return `You are a content writer for a South African-made products website. Write website page content for this South African business. Return ONLY a valid JSON object, no markdown, no explanation.

Business name: ${business.name}
${business.website ? `Website: ${business.website}` : ""}
${business.province ? `Province: ${business.province}` : ""}
${business.industry ? `Industry: ${business.industry}` : ""}
${business.notes ? `Additional notes: ${business.notes}` : ""}${researchSection}

${research ? "Use the live research above for accurate founder names, product names, and descriptions. " : ""}Return this exact JSON structure (all fields as strings, use null if unknown):
${JSON_SCHEMA}`;
}

function buildFallback(
  business: { name: string; website?: string | null; province?: string | null; industry?: string | null },
): Record<string, string | null> {
  return {
    founderName: null,
    founderBio: null,
    standoutProduct: null,
    productDescription: null,
    businessDescription: `${business.name} is a South African business${business.industry ? ` in the ${business.industry} industry` : ""}.`,
    location: business.province ?? null,
    madeInSA: "Proudly South African-made — supporting local entrepreneurs and communities.",
    callToAction: "Discover this proudly South African business today",
    websiteUrl: business.website ?? null,
  };
}

async function callClaude(prompt: string): Promise<Record<string, string | null>> {
  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in response");
  return JSON.parse(jsonMatch[0]) as Record<string, string | null>;
}

export async function generateContentForBusiness(businessId: number) {
  const [business] = await db.select().from(businessesTable).where(eq(businessesTable.id, businessId));
  if (!business) {
    throw new Error(`Business ${businessId} not found`);
  }

  // Step 1: live web research
  let research = "";
  let researchSources: string[] = [];
  try {
    const result = await researchBusinessWithAI(business.name, business.website);
    research = result.context;
    researchSources = result.sourcesUsed;
  } catch (err) {
    logger.warn({ err, businessId }, "Web research failed, proceeding without it");
  }

  // Step 2: generate content using research as context
  logger.info({ businessId, businessName: business.name, hasResearch: !!research }, "Generating content via AI");

  let parsed: Record<string, string | null>;
  try {
    parsed = await callClaude(buildPrompt(business, research));
  } catch (err) {
    logger.error({ err, businessId }, "AI generation failed, using placeholder content");
    parsed = buildFallback(business);
  }

  const today = new Date().toISOString().slice(0, 10);

  const [content] = await db
    .insert(contentTable)
    .values({
      businessId: business.id,
      founderName: parsed.founderName ?? null,
      founderBio: parsed.founderBio ?? null,
      standoutProduct: parsed.standoutProduct ?? null,
      productDescription: parsed.productDescription ?? null,
      businessDescription: parsed.businessDescription ?? null,
      location: parsed.location ?? null,
      madeInSA: parsed.madeInSA ?? null,
      callToAction: parsed.callToAction ?? null,
      websiteUrl: parsed.websiteUrl ?? null,
      researchSources: researchSources.length > 0 ? JSON.stringify(researchSources) : null,
      status: "pending_review",
      scheduledDate: today,
      generatedAt: new Date(),
    })
    .returning();

  await db.insert(notificationsTable).values({
    title: "Content ready for review",
    message: `New content for "${business.name}" is ready for your QA review.`,
    type: "content_ready",
    contentId: content.id,
  });

  await db.insert(activityTable).values({
    type: "content_generated",
    description: `Content generated for ${business.name}`,
  });

  // Send email notification if enabled
  const settingsRows = await db.select().from(settingsTable);
  const settings = settingsRows[0];
  if (settings?.emailNotificationsEnabled && settings.notificationEmail) {
    const appUrl = process.env["APP_URL"] ?? `https://${process.env["REPLIT_DEV_DOMAIN"] ?? "localhost"}`;
    await sendContentReadyEmail({
      to: settings.notificationEmail,
      businessName: business.name,
      contentId: content.id,
      appUrl,
    });
  }

  logger.info({ contentId: content.id, businessId }, "Content generated successfully");
  return content;
}

export async function regenerateContentEntry(contentId: number) {
  const [existing] = await db.select().from(contentTable).where(eq(contentTable.id, contentId));
  if (!existing) throw new Error(`Content entry ${contentId} not found`);

  const [business] = await db.select().from(businessesTable).where(eq(businessesTable.id, existing.businessId));
  if (!business) throw new Error(`Business ${existing.businessId} not found`);

  // Step 1: live web research
  let research = "";
  let researchSources: string[] = [];
  try {
    const result = await researchBusinessWithAI(business.name, business.website);
    research = result.context;
    researchSources = result.sourcesUsed;
  } catch (err) {
    logger.warn({ err, contentId }, "Web research failed, proceeding without it");
  }

  logger.info({ contentId, businessId: business.id, businessName: business.name, hasResearch: !!research }, "Regenerating content via AI");

  let parsed: Record<string, string | null>;
  try {
    parsed = await callClaude(buildPrompt(business, research));
  } catch (err) {
    logger.error({ err, contentId }, "AI regeneration failed, using placeholder content");
    parsed = buildFallback(business);
  }

  const [updated] = await db
    .update(contentTable)
    .set({
      founderName: parsed.founderName ?? null,
      founderBio: parsed.founderBio ?? null,
      standoutProduct: parsed.standoutProduct ?? null,
      productDescription: parsed.productDescription ?? null,
      businessDescription: parsed.businessDescription ?? null,
      location: parsed.location ?? null,
      madeInSA: parsed.madeInSA ?? null,
      callToAction: parsed.callToAction ?? null,
      websiteUrl: parsed.websiteUrl ?? null,
      researchSources: researchSources.length > 0 ? JSON.stringify(researchSources) : null,
      status: "pending_review",
      rejectionNote: null,
      generatedAt: new Date(),
      approvedAt: null,
      publishedAt: null,
    })
    .where(eq(contentTable.id, contentId))
    .returning();

  await db.insert(activityTable).values({
    type: "content_generated",
    description: `Content regenerated for ${business.name}`,
  });

  logger.info({ contentId }, "Content regenerated successfully");
  return updated;
}

export async function pickNextBusiness(): Promise<number | null> {
  // Find businesses that already have content sitting in the review queue.
  // We don't want to generate a second batch for a business that hasn't been
  // reviewed yet — wait until it is approved or rejected first.
  const awaitingReview = await db
    .select({ businessId: contentTable.businessId })
    .from(contentTable)
    .where(eq(contentTable.status, "pending_review"));

  const blockedIds = awaitingReview.map(r => r.businessId);

  const available = blockedIds.length > 0
    ? await db
        .select()
        .from(businessesTable)
        .where(
          notInArray(businessesTable.id, blockedIds)
        )
    : await db
        .select()
        .from(businessesTable);

  // Only pick from businesses that are in "pending" status
  const pending = available.filter(b => b.status === "pending");

  if (pending.length === 0) {
    logger.warn({ blockedCount: blockedIds.length }, "No pending businesses available — all are either awaiting review or already published");
    return null;
  }

  // Pick the next one in order (oldest first so we work through the list sequentially)
  const next = pending[0];
  return next.id;
}
