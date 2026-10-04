// requestDay (api/_lib/countries.js): the day a request's quest claims, health snapshot and first-scan bonus are filed
// under. A phone that sends its time zone is filed under its own date, so a quest is "today's" at its own midnight; one
// that doesn't (every build before this) is filed under the UTC date, exactly as before.
import { describe, expect, it } from 'vitest';
import { requestDay } from '../_lib/countries.js';

// 00:30 on Sunday 4 October in India (UTC+5:30) is still Saturday 3 October, 19:00, in UTC.
const NIGHT_IN_INDIA = new Date('2026-10-03T19:00:00Z');

describe('requestDay', () => {
  it("is the date in the phone's own time zone", () => {
    expect(requestDay('Asia/Kolkata', NIGHT_IN_INDIA)).toBe('2026-10-04');
    expect(requestDay('Europe/London', new Date('2026-10-03T23:30:00Z'))).toBe('2026-10-04'); // BST, UTC+1
    expect(requestDay('America/Los_Angeles', new Date('2026-10-04T05:00:00Z'))).toBe('2026-10-03'); // 22:00 the day before
    expect(requestDay('UTC', NIGHT_IN_INDIA)).toBe('2026-10-03');
  });

  it('is the UTC date when no time zone was sent: builds from before are filed as they always were', () => {
    expect(requestDay(undefined, NIGHT_IN_INDIA)).toBe('2026-10-03');
    expect(requestDay(null, NIGHT_IN_INDIA)).toBe('2026-10-03');
  });

  it('is the UTC date, not UK time, for anything that is not a time zone', () => {
    // (safeTimeZone falls back to Europe/London for scans; a claim must not move to UK time)
    for (const notAZone of ['Mars/Phobos', '', '   ', 42, {}, ['Asia/Kolkata'], 'x'.repeat(65), 'Asia/Kolkata; DROP TABLE']) {
      expect(requestDay(notAZone, NIGHT_IN_INDIA), String(notAZone)).toBe('2026-10-03');
    }
  });

  it('is today by default, as YYYY-MM-DD', () => {
    expect(requestDay('Asia/Kolkata')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(requestDay()).toBe(new Date().toISOString().slice(0, 10));
  });
});
