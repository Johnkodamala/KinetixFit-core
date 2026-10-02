// @vitest-environment jsdom
// The website's pages as documents: structure a screen reader can follow, links that go somewhere real, forms with
// labels, the details search engines and link previews read, and copy that only claims what the app really does.
import { describe, expect, it } from 'vitest';
import pageHtml from '../../site/index.html?raw';
import notFoundHtml from '../../site/404.html?raw';
import vercelJson from '../../vercel.json?raw';
import mealIdeasSource from '../lib/mealIdeas.ts?raw';
import moveRemindersSource from '../lib/moveReminders.ts?raw';
import notificationsSource from '../lib/notifications.ts?raw';
import { COUNTRIES } from '../lib/countries';
import { MOVE_MINUTES_OPTIONS } from '../lib/moveReminders';
import { FREE_DAILY_SCANS, PLUS_BENEFITS, PLUS_DAILY_SCANS } from '../lib/plus';
import { APP_ICONS } from '../lib/appIcons';
import { mainTargets, moreTargets } from '../lib/nutrition';
import { REWARDS } from './config';
import { formatGBP, formatPoints } from './format';

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const page = parse(pageHtml);
const notFound = parse(notFoundHtml);
const text = (doc: Document) => (doc.body.textContent ?? '').replace(/\s+/g, ' ');
const vercel = JSON.parse(vercelJson) as { rewrites: { source: string }[] };

// Pages that exist on the website: the site, the web app, and the rewrites in vercel.json
const ROUTES = new Set(['/', '/app/', ...vercel.rewrites.map(r => r.source).filter(s => !s.includes('('))]);

describe('structure', () => {
  it('has one h1 and never skips a heading level', () => {
    for (const doc of [page, notFound]) {
      expect(doc.querySelectorAll('h1')).toHaveLength(1);
      let previous = 1;
      doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
        const level = Number(h.tagName[1]);
        expect(level - previous, h.textContent ?? '').toBeLessThanOrEqual(1);
        previous = level;
      });
    }
  });

  it('has the landmarks and a skip link to the main content', () => {
    expect(page.querySelector('header')).not.toBeNull();
    expect(page.querySelector('nav[aria-label="Main"]')).not.toBeNull();
    expect(page.querySelector('main#main')).not.toBeNull();
    expect(page.querySelector('footer')).not.toBeNull();
    expect(page.querySelector('a.skip-link')?.getAttribute('href')).toBe('#main');
  });

  it('labels every section and names every landmark nav', () => {
    page.querySelectorAll('main > section').forEach(section => {
      const label = section.getAttribute('aria-labelledby');
      if (label) expect(page.getElementById(label), label).not.toBeNull();
      else expect(section.getAttribute('aria-label'), section.className).toBeTruthy();
    });
    page.querySelectorAll('nav').forEach(nav => expect(nav.getAttribute('aria-label')).toBeTruthy());
  });

  it('gives every section the nav links to', () => {
    const navTargets = [...page.querySelectorAll('.site-nav__link')].map(a => a.getAttribute('href'));
    expect(navTargets).toEqual(['#why', '#features', '#rewards', '#how', '#faq']);
    const menuTargets = [...page.querySelectorAll('.mobile-menu__list a')].map(a => a.getAttribute('href'));
    expect(menuTargets).toEqual(navTargets);
  });
});

describe('links', () => {
  const links = [...page.querySelectorAll<HTMLAnchorElement>('a[href]')];

  it('every in-page link lands on something', () => {
    links.filter(a => a.getAttribute('href')!.startsWith('#')).forEach(a => {
      expect(page.getElementById(a.getAttribute('href')!.slice(1)), a.outerHTML).not.toBeNull();
    });
  });

  it('every link to our own pages is a page that exists', () => {
    for (const doc of [page, notFound]) {
      doc.querySelectorAll<HTMLAnchorElement>('a[href^="/"]').forEach(a => {
        const path = a.getAttribute('href')!.split('#')[0] || '/';
        expect(ROUTES.has(path), a.getAttribute('href')!).toBe(true);
      });
    }
  });

  it('opens outside sites in a new tab, safely, and says so', () => {
    links.filter(a => /^https?:/.test(a.getAttribute('href')!)).forEach(a => {
      expect(a.target, a.href).toBe('_blank');
      expect(a.rel).toContain('noopener');
      expect(a.textContent, a.href).toMatch(/opens in a new tab/);
    });
  });

  it('has no empty or placeholder links', () => {
    links.forEach(a => {
      expect(a.getAttribute('href')).not.toMatch(/^(#|javascript:|)$/);
      expect((a.textContent ?? '').trim() || a.getAttribute('aria-label'), a.outerHTML).toBeTruthy();
    });
  });

  it('points "Log in" at the web app', () => {
    const appLinks = [...page.querySelectorAll('[data-app-link]')];
    expect(appLinks.length).toBeGreaterThanOrEqual(4);
    appLinks.forEach(a => expect(a.getAttribute('href')).toBe('/app/'));
  });
});

describe('images and icons', () => {
  it('hides decorative SVGs from screen readers and describes the mockup', () => {
    page.querySelectorAll('svg').forEach(svg => {
      const hidden = svg.closest('[aria-hidden="true"]') || svg.getAttribute('aria-hidden') === 'true';
      const labelled = svg.getAttribute('role') === 'img' && svg.getAttribute('aria-label');
      expect(hidden || labelled, svg.outerHTML.slice(0, 80)).toBeTruthy();
    });
    const phone = page.querySelector('.phone');
    expect(phone?.getAttribute('role')).toBe('img');
    expect(phone?.getAttribute('aria-label')).toMatch(/Today screen/);
  });

  it('has no images without alt text', () => {
    page.querySelectorAll('img').forEach(img => expect(img.hasAttribute('alt')).toBe(true));
  });
});

describe('the early access form', () => {
  const form = page.querySelector<HTMLFormElement>('[data-signup]')!;

  it('posts to the endpoint even without JS', () => {
    expect(form.getAttribute('action')).toBe('/api/early-access');
    expect(form.getAttribute('method')).toBe('post');
  });

  it('labels every field and links the email error to its input', () => {
    form.querySelectorAll('input:not([type="radio"])').forEach(input => {
      expect(form.querySelector(`label[for="${input.id}"]`), input.getAttribute('name')!).not.toBeNull();
    });
    const email = form.querySelector('input[name="email"]')!;
    expect(email.getAttribute('type')).toBe('email');
    expect(email.getAttribute('autocomplete')).toBe('email');
    expect(email.hasAttribute('required')).toBe(true);
    expect(page.getElementById(email.getAttribute('aria-describedby')!)).not.toBeNull();
    // the phone choice is a fieldset with a legend
    expect(form.querySelector('fieldset legend')?.textContent).toMatch(/phone/i);
  });

  it('keeps the bot trap out of reach of people and screen readers', () => {
    const trap = form.querySelector('.signup__trap')!;
    expect(trap.getAttribute('aria-hidden')).toBe('true');
    expect(trap.querySelector('input')?.getAttribute('tabindex')).toBe('-1');
  });

  it('announces what happens', () => {
    expect(form.querySelector('[data-status]')?.getAttribute('aria-live')).toBe('polite');
    expect(form.querySelector('[data-done]')?.hasAttribute('hidden')).toBe(true);
  });

  it('links to the privacy policy next to the email box', () => {
    expect(form.querySelector('a[href="/privacy-policy"]')).not.toBeNull();
  });
});

describe('what search engines and link previews see', () => {
  const meta = (selector: string) => page.querySelector(selector)?.getAttribute('content') ?? '';

  it('has a title and description of a sensible length', () => {
    expect(page.title.length).toBeGreaterThan(20);
    expect(page.title.length).toBeLessThanOrEqual(60);
    expect(meta('meta[name="description"]').length).toBeGreaterThan(70);
    expect(meta('meta[name="description"]').length).toBeLessThanOrEqual(160);
    expect(page.documentElement.lang).toBe('en-GB');
  });

  it('has a canonical address and full Open Graph + Twitter cards', () => {
    expect(page.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://www.kinetixfit.co.uk/');
    for (const p of ['og:title', 'og:description', 'og:url', 'og:image', 'og:type', 'og:site_name']) {
      expect(meta(`meta[property="${p}"]`), p).toBeTruthy();
    }
    expect(meta('meta[property="og:image"]')).toMatch(/^https:\/\/www\.kinetixfit\.co\.uk\//);
    expect(meta('meta[name="twitter:card"]')).toBe('summary_large_image');
  });

  it('has valid structured data about the company and the app', () => {
    const data = JSON.parse(page.querySelector('script[type="application/ld+json"]')!.textContent!);
    const types = data['@graph'].map((n: { '@type': string }) => n['@type']);
    expect(types).toEqual(expect.arrayContaining(['Organization', 'WebSite', 'MobileApplication']));
    const org = data['@graph'].find((n: { '@type': string }) => n['@type'] === 'Organization');
    expect(org.legalName).toBe('JN Global Ventures LTD');
    expect(org.email).toBe('info@kinetixfit.co.uk');
  });

  it('keeps the 404 page out of search results', () => {
    expect(notFound.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
  });
});

describe('copy that only says what is true', () => {
  const words = text(page);

  it('quotes the real reward numbers (and the static fallbacks match what JS fills in)', () => {
    const expected: Record<string, string> = {
      voucherPoints: formatPoints(REWARDS.voucherPoints), voucherValue: formatGBP(REWARDS.voucherValueGBP),
      donationPoints: formatPoints(REWARDS.donationPoints), donationValue: formatGBP(REWARDS.donationValueGBP),
      checkIn: String(REWARDS.checkIn), firstScan: String(REWARDS.firstScan), streakWeek: String(REWARDS.streakWeek),
      levelUp: String(REWARDS.levelUp), questMin: String(REWARDS.questMin), questMax: String(REWARDS.questMax),
    };
    page.querySelectorAll<HTMLElement>('[data-reward]').forEach(el => {
      expect(el.textContent, el.dataset.reward).toBe(expected[el.dataset.reward!]);
    });
    const faq = text(page).slice(text(page).indexOf('How do rewards work?'));
    expect(faq).toContain(`At ${formatPoints(REWARDS.donationPoints)} points you can give ${formatGBP(REWARDS.donationValueGBP)}`);
    expect(faq).toContain(`or, if you’re a Plus member, get a ${formatGBP(REWARDS.voucherValueGBP)} coffee voucher`);
  });

  it('says how long a coffee takes, in line with a perfect month', () => {
    const weeks = (REWARDS.voucherPoints / REWARDS.perfectMonth) * (30 / 7);
    expect(weeks).toBeGreaterThanOrEqual(4);
    expect(weeks).toBeLessThan(5);
    expect(words).toContain('a coffee takes about a month');
  });

  it('gets the scan allowance right', () => {
    expect(words).toContain(`${PLUS_DAILY_SCANS} a day instead of ${FREE_DAILY_SCANS}`);
  });

  it('lists the plans as the app defines them: scans, and the free and Plus app icons', () => {
    expect(page.querySelector('[data-plan="freeScans"]')!.textContent).toBe(String(FREE_DAILY_SCANS));
    expect(page.querySelector('[data-plan="plusScans"]')!.textContent).toBe(String(PLUS_DAILY_SCANS));
    const iconsIn = (row: string) => [...page.querySelectorAll(`[data-icons="${row}"] img`)].map(img => img.getAttribute('src')!.match(/app-icons\/(.+)\.webp$/)![1]);
    expect(iconsIn('free')).toEqual(APP_ICONS.filter(i => !i.plus).map(i => i.id));
    expect(iconsIn('plus')).toEqual(APP_ICONS.filter(i => i.plus).map(i => i.id));
    expect(words).toContain('Two app icons');
    expect(words).toContain('Seven more app icons');
    // every Plus benefit the app lists is on the page, in some form
    expect(PLUS_BENEFITS).toHaveLength(5);
    for (const phrase of ['photo or barcode scans a day', 'Coffee vouchers for your points, one a month', 'AI meal ideas', 'Plus widgets', 'Seven more app icons']) {
      expect(words, phrase).toContain(phrase);
    }
    // icons below the fold wait until they're needed
    page.querySelectorAll('.plan img').forEach(img => expect(img.getAttribute('loading')).toBe('lazy'));
  });

  it('counts the countries and UK allergens the app really has', () => {
    const numberWords = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    expect(words).toContain(`supports ${numberWords[COUNTRIES.length]} countries`);
    const uk = COUNTRIES.find(c => c.code === 'GB')!;
    expect(words).toContain(`the ${uk.allergens.length} UK allergens`);
    const meals = (mealIdeasSource.match(/^\s*m\('/gm) ?? []).length;
    expect(meals).toBeGreaterThan(100);
    expect(words).toContain('ranks over 100 everyday meals');
  });

  it('counts the nutrients the app tracks against targets', () => {
    const plan = { calories: 2085, protein: 87, carbs: 293, fat: 63, fiber: 30 };
    const count = mainTargets(plan).length + moreTargets(plan, { sex: 'female', age: 29, country: 'GB' }).length;
    expect(count).toBe(11);
    expect(words).toContain(`${count} nutrients`);
  });

  it('shows the example meal with the food table’s real numbers', () => {
    // 2 roti (68 g each, 297 kcal / 100 g) and a cup of dal (240 g, 145 kcal / 100 g): USDA, via src/lib/foodTable.ts
    expect(words).toContain('404 kcal');
    expect(words).toContain('348 kcal');
    expect(words).toContain('752 kcal');
  });

  it('names the company exactly as the legal pages do', () => {
    expect(words).toContain('JN Global Ventures LTD');
    expect(words).toContain('company number 17268312');
    expect(words).not.toContain('ZC236047');
  });

  it('never says you need a gym', () => {
    for (const doc of [page, notFound]) expect(text(doc)).not.toMatch(/\bgyms?\b/i);
    expect(page.getElementById('how-title')!.textContent).toBe('Four steps. Start where you are.');
  });

  it('keeps "Your day" to what the rest of the page doesn’t show', () => {
    const day = page.getElementById('day')!;
    expect([...day.querySelectorAll('.day__item h3')].map(h => h.textContent)).toEqual(['Morning check-in', 'Steps, sleep and heart rate, synced', 'A nudge to move', 'Gut check']);
    expect([...day.querySelectorAll('.also__item h4')].map(h => h.textContent)).toEqual(['Allergies and diet', 'Made for where you live', 'Levels and achievements']);
    const numberWords = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    expect(day.textContent).toContain(`in ${numberWords[COUNTRIES.length]} countries`);
  });

  it('shows the movement break in the app’s own words, as often as the app allows', () => {
    const note = page.querySelector('#day .ui-note')!;
    const title = note.querySelector('.ui-note__title')!.textContent!;
    const body = note.querySelector('.ui-note__body')!.textContent!;
    expect(moveRemindersSource).toContain(`{ title: '${title}', body: '${body}',`);
    expect(Math.min(...MOVE_MINUTES_OPTIONS)).toBe(45);
    expect(Math.max(...MOVE_MINUTES_OPTIONS)).toBe(120);
    expect(text(page)).toContain('every 45 minutes to two hours in the hours you choose');
    // Android waits for stillness (MoveReminderReceiver checks the step counter); water reminders carry "Add a glass"
    expect(moveRemindersSource).toContain('after `minutes` in use with no steps it sends one notification');
    expect(text(page)).toContain('with Add a glass right in the notification');
    expect(notificationsSource).toContain("{ id: ACTION_ADD_GLASS, title: 'Add a glass' }");
  });

  it('uses no emoji and no placeholder text', () => {
    for (const doc of [page, notFound]) {
      // emoji shown as emoji (© and ® are only pictographic when asked to be, with U+FE0F)
      expect(text(doc)).not.toMatch(/\p{Emoji_Presentation}|\uFE0F/u);
      expect(text(doc)).not.toMatch(/lorem|ipsum|TODO|TBD|\bxxx\b/i);
    }
  });

  it('writes UK English', () => {
    expect(words).not.toMatch(/\bfiber\b|\bcolor\b|\bcenter\b|\borganize\b|\bpersonalize\b/i);
    expect(words).toContain('fibre');
  });

  it('never claims the app is in the stores yet', () => {
    expect(words).toMatch(/coming soon/i);
    expect(words).not.toMatch(/download now|available now|get it on google play|download on the app store/i);
  });
});
