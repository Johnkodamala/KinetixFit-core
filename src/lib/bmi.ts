// BMI and the goal it suggests during onboarding. Bands follow the person's country: 18.5–24.9 (NHS, CDC, Health
// Canada, WHO), but 18.5–22.9 in India and Singapore, whose guidance uses lower cut-offs for Asian adults (see
// src/lib/countries.ts). BMI isn't used for under-18s (age-and-sex centiles apply), so no suggestion below 18.
import type { UserProfile } from '../App';
import { countryOf } from './countries';

export function bmiOf(heightCm: number, weightKg: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export interface GoalSuggestion {
  goal: UserProfile['target'];
  bmi: number;
  /** one sentence for the Goal screen, e.g. "Your BMI is 27.1, above the NHS healthy range…" */
  reason: string;
}

export function suggestGoal(p: Pick<UserProfile, 'height' | 'weight' | 'age' | 'country' | 'region'>): GoalSuggestion | null {
  if (p.age < 18 || !p.height || !p.weight) return null;
  const country = countryOf(p);
  const bmi = bmiOf(p.height, p.weight);
  const shown = bmi.toFixed(1);
  const range = `${country.bmiRange} of 18.5 to ${country.bmiHealthyMax}`;
  if (bmi < 18.5) return { goal: 'Weight Gain', bmi, reason: `Your BMI is ${shown}, below ${range}.` };
  if (bmi < country.bmiHealthyMax + 0.1) return { goal: 'Cardio Endurance', bmi, reason: `Your BMI is ${shown}, in ${range}.` };
  return { goal: 'Weight Loss', bmi, reason: `Your BMI is ${shown}, above ${range}.` };
}
