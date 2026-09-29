// The website's early access list (the form at kinetixfit.co.uk/#early-access, src/site/earlyAccess.ts).
// One entry per email address in Upstash Redis:
//   early_access           sorted set: email → when it first joined (ms since 1970), so the list reads in order
//   early_access:<email>   hash: email, platform (iphone / android / ''), source, createdAt, updatedAt
// Joining again only updates the phone. The answer is the same whether or not the email was already on the list,
// so the form can't be used to find out who has joined. A hidden "company" field catches bots (they get a normal
// answer and nothing is saved), and each IP (kept only as a hash, for an hour) can join a few times an hour.
// Reading the list: Upstash console → ZRANGE early_access 0 -1 WITHSCORES, then HGETALL early_access:<email>.
import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { handleCors } from './_lib/cors.js';

const redis = Redis.fromEnv();

export const LIST_KEY = 'early_access';
export const MAX_EMAIL_LENGTH = 254;
export const PLATFORMS = ['iphone', 'android'];
export const RATE_LIMIT = 8;
export const RATE_WINDOW_S = 60 * 60;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** The email to store (trimmed, lower case), or null if it isn't a usable address. */
export function normaliseEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0] : '').trim() || req.headers['x-real-ip'] || 'unknown';
  return createHash('sha256').update(String(ip)).digest('hex').slice(0, 32);
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'method_not_allowed', message: 'Use POST.' });
  }

  const body = readBody(req);
  // Bots fill in every field they find; people never see this one.
  if (typeof body.company === 'string' && body.company.trim() !== '') {
    return res.status(200).json({ ok: true });
  }

  const email = normaliseEmail(body.email);
  if (!email) {
    return res.status(400).json({ error: 'invalid_email', message: 'That email address doesn’t look right. Check it and try again.' });
  }
  const platform = PLATFORMS.includes(body.platform) ? body.platform : '';

  try {
    const rateKey = `early_access_rate:${clientKey(req)}`;
    const hits = await redis.incr(rateKey);
    if (hits === 1) await redis.expire(rateKey, RATE_WINDOW_S);
    if (hits > RATE_LIMIT) {
      return res.status(429).json({ error: 'rate_limited', message: 'Too many sign-ups from here just now. Please try again in a little while.' });
    }

    const now = new Date();
    const added = await redis.zadd(LIST_KEY, { nx: true }, { score: now.getTime(), member: email });
    const fields = { email, platform, source: 'website', updatedAt: now.toISOString() };
    if (added) fields.createdAt = now.toISOString();
    await redis.hset(`${LIST_KEY}:${email}`, fields);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('early-access: could not save', error?.message);
    return res.status(500).json({ error: 'server_error', message: 'We couldn’t save that just now. Please try again in a minute.' });
  }
}
