// The server files a quest claim, the health snapshot that verifies it, the first-scan bonus and the "2 quests today" gate
// of a voucher under the phone's own date, but only when the request says which time zone that is (requestDay in
// api/_lib/countries.js); without it the server falls back to the UTC date, which is hours behind in India and brings back the
// "already claimed" at 01:00. So every one of these requests must carry the phone's time zone.
import { describe, expect, it } from 'vitest';
import app from '../App.tsx?raw';

const requestBlock = (path: string) => {
  const start = app.indexOf(`serverUrl('${path}')`);
  expect(start, `${path} is called from App.tsx`).toBeGreaterThan(-1);
  return app.slice(start, start + 800);
};

describe('requests the server files by day', () => {
  for (const path of ['/api/complete-quest', '/api/sync-health-data', '/api/redeem-voucher']) {
    it(`${path} sends the phone's time zone`, () => {
      expect(requestBlock(path)).toContain('timeZone: deviceTimeZone()');
    });
  }
});
