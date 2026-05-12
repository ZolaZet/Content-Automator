import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db } from "@workspace/db";
import { businessesTable, contentTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export interface ChatResult {
  reply: string;
  updatedFields: Record<string, string | null>;
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

  const systemPrompt = `You are a content editor assistant for a South African business content platform. 
You help refine and improve content about South African businesses.
You have deep knowledge of South African businesses, entrepreneurs, and culture.

${businessContext}

Current content fields:
${contentSnapshot}

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
Never invent facts you're not confident about — say so in the reply instead.`;

  logger.info({ contentId, message }, "AI chat request");

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

    const parsed = JSON.parse(jsonMatch[0]) as ChatResult;
    logger.info({ contentId, updatedFields: Object.keys(parsed.updatedFields) }, "AI chat responded");
    return parsed;
  } catch (err) {
    logger.error({ err, contentId }, "AI chat failed");
    return {
      reply: "Sorry, I couldn't process that request. Please try again.",
      updatedFields: {},
    };
  }
}
