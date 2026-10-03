// Logging out must stop the phone's reminders (and empty its widgets). They are scheduled with the operating system, so wiping the app's storage does
// not touch them: before this, a phone that was logged out (not deleted) went on showing "Morning glass" every day and the
// gut check and daily check-in nudges for the next week. Only deleting the account cancelled them.
// endSession lives inside the App component, which has no component tests, so this reads its source like the site tests do.
import { describe, expect, it } from 'vitest';
import appSource from '../App.tsx?raw';

const endSession = (() => {
  const start = appSource.indexOf('const endSession = async');
  const end = appSource.indexOf('const needsSignIn =', start);
  return appSource.slice(start, end);
})();

describe('ending a session (log out, log out anyway, and after deleting)', () => {
  it('is found', () => {
    expect(endSession.length).toBeGreaterThan(200);
    expect(endSession).toContain('clearAllDomainData()');
  });

  it('cancels every scheduled reminder whichever way the session ends, before the storage is wiped', () => {
    expect(endSession).toMatch(/await clearDeviceReminders\(\);/);
    expect(endSession).not.toMatch(/if \(forgetAccount\)\s*await clearDeviceReminders/);
    expect(endSession.indexOf('clearDeviceReminders()')).toBeLessThan(endSession.indexOf('clearAllDomainData()'));
  });

  it('also empties the home-screen widgets: they showed the last account’s numbers until someone logged in again', () => {
    expect(endSession).toMatch(/clearWidgets\(\);/);
    expect(endSession).not.toMatch(/if \(forgetAccount\) \{[^}]*clearWidgets/);
    // after the storage is wiped, so they come back as the defaults
    expect(endSession.indexOf('clearWidgets()')).toBeGreaterThan(endSession.indexOf('clearAllDomainData()'));
  });

  it('every way of logging out goes through it', () => {
    const calls = [...appSource.matchAll(/endSession\(\{ flush: (true|false), forgetAccount: (true|false) \}\)/g)];
    expect(calls.length).toBeGreaterThanOrEqual(3); // log out, log out anyway, after deleting
  });
});
