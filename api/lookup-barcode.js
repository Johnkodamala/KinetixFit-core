// Private serverless endpoint: looks up a scanned barcode against Open Food Facts (free, no API
// key). Returns real product data or an honest 404 — never fabricated fallback data.
import { handleCors } from './_lib/cors.js';
import { checkScanQuota, recordScan, quotaExceededBody } from './_lib/scanQuota.js';

const ALLERGEN_TAG_MAP = {
  'en:peanuts': 'peanuts',
  'en:nuts': 'nuts',
  'en:milk': 'milk',
  'en:eggs': 'eggs',
  'en:fish': 'fish',
  'en:crustaceans': 'crustaceans',
  'en:molluscs': 'molluscs',
  'en:soybeans': 'soya',
  'en:gluten': 'wheat',
  'en:celery': 'celery',
  'en:mustard': 'mustard',
  'en:sesame-seeds': 'sesame',
  'en:sulphur-dioxide-and-sulphites': 'sulphur dioxide',
  'en:lupin': 'lupin'
};

const toNumber = (v) => (typeof v === 'number' ? v : parseFloat(v));

// 'en:vegetarian' → true, 'en:non-vegetarian' → false, anything else ('en:maybe-vegetarian', 'en:vegetarian-status-unknown',
// no analysis) → null: the app then goes by the product's name and ingredients
const vegetarianStatus = (tags) => {
  if (!Array.isArray(tags)) return null;
  if (tags.includes('en:non-vegetarian')) return false;
  if (tags.includes('en:vegetarian')) return true;
  return null;
};

// A real serving in g or ml (drinks: 1 ml counted as 1 g — Open Food Facts gives drinks per 100 ml under the same
// "_100g" keys). A serving_size without a unit ("100") isn't trusted: it's usually just the label's per-100 basis.
function resolveServing(product) {
  const quantity = toNumber(product.serving_quantity);
  const unit = String(product.serving_quantity_unit || '').toLowerCase();
  const text = typeof product.serving_size === 'string' ? product.serving_size : '';
  if (quantity > 0 && (unit === 'g' || unit === 'ml' || /\d\s*(g|ml)\b/i.test(text))) return quantity;
  const match = text.match(/([\d.]+)\s*(g|ml)\b/i);
  return match ? parseFloat(match[1]) : null;
}

// The whole pack (a 250 ml bottle, a 400 g loaf), when the product says so in g or ml.
function resolvePackage(product) {
  const quantity = toNumber(product.product_quantity);
  const unit = String(product.product_quantity_unit || 'g').toLowerCase();
  return quantity > 0 && (unit === 'g' || unit === 'ml') ? quantity : null;
}

const isDrink = (product) => [product.product_quantity_unit, product.serving_quantity_unit, product.nutrition_data_per === '100ml' ? 'ml' : '']
  .some(u => String(u || '').toLowerCase() === 'ml');

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { barcode, appUserId } = req.body;
  if (!barcode) {
    return res.status(400).json({ error: 'barcode is required.' });
  }
  // Barcode scans share the daily photo-scan limit (free 2, Plus 10).
  if (!appUserId) {
    return res.status(401).json({ error: 'Sign in to scan a barcode.' });
  }

  try {
    const quota = await checkScanQuota(appUserId, req.body?.timeZone);
    if (!quota.allowed) return res.status(429).json(quotaExceededBody(quota));

    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`);
    if (!response.ok) {
      return res.status(502).json({ error: 'Open Food Facts lookup failed. Please try again.' });
    }

    const data = await response.json();
    if (data.status !== 1 || !data.product) {
      return res.status(404).json({ error: 'Product not found — try manual entry.' });
    }

    const product = data.product;
    const nutriments = product.nutriments || {};
    const serving = resolveServing(product);
    const packageGrams = resolvePackage(product);
    // What one scan logs by default: a serving; else a single-serve pack (up to 1 kg / 1 l) as a whole; else 100 g.
    const servingGrams = serving ?? (packageGrams && packageGrams <= 1000 ? packageGrams : 100);
    const scale = servingGrams / 100;

    const scaledMass = (key) => typeof nutriments[key] === 'number' ? Math.round(nutriments[key] * scale) : 0;
    const scaledMassMg = (key, decimals = 0) => {
      const grams = typeof nutriments[key] === 'number' ? nutriments[key] * scale * 1000 : 0;
      const factor = 10 ** decimals;
      return Math.round(grams * factor) / factor;
    };

    const allergens = (product.allergens_tags || [])
      .map(tag => ALLERGEN_TAG_MAP[tag])
      .filter(Boolean);

    // Per-100 g values and the pack's own serving text let the app change the amount eaten ("2 slices", "½ pack")
    // on the phone, without asking again.
    // null = not on this product's label (the app shows those totals as "from N of M foods", not as a real 0)
    const per100 = (key, factor = 1) => typeof nutriments[key] === 'number' ? Math.round(nutriments[key] * factor * 100) / 100 : null;

    return res.status(200).json({
      foodName: product.product_name || 'Unknown product',
      per100g: {
        kcal: per100('energy-kcal_100g') ?? 0, carbs: per100('carbohydrates_100g') ?? 0, protein: per100('proteins_100g') ?? 0,
        fat: per100('fat_100g') ?? 0, fiber: per100('fiber_100g') ?? 0,
        satFat: per100('saturated-fat_100g'), sugars: per100('sugars_100g'), sodiumMg: per100('sodium_100g', 1000),
        potassiumMg: per100('potassium_100g', 1000), ironMg: per100('iron_100g', 1000), calciumMg: per100('calcium_100g', 1000)
      },
      servingLabel: serving && typeof product.serving_size === 'string' ? product.serving_size.slice(0, 60) : undefined,
      packageGrams: packageGrams ?? undefined,
      liquid: isDrink(product),
      ingredientsText: product.ingredients_text || '',
      allergens,
      // Open Food Facts' reading of the ingredient list: the app points out meat or fish to vegetarians
      vegetarian: vegetarianStatus(product.ingredients_analysis_tags),
      estimatedPortionGrams: Math.round(servingGrams),
      estimated: false, // real product serving size, not AI-estimated
      calories: scaledMass('energy-kcal_100g'),
      macros: {
        carbs: scaledMass('carbohydrates_100g'),
        protein: scaledMass('proteins_100g'),
        fat: scaledMass('fat_100g'),
        fiber: scaledMass('fiber_100g')
      },
      micros: {
        sodium: `${scaledMassMg('sodium_100g')}mg`,
        potassium: `${scaledMassMg('potassium_100g')}mg`,
        iron: `${scaledMassMg('iron_100g', 1)}mg`,
        calcium: `${scaledMassMg('calcium_100g')}mg`
      },
      source: 'Open Food Facts',
      scansLeft: await recordScan(appUserId, quota),
      scanLimit: quota.limit,
      plus: quota.plus
    });
  } catch (error) {
    return res.status(500).json({ error: 'Barcode lookup failed', details: error.message });
  }
}
