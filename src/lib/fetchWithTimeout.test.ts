// A request to the account's server that never answers (the phone says "connected" a moment before the connection carries
// traffic, or a Wi-Fi hand-over drops the packets) used to hang for minutes: the upload behind it waited, and nothing
// retried. Seen on the S21 FE after leaving airplane mode: a queued drink was still unsent minutes later and the request
// was still pending until the next airplane-mode switch aborted it.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithTimeout } from './fetchWithTimeout';

afterEach(() => { vi.useRealTimers(); });

/** a fetch that answers after `ms`, or never; it rejects with an AbortError when its signal fires, as the real one does */
function slowFetch(ms: number | null, status = 200): typeof fetch {
  return (_input, init) => new Promise<Response>((resolve, reject) => {
    const signal = init?.signal;
    if (signal?.aborted) { reject(new DOMException('aborted', 'AbortError')); return; }
    signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    if (ms !== null) setTimeout(() => resolve(new Response('ok', { status })), ms);
  });
}

describe('fetchWithTimeout', () => {
  it('gives up on a request that never answers, with an abort error', async () => {
    vi.useFakeTimers();
    const call = fetchWithTimeout(5_000, slowFetch(null))('https://example.test/x');
    const outcome = call.then(() => 'answered', (e: unknown) => (e as Error).name);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(vi.getTimerCount()).toBeGreaterThan(0); // still waiting
    await vi.advanceTimersByTimeAsync(2);
    expect(await outcome).toBe('AbortError');
  });

  it('passes a prompt answer through untouched and leaves no timer behind', async () => {
    vi.useFakeTimers();
    const call = fetchWithTimeout(5_000, slowFetch(100, 201))('https://example.test/x');
    await vi.advanceTimersByTimeAsync(100);
    const response = await call;
    expect(response.status).toBe(201);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the caller\'s own signal working: aborting it aborts the request', async () => {
    vi.useFakeTimers();
    const mine = new AbortController();
    const call = fetchWithTimeout(5_000, slowFetch(null))('https://example.test/x', { signal: mine.signal });
    const outcome = call.then(() => 'answered', (e: unknown) => (e as Error).name);
    mine.abort();
    expect(await outcome).toBe('AbortError');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refuses at once when the caller\'s signal had already been aborted', async () => {
    vi.useFakeTimers();
    const mine = new AbortController();
    mine.abort();
    const call = fetchWithTimeout(5_000, slowFetch(100))('https://example.test/x', { signal: mine.signal });
    await expect(call).rejects.toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('passes the url and the other options on', async () => {
    const inner = vi.fn(async () => new Response('ok'));
    await fetchWithTimeout(5_000, inner as unknown as typeof fetch)('https://example.test/y', { method: 'POST', body: '{}', headers: { a: 'b' } });
    const [url, init] = inner.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.test/y');
    expect(init).toMatchObject({ method: 'POST', body: '{}', headers: { a: 'b' } });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
