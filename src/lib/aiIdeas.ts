// What the phone does with the AI meal ideas (api/suggest-meals.js) before showing them. The server asks the model to leave
// out the person's allergens and drops what the model itself says breaks a rule, but a model can miss that hummus is made
// with tahini, which is sesame. So the phone checks the dish's own words too, with the same word lists as everywhere else
// in the app (src/lib/allergens.ts: label allergens by the foods they're in, typed allergies by their own words).
import { allergiesIn } from './allergens';
import type { CountryCode } from './countries';
import { avoidedThere } from './mealIdeas';

export interface AiIdea {
  name: string;
  description: string;
  /** what the server says the dish contains (label allergen ids) */
  allergens?: string[];
}

/**
 * The ideas this person can have: none that has one of their allergies — whether the server said so, or the dish's name and
 * description show it — and none with a meat that isn't eaten where they live (beef in India).
 */
export function keepSafeIdeas<T extends AiIdea>(ideas: T[], allergies: string[], country: CountryCode): T[] {
  return ideas.filter(idea => {
    const text = `${idea.name} ${idea.description}`;
    if ((idea.allergens ?? []).some(a => allergies.includes(String(a).toLowerCase()))) return false;
    if (allergiesIn(text, allergies).length > 0) return false;
    return !avoidedThere(text, country);
  });
}
