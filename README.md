# Car Guy Gifts

AI-powered gift concierge for car enthusiasts. Aggregates products from Shopify merchants via the Global Catalog MCP, curates them for the "gifts for car guys" niche, and serves static gift guide pages on Cloudflare Pages with live checkout resolution at the edge.

## Architecture

```
Shopify Global Catalog MCP (catalog.shopify.com)
        ↓
  Nightly Build (Cron Trigger)
    → search_catalog for each gift guide query
    → curate with niche heuristics (US merchants, gift scoring)
    → write static HTML to /public
        ↓
  Cloudflare Pages (static, global CDN)
    → Gift guide pages (free, fast, SEO-friendly)
    → /api/checkout/:upid (Pages Function → get_product → 302 redirect)
    → /api/concierge (Pages Function → search + curate, LLM in phase 2)
```

## Project Structure

```
functions/                    Cloudflare Pages Functions (edge runtime)
  api/
    checkout/[upid].js        Live checkout redirect via MCP get_product
    concierge.js              Gift concierge API (phase 2: LLM-powered)
build/
  nightly.js                  Build script: queries → MCP search → static HTML
lib/
  catalog-client.js           Shopify Global Catalog MCP JSON-RPC client
  heuristics.js               Niche curation: gift scoring, filtering, categorizing
  queries.yaml                Curated gift guide queries
public/                       Static output (auto-deployed by Cloudflare Pages)
  .well-known/ucp/
    agent-profile.json        UCP agent profile (required by Shopify MCP)
  styles.css
  index.html + *.html         Generated gift guide pages
wrangler.toml                 Cloudflare config (KV, Cron, bindings)
package.json
```

## Development

```bash
npm install
npm run build                 # Generate static pages from live Shopify catalog
npm run dev                   # Local dev server (wrangler pages dev)
```

## Deployment

1. Push to GitHub
2. Connect repo to Cloudflare Pages
3. Set build command: `npm run build`
4. Set output directory: `public`
5. Create KV namespace: `wrangler kv:namespace create PRODUCT_CACHE`
6. Update `wrangler.toml` with the KV namespace ID
7. Add Cron Trigger for nightly rebuilds

## Phases

- **Phase 1 (current)**: Static gift guides + live checkout redirect ✅
- **Phase 2**: LLM-powered concierge (natural language gift finder)
- **Phase 3**: User accounts, saved gift lists, affiliate integration
- **Phase 4**: Additional niches (cyclists, runners, etc.)

## Tech Stack

- Cloudflare Pages + Pages Functions (Workers runtime)
- Shopify Global Catalog MCP (UCP-compliant)
- KV for edge caching
- Vanilla HTML/CSS (no framework needed for MVP)