// The first script on the home page (site/index.html, <script data-forward>): sign-in and password-reset links,
// failed links and old web-app bookmarks go on to the app at /app/ with everything after the path kept; everything
// else stays on the website. Runs the page's own script text, so what's tested is what ships.
import { describe, expect, it } from 'vitest';
import pageHtml from '../../site/index.html?raw';
import { isRecoveryLink } from '../lib/auth';

const script = pageHtml.match(/<script data-forward>([\s\S]*?)<\/script>/)?.[1] ?? '';

/** Runs the forwarder for an address; returns where it sent the browser, or null if it stayed. */
function visit(address: string): string | null {
  const url = new URL(address, 'https://www.kinetixfit.co.uk');
  let target: string | null = null;
  const location = { hash: url.hash, search: url.search, replace: (to: string) => { target = to; } };
  // the script is `(function (l) { … })(location);`, so it reads the `location` we pass in
  new Function('location', script)(location);
  return target;
}

describe('the home page forwarder', () => {
  it('is the first script on the page', () => {
    expect(script).toContain('l.replace');
    const firstScript = pageHtml.indexOf('<script');
    expect(pageHtml.indexOf('<script data-forward>')).toBe(firstScript);
  });

  it('sends a password-reset link to the app with its tokens', () => {
    const link = '/#access_token=abc.def&expires_in=3600&refresh_token=r1&token_type=bearer&type=recovery';
    expect(visit(link)).toBe(`/app/${link.slice(1)}`);
    // …which the app then reads as a reset link
    expect(isRecoveryLink(new URL(visit(link)!, 'https://x.test').hash)).toBe(true);
  });

  it('sends Google sign-in returns and PKCE codes to the app', () => {
    expect(visit('/#access_token=abc&refresh_token=r1&provider_token=g')).toBe('/app/#access_token=abc&refresh_token=r1&provider_token=g');
    expect(visit('/?code=4f3c2a')).toBe('/app/?code=4f3c2a');
  });

  it('sends failed and expired links to the app, which explains them', () => {
    expect(visit('/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid')).toBe(
      '/app/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid',
    );
    expect(visit('/?error=server_error&error_code=unexpected_failure')).toBe('/app/?error=server_error&error_code=unexpected_failure');
  });

  it('sends old bookmarks of the web app’s screens to the app', () => {
    expect(visit('/#vitals')).toBe('/app/#vitals');
    expect(visit('/#nourish')).toBe('/app/#nourish');
    expect(visit('/#account/details')).toBe('/app/#account/details');
    expect(visit('/#profile')).toBe('/app/#profile');
    expect(visit('/#hub')).toBe('/app/#hub');
  });

  it('keeps visitors on the website, including its own sections', () => {
    for (const address of ['/', '/#why', '/#features', '/#rewards', '/#how', '/#faq', '/#early-access', '/?utm_source=instagram', '/#accounts', '/#vitalsigns', '/?coded=1']) {
      expect(visit(address), address).toBeNull();
    }
  });
});
