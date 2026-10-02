// Remembers, on this phone, that the signed-in account is on Plus. The app only learns the plan a moment after it
// opens (RevenueCat and the server answer asynchronously), but the opening screen plays straight away: this lets it
// say PLUS for someone who was on Plus last time. Purely cosmetic — the plan itself always comes from the store and
// the server — and it is wiped at logout with the rest of the account's data (src/lib/sync.ts), so the next account
// never opens with this one's badge.

export const PLUS_KNOWN_KEY = 'kx_plus_known';

export function readPlusKnown(): boolean {
  try { return localStorage.getItem(PLUS_KNOWN_KEY) === '1'; } catch { return false; }
}

export function rememberPlus(isPlus: boolean) {
  try {
    if (isPlus) localStorage.setItem(PLUS_KNOWN_KEY, '1');
    else localStorage.removeItem(PLUS_KNOWN_KEY);
  } catch { /* storage blocked: the opening screen just stays plain */ }
}
