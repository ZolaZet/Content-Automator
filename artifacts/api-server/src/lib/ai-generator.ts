import { db } from "@workspace/db";
import { businessesTable, contentTable, notificationsTable, activityTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "./logger";

export async function generateContentForBusiness(businessId: number) {
  const [business] = await db.select().from(businessesTable).where(eq(businessesTable.id, businessId));
  if (!business) {
    throw new Error(`Business ${businessId} not found`);
  }

  const prompt = `You are a content writer for a South African-made products website. Research and write website page content for this South African business. Return ONLY a valid JSON object, no markdown, no explanation.

Business name: ${business.name}
${business.website ? `Website: ${business.website}` : ""}
${business.province ? `Province: ${business.province}` : ""}
${business.industry ? `Industry: ${business.industry}` : ""}
${business.notes ? `Additional notes: ${business.notes}` : ""}

Return this exact JSON structure (all fields as strings, use null if unknown):
{
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

  logger.info({ businessId, businessName: business.name }, "Generating content via AI");

  let parsed: Record<string, string | null>;
  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    parsed = JSON.parse(jsonMatch[0]) as Record<string, string | null>;
  } catch (err) {
    logger.error({ err, businessId }, "AI generation failed, using placeholder content");
    parsed = {
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

  logger.info({ contentId: content.id, businessId }, "Content generated successfully");
  return content;
}

export async function regenerateContentEntry(contentId: number) {
  const [existing] = await db.select().from(contentTable).where(eq(contentTable.id, contentId));
  if (!existing) throw new Error(`Content entry ${contentId} not found`);

  const [business] = await db.select().from(businessesTable).where(eq(businessesTable.id, existing.businessId));
  if (!business) throw new Error(`Business ${existing.businessId} not found`);

  const prompt = `You are a content writer for a South African-made products website. Research and write website page content for this South African business. Return ONLY a valid JSON object, no markdown, no explanation.

Business name: ${business.name}
${business.website ? `Website: ${business.website}` : ""}
${business.province ? `Province: ${business.province}` : ""}
${business.industry ? `Industry: ${business.industry}` : ""}
${business.notes ? `Additional notes: ${business.notes}` : ""}

Return this exact JSON structure (all fields as strings, use null if unknown):
{
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

  logger.info({ contentId, businessId: business.id, businessName: business.name }, "Regenerating content via AI");

  let parsed: Record<string, string | null>;
  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    parsed = JSON.parse(jsonMatch[0]) as Record<string, string | null>;
  } catch (err) {
    logger.error({ err, contentId }, "AI regeneration failed, using placeholder content");
    parsed = {
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
  const today = new Date().toISOString().slice(0, 10);

  const alreadyScheduled = await db
    .select()
    .from(contentTable)
    .where(eq(contentTable.scheduledDate, today));

  if (alreadyScheduled.length > 0) {
    return alreadyScheduled[0].businessId;
  }

  const pending = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.status, "pending"));

  if (pending.length === 0) {
    logger.warn("No pending businesses to generate content for");
    return null;
  }

  const randomBusiness = pending[Math.floor(Math.random() * pending.length)];
  return randomBusiness.id;
}
