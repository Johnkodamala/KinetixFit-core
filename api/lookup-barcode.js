// Private serverless endpoint: looks up a scanned barcode against Open Food Facts (free, no API
// key). Returns real product data or an honest 404 — never fabricated fallback data.
import { handleCors } from './_lib/cors.js';

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

function resolveServingGrams(product) {
  if (typeof product.serving_quantity === 'number' && product.serving_quantity > 0) {
    return product.serving_quantity;
  }
  if (typeof product.serving_size === 'string') {
    const match = product.serving_size.match(/([\d.]+)\s*g/i);
    if (match) return parseFloat(match[1]);
  }
  return 100; // matches the "_100g" nutriment basis when no real serving size is given
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { barcode } = req.body;
  if (!barcode) {
    return res.status(400).json({ error: 'barcode is required.' });
  }

  try {
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
    const servingGrams = resolveServingGrams(product);
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

    return res.status(200).json({
      foodName: product.product_name || 'Unknown product',
      ingredientsText: product.ingredients_text || '',
      allergens,
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
      source: 'Open Food Facts'
    });
  } catch (error) {
    return res.status(500).json({ error: 'Barcode lookup failed', details: error.message });
  }
}
