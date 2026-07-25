/**
 * Niche Curation Heuristics — Car Guy Gifts
 *
 * Takes raw Shopify Global Catalog search results and ranks/filters them
 * for the "gifts for car guys" niche.
 */

// Keywords that signal a product IS a good car-guy gift
const GIFT_POSITIVE = [
  "car enthusiast",
  "car guy",
  "car lover",
  "automotive",
  "garage",
  "mechanic",
  "racing",
  "race car",
  "driving",
  "car enthusiast gift",
  "car lover gift",
  "detailing",
  "car wash",
  "car art",
  "car decor",
  "man cave",
  "license plate",
  "keychain",
  "car key",
  "shift knob",
  "steering wheel",
  "oil change",
  "muscle car",
  "classic car",
  "jeep",
  "wrangler",
  "off road",
  "track day",
  "autocross",
  "drag racing",
  "formula 1",
  "f1",
  "nascar",
  "hot wheels",
  "model car",
  "car poster",
  "tire",
  "exhaust",
  "bumper",
];

// Keywords that signal a product is NOT a car-guy gift
const GIFT_NEGATIVE = [
  "toy car for kids",
  "baby",
  "toddler",
  "diaper",
  "pet",
  "dog toy",
  "cat toy",
  "halloween costume",
  "inflatable",
  "pool float",
  "phone case for iphone",
  "laptop sticker",
];

// Gift-relevant categories (naive keyword match, refined over time)
const GIFT_CATEGORIES = {
  garage_art: ["wall art", "metal sign", "poster", "print", "garage decor"],
  apparel: ["shirt", "t-shirt", "tee", "hoodie", "hat", "cap"],
  tools: ["tool", "wrench", "socket", "multimeter", "jack", "stand"],
  detailing: ["detailing", "car wash", "wax", "polish", "ceramic", "microfiber"],
  accessories: ["keychain", "key ring", "license plate frame", "shift knob"],
  models: ["model car", "hot wheels", "diecast", "scale model"],
  books: ["book", "manual", "guide", "encyclopedia"],
  tech: ["dash cam", "phone mount", "obd2", "scanner", "charger"],
  drinkware: ["mug", "tumbler", "flask", "thermos", "coffee"],
};

/**
 * Score a product's gift-relevance on a 0-100 scale.
 */
function giftScore(product) {
  const text = [
    product.title || "",
    product.description?.plain || "",
    product.metadata?.top_features || "",
    product.metadata?.unique_selling_points?.join(" ") || "",
  ]
    .join(" ")
    .toLowerCase();

  let score = 50; // neutral baseline

  // Positive signals
  for (const kw of GIFT_POSITIVE) {
    if (text.includes(kw)) score += 5;
  }

  // Negative signals
  for (const kw of GIFT_NEGATIVE) {
    if (text.includes(kw)) score -= 15;
  }

  // Rating boost — well-reviewed products make better gifts
  if (product.rating) {
    const r = product.rating.value || 0;
    const count = product.rating.count || 0;
    if (r >= 4.5 && count >= 100) score += 10;
    else if (r >= 4.0 && count >= 50) score += 5;
    else if (r < 3.5) score -= 10;
  }

  // Personalization boost — customizable gifts feel more thoughtful
  if (text.includes("personalized") || text.includes("custom") || text.includes("engraved")) {
    score += 8;
  }

  // Clamp
  return Math.max(0, Math.min(100, score));
}

/**
 * Filter out products priced in non-USD currencies (MVP: US-only).
 */
function isUsMerchant(product) {
  const priceRange = product.price_range || {};
  const min = priceRange.min || {};
  return min.currency === "USD";
}

/**
 * Categorize a product into gift categories (naive keyword match).
 */
function categorize(product) {
  const text = (product.title + " " + (product.description?.plain || "")).toLowerCase();
  const cats = [];
  for (const [cat, keywords] of Object.entries(GIFT_CATEGORIES)) {
    if (keywords.some((kw) => text.includes(kw))) cats.push(cat);
  }
  return cats.length > 0 ? cats : ["uncategorized"];
}

/**
 * Extract a clean product card from the raw catalog response.
 */
function toProductCard(product) {
  // Pick the first available variant for the card
  const variant = product.variants?.find((v) => v.availability?.available) || product.variants?.[0];

  return {
    id: product.id,
    title: product.title,
    description: product.description?.plain || "",
    image: product.media?.[0]?.url || variant?.media?.[0]?.url || null,
    image_alt: product.media?.[0]?.alt_text || product.title,
    price: variant
      ? {
          amount: variant.price?.amount || 0,
          currency: variant.price?.currency || "USD",
          display: formatPrice(variant.price?.amount, variant.price?.currency),
        }
      : null,
    rating: product.rating || null,
    seller: variant?.seller || null,
    checkout_url: variant?.checkout_url || null,
    product_url: variant?.url || null,
    categories: categorize(product),
    gift_score: giftScore(product),
  };
}

function formatPrice(minorUnits, currency) {
  if (!minorUnits) return "Price unavailable";
  const major = (minorUnits / 100).toFixed(2);
  const symbol = currency === "USD" ? "$" : currency + " ";
  return `${symbol}${major}`;
}

/**
 * Curate raw catalog search results into ranked, filtered gift cards.
 */
export function curate(catalogResult, opts = {}) {
  const products = catalogResult?.products || [];
  const usOnly = opts.usOnly !== false; // default true for MVP

  let cards = products.map(toProductCard);

  if (usOnly) {
    cards = cards.filter((c) => {
      // Check if any variant is USD
      const product = products.find((p) => p.id === c.id);
      return product && isUsMerchant(product);
    });
  }

  // Sort by gift score descending
  cards.sort((a, b) => b.gift_score - a.gift_score);

  return cards;
}

export { giftScore, categorize, toProductCard, formatPrice, GIFT_CATEGORIES };