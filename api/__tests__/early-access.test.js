// api/early-access.js with Upstash Redis replaced by an in-memory stand-in: joining, joining again, bad input, the bot
// trap, the rate limit, CORS preflight and Redis being down. (This folder starts with "_", so Vercel doesn't deploy it.)
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = { strings: new Map(), zsets: new Map(), hashes: new Map(), fail: false };
vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: () => {
      const guard = () => { if (store.fail) throw new Error('redis down'); };
      return {
        incr: async key => { guard(); const v = Number(store.strings.get(key) ?? 0) + 1; store.strings.set(key, v); return v; },
        expire: async () => { guard(); return 1; },
        zadd: async (key, opts, { score, member }) => {
          guard();
          const set = store.zsets.get(key) ?? new Map();
          store.zsets.set(key, set);
          if (opts?.nx && set.has(member)) return 0;
          set.set(member, score);
          return 1;
        },
        hset: async (key, fields) => { guard(); store.hashes.set(key, { ...(store.hashes.get(key) ?? {}), ...fields }); return Object.keys(fields).length; },
      };
    },
  },
}));

const { default: handler, normaliseEmail, RATE_LIMIT, LIST_KEY } = await import('../early-access.js');
const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

function call({ method = 'POST', body = {}, headers = {} } = {}) {
  const res = {
    statusCode: 200, headers: {}, body: undefined, ended: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { this.ended = true; return this; },
  };
  const req = { method, body, headers: { 'x-forwarded-for': '203.0.113.7', ...headers } };
  return handler(req, res).then(() => res);
}

beforeEach(() => {
  store.strings.clear();
  store.zsets.clear();
  store.hashes.clear();
  store.fail = false;
  consoleError.mockClear();
});

describe('normaliseEmail', () => {
  it('trims and lower-cases a usable address', () => {
    expect(normaliseEmail('  Maya.Smith@Example.co.uk ')).toBe('maya.smith@example.co.uk');
  });
  it('refuses anything that is not an address', () => {
    for (const bad of ['', 'maya', 'maya@', '@example.com', 'maya@example', 'maya @example.com', 'a@b.', null, 42, {}, `${'a'.repeat(250)}@x.com`]) {
      expect(normaliseEmail(bad)).toBeNull();
    }
  });
});

describe('POST /api/early-access', () => {
  it('adds a new email with the phone it came with', async () => {
    const res = await call({ body: { email: 'Maya@Example.com', platform: 'iphone' } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect([...store.zsets.get(LIST_KEY).keys()]).toEqual(['maya@example.com']);
    const saved = store.hashes.get(`${LIST_KEY}:maya@example.com`);
    expect(saved).toMatchObject({ email: 'maya@example.com', platform: 'iphone', source: 'website' });
    expect(saved.createdAt).toBe(saved.updatedAt);
  });

  it('answers the same the second time, keeps the first join time and updates the phone', async () => {
    await call({ body: { email: 'maya@example.com', platform: 'iphone' } });
    const first = { ...store.hashes.get(`${LIST_KEY}:maya@example.com`) };
    const firstScore = store.zsets.get(LIST_KEY).get('maya@example.com');
    await new Promise(r => setTimeout(r, 5));
    const res = await call({ body: { email: 'MAYA@example.com', platform: 'android' } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const again = store.hashes.get(`${LIST_KEY}:maya@example.com`);
    expect(again.createdAt).toBe(first.createdAt);
    expect(again.platform).toBe('android');
    expect(store.zsets.get(LIST_KEY).get('maya@example.com')).toBe(firstScore);
    expect(store.zsets.get(LIST_KEY).size).toBe(1);
  });

  it('stores an unknown or missing phone as empty', async () => {
    await call({ body: { email: 'a@example.com', platform: 'windows-phone' } });
    await call({ body: { email: 'b@example.com' } });
    expect(store.hashes.get(`${LIST_KEY}:a@example.com`).platform).toBe('');
    expect(store.hashes.get(`${LIST_KEY}:b@example.com`).platform).toBe('');
  });

  it('reads a JSON body sent as text', async () => {
    const res = await call({ body: JSON.stringify({ email: 'text@example.com' }) });
    expect(res.statusCode).toBe(200);
    expect(store.zsets.get(LIST_KEY).has('text@example.com')).toBe(true);
  });

  it('says what is wrong with a bad email and saves nothing', async () => {
    const res = await call({ body: { email: 'not-an-email' } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid_email');
    expect(res.body.message).toMatch(/doesn’t look right/);
    expect(store.zsets.size).toBe(0);
  });

  it('gives bots filling the hidden field a normal answer and saves nothing', async () => {
    const res = await call({ body: { email: 'bot@example.com', company: 'Acme Ltd' } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(store.zsets.size).toBe(0);
    expect(store.strings.size).toBe(0);
  });

  it('limits sign-ups from one address per hour, and keeps only a hash of the IP', async () => {
    for (let i = 0; i < RATE_LIMIT; i += 1) {
      expect((await call({ body: { email: `p${i}@example.com` } })).statusCode).toBe(200);
    }
    const res = await call({ body: { email: 'one-more@example.com' } });
    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe('rate_limited');
    expect(store.zsets.get(LIST_KEY).has('one-more@example.com')).toBe(false);
    const keys = [...store.strings.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain('203.0.113.7');
    // someone else is unaffected
    expect((await call({ body: { email: 'other@example.com' }, headers: { 'x-forwarded-for': '198.51.100.2' } })).statusCode).toBe(200);
  });

  it('answers the CORS preflight and refuses other methods', async () => {
    const preflight = await call({ method: 'OPTIONS', headers: { origin: 'https://localhost' } });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.ended).toBe(true);
    const get = await call({ method: 'GET' });
    expect(get.statusCode).toBe(405);
    expect(get.headers.allow).toBe('POST, OPTIONS');
  });

  it('says so when Redis is down, without leaking the error', async () => {
    store.fail = true;
    const res = await call({ body: { email: 'maya@example.com' } });
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'server_error', message: expect.stringMatching(/couldn’t save/) });
    expect(JSON.stringify(res.body)).not.toContain('redis down');
    expect(consoleError).toHaveBeenCalled();
  });
});
