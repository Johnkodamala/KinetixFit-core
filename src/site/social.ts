// The footer's "Follow us" column: it says "Coming soon" (written in the page) until SOCIAL_PROFILES (config.ts) has at
// least one real account, then lists them. Share links (WhatsApp, X, LinkedIn, Facebook, email) are plain links in the
// page.
import { SOCIAL_LABELS, SOCIAL_PROFILES, type SocialProfile } from './config';

/** Only complete https addresses make it onto the page. */
export function validProfiles(profiles: SocialProfile[]): SocialProfile[] {
  return profiles.filter(profile => {
    try {
      const url = new URL(profile.url);
      return url.protocol === 'https:' && profile.network in SOCIAL_LABELS;
    } catch {
      return false;
    }
  });
}

export function renderFollowLinks(doc: Document = document, profiles: SocialProfile[] = SOCIAL_PROFILES): number {
  const column = doc.querySelector<HTMLElement>('[data-follow]');
  const list = doc.querySelector<HTMLElement>('[data-follow-list]');
  const usable = validProfiles(profiles);
  if (!column || !list || usable.length === 0) return 0;
  list.replaceChildren(...usable.map(profile => {
    const item = doc.createElement('li');
    const link = doc.createElement('a');
    link.href = profile.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = SOCIAL_LABELS[profile.network];
    const hint = doc.createElement('span');
    hint.className = 'visually-hidden';
    hint.textContent = ' (opens in a new tab)';
    link.append(hint);
    item.append(link);
    return item;
  }));
  column.hidden = false;
  return usable.length;
}
