import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db } from "@workspace/db";
import { businessesTable, contentTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { detectSearchIntent, researchBusiness } from "./web-research";

export interface ChatResult {
  reply: string;
  updatedFields: Record<string, string | null>;
  sourcesUsed?: string[];
  webSearched?: boolean;
}

const FIELD_NAMES = [
  "founderName",
  "founderBio",
  "standoutProduct",
  "productDescription",
  "businessDescription",
  "location",
  "madeInSA",
  "callToAction",
  "websiteUrl",
];

export async function chatWithContent(
  contentId: number,
  message: string,
  currentContent: Record<string, unknown>
): Promise<ChatResult> {
  const [content] = await db.select().from(contentTable).where(eq(contentTable.id, contentId));
  const [business] = content
    ? await db.select().from(businessesTable).where(eq(businessesTable.id, content.businessId))
    : [undefined];

  const businessContext = business
    ? `Business: ${business.name}${business.website ? ` | Website: ${business.website}` : ""}${business.province ? ` | Province: ${business.province}` : ""}${business.industry ? ` | Industry: ${business.industry}` : ""}${business.notes ? ` | Notes: ${business.notes}` : ""}`
    : "";

  const contentSnapshot = Object.entries(currentContent)
    .filter(([k]) => FIELD_NAMES.includes(k))
    .map(([k, v]) => `${k}: ${v ?? "(empty)"}`)
    .join("\n");

  // Decide whether to do live web research
  const shouldSearch = detectSearchIntent(message);
  let webContext = "";
  let sourcesUsed: string[] = [];

  if (shouldSearch && business) {
    logger.info({ contentId, businessName: business.name }, "Doing live web research for chat");
    const websiteUrl = (currentContent.websiteUrl as string | null | undefined)
      ?? business.website
      ?? null;
    const research = await researchBusiness(business.name, websiteUrl, message);
    webContext = research.context;
    sourcesUsed = research.sourcesUsed;
  }

  const systemPrompt = `You are a content editor assistant for a South African business content platform.
You help refine and improve content about South African businesses.
You have deep knowledge of South African businesses, entrepreneurs, and culture.

${businessContext}

Current content fields:
${contentSnapshot}
${webContext ? `\n\n--- LIVE WEB DATA (use this to correct or enrich the content) ---\n${webContext}\n--- END WEB DATA ---` : ""}

The user will ask you to improve, correct, or research specific fields.
You MUST respond with valid JSON in this exact format:
{
  "reply": "A friendly 1-2 sentence explanation of what you changed or found",
  "updatedFields": {
    "fieldName": "new value or null to clear"
  }
}

Only include fields in updatedFields that you are actually changing.
Available field names: founderName, founderBio, standoutProduct, productDescription, businessDescription, location, madeInSA, callToAction, websiteUrl
If you have no changes to make (e.g. answering a question), return an empty updatedFields object {}.
${webContext ? "You have access to live web data above — use it to give accurate, factual answers. Cite when data came from the web." : ""}
Never invent facts you're not confident about — say so in the reply instead.`;

  logger.info({ contentId, message, webSearched: shouldSearch }, "AI chat request");

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: message }],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonMatch[0]) as { reply: string; updatedFields: Record<string, string | null> };
    logger.info({ contentId, updatedFields: Object.keys(parsed.updatedFields), webSearched: shouldSearch }, "AI chat responded");

    return {
      reply: parsed.reply,
      updatedFields: parsed.updatedFields,
      sourcesUsed: sourcesUsed.length > 0 ? sourcesUsed : undefined,
      webSearched: shouldSearch,
    };
  } catch (err) {
    logger.error({ err, contentId }, "AI chat failed");
    return {
      reply: "Sorry, I couldn't process that request. Please try again.",
      updatedFields: {},
    };
  }
}
