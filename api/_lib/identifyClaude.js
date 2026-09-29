// Asks Claude what's in a meal photo, in one short call, using the model-independent contract in identify.js. The
// client is passed in (api/scan-meal.js has one; tests pass a stand-in).
//
// Thinking is off and effort low: recognising food and judging portions is perception, not reasoning, and the answer
// is a small JSON object. Sonnet 5 thinks unless told not to, and that used to share the token budget with the answer.
// Haiku 4.5 doesn't take `effort`.
import { IdentifyError, MEAL_SCHEMA, finishMeal, mealPrompt } from './identify.js';

const MAX_TOKENS = 1200; // about 100 tokens a food: room for the most foods a meal can have

export async function identifyMealWithClaude({ image, mimeType, note }, { client, model = process.env.SCAN_MODEL || 'claude-sonnet-5' }) {
  const started = Date.now();
  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'disabled' },
    output_config: {
      format: { type: 'json_schema', schema: MEAL_SCHEMA },
      ...(/haiku-4-5/.test(model) ? {} : { effort: 'low' }),
    },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: image } },
        { type: 'text', text: mealPrompt(note) },
      ],
    }],
  });
  // what a scan costs, for comparing models later
  const usage = { model: response.model, input: response.usage?.input_tokens, output: response.usage?.output_tokens,
    stop: response.stop_reason, ms: Date.now() - started };

  if (response.stop_reason === 'refusal') throw new IdentifyError('refused', 'The photo was declined', usage);
  if (response.stop_reason === 'max_tokens') throw new IdentifyError('truncated', 'The answer was cut off', usage);
  // every text block, whatever comes before it
  const text = (response.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('');
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new IdentifyError('invalid', 'The answer isn\'t JSON', usage);
  }
  try {
    return { meal: finishMeal(raw, note), usage };
  } catch (error) {
    if (error instanceof IdentifyError) error.usage = usage;
    throw error;
  }
}
