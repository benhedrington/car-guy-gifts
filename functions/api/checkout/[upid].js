/**
 * Checkout Redirect — /api/checkout/:upid
 *
 * Calls Shopify Global Catalog get_product to resolve the live checkout URL
 * for the selected product/variant, then redirects the buyer to the merchant.
 *
 * This is the ONLY dynamic call on the gift-guide path — 95%+ of page views
 * are static HTML. This runs only when someone clicks "Get this gift".
 */

const CATALOG_ENDPOINT = "https://catalog.shopify.com/api/ucp/mcp";
const UCP_PROFILE = "https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json";

export async function onRequestGet({ params, env }) {
  const upid = decodeURIComponent(params.upid);

  if (!upid) {
    return new Response("Missing product ID", { status: 400 });
  }

  try {
    // Check KV cache first (cached checkout URLs expire after 1 hour)
    const cacheKey = `checkout:${upid}`;
    const cached = await env.PRODUCT_CACHE?.get(cacheKey, "json");
    if (cached?.checkout_url) {
      console.log(`Cache hit for ${upid}`);
      return Response.redirect(cached.checkout_url, 302);
    }

    // Call Shopify Global Catalog MCP — get_product
    const body = {
      jsonrpc: "2.0",
      method: "tools/call",
      id: 1,
      params: {
        name: "get_product",
        arguments: {
          meta: {
            "ucp-agent": {
              profile: env.UCP_PROFILE_URL || UCP_PROFILE,
            },
          },
          catalog: {
            ids: [upid],
            context: { address_country: "US" },
          },
        },
      },
    };

    const res = await fetch(env.SHOPIFY_CATALOG_ENDPOINT || CATALOG_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return new Response(`Catalog error: ${res.status}`, { status: 502 });
    }

    const json = await res.json();

    if (json.error) {
      return new Response(`Catalog error: ${json.error.message}`, { status: 502 });
    }

    // Extract checkout URL from the first available variant
    const product = json.result?.structuredContent?.products?.[0];
    const variant =
      product?.variants?.find((v) => v.availability?.available) || product?.variants?.[0];

    if (!variant?.checkout_url) {
      // Fallback to product URL if no checkout URL
      if (variant?.url) {
        return Response.redirect(variant.url, 302);
      }
      return new Response("Product no longer available", { status: 404 });
    }

    // Cache the checkout URL for 1 hour (prices/availability can change)
    if (env.PRODUCT_CACHE) {
      await env.PRODUCT_CACHE.put(
        cacheKey,
        JSON.stringify({
          checkout_url: variant.checkout_url,
          cached_at: Date.now(),
        }),
        { expirationTtl: 3600 }
      );
    }

    return Response.redirect(variant.checkout_url, 302);
  } catch (err) {
    console.error("Checkout redirect error:", err);
    return new Response("Internal error", { status: 500 });
  }
}