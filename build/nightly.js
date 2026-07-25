/**
 * Nightly Build Script
 *
 * Runs each curated query against the Shopify Global Catalog MCP,
 * curates results, and writes static HTML gift guide pages.
 *
 * Usage:
 *   node build/nightly.js           # build all guides from queries.yaml
 *   node build/nightly.js --slug=jeep-wrangler-gifts  # build one guide
 *
 * In production: runs as a Cloudflare Cron Trigger via build/scheduled.js
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { CatalogClient } from "../lib/catalog-client.js";
import { curate, formatPrice } from "../lib/heuristics.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PUBLIC_DIR = join(ROOT, "public");
const QUERIES_PATH = join(ROOT, "lib", "queries.yaml");

// Simple YAML parser (avoids adding a dep for this simple structure)
function parseYaml(text) {
  // Very basic YAML parser for our flat structure — enough for queries.yaml
  const guides = [];
  let current = null;
  let inGuides = false;

  for (const line of text.split("\n")) {
    const trimmed = line.trim();

    if (trimmed === "guides:" || trimmed.startsWith("guides:")) {
      inGuides = true;
      continue;
    }
    if (!inGuides) continue;

    if (line.startsWith("  - ")) {
      // New guide entry
      if (current) guides.push(current);
      current = {};
      const kv = trimmed.replace(/^-\s+/, "").split(":");
      if (kv.length === 2) {
        current[kv[0].trim()] = kv[1].trim().replace(/^["']|["']$/g, "");
      }
    } else if (line.startsWith("    ") && current) {
      const kv = trimmed.split(":");
      if (kv.length >= 2) {
        const key = kv[0].trim();
        const val = kv.slice(1).join(":").trim().replace(/^["']|["']$/g, "");
        current[key] = isNaN(val) ? val : parseInt(val);
      }
    }
  }
  if (current) guides.push(current);
  return guides;
}

function loadQueries() {
  const raw = readFileSync(QUERIES_PATH, "utf-8");
  return parseYaml(raw);
}

function renderGiftGuide(guide, products) {
  const productCards = products
    .map(
      (p) => `
    <article class="product-card" data-score="${p.gift_score}">
      <a href="/api/checkout/${encodeURIComponent(p.id)}" class="product-link" rel="nofollow noopener">
        ${p.image ? `<img src="${p.image}" alt="${escapeHtml(p.image_alt)}" loading="lazy" />` : ""}
        <h3>${escapeHtml(p.title)}</h3>
        <p class="price">${p.price?.display || "Price unavailable"}</p>
        ${p.rating ? `<p class="rating">★ ${p.rating.value} (${p.rating.count})</p>` : ""}
        <p class="seller">${escapeHtml(p.seller?.name || "")}</p>
        <p class="why">${escapeHtml(p.description).slice(0, 150)}${p.description.length > 150 ? "..." : ""}</p>
      </a>
    </article>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(guide.title)}</title>
  <meta name="description" content="${escapeHtml(guide.description)}" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header>
    <nav>
      <a href="/" class="logo">🏎️ Car Guy Gifts</a>
      <a href="/concierge" class="concierge-link">Ask the Concierge →</a>
    </nav>
  </header>

  <main>
    <h1>${escapeHtml(guide.title)}</h1>
    <p class="subtitle">${escapeHtml(guide.description)}</p>
    <p class="last-updated">Updated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>

    <div class="product-grid">
      ${productCards}
    </div>
  </main>

  <footer>
    <p>Powered by <a href="https://shopify.dev/docs/agents/catalog/global-catalog">Shopify Global Catalog MCP</a> ·
       <a href="/about">About</a> ·
       <a href="/privacy">Privacy</a> ·
       Prices and availability are verified at click.</p>
  </footer>
</body>
</html>`;
}

function renderHomepage(guides) {
  const guideCards = guides
    .map(
      (g) => `
    <a href="/${g.slug}.html" class="guide-card">
      <h2>${escapeHtml(g.title)}</h2>
      <p>${escapeHtml(g.description)}</p>
      <span class="recipient">For: ${escapeHtml(g.recipient || "car enthusiast")}</span>
    </a>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Car Guy Gifts — AI-Powered Gift Concierge for Car Enthusiasts</title>
  <meta name="description" content="Find the perfect gift for the car enthusiast in your life. Curated from hundreds of Shopify merchants, powered by AI." />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header>
    <nav>
      <a href="/" class="logo">🏎️ Car Guy Gifts</a>
      <a href="/concierge" class="concierge-link">Ask the Concierge →</a>
    </nav>
  </header>

  <main>
    <section class="hero">
      <h1>Gifts for Car Guys</h1>
      <p class="tagline">Curated by AI across hundreds of Shopify stores. Prices verified at checkout.</p>
      <a href="/concierge" class="cta">🎯 Find the Perfect Gift →</a>
    </section>

    <section class="guides">
      <h2>Browse Gift Guides</h2>
      <div class="guide-grid">
        ${guideCards}
      </div>
    </section>
  </main>

  <footer>
    <p>Powered by <a href="https://www.shopify.com/ucp">Shopify UCP</a> · Cloudflare Pages</p>
  </footer>
</body>
</html>`;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function build() {
  const guides = loadQueries();
  const slugFilter = process.argv.find((a) => a.startsWith("--slug="))?.split("=")[1];

  const toBuild = slugFilter ? guides.filter((g) => g.slug === slugFilter) : guides;

  if (toBuild.length === 0) {
    console.error(`No guides found${slugFilter ? ` for slug: ${slugFilter}` : ""}`);
    process.exit(1);
  }

  console.log(`Building ${toBuild.length} gift guide(s)...`);

  const client = new CatalogClient();

  for (const guide of toBuild) {
    try {
      // Rate limit: wait 2s between requests to avoid 429s
      if (toBuild.indexOf(guide) > 0) {
        await new Promise((r) => setTimeout(r, 2000));
      }

      console.log(`  → Searching: "${guide.query}"`);
      let result;
      let retries = 3;
      while (retries > 0) {
        try {
          result = await client.search(guide.query, { country: "US" });
          break;
        } catch (err) {
          if (err.message.includes("429") && retries > 1) {
            const wait = (4 - retries) * 3000;
            console.log(`    ⚠ Rate limited, waiting ${wait / 1000}s before retry...`);
            await new Promise((r) => setTimeout(r, wait));
            retries--;
          } else {
            throw err;
          }
        }
      }
      const curated = curate(result, { usOnly: true });

      console.log(`    Found ${result?.products?.length || 0} products, ${curated.length} after curation`);

      const html = renderGiftGuide(guide, curated);
      const outPath = join(PUBLIC_DIR, `${guide.slug}.html`);
      writeFileSync(outPath, html);
      console.log(`    ✓ Written: ${outPath}`);
    } catch (err) {
      console.error(`    ✗ Failed: ${guide.slug} — ${err.message}`);
    }
  }

  // Build homepage
  const homepage = renderHomepage(guides);
  writeFileSync(join(PUBLIC_DIR, "index.html"), homepage);
  console.log(`  ✓ Homepage written`);

  console.log("Build complete.");
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});