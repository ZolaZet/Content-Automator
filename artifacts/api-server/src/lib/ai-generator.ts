import { db } from "@workspace/db";
import { businessesTable, contentTable, notificationsTable, activityTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
  const businesses = await db.select().from(businessesTable);
  const contentHistory = await db
    .select({ businessId: contentTable.businessId })
    .from(contentTable);

  // A business is a one-time content subject. This also catches older
  // rejected entries created before rejecting one marked the business skipped.
  const processedIds = new Set(contentHistory.map((row) => row.businessId));
  const pending = businesses.filter(
    (business) => business.status === "pending" && !processedIds.has(business.id),
  );

  // Prefer a business found live on the web. The existing pending list remains
  // a safe fallback if web discovery is temporarily unavailable.
  const discovered = await discoverNewBusiness(
    businesses.map((business) => ({
      name: business.name,
      website: business.website,
    })),
  );

  if (discovered) {
    const [created] = await db
      .insert(businessesTable)
      .values({
        name: discovered.name,
        website: discovered.website,
        province: discovered.province,
        industry: discovered.industry,
        status: "pending",
      })
      .returning();

    if (created) {
      await db.insert(activityTable).values({
        type: "business_discovered",
        description: `New business discovered online: ${created.name}`,
      });
      logger.info({ businessId: created.id, businessName: created.name }, "Discovered a new business online");
      return created.id;
    }
  }

  if (pending.length > 0) {
    const next = pending[0];
    logger.warn(
      { businessId: next.id, businessName: next.name },
      "Online discovery unavailable, using an unprocessed pending business",
    );
    return next.id;
  }

  logger.warn(
    { processedCount: processedIds.size, businessCount: businesses.length },
    "No new businesses available for content generation",
  );
  return null;
}

interface DiscoverableBusiness {
  name: string;
  website: string | null;
  province: string | null;
  industry: string | null;
}

function normalizeBusinessName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeWebsite(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    return new URL(website).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return website.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

async function discoverNewBusiness(
  knownBusinesses: Array<{ name: string; website?: string | null }>,
): Promise<DiscoverableBusiness | null> {
  const knownNames = new Set(knownBusinesses.map((business) => normalizeBusinessName(business.name)));
  const knownWebsites = new Set(
    knownBusinesses
      .map((business) => normalizeWebsite(business.website))
      .filter((website): website is string => !!website),
  );
  const excludedList = knownBusinesses.map((business) => business.name).join(", ");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const prompt = `Find one real South African business that makes, grows, designs, or sells locally made products.

Use live web search and choose a business with a public website or other reliable public sources. Do not choose any business in this exclusion list, including close name variants:
${excludedList || "(none)"}

This is discovery attempt ${attempt + 1}. Look for a different candidate if a likely result is already in the list. Prefer an independent or distinctive South African business rather than a large generic multinational.

Return ONLY one valid JSON object with exactly these fields:
{
  "name": "official business name",
  "website": "official HTTPS website URL or null",
  "province": "South African province or null",
  "industry": "short industry label or null"
}`;

    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 2048,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: [{ type: "web_search_20250305", name: "web_search" }] as any,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) continue;

      const candidate = JSON.parse(match[0]) as Partial<DiscoverableBusiness>;
      if (!candidate.name || typeof candidate.name !== "string") continue;

      const candidateName = normalizeBusinessName(candidate.name);
      const candidateWebsite = typeof candidate.website === "string" ? candidate.website : null;
      const candidateHostname = normalizeWebsite(candidateWebsite);
      if (knownNames.has(candidateName) || (candidateHostname && knownWebsites.has(candidateHostname))) {
        knownNames.add(candidateName);
        if (candidateHostname) knownWebsites.add(candidateHostname);
        continue;
      }

      return {
        name: candidate.name.trim(),
        website: candidateWebsite,
        province: typeof candidate.province === "string" ? candidate.province.trim() : null,
        industry: typeof candidate.industry === "string" ? candidate.industry.trim() : null,
      };
    } catch (err) {
      logger.warn({ err, attempt: attempt + 1 }, "Online business discovery failed");
    }
  }

  return null;
}
