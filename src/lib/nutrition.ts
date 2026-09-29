// What a person needs in a day, per nutrient, next to what they've eaten (from the food log — src/lib/foodLog.ts).
//
// Calories, protein, carbs, fat and fibre come from the person's own plan (nhsTargets in App.tsx). The rest follow
// the health guidance of the person's country, grouped by which body's figures that country uses:
//   Saturated fat — UK (SACN/NHS): no more than 30 g men / 20 g women. Elsewhere under 10% of energy (US DGA,
//                   Health Canada, NHMRC, WHO) → calories × 10% ÷ 9.
//   Sugars        — total sugars: the UK/EU label reference intake of 90 g (GB, IE). Other countries give a limit
//                   only for added/free sugars, which labels don't separate, so there it's shown without a target.
//   Sodium        — UK/Ireland 2,400 mg (6 g salt, NHS/FSAI) · US 2,300 mg (DGA) · Canada 2,300 mg (CDRR) ·
//                   Australia/NZ 2,000 mg (NHMRC suggested target) · India/Singapore/UAE 2,000 mg (WHO).
//   Potassium     — UK 3,500 mg (RNI) · US/Canada 3,400 mg men / 2,600 mg women (AI) · AU/NZ 3,800 / 2,800 (AI) ·
//                   WHO at least 3,510 mg (IN, SG, AE).
//   Iron          — UK 8.7 mg men and women 51+, 14.8 mg women 19–50 (RNI) · US/Canada and AU/NZ 8 mg / 18 mg
//                   (RDA) · FAO/WHO at 15% bioavailability 9.1 mg men, 19.6 mg women 19–50, 7.5 mg women 51+.
//   Calcium       — UK 700 mg (RNI) · US/Canada 1,000 mg, 1,200 mg women 51+ and everyone 71+ · AU/NZ 1,000 mg,
//                   1,300 mg women 51+ and men 71+ · FAO/WHO 1,000 mg, 1,300 mg women 51+ and everyone 65+.
// These are for adults and aren't medical advice; pregnancy and health conditions change them.
import type { CountryCode } from './countries';
import type { Nutrients, NutrientKey } from './foodLog';

type Family = 'uk' | 'na' | 'anz' | 'who';
const FAMILY: Record<CountryCode, Family> = { GB: 'uk', IE: 'uk', US: 'na', CA: 'na', AU: 'anz', NZ: 'anz', IN: 'who', SG: 'who', AE: 'who' };

export type TargetKind = 'goal' | 'target' | 'limit' | 'none';

export interface NutrientTarget {
  key: NutrientKey;
  label: string;
  unit: 'kcal' | 'g' | 'mg';
  /** goal: reach at least this · target: aim for about this · limit: stay under it · none: shown for reference */
  kind: TargetKind;
  amount: number | null;
  decimals: number;
}

export interface PersonForTargets {
  sex: 'male' | 'female' | null | undefined | string;
  age: number;
  country: CountryCode;
}

export interface PlanTargets { calories: number; protein: number; carbs: number; fat: number; fiber: number; }

const female = (p: PersonForTargets) => p.sex === 'female';
const male = (p: PersonForTargets) => p.sex === 'male';

function satFatLimit(p: PersonForTargets, calories: number): number {
  if (FAMILY[p.country] === 'uk') return male(p) ? 30 : 20;
  return Math.round((calories * 0.1) / 9);
}

function sodiumLimit(p: PersonForTargets): number {
  return ({ uk: 2400, na: 2300, anz: 2000, who: 2000 } as const)[FAMILY[p.country]];
}

function potassiumGoal(p: PersonForTargets): number {
  switch (FAMILY[p.country]) {
    case 'uk': return 3500;
    case 'na': return male(p) ? 3400 : 2600;
    case 'anz': return male(p) ? 3800 : 2800;
    default: return 3510;
  }
}

function ironGoal(p: PersonForTargets): number {
  const menstruating = female(p) && p.age <= 50;
  switch (FAMILY[p.country]) {
    case 'uk': return menstruating ? 14.8 : 8.7;
    case 'na': case 'anz': return menstruating ? 18 : 8;
    default: return menstruating ? 19.6 : female(p) ? 7.5 : 9.1;
  }
}

function calciumGoal(p: PersonForTargets): number {
  const olderWoman = female(p) && p.age >= 51;
  switch (FAMILY[p.country]) {
    case 'uk': return 700;
    case 'na': return olderWoman || p.age >= 71 ? 1200 : 1000;
    case 'anz': return olderWoman || (male(p) && p.age >= 71) ? 1300 : 1000;
    default: return olderWoman || p.age >= 65 ? 1300 : 1000;
  }
}

/** The main five (from the person's plan), in the order Nourish shows them. */
export function mainTargets(plan: PlanTargets): NutrientTarget[] {
  return [
    { key: 'kcal', label: 'Calories', unit: 'kcal', kind: 'target', amount: plan.calories, decimals: 0 },
    { key: 'protein', label: 'Protein', unit: 'g', kind: 'goal', amount: plan.protein, decimals: 0 },
    { key: 'carbs', label: 'Carbs', unit: 'g', kind: 'target', amount: plan.carbs, decimals: 0 },
    { key: 'fat', label: 'Fat', unit: 'g', kind: 'target', amount: plan.fat, decimals: 0 },
    { key: 'fiber', label: 'Fibre', unit: 'g', kind: 'goal', amount: plan.fiber, decimals: 0 },
  ];
}

/** Saturated fat, sugars, sodium and the minerals, from the country's guidance. */
export function moreTargets(plan: PlanTargets, person: PersonForTargets): NutrientTarget[] {
  return [
    { key: 'satFat', label: 'Saturated fat', unit: 'g', kind: 'limit', amount: satFatLimit(person, plan.calories), decimals: 0 },
    FAMILY[person.country] === 'uk'
      ? { key: 'sugars', label: 'Sugars', unit: 'g', kind: 'limit', amount: 90, decimals: 0 }
      : { key: 'sugars', label: 'Sugars', unit: 'g', kind: 'none', amount: null, decimals: 0 },
    { key: 'sodiumMg', label: FAMILY[person.country] === 'uk' ? 'Salt (as sodium)' : 'Sodium', unit: 'mg', kind: 'limit', amount: sodiumLimit(person), decimals: 0 },
    { key: 'potassiumMg', label: 'Potassium', unit: 'mg', kind: 'goal', amount: potassiumGoal(person), decimals: 0 },
    { key: 'ironMg', label: 'Iron', unit: 'mg', kind: 'goal', amount: ironGoal(person), decimals: 1 },
    { key: 'calciumMg', label: 'Calcium', unit: 'mg', kind: 'goal', amount: calciumGoal(person), decimals: 0 },
  ];
}

export type NutrientStatus = 'short' | 'met' | 'near' | 'over' | 'none';

/**
 * Where a day stands on one nutrient: a goal is met at 100%; a target is met within 10% either side and over past
 * 110%; a limit is "near" from 90% and "over" past 100%.
 */
export function statusOf(target: NutrientTarget, eaten: number): NutrientStatus {
  if (target.kind === 'none' || !target.amount) return 'none';
  const ratio = eaten / target.amount;
  if (target.kind === 'goal') return ratio >= 1 ? 'met' : 'short';
  if (target.kind === 'target') return ratio > 1.1 ? 'over' : ratio >= 0.9 ? 'met' : 'short';
  return ratio > 1 ? 'over' : ratio >= 0.9 ? 'near' : 'short';
}

/** "48 g to go", "Reached", "320 mg left", "12 g over" */
export function statusText(target: NutrientTarget, eaten: number, fmt: (n: number) => string): string {
  if (target.kind === 'none' || !target.amount) return 'No daily target';
  const diff = target.amount - eaten;
  if (target.kind === 'goal') return diff <= 0 ? 'Reached' : `${fmt(diff)} to go`;
  return diff < 0 ? `${fmt(-diff)} over` : `${fmt(diff)} left`;
}

export const valueOf = (n: Nutrients, key: NutrientKey) => n[key] ?? 0;
