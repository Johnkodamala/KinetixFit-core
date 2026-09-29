import { describe, expect, it } from 'vitest';
import { ONBOARDED_EMAIL_KEY, clearOnboardingStep, hasOnboarded, markLoggedInAccount, markOnboarded, normaliseEmail, saveOnboardingStep, savedOnboardingStep } from './onboarding';

describe('hasOnboarded', () => {
  it('is false with no email or nothing saved', () => {
    expect(hasOnboarded(null)).toBe(false);
    expect(hasOnboarded('')).toBe(false);
    expect(hasOnboarded('a@b.dev')).toBe(false);
  });

  it('matches the account that finished onboarding, ignoring case and spaces', () => {
    markOnboarded('Siva@Test.dev');
    expect(localStorage.getItem(ONBOARDED_EMAIL_KEY)).toBe('siva@test.dev');
    expect(hasOnboarded(' SIVA@test.dev ')).toBe(true);
    expect(hasOnboarded('other@test.dev')).toBe(false);
  });

  it('does not count someone halfway through onboarding (their profile already has a country)', () => {
    // the bug: About you fills in the country on its first page, and a profile with a country used to count as finished
    localStorage.setItem('kinetix_profile', JSON.stringify({ email: 'half@test.dev', country: 'IN' }));
    expect(hasOnboarded('half@test.dev')).toBe(false);
  });
});

describe('markLoggedInAccount (accounts that finished before the marker existed)', () => {
  it('marks the account that is still logged in', () => {
    localStorage.setItem('kinetix_logged_in', 'true');
    localStorage.setItem('kinetix_profile', JSON.stringify({ email: 'Old@Test.dev', country: 'GB' }));
    markLoggedInAccount();
    expect(hasOnboarded('old@test.dev')).toBe(true);
  });

  it('does nothing when logged out, already marked, or without a usable profile', () => {
    localStorage.setItem('kinetix_profile', JSON.stringify({ email: 'a@b.dev', country: 'GB' }));
    markLoggedInAccount();
    expect(hasOnboarded('a@b.dev')).toBe(false); // not logged in: may be mid-onboarding

    localStorage.setItem('kinetix_logged_in', 'true');
    markOnboarded('other@b.dev');
    markLoggedInAccount();
    expect(hasOnboarded('other@b.dev')).toBe(true); // the existing mark stays

    localStorage.clear();
    localStorage.setItem('kinetix_logged_in', 'true');
    localStorage.setItem('kinetix_profile', '{not json');
    markLoggedInAccount();
    expect(localStorage.getItem(ONBOARDED_EMAIL_KEY)).toBeNull();
  });
});

describe('onboarding step progress', () => {
  it('remembers the step for the same account only', () => {
    saveOnboardingStep('Siva@test.dev', 5);
    expect(savedOnboardingStep('siva@test.dev')).toBe(5);
    expect(savedOnboardingStep('other@test.dev')).toBeNull();
    expect(savedOnboardingStep(null)).toBeNull();
  });

  it('ignores steps outside 3–6', () => {
    saveOnboardingStep('a@b.dev', 2);
    expect(savedOnboardingStep('a@b.dev')).toBeNull();
    saveOnboardingStep('a@b.dev', 7);
    expect(savedOnboardingStep('a@b.dev')).toBeNull();
    localStorage.setItem('kx_ob_step', JSON.stringify({ email: 'a@b.dev', step: 9 }));
    expect(savedOnboardingStep('a@b.dev')).toBeNull();
  });

  it('is cleared on finishing onboarding and by clearOnboardingStep', () => {
    saveOnboardingStep('a@b.dev', 4);
    markOnboarded('a@b.dev');
    expect(savedOnboardingStep('a@b.dev')).toBeNull();
    saveOnboardingStep('a@b.dev', 6);
    clearOnboardingStep();
    expect(savedOnboardingStep('a@b.dev')).toBeNull();
  });

  it('normalises emails', () => {
    expect(normaliseEmail('  A@B.Dev ')).toBe('a@b.dev');
  });
});
