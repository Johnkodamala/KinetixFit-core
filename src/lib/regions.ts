// Regions offered in onboarding ("Where are you based?"), each with one well-established, checkable
// fact about getting active there. Keep facts true and neutral — they're shown as "Did you know?".
export interface Region {
  id: string;
  name: string;
  fact: string;
}

export const REGIONS: Region[] = [
  { id: 'london', name: 'London', fact: 'The London Marathon is the world’s biggest annual one-day fundraising event.' },
  { id: 'south_east', name: 'South East', fact: 'The South Downs Way is a 100-mile National Trail from Winchester to Eastbourne.' },
  { id: 'south_west', name: 'South West', fact: 'The South West Coast Path is England’s longest National Trail — 630 miles of coastline.' },
  { id: 'east', name: 'East of England', fact: 'The Norfolk Broads have around 125 miles of lock-free waterways to paddle, row and walk beside.' },
  { id: 'east_midlands', name: 'East Midlands', fact: 'The Peak District became Britain’s first national park, in 1951.' },
  { id: 'west_midlands', name: 'West Midlands', fact: 'Birmingham has more miles of canal than Venice — flat, traffic-free routes for a walk or run.' },
  { id: 'yorkshire', name: 'Yorkshire and the Humber', fact: 'Yorkshire hosted the Grand Départ of the Tour de France in 2014.' },
  { id: 'north_west', name: 'North West', fact: 'Scafell Pike in the Lake District is England’s highest mountain, at 978 metres.' },
  { id: 'north_east', name: 'North East', fact: 'The Great North Run, from Newcastle to South Shields, is one of the biggest half marathons in the world.' },
  { id: 'scotland', name: 'Scotland', fact: 'Ben Nevis is the highest mountain in the British Isles, at 1,345 metres.' },
  { id: 'wales', name: 'Wales', fact: 'The Wales Coast Path follows almost the whole Welsh coastline — about 870 miles.' },
  { id: 'northern_ireland', name: 'Northern Ireland', fact: 'The Giant’s Causeway is made of around 40,000 interlocking basalt columns.' },
  { id: 'outside_uk', name: 'Outside the UK', fact: 'The UK’s Chief Medical Officers recommend at least 150 minutes of moderate activity a week — about 20 minutes a day.' },
];

export const regionById = (id: string | null | undefined) => REGIONS.find(r => r.id === id) ?? null;

// Encouragement shown under the fact — written in the app's own voice, so nothing is misattributed.
export const MOTIVATION_LINES = [
  'You don’t have to be extreme. Just consistent.',
  'Small steps, taken daily, go the distance.',
  'Every finish line starts with a single step.',
  'Strong isn’t a size. It’s a habit.',
  'Show up for yourself — the results will follow.',
  'Progress beats perfect, every single time.',
];
