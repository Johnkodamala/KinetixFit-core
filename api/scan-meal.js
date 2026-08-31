// Private serverless endpoint: identifies a food item (from a photo or free text) and returns
// real nutrition data. Stateless — no user profile data is sent here or stored; personalization
// (allergens, dietary recommendations) stays entirely client-side in src/App.tsx.

const NUTRIENT_IDS = {
  calories: 1008,
  protein: 1003,
  carbs: 1005,
  fat: 1004,
  fiber: 1079,
  sodium: 1093,
  potassium: 1092,
  iron: 1089,
  calcium: 1087
};

async function identifyFoodFromPhoto(base64Image, mimeType) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
          {
            type: 'text',
            text: 'Identify the single main food item in this photo and estimate its portion size in grams. ' +
              'Respond with ONLY a JSON object, no other text, in this exact shape: ' +
              '{"foodName": "short generic food name", "estimatedGrams": number}'
          }
        ]
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`Vision request failed: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse food identification response');

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.foodName || !parsed.estimatedGrams) throw new Error('Incomplete food identification response');
  return { foodName: parsed.foodName, estimatedGrams: parsed.estimatedGrams };
}

async function lookupNutrition(foodName) {
  const USDA_FDC_API_KEY = process.env.USDA_FDC_API_KEY;
  const searchUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_FDC_API_KEY}&query=${encodeURIComponent(foodName)}&pageSize=5`;
  const response = await fetch(searchUrl);

  if (!response.ok) {
    throw new Error(`USDA lookup failed: ${response.status}`);
  }

  const data = await response.json();
  const match = data.foods?.[0];
  if (!match) return null;

  const basisGrams = match.dataType === 'Branded' && match.servingSize && match.servingSizeUnit === 'g'
    ? match.servingSize
    : 100;

  const nutrientValues = {};
  for (const [key, id] of Object.entries(NUTRIENT_IDS)) {
    const found = match.foodNutrients?.find(n => n.nutrientId === id);
    nutrientValues[key] = found?.value || 0;
  }

  return { nutrientValues, basisGrams };
}

function buildResult(foodName, estimatedGrams, nutrientValues, basisGrams) {
  const scale = estimatedGrams / basisGrams;
  const scaled = {};
  for (const key of Object.keys(nutrientValues)) {
    scaled[key] = nutrientValues[key] * scale;
  }

  return {
    foodName,
    estimatedPortionGrams: Math.round(estimatedGrams),
    estimated: true,
    calories: Math.round(scaled.calories),
    macros: {
      carbs: Math.round(scaled.carbs),
      protein: Math.round(scaled.protein),
      fat: Math.round(scaled.fat),
      fiber: Math.round(scaled.fiber)
    },
    micros: {
      sodium: `${Math.round(scaled.sodium)}mg`,
      potassium: `${Math.round(scaled.potassium)}mg`,
      iron: `${scaled.iron.toFixed(1)}mg`,
      calcium: `${Math.round(scaled.calcium)}mg`
    },
    source: 'USDA FoodData Central'
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { image, mimeType, foodText } = req.body;

  try {
    let foodName;
    let estimatedGrams;

    if (image) {
      const identified = await identifyFoodFromPhoto(image, mimeType || 'image/jpeg');
      foodName = identified.foodName;
      estimatedGrams = identified.estimatedGrams;
    } else if (foodText) {
      foodName = foodText;
      estimatedGrams = 100;
    } else {
      return res.status(400).json({ error: 'Provide either "image" (base64) or "foodText".' });
    }

    const nutrition = await lookupNutrition(foodName);
    if (!nutrition) {
      return res.status(404).json({ error: `Could not find nutrition data for "${foodName}". Please try a more specific description.` });
    }

    const result = buildResult(foodName, estimatedGrams, nutrition.nutrientValues, nutrition.basisGrams);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: 'Meal scan failed', details: error.message });
  }
}
