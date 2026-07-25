/**
 * Shopify Global Catalog MCP Client
 *
 * Wraps the UCP-compliant JSON-RPC endpoint at catalog.shopify.com/api/ucp/mcp.
 * All methods return plain JS objects (the `result.structuredContent` from the RPC response).
 */

const DEFAULT_ENDPOINT = "https://catalog.shopify.com/api/ucp/mcp";

// Shopify's public test profile — works for development.
// In production, this points to our own agent profile at /.well-known/ucp/.
const DEFAULT_PROFILE =
  "https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json";

export class CatalogClient {
  constructor({ endpoint = DEFAULT_ENDPOINT, profileUrl = DEFAULT_PROFILE } = {}) {
    this.endpoint = endpoint;
    this.profileUrl = profileUrl;
  }

  async _call(toolName, args) {
    const body = {
      jsonrpc: "2.0",
      method: "tools/call",
      id: 1,
      params: {
        name: toolName,
        arguments: {
          meta: {
            "ucp-agent": { profile: this.profileUrl },
          },
          ...args,
        },
      },
    };

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`MCP HTTP ${res.status}: ${await res.text()}`);
    }

    const json = await res.json();

    if (json.error) {
      throw new Error(
        `MCP error ${json.error.code}: ${json.error.message} — ${JSON.stringify(json.error.data)}`
      );
    }

    return json.result?.structuredContent ?? null;
  }

  /**
   * Search products across all Shopify merchants.
   * @param {string} query - Free-text search ("Jeep Wrangler gifts under $50")
   * @param {object} opts - { country, limit, like }
   */
  async search(query, opts = {}) {
    const catalog = { query };

    if (opts.country) {
      catalog.context = { address_country: opts.country };
    }
    if (opts.like) {
      catalog.like = opts.like;
    }

    const result = await this._call("search_catalog", { catalog });
    return result;
  }

  /**
   * Look up specific products/variants by ID.
   * @param {string[]} ids - Product GIDs or variant GIDs
   */
  async lookup(ids) {
    const result = await this._call("lookup_catalog", {
      catalog: { ids },
    });
    return result;
  }

  /**
   * Get full product details with variant selection.
   * @param {string} id - Product or variant GID
   */
  async getProduct(id, opts = {}) {
    const catalog = { ids: [id] };

    if (opts.country) {
      catalog.context = { address_country: opts.country };
    }

    const result = await this._call("get_product", { catalog });
    return result;
  }
}