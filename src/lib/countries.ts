// The countries KinetixFit supports (English only), and everything that changes with them: units, number and date
// formats, currency, the health body whose guidance the targets follow, the allergens that country's food law makes
// labels declare, and the charities points can go to. api/_lib/countries.js mirrors the reward rules server-side.
//
// Guidance sources (keep in step if they change):
//   BMI:    NHS / CDC / Health Canada / WHO use 18.5–24.9; India (Consensus Statement for Asian Indians) and
//           Singapore (HPB) use 18.5–22.9.
//   Fibre:  UK SACN/NHS 30 g · US Dietary Guidelines 14 g per 1,000 kcal · Health Canada 25 g women / 38 g men ·
//           NHMRC (AU/NZ) 25 g women / 30 g men · FSAI (Ireland) 25 g · HPB (Singapore) 20 g women / 26 g men ·
//           WHO (India, UAE) at least 25 g.
//   Allergens: UK/Ireland 14 (retained EU FIC) · US 9 (FALCPA + FASTER Act) · Canada 11 priority allergens ·
//           FSANZ (AU/NZ) PEAL list · FSSAI (India), SFA (Singapore), GSO (UAE) follow the Codex list.
//   Activity: every one of these follows WHO's 150 minutes of moderate activity a week.
import type { UserProfile } from '../App';

export type CountryCode = 'GB' | 'US' | 'CA' | 'AU' | 'NZ' | 'IE' | 'IN' | 'SG' | 'AE';

export interface Charity {
  id: string;
  name: string;
  mission: string;
  desc: string;
}

export interface Country {
  code: CountryCode;
  name: string;
  flag: string;
  /** BCP 47 locale for numbers and dates (en-IN groups lakhs: 1,00,000) */
  locale: string;
  currency: string;
  /** 'us': height in ft/in and weight in lb; everything is stored metric */
  units: 'metric' | 'us';
  distance: 'km' | 'mi';
  /** one well-established, checkable fact about getting active there (onboarding "Did you know?") */
  fact: string;
  /** "the NHS healthy range", used as "Your BMI is 27.1, above {bmiRange} of 18.5 to 24.9." */
  bmiRange: string;
  bmiHealthyMax: number;
  /** how fast to lose weight, in that country's own guidance (onboarding plan, week 12) */
  weightLossPace: string;
  fibre: (sex: UserProfile['sex'], calories: number) => number;
  fibreSource: string;
  /** allergen ids (the same ids everywhere; labels differ, see allergenLabel) that labels must declare there */
  allergens: string[];
  allergenLaw: string;
  /** true once donations are set up in that country; until then its charities show as coming soon */
  donationsLive: boolean;
  vouchersLive: boolean;
  /** what one 1,000-point donation gives, in local currency */
  donationAmount: number;
  charities: Charity[];
}

const UK_14 = ['peanuts', 'nuts', 'milk', 'eggs', 'fish', 'crustaceans', 'molluscs', 'soya', 'wheat', 'celery', 'mustard', 'sesame', 'sulphur dioxide', 'lupin'];
const CODEX = ['peanuts', 'nuts', 'milk', 'eggs', 'fish', 'crustaceans', 'soya', 'wheat', 'sulphur dioxide'];

const bySex = (female: number, male: number, unknown = female) => (sex: UserProfile['sex']) =>
  sex === 'male' ? male : sex === 'female' ? female : unknown;

export const COUNTRIES: Country[] = [
  {
    code: 'GB', name: 'United Kingdom', flag: '🇬🇧', locale: 'en-GB', currency: 'GBP', units: 'metric', distance: 'km',
    fact: 'The UK’s Chief Medical Officers recommend at least 150 minutes of moderate activity a week — about 20 minutes a day.',
    bmiRange: 'the NHS healthy range', bmiHealthyMax: 24.9,
    weightLossPace: 'The NHS suggests aiming for 0.5 to 1 kg a week.',
    fibre: () => 30, fibreSource: 'NHS',
    allergens: UK_14, allergenLaw: 'the 14 allergens UK food law requires labels to show',
    donationsLive: true, vouchersLive: true, donationAmount: 2.5,
    charities: [
      { id: 'CHAR-NHS', name: 'NHS Charities Together', mission: 'Supporting frontline health staff, clinical equipment, and patient recovery schemes.', desc: 'Health care' },
      { id: 'CHAR-BHF', name: 'British Heart Foundation', mission: 'Funding cardiovascular health research, clinical trials, and life-saving tech.', desc: 'Heart research' },
      { id: 'CHAR-TRUSSELL', name: 'The Trussell Trust', mission: 'Stopping hunger and supporting local food banks to end poverty in the UK.', desc: 'Food banks' },
    ],
  },
  {
    code: 'US', name: 'United States', flag: '🇺🇸', locale: 'en-US', currency: 'USD', units: 'us', distance: 'mi',
    fact: 'The Appalachian Trail runs about 2,190 miles through 14 states, from Georgia to Maine.',
    bmiRange: 'the CDC healthy range', bmiHealthyMax: 24.9,
    weightLossPace: 'The CDC suggests aiming for 1 to 2 pounds a week.',
    fibre: (_sex, calories) => Math.round((calories * 14) / 1000), fibreSource: 'Dietary Guidelines for Americans',
    allergens: ['milk', 'eggs', 'fish', 'crustaceans', 'nuts', 'peanuts', 'wheat', 'soya', 'sesame'],
    allergenLaw: 'the 9 major allergens US food law requires labels to show',
    donationsLive: false, vouchersLive: false, donationAmount: 3,
    charities: [
      { id: 'US-AHA', name: 'American Heart Association', mission: 'Fighting heart disease and stroke through research, education and advocacy.', desc: 'Heart health' },
      { id: 'US-FEEDING', name: 'Feeding America', mission: 'The nationwide network of food banks working to end hunger in the US.', desc: 'Food banks' },
      { id: 'US-STJUDE', name: 'St. Jude Children’s Research Hospital', mission: 'Treating and researching childhood cancer — families never receive a bill for treatment.', desc: 'Children’s health' },
    ],
  },
  {
    code: 'CA', name: 'Canada', flag: '🇨🇦', locale: 'en-CA', currency: 'CAD', units: 'metric', distance: 'km',
    fact: 'The Trans Canada Trail links about 28,000 km of trails from coast to coast to coast.',
    bmiRange: 'the Health Canada healthy range', bmiHealthyMax: 24.9,
    weightLossPace: 'Health experts suggest aiming for 0.5 to 1 kg a week.',
    fibre: bySex(25, 38), fibreSource: 'Health Canada',
    allergens: ['eggs', 'milk', 'mustard', 'peanuts', 'crustaceans', 'molluscs', 'fish', 'sesame', 'soya', 'sulphur dioxide', 'nuts', 'wheat'],
    allergenLaw: 'the priority allergens Canadian labels must show',
    donationsLive: false, vouchersLive: false, donationAmount: 5,
    charities: [
      { id: 'CA-HEARTSTROKE', name: 'Heart & Stroke', mission: 'Funding heart and brain research and helping Canadians live healthier lives.', desc: 'Heart health' },
      { id: 'CA-FOODBANKS', name: 'Food Banks Canada', mission: 'Supporting food banks across Canada to relieve hunger.', desc: 'Food banks' },
      { id: 'CA-CANCER', name: 'Canadian Cancer Society', mission: 'Funding cancer research and support for people living with cancer.', desc: 'Cancer research' },
    ],
  },
  {
    code: 'AU', name: 'Australia', flag: '🇦🇺', locale: 'en-AU', currency: 'AUD', units: 'metric', distance: 'km',
    fact: 'The Bibbulmun Track in Western Australia runs about 1,000 km from Kalamunda to Albany.',
    bmiRange: 'the healthy range', bmiHealthyMax: 24.9,
    weightLossPace: 'Australia’s national guidelines suggest aiming for 0.5 to 1 kg a week.',
    fibre: bySex(25, 30), fibreSource: 'NHMRC',
    allergens: ['peanuts', 'nuts', 'eggs', 'milk', 'sesame', 'soya', 'fish', 'crustaceans', 'molluscs', 'lupin', 'wheat', 'sulphur dioxide'],
    allergenLaw: 'the allergens Australian food law requires labels to show',
    donationsLive: false, vouchersLive: false, donationAmount: 5,
    charities: [
      { id: 'AU-HEART', name: 'Heart Foundation', mission: 'Funding heart research and helping Australians live heart-healthy lives.', desc: 'Heart health' },
      { id: 'AU-FOODBANK', name: 'Foodbank Australia', mission: 'Australia’s largest food relief organisation, supplying charities nationwide.', desc: 'Food relief' },
      { id: 'AU-CANCER', name: 'Cancer Council', mission: 'Funding cancer research, prevention and support across Australia.', desc: 'Cancer research' },
    ],
  },
  {
    code: 'NZ', name: 'New Zealand', flag: '🇳🇿', locale: 'en-NZ', currency: 'NZD', units: 'metric', distance: 'km',
    fact: 'Te Araroa, New Zealand’s trail, runs about 3,000 km from Cape Reinga to Bluff.',
    bmiRange: 'the healthy range', bmiHealthyMax: 24.9,
    weightLossPace: 'Health experts suggest aiming for 0.5 to 1 kg a week.',
    fibre: bySex(25, 30), fibreSource: 'NHMRC',
    allergens: ['peanuts', 'nuts', 'eggs', 'milk', 'sesame', 'soya', 'fish', 'crustaceans', 'molluscs', 'lupin', 'wheat', 'sulphur dioxide'],
    allergenLaw: 'the allergens New Zealand food law requires labels to show',
    donationsLive: false, vouchersLive: false, donationAmount: 5,
    charities: [
      { id: 'NZ-HEART', name: 'Heart Foundation', mission: 'Funding heart research and care for New Zealanders.', desc: 'Heart health' },
      { id: 'NZ-CANCER', name: 'Cancer Society', mission: 'Supporting people with cancer and funding research and prevention.', desc: 'Cancer support' },
      { id: 'NZ-KIWIHARVEST', name: 'KiwiHarvest', mission: 'Rescuing good surplus food and delivering it to community groups.', desc: 'Food rescue' },
    ],
  },
  {
    code: 'IE', name: 'Ireland', flag: '🇮🇪', locale: 'en-IE', currency: 'EUR', units: 'metric', distance: 'km',
    fact: 'The Wild Atlantic Way follows about 2,500 km of Ireland’s west coast.',
    bmiRange: 'the healthy range', bmiHealthyMax: 24.9,
    weightLossPace: 'Health experts suggest aiming for 0.5 to 1 kg a week.',
    fibre: () => 25, fibreSource: 'FSAI',
    allergens: UK_14, allergenLaw: 'the 14 allergens EU food law requires labels to show',
    donationsLive: false, vouchersLive: false, donationAmount: 3,
    charities: [
      { id: 'IE-HEART', name: 'Irish Heart Foundation', mission: 'Fighting heart disease and stroke in Ireland.', desc: 'Heart health' },
      { id: 'IE-CANCER', name: 'Irish Cancer Society', mission: 'Funding cancer research and free support services in Ireland.', desc: 'Cancer support' },
      { id: 'IE-FOODCLOUD', name: 'FoodCloud', mission: 'Redistributing surplus food to charities and community groups.', desc: 'Food rescue' },
    ],
  },
  {
    code: 'IN', name: 'India', flag: '🇮🇳', locale: 'en-IN', currency: 'INR', units: 'metric', distance: 'km',
    fact: 'Yoga began in ancient India, and the United Nations marks International Day of Yoga every 21 June.',
    bmiRange: 'the healthy range for Indian adults', bmiHealthyMax: 22.9,
    weightLossPace: 'Health experts suggest aiming for 0.5 to 1 kg a week.',
    fibre: () => 25, fibreSource: 'WHO',
    allergens: CODEX, allergenLaw: 'the allergens FSSAI requires labels to show',
    donationsLive: false, vouchersLive: false, donationAmount: 250,
    charities: [
      { id: 'IN-AKSHAYAPATRA', name: 'The Akshaya Patra Foundation', mission: 'Serving freshly cooked mid-day meals to schoolchildren across India.', desc: 'School meals' },
      { id: 'IN-CRY', name: 'CRY – Child Rights and You', mission: 'Working for children’s health, nutrition and education.', desc: 'Children’s health' },
      { id: 'IN-HELPAGE', name: 'HelpAge India', mission: 'Supporting healthcare and dignity for older people in India.', desc: 'Elder care' },
    ],
  },
  {
    code: 'SG', name: 'Singapore', flag: '🇸🇬', locale: 'en-SG', currency: 'SGD', units: 'metric', distance: 'km',
    fact: 'Singapore’s Park Connector Network links parks across the island with more than 300 km of paths to walk, run and cycle.',
    bmiRange: 'the HPB healthy range', bmiHealthyMax: 22.9,
    weightLossPace: 'Health experts suggest aiming for 0.5 to 1 kg a week.',
    fibre: bySex(20, 26), fibreSource: 'HPB',
    allergens: CODEX, allergenLaw: 'the allergens Singapore food law requires labels to show',
    donationsLive: false, vouchersLive: false, donationAmount: 4,
    charities: [
      { id: 'SG-COMCHEST', name: 'Community Chest', mission: 'Funding social services for people in need across Singapore.', desc: 'Social care' },
      { id: 'SG-FOODHEART', name: 'Food from the Heart', mission: 'Distributing food to families and people in need in Singapore.', desc: 'Food support' },
      { id: 'SG-HEART', name: 'Singapore Heart Foundation', mission: 'Helping people in Singapore prevent heart disease and stroke.', desc: 'Heart health' },
    ],
  },
  {
    code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', locale: 'en-AE', currency: 'AED', units: 'metric', distance: 'km',
    fact: 'The Dubai Fitness Challenge invites everyone to do 30 minutes of activity a day for 30 days, every year.',
    bmiRange: 'the healthy range', bmiHealthyMax: 24.9,
    weightLossPace: 'Health experts suggest aiming for 0.5 to 1 kg a week.',
    fibre: () => 25, fibreSource: 'WHO',
    allergens: CODEX, allergenLaw: 'the allergens UAE food law requires labels to show',
    donationsLive: false, vouchersLive: false, donationAmount: 12,
    charities: [
      { id: 'AE-REDCRESCENT', name: 'Emirates Red Crescent', mission: 'The UAE’s humanitarian society, helping people in need at home and abroad.', desc: 'Humanitarian aid' },
      { id: 'AE-FOODBANK', name: 'UAE Food Bank', mission: 'Collecting surplus food and distributing it to people in need.', desc: 'Food support' },
      { id: 'AE-ALJALILA', name: 'Al Jalila Foundation', mission: 'Funding medical research and treatment for patients in the UAE.', desc: 'Health care' },
    ],
  },
];

export const countryByCode = (code: string | null | undefined): Country =>
  COUNTRIES.find(c => c.code === code) ?? COUNTRIES[0];

/** The phone's own region ("en-IN" → India), if it's one we support. */
export function detectCountry(): CountryCode | null {
  const tags = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  for (const tag of tags) {
    const region = tag.split('-')[1]?.toUpperCase();
    const hit = COUNTRIES.find(c => c.code === region);
    if (hit) return hit.code;
  }
  return null;
}

/** The person's country: what they chose, else a UK region implies the UK, else the phone's region, else the UK. */
export function countryOf(profile: Pick<UserProfile, 'country' | 'region'>): Country {
  if (profile.country) return countryByCode(profile.country);
  if (profile.region && profile.region !== 'outside_uk') return countryByCode('GB');
  return countryByCode(detectCountry());
}

// Display formatting follows the person's country; App keeps this in step with the profile.
let active: Country = COUNTRIES[0];
export const setActiveCountry = (c: Country) => { active = c; };
export const activeCountry = () => active;

export const fmtNumber = (n: number, fractionDigits = 0) =>
  n.toLocaleString(active.locale, { maximumFractionDigits: fractionDigits });

export const fmtDate = (d: Date, options: Intl.DateTimeFormatOptions) => d.toLocaleDateString(active.locale, options);

export const fmtTime = (d: Date) => d.toLocaleTimeString(active.locale, { hour: '2-digit', minute: '2-digit' });

export const fmtMoney = (amount: number, country: Country = active) =>
  amount.toLocaleString(country.locale, {
    style: 'currency', currency: country.currency, minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  });

// Allergen names as that country's labels say them (the ids stay UK wording for storage and the server)
const ALLERGEN_NAMES: Record<string, Partial<Record<CountryCode | 'default', string>>> = {
  nuts: { default: 'Tree nuts', GB: 'Nuts', IE: 'Nuts' },
  soya: { default: 'Soy', GB: 'Soya', IE: 'Soya' },
  crustaceans: { default: 'Crustaceans', US: 'Shellfish' },
  'sulphur dioxide': { default: 'Sulphites', GB: 'Sulphur dioxide', IE: 'Sulphur dioxide' },
  wheat: { default: 'Wheat', GB: 'Cereals with gluten', IE: 'Cereals with gluten', AU: 'Wheat and gluten', NZ: 'Wheat and gluten', IN: 'Cereals with gluten', SG: 'Cereals with gluten', AE: 'Cereals with gluten', CA: 'Wheat and triticale' },
};

export function allergenLabel(id: string, country: Country = active): string {
  const names = ALLERGEN_NAMES[id];
  const name = names?.[country.code] ?? names?.default ?? id;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The IANA time zone of the phone, so the server's daily limits reset at the person's own midnight. */
export const deviceTimeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'Europe/London'; }
};
