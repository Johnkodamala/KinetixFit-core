// BMI and the goal it suggests during onboarding. Bands are the NHS adult ranges; BMI isn't used for
// under-18s (the NHS uses age-and-sex centiles for them), so no suggestion is made below 18.
import type { UserProfile } from '../App';

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

export function suggestGoal(p: Pick<UserProfile, 'height' | 'weight' | 'age'>): GoalSuggestion | null {
  if (p.age < 18 || !p.height || !p.weight) return null;
  const bmi = bmiOf(p.height, p.weight);
  const shown = bmi.toFixed(1);
  if (bmi < 18.5) {
    return { goal: 'Weight Gain', bmi, reason: `Your BMI is ${shown}, below the NHS healthy range of 18.5 to 24.9.` };
  }
  if (bmi < 25) {
    return { goal: 'Cardio Endurance', bmi, reason: `Your BMI is ${shown}, in the NHS healthy range of 18.5 to 24.9.` };
  }
  return { goal: 'Weight Loss', bmi, reason: `Your BMI is ${shown}, above the NHS healthy range of 18.5 to 24.9.` };
}
