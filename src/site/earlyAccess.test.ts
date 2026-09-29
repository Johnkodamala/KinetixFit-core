// @vitest-environment jsdom
// The early access form: plain-words checks before sending, every server answer turned into something useful,
// nothing typed ever lost, and the success state announced.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pageHtml from '../../site/index.html?raw';
import { emailError, initEarlyAccess, readPayload, submitEarlyAccess, type EarlyAccessPayload } from './earlyAccess';
import { loadPage, nextFrame } from './testing';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const payload: EarlyAccessPayload = { email: 'maya@example.com', platform: 'android', company: '' };

describe('emailError', () => {
  it('asks for an email when there is none', () => {
    expect(emailError('')).toBe('Enter your email address.');
    expect(emailError('   ')).toBe('Enter your email address.');
  });
  it('flags addresses that cannot work', () => {
    for (const bad of ['maya', 'maya@', 'maya@example', '@example.com', 'maya @example.com', 'maya@example..com', `${'a'.repeat(250)}@example.com`]) {
      expect(emailError(bad), bad).toMatch(/doesn’t look right/);
    }
  });
  it('accepts real ones, including subdomains and plus tags', () => {
    for (const good of ['maya@example.com', ' maya+kx@mail.example.co.uk ', 'j.o@sub.domain.io']) {
      expect(emailError(good), good).toBeNull();
    }
  });
});

describe('submitEarlyAccess', () => {
  it('posts JSON to the endpoint', async () => {
    const fetchSpy = vi.fn(async () => json({ ok: true }));
    await expect(submitEarlyAccess(payload, fetchSpy as unknown as typeof fetch)).resolves.toEqual({ ok: true });
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/early-access');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });

  it('turns a 400 into an email message', async () => {
    const result = await submitEarlyAccess(payload, (async () => json({ error: 'invalid_email', message: 'That email address doesn’t look right.' }, 400)) as typeof fetch);
    expect(result).toEqual({ ok: false, field: 'email', message: 'That email address doesn’t look right.' });
  });

  it('turns a 429 into a try-later message', async () => {
    const result = await submitEarlyAccess(payload, (async () => json({ error: 'rate_limited' }, 429)) as typeof fetch);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/Too many sign-ups/);
  });

  it('turns a server error or a non-JSON page into a message with our email', async () => {
    const html = (async () => new Response('<html>Bad gateway</html>', { status: 502 })) as typeof fetch;
    const result = await submitEarlyAccess(payload, html);
    expect(!result.ok && result.message).toMatch(/info@kinetixfit\.co\.uk/);
  });

  it('turns a network failure or a timeout into a connection message', async () => {
    const offline = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
    expect(await submitEarlyAccess(payload, offline)).toEqual({ ok: false, message: expect.stringMatching(/Check your connection/) });
    const hanging = ((_: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as unknown as typeof fetch;
    expect(await submitEarlyAccess(payload, hanging, 20)).toEqual({ ok: false, message: expect.stringMatching(/Check your connection/) });
  });
});

describe('the form on the page', () => {
  let form: HTMLFormElement;
  let email: HTMLInputElement;
  const submit = () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  const errorText = () => form.querySelector<HTMLElement>('[data-error]')!;

  beforeEach(() => {
    loadPage(pageHtml);
    form = document.querySelector('[data-signup]')!;
    email = form.querySelector('input[name="email"]')!;
  });
  afterEach(() => vi.restoreAllMocks());

  it('reads the email, phone and trap field', () => {
    email.value = '  maya@example.com ';
    form.querySelector<HTMLInputElement>('input[value="iphone"]')!.checked = true;
    expect(readPayload(form)).toEqual({ email: 'maya@example.com', platform: 'iphone', company: '' });
  });

  it('explains a bad email without sending anything, then clears the message once it is fixed', async () => {
    const fetchSpy = vi.fn();
    initEarlyAccess(document, fetchSpy as unknown as typeof fetch);
    email.value = 'maya@';
    submit();
    await nextFrame();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errorText().hidden).toBe(false);
    expect(errorText().textContent).toMatch(/doesn’t look right/);
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(email);
    email.value = 'maya@example.com';
    email.dispatchEvent(new Event('input'));
    expect(errorText().hidden).toBe(true);
    expect(email.hasAttribute('aria-invalid')).toBe(false);
  });

  it('shows it is working, then says thank you with the email, and moves focus there', async () => {
    let finish!: (r: Response) => void;
    const fetchSpy = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    initEarlyAccess(document, fetchSpy as unknown as typeof fetch);
    email.value = 'maya@example.com';
    submit();
    const button = form.querySelector<HTMLButtonElement>('[data-submit]')!;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.textContent).toMatch(/Joining/);
    // a second press while it's sending does nothing
    submit();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    finish(json({ ok: true }));
    await nextFrame();
    const done = form.querySelector<HTMLElement>('[data-done]')!;
    expect(done.hidden).toBe(false);
    expect(form.querySelector<HTMLElement>('.signup__fields')!.hidden).toBe(true);
    expect(done.textContent).toContain('maya@example.com');
    expect(document.activeElement).toBe(done);
  });

  it('keeps what was typed and says what happened when the server can’t be reached', async () => {
    initEarlyAccess(document, (async () => { throw new TypeError('offline'); }) as typeof fetch);
    email.value = 'maya@example.com';
    submit();
    await nextFrame();
    const status = form.querySelector('[data-status]')!;
    expect(status.textContent).toMatch(/Check your connection/);
    expect(email.value).toBe('maya@example.com');
    expect(form.querySelector<HTMLElement>('.signup__fields')!.hidden).toBe(false);
    const button = form.querySelector<HTMLButtonElement>('[data-submit]')!;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toMatch(/Get early access/);
    // typing again clears the message
    email.dispatchEvent(new Event('input'));
    expect(status.textContent).toBe('');
  });

  it('shows the server’s email message on the field', async () => {
    initEarlyAccess(document, (async () => json({ message: 'That email address doesn’t look right. Check it and try again.' }, 400)) as typeof fetch);
    email.value = 'maya@example.com';
    submit();
    await nextFrame();
    expect(errorText().hidden).toBe(false);
    expect(email.getAttribute('aria-invalid')).toBe('true');
  });
});
