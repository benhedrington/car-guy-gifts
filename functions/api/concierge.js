/**
 * Gift Concierge API — /api/concierge
 *
 * POST { message, history? } → streaming JSON cards
 *
 * Phase 2 feature — the LLM-powered conversational gift finder.
 * For now, this is a simple search proxy that takes natural language,
 * extracts a query, and returns curated product cards.
 *
 * When we wire in an LLM (Anthropic/OpenAI/Workers AI), this endpoint
 * will stream a conversation that calls search_catalog iteratively.
 */

import { CatalogClient } from "../../lib/catalog-client.js";
import { curate } from "../../lib/heuristics.js";

const CATALOG_ENDPOINT = "https://catalog.shopify.com/api/ucp/mcp";
const UCP_PROFILE = "https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json";

// Very simple query extraction — replaced by LLM in phase 2
function extractQuery(message) {
  // Strip gift-irrelevant words, keep the car-relevant core
  let q = message
    .toLowerCase()
    .replace(/gifts? for/g, "")
    .replace(/my (brother|dad|son|husband|boyfriend|uncle|friend)/g, "")
    .replace(/who (has|owns|loves|drives)/g, "")
    .replace(/\b(gift|present|idea|something)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Add "gift" back to help the catalog prioritize gift-relevant results
  if (q.length < 10) q = "car enthusiast gift";
  return q + " gift";
}

export async function onRequestPost({ request, env }) {
  try {
    const { message } = await request.json();

    if (!message) {
      return json({ error: "Message required" }, 400);
    }

    const client = new CatalogClient({
      endpoint: env.SHOPIFY_CATALOG_ENDPOINT || CATALOG_ENDPOINT,
      profileUrl: env.UCP_PROFILE_URL || UCP_PROFILE,
    });

    const query = extractQuery(message);
    const result = await client.search(query, { country: "US" });
    const curated = curate(result, { usOnly: true });

    // For now, return structured cards. Phase 2: stream LLM conversation.
    return json({
      query,
      products: curated.slice(0, 12).map((p) => ({
        id: p.id,
        title: p.title,
        price: p.price?.display,
        image: p.image,
        rating: p.rating?.value,
        rating_count: p.rating?.count,
        seller: p.seller?.name,
        gift_score: p.gift_score,
        checkout_url: `/api/checkout/${encodeURIComponent(p.id)}`,
      })),
      count: curated.length,
      note:
        "Phase 1: keyword extraction. Phase 2 will add LLM-powered conversation.",
    });
  } catch (err) {
    console.error("Concierge error:", err);
    return json({ error: "Internal error", detail: err.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}