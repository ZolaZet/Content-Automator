import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "./logger";

const FETCH_TIMEOUT_MS = 8000;
const MAX_CONTENT_CHARS = 6000;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

export interface WebResearchResult {
  sourcesUsed: string[];
  context: string;
}

export async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SAContentHub/1.0)" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    const text = stripHtml(html);
    return text.slice(0, MAX_CONTENT_CHARS);
  } catch (err) {
    logger.warn({ err, url }, "Failed to fetch page");
    return null;
  }
}

interface DDGResult {
  Abstract?: string;
  AbstractSource?: string;
  AbstractURL?: string;
  RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
}

export async function searchDuckDuckGo(query: string): Promise<{ answer: string; urls: string[] }> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { answer: "", urls: [] };
    const data = await res.json() as DDGResult;

    const parts: string[] = [];
    const urls: string[] = [];

    if (data.Abstract) {
      parts.push(`Summary: ${data.Abstract}`);
      if (data.AbstractURL) urls.push(data.AbstractURL);
    }

    const topics = (data.RelatedTopics ?? []).slice(0, 4);
    for (const t of topics) {
      if (t.Text) parts.push(`• ${t.Text}`);
      if (t.FirstURL) urls.push(t.FirstURL);
    }

    return { answer: parts.join("\n"), urls };
  } catch (err) {
    logger.warn({ err, query }, "DuckDuckGo search failed");
    return { answer: "", urls: [] };
  }
}

export function detectSearchIntent(message: string): boolean {
  const lower = message.toLowerCase();
  const keywords = [
    "find", "search", "look up", "lookup", "fetch", "get", "check",
    "what is", "who is", "where is", "what are", "tell me about",
    "website", "url", "address", "phone", "contact", "latest",
    "current", "real", "actual", "correct", "verify", "confirm",
    "research", "information about", "info on", "details about",
  ];
  return keywords.some(k => lower.includes(k));
}

interface WebSearchToolResultContent {
  type: "web_search_result";
  url?: string;
  title?: string;
  encrypted_content?: string;
}

interface WebSearchToolResultBlock {
  type: "web_search_tool_result";
  tool_use_id: string;
  content: WebSearchToolResultContent[];
}

/**
 * Research a business using Claude's built-in web search tool.
 * Returns a structured summary with sources, suitable for injecting into a generation prompt.
 */
export async function researchBusinessWithAI(
  businessName: string,
  website?: string | null,
): Promise<WebResearchResult> {
  const websiteHint = website ? ` (website: ${website})` : "";
  const prompt = `Research the South African business "${businessName}"${websiteHint}.

Find and summarise:
1. The founder's full name and their background / founding story
2. Their most notable or standout products / services with specific names
3. Their city and province location
4. What makes them uniquely South African — heritage, community impact, craft
5. A brief description of their business mission

Provide accurate, specific, factual information from reliable sources. Be concise.`;

  try {
    logger.info({ businessName }, "Running AI web research before content generation");

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ type: "web_search_20250305", name: "web_search" }] as any,
      messages: [{ role: "user", content: prompt }],
    });

    const sourcesUsed: string[] = [];
    const textParts: string[] = [];

    for (const block of response.content) {
      if (block.type === "web_search_tool_result") {
        const searchBlock = block as unknown as WebSearchToolResultBlock;
        for (const r of searchBlock.content ?? []) {
          if (r.url && !sourcesUsed.includes(r.url)) {
            sourcesUsed.push(r.url);
          }
        }
      } else if (block.type === "text") {
        textParts.push(block.text);
      }
    }

    const context = textParts.join("\n").trim();
    logger.info({ businessName, sourcesCount: sourcesUsed.length, contextLength: context.length }, "AI web research complete");

    return { sourcesUsed, context };
  } catch (err) {
    logger.warn({ err, businessName }, "AI web research failed, falling back to DuckDuckGo");
    return researchBusiness(businessName, website);
  }
}

export async function researchBusiness(
  businessName: string,
  websiteUrl?: string | null,
  extraQuery?: string
): Promise<WebResearchResult> {
  const sourcesUsed: string[] = [];
  const contextParts: string[] = [];

  if (websiteUrl) {
    logger.info({ url: websiteUrl }, "Fetching business website");
    const pageText = await fetchPage(websiteUrl);
    if (pageText && pageText.length > 100) {
      contextParts.push(`=== Content from ${websiteUrl} ===\n${pageText}`);
      sourcesUsed.push(websiteUrl);
    }
  }

  const searchQuery = extraQuery
    ? `${businessName} South Africa ${extraQuery}`
    : `${businessName} South Africa`;

  logger.info({ query: searchQuery }, "Searching DuckDuckGo");
  const { answer, urls } = await searchDuckDuckGo(searchQuery);
  if (answer) {
    contextParts.push(`=== Web search results for "${searchQuery}" ===\n${answer}`);
    urls.forEach(u => { if (!sourcesUsed.includes(u)) sourcesUsed.push(u); });
  }

  return {
    sourcesUsed,
    context: contextParts.join("\n\n"),
  };
}
