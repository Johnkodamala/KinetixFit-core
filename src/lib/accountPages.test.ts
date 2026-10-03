import { describe, expect, it } from 'vitest';
import { accountPageAllowed, promoCodesAllowedOn } from './accountPages';

describe('which Account pages open where', () => {
  it('has no promo code box on an iPhone (Apple wants offer codes through the App Store), but does on Android and the web', () => {
    expect(promoCodesAllowedOn('ios')).toBe(false);
    expect(promoCodesAllowedOn('android')).toBe(true);
    expect(promoCodesAllowedOn('web')).toBe(true);
  });

  it('does not open the promo page from a link on an iPhone: it would be an empty page', () => {
    expect(accountPageAllowed('promo', 'ios')).toBe(false);
    expect(accountPageAllowed('promo', 'android')).toBe(true);
    expect(accountPageAllowed('promo', 'web')).toBe(true);
  });

  it('opens every other page everywhere', () => {
    for (const page of ['details', 'allergies', 'devices', 'reminders', 'icon', 'widgets', 'subscription', 'about', 'privacy', 'help']) {
      for (const platform of ['ios', 'android', 'web']) expect(accountPageAllowed(page, platform), `${page} on ${platform}`).toBe(true);
    }
  });
});
