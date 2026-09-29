// The early access form (#early-access → POST /api/early-access, api/early-access.js). Checks the email on the
// page first, says exactly what went wrong when something does, and never loses what was typed. Without JS the
// form still posts to the same address.
import { CONTACT_EMAIL, EARLY_ACCESS_ENDPOINT } from './config';

export const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const TIMEOUT_MS = 10000;

export type Platform = 'iphone' | 'android';

export interface EarlyAccessPayload {
  email: string;
  platform: Platform | null;
  /** the hidden honeypot field: people leave it empty, bots fill it in */
  company: string;
}

export type SubmitResult =
  | { ok: true }
  | { ok: false; field?: 'email'; message: string };

/** What's wrong with an email address, in plain words, or null if it looks right. */
export function emailError(raw: string): string | null {
  const value = raw.trim();
  if (value === '') return 'Enter your email address.';
  if (value.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(value)) {
    return 'That email address doesn’t look right. Check it and try again.';
  }
  return null;
}

export function readPayload(form: HTMLFormElement): EarlyAccessPayload {
  const data = new FormData(form);
  const platform = data.get('platform');
  return {
    email: String(data.get('email') ?? '').trim(),
    platform: platform === 'iphone' || platform === 'android' ? platform : null,
    company: String(data.get('company') ?? ''),
  };
}

const NETWORK_MESSAGE = `Couldn’t reach Kinetix Fit just now. Check your connection and try again, or email ${CONTACT_EMAIL}.`;

/** Sends the sign-up and turns every answer into something the page can show. */
export async function submitEarlyAccess(
  payload: EarlyAccessPayload,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = TIMEOUT_MS,
): Promise<SubmitResult> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(EARLY_ACCESS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });
    if (response.ok) return { ok: true };
    let body: { error?: string; message?: string } = {};
    try {
      body = await response.json();
    } catch {
      // not JSON (a proxy error page): fall through to the generic message
    }
    if (response.status === 400) {
      return { ok: false, field: 'email', message: body.message || 'That email address doesn’t look right. Check it and try again.' };
    }
    if (response.status === 429) {
      return { ok: false, message: body.message || 'Too many sign-ups from here just now. Please try again in a little while.' };
    }
    return { ok: false, message: body.message || `Something went wrong on our side. Please try again, or email ${CONTACT_EMAIL}.` };
  } catch {
    return { ok: false, message: NETWORK_MESSAGE };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function initEarlyAccess(doc: Document = document, fetchImpl?: typeof fetch): HTMLFormElement | null {
  const form = doc.querySelector<HTMLFormElement>('[data-signup]');
  if (!form) return null;
  const email = form.querySelector<HTMLInputElement>('input[name="email"]');
  const error = form.querySelector<HTMLElement>('[data-error]');
  const status = form.querySelector<HTMLElement>('[data-status]');
  const submit = form.querySelector<HTMLButtonElement>('[data-submit]');
  const label = submit?.querySelector<HTMLElement>('.signup__submit-label');
  const fields = form.querySelector<HTMLElement>('.signup__fields');
  const done = form.querySelector<HTMLElement>('[data-done]');
  const doneText = form.querySelector<HTMLElement>('[data-done-text]');
  if (!email || !error || !status || !submit || !label || !fields || !done) return null;
  const idleLabel = label.textContent ?? 'Get early access';
  let busy = false;

  const showFieldError = (message: string | null) => {
    error.textContent = message ?? '';
    error.hidden = !message;
    if (message) email.setAttribute('aria-invalid', 'true');
    else email.removeAttribute('aria-invalid');
  };

  // Once someone has seen an error, re-check as they fix it, so the message goes away the moment it's right.
  email.addEventListener('input', () => {
    if (email.getAttribute('aria-invalid') === 'true') showFieldError(emailError(email.value));
    status.textContent = '';
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    status.textContent = '';
    const payload = readPayload(form);
    const problem = emailError(payload.email);
    if (problem) {
      showFieldError(problem);
      email.focus();
      return;
    }
    showFieldError(null);

    busy = true;
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    label.textContent = 'Joining…';
    const result = await submitEarlyAccess(payload, fetchImpl ?? doc.defaultView?.fetch.bind(doc.defaultView) ?? fetch);
    busy = false;
    submit.disabled = false;
    submit.removeAttribute('aria-busy');
    label.textContent = idleLabel;

    if (result.ok) {
      fields.hidden = true;
      if (doneText) doneText.textContent = `We’ll email ${payload.email} the day Kinetix Fit is ready.`;
      done.hidden = false;
      done.focus();
      return;
    }
    if (result.field === 'email') {
      showFieldError(result.message);
      email.focus();
    } else {
      status.textContent = result.message;
    }
  });
  return form;
}
