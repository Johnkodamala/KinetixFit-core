import { describe, expect, it } from 'vitest';
import { PLUS_KNOWN_KEY, readPlusKnown, rememberPlus } from './plusBadge';
import { clearAllDomainData } from './sync';

describe('remembering that this account is on Plus (so the opening screen can say so before the app has asked)', () => {
  it('is false until Plus has been seen', () => {
    expect(readPlusKnown()).toBe(false);
  });

  it('remembers Plus, and forgets it when the account is not Plus any more', () => {
    rememberPlus(true);
    expect(readPlusKnown()).toBe(true);
    rememberPlus(false);
    expect(readPlusKnown()).toBe(false);
    expect(localStorage.getItem(PLUS_KNOWN_KEY)).toBeNull();
  });

  it('is gone after logging out, so the next account never opens with this one’s badge', () => {
    rememberPlus(true);
    clearAllDomainData();
    expect(readPlusKnown()).toBe(false);
  });
});
