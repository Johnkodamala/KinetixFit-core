// api/sync-health-data.js: the phone's periodic health snapshot, which api/complete-quest.js checks a steps or recovery
// quest against. It is filed under the same day the quest will be claimed under: the phone's own date when the request
// sends its time zone, the UTC date when it doesn't (builds from before).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map();
vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: () => ({ set: async (key, value) => { store.set(key, value); return 'OK'; } }) },
}));

const { default: handler } = await import('../sync-health-data.js');

function call(body, method = 'POST') {
  const res = {
    statusCode: 200, body: undefined,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; },
  };
  return handler({ method, body, headers: {} }, res).then(() => res);
}

// 00:30 on 4 Oct in India: still 3 Oct in UTC
const NIGHT_IN_INDIA = new Date('2026-10-03T19:00:00Z');

beforeEach(() => { store.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NIGHT_IN_INDIA); });
afterEach(() => { vi.useRealTimers(); });

describe('sync-health-data', () => {
  it('keeps the numbers it was sent, and null for anything that is not a number', async () => {
    const res = await call({ appUserId: 'maya@example.com', steps: 4200, liveBpm: 'fast', liveHrv: null, sleepQualityPercent: 55 });
    expect(res.statusCode).toBe(200);
    const [, saved] = [...store.entries()][0];
    expect(JSON.parse(saved)).toMatchObject({ steps: 4200, liveBpm: null, liveHrv: null, sleepQualityPercent: 55 });
  });

  it('files it under the UTC date when the request sends no time zone (builds from before)', async () => {
    await call({ appUserId: 'maya@example.com', steps: 10 });
    expect([...store.keys()]).toEqual(['health_snapshot:maya@example.com:2026-10-03']);
  });

  it("files it under the phone's own date when it sends its time zone", async () => {
    await call({ appUserId: 'maya@example.com', steps: 10, timeZone: 'Asia/Kolkata' });
    expect([...store.keys()]).toEqual(['health_snapshot:maya@example.com:2026-10-04']);
  });

  it('treats a time zone that is not one as none', async () => {
    await call({ appUserId: 'maya@example.com', steps: 10, timeZone: 'Mars/Phobos' });
    expect([...store.keys()]).toEqual(['health_snapshot:maya@example.com:2026-10-03']);
  });

  it('needs an account and a POST', async () => {
    expect((await call({ steps: 10 })).statusCode).toBe(400);
    expect((await call({ appUserId: 'maya@example.com' }, 'GET')).statusCode).toBe(405);
    expect(store.size).toBe(0);
  });
});
