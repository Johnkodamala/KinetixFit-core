// End-to-end checks of the website build, served like Vercel serves it (scripts/site-check/serve.mjs): routing and
// the auth forwarder, nav, the phone menu, CTAs, FAQ, the early access form (every server answer mocked), the opening
// animation, the phone's demo, the five feature chapters' demos, the widgets (the home screen's story, the Light / Dark
// switch, the wall of 14), the rewards story, reduced motion, layout stability,
// 23 screen sizes, larger text, touch targets, axe (WCAG 2.2 AA) and page weight. Pages open as a returning visitor (the opening animation already seen)
// unless a check asks for a first visit.
// Every request that isn't to localhost is aborted, so nothing reaches production.
//
// Playwright and axe-core aren't project dependencies: install them in a scratch folder and point PW_DIR at it.
//   npm run build:web && node scripts/site-check/serve.mjs &
//   PW_DIR=/tmp/kx-pw node scripts/site-check/e2e.mjs [http://localhost:5190] [outDir]
//   ENGINE=webkit PW_DIR=/tmp/kx-pw node scripts/site-check/e2e.mjs      (Safari's engine; keys follow Safari's Tab rules)
// (/tmp/kx-pw: `npm init -y && npm i playwright axe-core`; the browsers are in ~/Library/Caches/ms-playwright.)
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const pwDir = process.env.PW_DIR;
if (!pwDir) throw new Error('Set PW_DIR to a folder with playwright and axe-core installed (see the header).');
const require = createRequire(join(pwDir, 'package.json'));
const { chromium, webkit } = require('playwright');
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const [BASE = 'http://localhost:5190', OUT = mkdtempSync(join(tmpdir(), 'kx-site-check-'))] = process.argv.slice(2);
const results = [];
const check = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? '' });
  } catch (error) {
    results.push({ name, ok: false, detail: String(error?.message ?? error).split('\n')[0] });
  }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const engine = process.env.ENGINE === 'webkit' ? webkit : chromium;
const browser = await engine.launch();
console.log('engine:', process.env.ENGINE || 'chromium');
const TAB = process.env.ENGINE === 'webkit' ? 'Alt+Tab' : 'Tab';

async function newPage({ width = 1440, height = 900, reducedMotion = 'no-preference', api = null, scale = 1, intro = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion, deviceScaleFactor: scale });
  if (!intro) await ctx.addInitScript(() => { try { sessionStorage.setItem('kx_intro_seen', '1'); } catch { /* about:blank */ } });
  const errors = [];
  const requests = [];
  await ctx.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'localhost') return route.abort();
    if (url.pathname === '/api/early-access') {
      requests.push({ method: route.request().method(), body: route.request().postData() });
      const reply = api ? api(route.request()) : { status: 200, body: { ok: true } };
      if (reply === 'abort') return route.abort();
      return route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body) });
    }
    return route.continue();
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return { ctx, page, errors, requests };
}

const inView = (page, selector) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight };
}, selector);

const waitScroll = page => page.waitForFunction(() => new Promise(resolve => {
  let last = scrollY, same = 0;
  const tick = () => { if (scrollY === last) same += 1; else { same = 0; last = scrollY; } if (same > 20) resolve(true); else requestAnimationFrame(tick); };
  tick();
}));

// ---------------------------------------------------------------------------------------------------------------
// Routing and pages
// ---------------------------------------------------------------------------------------------------------------
await check('home page loads with no console errors', async () => {
  const { ctx, page, errors } = await newPage();
  const res = await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  assert(res.status() === 200, `status ${res.status()}`);
  assert((await page.title()).startsWith('Kinetix Fit | The fitness app'), await page.title());
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await check('/app/ and /app open the web app (sign-in screen)', async () => {
  for (const path of ['/app/', '/app']) {
    const { ctx, page, errors } = await newPage({ width: 390, height: 844 });
    await page.addInitScript(() => sessionStorage.setItem('kx_intro_seen', '1'));
    const res = await page.goto(BASE + path, { waitUntil: 'networkidle' });
    assert(res.status() === 200, `${path} status ${res.status()}`);
    await page.waitForSelector('.ob-hero-title', { timeout: 8000 });
    const title = await page.textContent('.ob-hero-title');
    assert(/Welcome|Kinetix Fit/.test(title), title);
    const bad = errors.filter(e => !/Failed to load resource|ERR_FAILED|net::/.test(e));
    assert(bad.length === 0, bad.join(' | '));
    await ctx.close();
  }
});

await check('a password-reset link on / goes on to the app, tokens intact, and shows "Choose a new password"', async () => {
  const { ctx, page } = await newPage({ width: 390, height: 844 });
  await page.addInitScript(() => sessionStorage.setItem('kx_intro_seen', '1'));
  const hash = '#access_token=fake.jwt.value&expires_in=3600&refresh_token=r1&token_type=bearer&type=recovery';
  await page.goto(BASE + '/' + hash);
  await page.waitForURL(/\/app\//, { timeout: 5000 });
  assert(page.url().includes('/app/'), page.url());
  await page.waitForSelector('.ob-hero-title', { timeout: 8000 });
  const title = await page.textContent('.ob-hero-title');
  assert(/new password/i.test(title), `title: ${title}`);
  await ctx.close();
  return title.trim();
});

await check('old web-app bookmarks (#nourish, #account/details) go on to the app; #rewards stays on the site', async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + '/#nourish');
  await page.waitForURL(/\/app\/#nourish/, { timeout: 5000 });
  await page.goto(BASE + '/#account/details');
  await page.waitForURL(/\/app\/#account\/details/, { timeout: 5000 });
  await page.goto(BASE + '/#rewards', { waitUntil: 'networkidle' });
  assert(new URL(page.url()).pathname === '/', page.url());
  await ctx.close();
});

await check('legal and support pages load on the brand, with working links', async () => {
  const { ctx, page, errors } = await newPage();
  for (const [path, text] of [['/privacy-policy', 'Early access list'], ['/terms-of-service', 'Terms of Service'], ['/email-confirmed', 'Your email is confirmed']]) {
    const res = await page.goto(BASE + path, { waitUntil: 'networkidle' });
    assert(res.status() === 200, `${path} ${res.status()}`);
    assert((await page.textContent('body')).includes(text), `${path} missing "${text}"`);
    const stroke = await page.getAttribute('.legal-header svg path', 'stroke');
    assert(stroke === '#E5532D', `${path} logo ${stroke}`);
  }
  assert(await page.getAttribute('#hint a', 'href') === '/app/', 'email-confirmed "Log in here" should open the web app');
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await check('unknown pages get the branded 404 with status 404', async () => {
  const { ctx, page, errors } = await newPage({ width: 390, height: 844 });
  const res = await page.goto(BASE + '/this/does/not/exist', { waitUntil: 'networkidle' });
  assert(res.status() === 404, `status ${res.status()}`);
  assert(/Wrong\s*lane/.test(await page.textContent('h1')), await page.textContent('h1'));
  assert(await page.getAttribute('meta[name="robots"]', 'content') === 'noindex', 'no noindex');
  await page.click('text=Back to the home page');
  await page.waitForURL(BASE + '/');
  // the browser logs the 404 page's own status; anything else is a real error
  const real = errors.filter(e => !/status of 404/.test(e));
  assert(real.length === 0, real.join(' | '));
  await ctx.close();
});

await check('robots.txt, sitemap.xml and the link-preview image are served', async () => {
  const { ctx, page } = await newPage();
  for (const path of ['/robots.txt', '/sitemap.xml', '/og-image.png']) {
    const res = await page.goto(BASE + path);
    assert(res.status() === 200, `${path} ${res.status()}`);
  }
  await ctx.close();
});

await check('every internal link on the home page answers 200', async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const hrefs = await page.$$eval('a[href^="/"]', as => [...new Set(as.map(a => a.getAttribute('href').split('#')[0] || '/'))]);
  for (const href of hrefs) {
    const res = await page.request.get(BASE + href);
    assert(res.status() === 200, `${href} → ${res.status()}`);
  }
  await ctx.close();
  return hrefs.join(', ');
});

await check('every <use href="#…"> icon exists in the sprite', async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const missing = await page.$$eval('use', uses => uses.map(u => u.getAttribute('href')).filter(h => !document.querySelector(h)));
  assert(missing.length === 0, `missing: ${[...new Set(missing)].join(', ')}`);
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------
// Navigation, CTAs, menu
// ---------------------------------------------------------------------------------------------------------------
await check('desktop nav: each link scrolls its section under the header and marks itself', async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const report = [];
  for (const id of ['why', 'features', 'rewards', 'how', 'faq']) {
    await page.click(`.site-nav__link[href="#${id}"]`);
    await waitScroll(page);
    const pos = await inView(page, `#${id}`);
    assert(pos && pos.top >= -2 && pos.top <= 140, `#${id} top ${pos?.top}`);
    assert(new URL(page.url()).hash === `#${id}`, page.url());
    await page.waitForTimeout(250);
    const active = await page.$eval('.site-nav__link.is-active', a => a.getAttribute('href')).catch(() => null);
    assert(active === `#${id}`, `active ${active} after #${id}`);
    report.push(`${id}@${pos.top}`);
  }
  await ctx.close();
  return report.join(' ');
});

await check('header turns frosted on scroll and dark over the Rewards section', async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  assert(!(await page.$eval('[data-header]', h => h.classList.contains('is-scrolled'))), 'scrolled at top');
  await page.evaluate(() => { const r = document.querySelector('#rewards'); window.scrollTo({ top: r.offsetTop + 300, behavior: 'instant' }); });
  await page.waitForTimeout(300);
  const cls = await page.$eval('[data-header]', h => h.className);
  assert(cls.includes('is-scrolled') && cls.includes('is-dark'), cls);
  await page.evaluate(() => window.scrollTo({ top: document.querySelector('#how').offsetTop + 50, behavior: 'instant' }));
  await page.waitForTimeout(300);
  assert(!(await page.$eval('[data-header]', h => h.classList.contains('is-dark'))), 'still dark over How it works');
  await ctx.close();
});

await check('every "Get early access" button reaches the form; "See how it works" reaches the steps', async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const count = await page.$$eval('a[href="#early-access"]', a => a.length);
  for (let i = 0; i < count; i += 1) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const link = page.locator('a[href="#early-access"]').nth(i);
    if (!(await link.isVisible())) continue;
    await link.click();
    await waitScroll(page);
    const pos = await inView(page, '#early-access');
    assert(pos.top <= 160 && pos.top > -40, `CTA ${i}: form top ${pos.top}`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('.hero .btn--quiet');
  await waitScroll(page);
  const how = await inView(page, '#how');
  assert(how.top <= 160 && how.top > -40, `#how top ${how.top}`);
  await ctx.close();
  return `${count} early-access links`;
});

await check('"Log in" goes to the web app; logged-in visitors see "Open the app"', async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  assert((await page.textContent('.site-header__login')).trim() === 'Log in', 'label');
  await Promise.all([page.waitForURL(/\/app\/$/), page.click('.site-header__login')]);
  await page.evaluate(() => localStorage.setItem('kinetix_logged_in', 'true'));
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  assert((await page.textContent('.site-header__login')).trim() === 'Open the app', 'logged-in label');
  await ctx.close();
});

await check('phone menu: opens, traps focus, Escape closes, a link closes it and lands on the section', async () => {
  const { ctx, page } = await newPage({ width: 390, height: 844 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  assert(await page.isVisible('[data-menu-toggle]'), 'toggle hidden');
  assert(!(await page.isVisible('.site-nav')), 'desktop nav visible on phone');
  await page.click('[data-menu-toggle]');
  await page.waitForSelector('[data-menu].is-open');
  assert(await page.$eval('[data-menu-toggle]', b => b.getAttribute('aria-expanded')) === 'true', 'aria-expanded');
  const focusedInMenu = await page.evaluate(() => document.querySelector('[data-menu]').contains(document.activeElement));
  assert(focusedInMenu, 'focus not in menu');
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('Tab');
  assert(await page.evaluate(() => document.querySelector('[data-menu]').contains(document.activeElement)), 'Tab escaped the menu');
  assert(await page.evaluate(() => getComputedStyle(document.documentElement).overflow) === 'hidden', 'page not locked');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  assert(await page.$eval('[data-menu]', m => m.hidden), 'menu still shown after Escape');
  assert(await page.evaluate(() => document.activeElement?.matches('[data-menu-toggle]')), 'focus not returned');
  await page.click('[data-menu-toggle]');
  await page.waitForSelector('[data-menu].is-open');
  await page.click('.mobile-menu__list a[href="#faq"]');
  await waitScroll(page);
  const pos = await inView(page, '#faq');
  assert(pos.top <= 100 && pos.top > 60, `#faq top ${pos.top}`);
  assert(await page.$eval('[data-menu]', m => !m.classList.contains('is-open')), 'menu still open');
  assert(new URL(page.url()).hash === '#faq', `address ${page.url()}`);
  assert(await page.evaluate(() => document.activeElement?.id === 'faq'), 'focus not on the section');
  await ctx.close();
});

await check('skip link is the first Tab stop and moves focus to the main content', async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.keyboard.press(TAB);
  assert(await page.evaluate(() => document.activeElement?.classList.contains('skip-link')), 'first tab stop');
  await page.waitForTimeout(300); // it slides in
  const box = await page.locator('.skip-link').boundingBox();
  assert(box && box.y >= 0, 'skip link not visible when focused');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  assert(await page.evaluate(() => document.activeElement?.id === 'main' || location.hash === '#main'), 'not moved to main');
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------
// FAQ and form
// ---------------------------------------------------------------------------------------------------------------
await check('FAQ: every question opens and closes, by mouse and keyboard', async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const n = await page.$$eval('.qa', d => d.length);
  for (let i = 0; i < n; i += 1) {
    const summary = page.locator('.qa summary').nth(i);
    await summary.scrollIntoViewIfNeeded();
    await summary.click();
    await page.waitForTimeout(380);
    assert(await page.locator('.qa').nth(i).evaluate(d => d.open), `q${i} didn't open`);
    const h = await page.locator('.qa__a').nth(i).evaluate(a => a.getBoundingClientRect().height);
    assert(h > 20, `q${i} answer height ${h}`);
    await summary.click();
    await page.waitForTimeout(380);
    assert(!(await page.locator('.qa').nth(i).evaluate(d => d.open)), `q${i} didn't close`);
  }
  const first = page.locator('.qa summary').first();
  await first.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(380);
  assert(await page.locator('.qa').first().evaluate(d => d.open), 'keyboard Enter did not open');
  await ctx.close();
  return `${n} questions`;
});

async function fillForm(page, email, platform) {
  await page.locator('#signup-email').scrollIntoViewIfNeeded();
  await page.fill('#signup-email', email);
  if (platform) await page.check(`input[name="platform"][value="${platform}"]`, { force: true });
  await page.click('[data-submit]');
}

await check('form: empty and invalid emails get plain-words errors and send nothing', async () => {
  const { ctx, page, requests } = await newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await fillForm(page, '', null);
  assert((await page.textContent('#signup-email-error')).includes('Enter your email address'), 'empty message');
  assert(await page.getAttribute('#signup-email', 'aria-invalid') === 'true', 'aria-invalid');
  assert(await page.evaluate(() => document.activeElement?.id === 'signup-email'), 'focus');
  await fillForm(page, 'maya@', null);
  assert((await page.textContent('#signup-email-error')).includes('doesn’t look right'), 'invalid message');
  await page.fill('#signup-email', 'maya@example.com');
  assert(await page.isHidden('#signup-email-error'), 'error stayed after fixing');
  assert(requests.length === 0, `${requests.length} requests sent`);
  await ctx.close();
});

await check('form: a good email joins (phone included) and the thank-you is announced', async () => {
  const { ctx, page, requests } = await newPage({ width: 390, height: 844 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await fillForm(page, 'maya@example.com', 'android');
  await page.waitForSelector('[data-done]:not([hidden])');
  assert((await page.textContent('[data-done]')).includes('maya@example.com'), 'no email in thank-you');
  assert(await page.evaluate(() => document.activeElement?.matches('[data-done]')), 'focus not on thank-you');
  assert(requests.length === 1, `${requests.length} requests`);
  const body = JSON.parse(requests[0].body);
  assert(body.email === 'maya@example.com' && body.platform === 'android' && body.company === '', JSON.stringify(body));
  await ctx.close();
});

await check('form: server errors, rate limits and no connection all explain themselves and keep the email', async () => {
  for (const [label, api, expected] of [
    ['500', () => ({ status: 500, body: { message: 'We couldn’t save that just now. Please try again in a minute.' } }), 'couldn’t save'],
    ['429', () => ({ status: 429, body: { message: 'Too many sign-ups from here just now. Please try again in a little while.' } }), 'Too many sign-ups'],
    ['offline', () => 'abort', 'Check your connection'],
  ]) {
    const { ctx, page } = await newPage({ api });
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await fillForm(page, 'maya@example.com', null);
    await page.waitForFunction(() => document.querySelector('[data-status]').textContent.length > 0, null, { timeout: 12000 });
    const status = await page.textContent('[data-status]');
    assert(status.includes(expected), `${label}: ${status}`);
    assert(await page.inputValue('#signup-email') === 'maya@example.com', `${label}: email lost`);
    assert(await page.isEnabled('[data-submit]'), `${label}: button stuck`);
    await ctx.close();
  }
});

await check('form: works from the keyboard alone', async () => {
  const { ctx, page, requests } = await newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.focus('#signup-email');
  await page.keyboard.type('kb@example.com');
  await page.keyboard.press(TAB); // → first radio
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press(TAB); // → the button (Enter on a radio doesn't submit in WebKit)
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-done]:not([hidden])', { timeout: 5000 });
  const body = JSON.parse(requests[0].body);
  assert(body.email === 'kb@example.com' && body.platform === 'android', JSON.stringify(body));
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------
// Motion: rewards story, reduced motion, hero entrance
// ---------------------------------------------------------------------------------------------------------------
for (const [w, h] of [[1440, 900], [390, 844]]) {
  await check(`rewards story at ${w}px: the cup fills beat by beat to 1,500 and empties on the way back`, async () => {
    const { ctx, page } = await newPage({ width: w, height: h });
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const beats = await page.$$eval('.beat', bs => bs.map(b => Number(b.dataset.total)));
    const seen = [];
    for (let i = 0; i < beats.length; i += 1) {
      await page.evaluate(idx => {
        const beat = document.querySelectorAll('.beat')[idx];
        const top = beat.getBoundingClientRect().top + scrollY;
        window.scrollTo({ top: top - innerHeight * 0.55 + 12, behavior: 'instant' });
      }, i);
      await page.waitForTimeout(900);
      const count = await page.textContent('[data-points-count]');
      seen.push(count);
      assert(Number(count.replace(/,/g, '')) === beats[i], `beat ${i}: shows ${count}, expected ${beats[i]}`);
      assert(await page.locator('.beat').nth(i).evaluate(b => b.classList.contains('is-active')), `beat ${i} not active`);
    }
    assert(await page.$eval('[data-cup]', c => c.classList.contains('is-full')), 'cup not full at the end');
    assert((await page.textContent('[data-journey-status]')).includes('Coffee'), 'status');
    await page.evaluate(() => window.scrollTo({ top: document.querySelector('#rewards').offsetTop, behavior: 'instant' }));
    await page.waitForTimeout(900);
    assert((await page.textContent('[data-points-count]')) === '0', 'did not empty');
    await ctx.close();
    return seen.join(' → ');
  });
}

await check('scrolling the whole page on a phone never shifts the layout (page height stays put)', async () => {
  const { ctx, page } = await newPage({ width: 390, height: 844 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);
  const heights = new Set();
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += 300) {
    await page.evaluate(yy => window.scrollTo({ top: yy, behavior: 'instant' }), y);
    await page.waitForTimeout(60);
    heights.add(await page.evaluate(() => document.documentElement.scrollHeight));
  }
  assert(heights.size === 1, `page height changed while scrolling: ${[...heights].join(', ')}`);
  await ctx.close();
  return `${total}px throughout`;
});

await check('reduced motion: everything visible at once, the finished story, no parallax', async () => {
  const { ctx, page } = await newPage({ reducedMotion: 'reduce' });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const hidden = await page.$$eval('.reveal', els => els.filter(el => getComputedStyle(el).opacity !== '1').length);
  assert(hidden === 0, `${hidden} reveals not visible`);
  // the rest of the page's motion rests finished too: the plans' icons, the trust promises, the day's lane
  const unfinished = await page.$$eval('.plan__icon-row img, .trust__col li', els => els.filter(el => getComputedStyle(el).opacity !== '1').length);
  assert(unfinished === 0, `${unfinished} icons or promises not shown`);
  const day = await page.$eval('[data-day]', l => ({ p: l.style.getPropertyValue('--p'), passed: l.querySelectorAll('.day__item.is-passed').length, all: l.querySelectorAll('.day__item').length }));
  assert(day.p === '1' && day.passed === day.all, `day lane: ${JSON.stringify(day)}`);
  assert(await page.$eval('[data-cup]', c => c.classList.contains('is-full')), 'cup not full');
  assert(!(await page.$eval('.journey', j => j.classList.contains('is-live'))), 'story is live');
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(200);
  const py = await page.$eval('.hero__lanes', el => el.style.getPropertyValue('--py'));
  assert(py === '', `parallax moved: ${py}`);
  await ctx.close();
});

await check('hero entrance: "Real rewards." opens to the wide cut, nothing left hidden, no layout shift', async () => {
  const { ctx, page } = await newPage();
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);
  const stretch = await page.$eval('.hero__line--big', el => getComputedStyle(el).fontStretch);
  assert(stretch === '125%', `font-stretch ${stretch}`);
  const opacities = await page.$$eval('.hero__eyebrow, .hero__line--small, .hero__lead, .hero__actions, .hero__facts, .phone, .float', els => els.map(el => getComputedStyle(el).opacity));
  assert(opacities.every(o => o === '1'), opacities.join(','));
  const cls = await page.evaluate(() => window.__cls);
  assert(cls < 0.05, `CLS ${cls.toFixed(3)}`);
  await ctx.close();
  return `CLS ${cls.toFixed(4)}`;
});

// ---------------------------------------------------------------------------------------------------------------
// The opening animation and the phone's demo
// ---------------------------------------------------------------------------------------------------------------
await check('opening animation: plays on a first visit, reveals the hero, no layout shift, then not again that visit', async () => {
  const { ctx, page, errors } = await newPage({ intro: true });
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  const during = await page.evaluate(() => ({
    attr: document.documentElement.dataset.intro,
    shown: getComputedStyle(document.querySelector('[data-intro-overlay]')).display !== 'none',
    heroReady: document.querySelector('.hero').classList.contains('is-ready'),
  }));
  assert(during.attr === 'run' && during.shown, `not playing: ${JSON.stringify(during)}`);
  assert(!during.heroReady, 'the hero started under the intro');
  await page.waitForFunction(() => !document.querySelector('[data-intro-overlay]'), null, { timeout: 5000 });
  const after = await page.evaluate(() => ({ attr: document.documentElement.dataset.intro ?? null, ready: document.querySelector('.hero').classList.contains('is-ready'), seen: sessionStorage.getItem('kx_intro_seen') }));
  assert(after.attr === null && after.ready && after.seen === '1', JSON.stringify(after));
  await page.waitForTimeout(1600);
  const cls = await page.evaluate(() => window.__cls);
  assert(cls < 0.05, `CLS ${cls.toFixed(3)}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert(!(await page.evaluate(() => document.documentElement.dataset.intro)), 'played again on reload');
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
  return `CLS ${cls.toFixed(4)}`;
});

await check('opening animation: a key or a tap skips it at once', async () => {
  for (const how of ['key', 'tap']) {
    const { ctx, page } = await newPage({ intro: true, width: 390, height: 844 });
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.intro === 'run' && window.getComputedStyle(document.querySelector('.intro')).display !== 'none');
    await page.waitForTimeout(250);
    const t = Date.now();
    if (how === 'key') await page.keyboard.press(TAB);
    else await page.mouse.click(200, 400);
    await page.waitForFunction(() => !document.documentElement.dataset.intro, null, { timeout: 1000 });
    await page.waitForFunction(() => !document.querySelector('[data-intro-overlay]'), null, { timeout: 2000 });
    assert(Date.now() - t < 1500, `${how}: took ${Date.now() - t} ms`);
    // Tab still moves focus normally: the skip link comes first
    if (how === 'key') assert(await page.evaluate(() => document.activeElement?.classList.contains('skip-link')), 'Tab lost its first stop');
    await ctx.close();
  }
});

await check('opening animation: never with reduced motion or for a link to a section', async () => {
  for (const [label, opts, path] of [['reduced motion', { intro: true, reducedMotion: 'reduce' }, '/'], ['#faq', { intro: true }, '/#faq']]) {
    const { ctx, page } = await newPage(opts);
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    const shown = await page.evaluate(() => { const o = document.querySelector('[data-intro-overlay]'); return o ? getComputedStyle(o).display !== 'none' : false; });
    assert(!shown, `${label}: the intro showed`);
    await ctx.close();
  }
});

await check('the phone in the hero plays the app: water added, a quest claimed, nutrients, back to Today', async () => {
  const { ctx, page, errors } = await newPage({ width: 1440, height: 900 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const seen = await page.evaluate(() => new Promise(resolve => {
    const stage = document.querySelector('[data-demo-stage]');
    const log = [];
    const note = () => {
      const d = stage.dataset;
      const key = `${d.scene}${d.glass === 'on' ? '+glass' : ''}${d.claim === 'on' ? '+claim' : ''}`;
      if (log.at(-1) !== key) log.push(key);
    };
    new MutationObserver(note).observe(stage, { attributes: true });
    setTimeout(() => resolve({ log, points: stage.querySelector('[data-demo-count]').textContent, water: stage.querySelector('.ap-hydro__amount').textContent.trim() }), 20000);
  }));
  const story = seen.log.join(' → ');
  for (const step of ['today+glass', 'rewards+glass+claim', 'nourish+glass+claim', 'today+glass+claim']) assert(seen.log.includes(step), `missing ${step}: ${story}`);
  assert(seen.log.indexOf('rewards+glass+claim') < seen.log.indexOf('nourish+glass+claim'), story);
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
  return story;
});

await check('the phone rests off screen and with reduced motion shows Today, still', async () => {
  const { ctx, page } = await newPage({ width: 1440, height: 900 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  await page.evaluate(() => window.scrollTo({ top: document.querySelector('#faq').offsetTop, behavior: 'instant' }));
  await page.waitForTimeout(400);
  const paused = await page.$eval('[data-demo-stage]', s => s.classList.contains('is-paused'));
  assert(paused, 'still playing off screen');
  await ctx.close();
  const rm = await newPage({ width: 390, height: 844, reducedMotion: 'reduce' });
  await rm.page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const still = await rm.page.$eval('[data-demo-stage]', s => ({ scene: s.dataset.scene, glass: s.dataset.glass }));
  assert(still.scene === 'today' && still.glass === 'on', JSON.stringify(still));
  await rm.page.waitForTimeout(2500);
  assert((await rm.page.$eval('[data-demo-stage]', s => s.dataset.scene)) === 'today', 'moved with reduced motion');
  await rm.ctx.close();
});

// The five feature chapters and the widgets' home screen (src/site/features.ts): the first steps of each story, in
// order, and where each tap lands
const FEATURE_STORIES = {
  body: ['start', 'plan', 'fill', 'more'],
  meals: ['start', 'in', 'foot', 'page2'],
  scan: ['rest', 'bc-scan', 'bc-read', 'bc-done', 'bc-result'],
  cycle: ['d2', 'd9', 'd12'],
  watch: ['rest', 'sheet', 'yoga', 'min45', 'down', 'added'],
  widgets: ['start', 'rings', 'glass', 'goal'],
};
const FEATURE_STILLS = { body: 'fill', meals: 'in', scan: 'bc-result', cycle: 'd9', watch: 'added', widgets: 'goal' };

await check('the feature chapters play the app on screen: each story in order, every tap on its button, resting off screen', async () => {
  const { ctx, page, errors } = await newPage({ width: 1440, height: 900 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const report = [];
  for (const [id, story] of Object.entries(FEATURE_STORIES)) {
    await page.evaluate(sel => { const el = document.querySelector(sel); window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 120, behavior: 'instant' }); }, `[data-feature="${id}"]`);
    const seen = await page.evaluate(([id, count]) => new Promise(resolve => {
      const stage = document.querySelector(`[data-feature="${id}"]`);
      const steps = [stage.dataset.step];
      const taps = [];
      new MutationObserver(records => {
        for (const r of records) {
          if (r.attributeName === 'data-step' && steps.at(-1) !== stage.dataset.step) steps.push(stage.dataset.step);
          if (r.attributeName === 'data-press' && stage.dataset.press) {
            // the dot is placed synchronously with the press: its centre must sit on the pressed button
            const dot = stage.querySelector('[data-feat-touch]').getBoundingClientRect();
            const target = stage.querySelector(`[data-touch-target="${stage.dataset.press}"]`).getBoundingClientRect();
            const x = dot.left + dot.width / 2; const y = dot.top + dot.height / 2;
            taps.push({ on: stage.dataset.press, hit: x >= target.left && x <= target.right && y >= target.top && y <= target.bottom && target.height > 0 });
          }
        }
        if (steps.length >= count) resolve({ steps, taps });
      }).observe(stage, { attributes: true });
      setTimeout(() => resolve({ steps, taps }), 12000);
    }), [id, story.length + 1]);
    // a stage shows its still step until it nears the screen, then starts its story from the first step
    const from = seen.steps.indexOf(story[0]);
    const played = from < 0 ? seen.steps : seen.steps.slice(from, from + story.length);
    assert(played.join(' → ') === story.join(' → '), `${id}: ${seen.steps.join(' → ')}`);
    const missed = seen.taps.filter(t => !t.hit).map(t => t.on);
    assert(missed.length === 0, `${id}: taps off target: ${missed.join(', ')}`);
    report.push(`${id} ${seen.steps.length} steps, ${seen.taps.length} taps`);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(400);
  const playing = await page.$$eval('[data-feature]', stages => stages.filter(s => !s.classList.contains('is-paused')).map(s => s.dataset.feature));
  assert(playing.length === 0, `still playing off screen: ${playing.join(', ')}`);
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
  return report.join('; ');
});

await check('the feature chapters with reduced motion: each shows its still step and never moves', async () => {
  const { ctx, page } = await newPage({ width: 390, height: 844, reducedMotion: 'reduce' });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  for (const id of Object.keys(FEATURE_STILLS)) {
    await page.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'center' }), `[data-feature="${id}"]`);
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(2500);
  const steps = await page.$$eval('[data-feature]', stages => Object.fromEntries(stages.map(s => [s.dataset.feature, s.dataset.step])));
  assert(JSON.stringify(steps) === JSON.stringify(FEATURE_STILLS), JSON.stringify(steps));
  // the scan's still step is a result lower down its card: it's scrolled up into view, not left below the fold
  const shown = await page.$eval('[data-feature="scan"]', stage => {
    const viewport = stage.querySelector('[data-viewport]').getBoundingClientRect();
    const result = stage.querySelector('.apx-result.is-now').getBoundingClientRect();
    return result.top >= viewport.top && result.top < viewport.bottom - 150;
  });
  assert(shown, 'the scan result is out of view');
  await ctx.close();
});

// The widgets (#widgets): the switch turns the home screen and the wall dark and back, by mouse and by keyboard; all 14
// are on the wall, marked Free or Plus; on phones the wall scrolls sideways (a keyboard stop) and the page doesn't
await check('widgets: the Light / Dark switch turns the phone and all 14 dark and back, by mouse and keyboard', async () => {
  const { ctx, page, errors } = await newPage({ width: 1440, height: 900 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const look = () => page.evaluate(() => ({
    theme: document.querySelector('#widgets').dataset.wtheme,
    home: getComputedStyle(document.querySelector('.hs .kw')).backgroundImage.includes('rgb(28, 38, 45)'),
    wall: [...document.querySelectorAll('.wwall .kw:not(.kw--glass):not(.kw-level)')].filter(k => getComputedStyle(k).backgroundImage.includes('rgb(28, 38, 45)')).length,
  }));
  const before = await look();
  assert(before.theme === 'light' && !before.home && before.wall === 0, `start: ${JSON.stringify(before)}`);
  await page.click('.wswitch label:has(input[value="dark"])');
  await page.waitForTimeout(700);
  const dark = await look();
  assert(dark.theme === 'dark' && dark.home && dark.wall === 12, `dark: ${JSON.stringify(dark)}`);
  // the keyboard: an arrow key moves between the two radios
  await page.focus('#wtheme-dark');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(700);
  const back = await look();
  assert(back.theme === 'light' && !back.home, `back: ${JSON.stringify(back)}`);
  const tiers = await page.$$eval('.wwall__item', items => items.map(li => li.querySelector('.wtier').textContent));
  assert(tiers.length === 14 && tiers.filter(t => t === 'Plus').length === 3 && tiers.filter(t => t === 'Free').length === 11, tiers.join(','));
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
  return `${tiers.length} widgets, dark ${dark.wall + 2}/14`;
});

await check('widgets on phones: the wall scrolls sideways as a keyboard stop, the page never does', async () => {
  const { ctx, page } = await newPage({ width: 390, height: 844, reducedMotion: 'reduce' });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const wall = await page.$eval('[data-wwall]', g => ({ sw: g.scrollWidth, cw: g.clientWidth, tab: g.getAttribute('tabindex'), page: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  assert(wall.sw > wall.cw * 2 && wall.tab === '0' && wall.page <= 0, JSON.stringify(wall));
  await page.focus('[data-wwall]');
  // at a person's pace: WebKit folds key presses that come faster than its smooth scroll into one
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(80);
    if (await page.$eval('[data-wwall]', g => g.scrollLeft >= g.scrollWidth - g.clientWidth - 1)) break;
  }
  await page.waitForTimeout(400);
  const end = await page.$eval('[data-wwall]', g => {
    const last = [...g.querySelectorAll('.wwall__item')].reduce((a, b) => (b.getBoundingClientRect().right > a.getBoundingClientRect().right ? b : a));
    return { left: Math.round(g.scrollLeft), lastRight: Math.round(last.getBoundingClientRect().right), vw: innerWidth };
  });
  assert(end.left > 0 && end.lastRight <= end.vw + 1, JSON.stringify(end));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(250);
  assert(await page.$eval('[data-wwall]', g => !g.hasAttribute('tabindex')), 'the wall stays a keyboard stop on a wide screen');
  await ctx.close();
  return `scrolled to ${end.left}px`;
});

await check('"Your day": the lane fills as you read down it and empties on the way back; each time lights up once reached', async () => {
  const { ctx, page } = await newPage({ width: 1440, height: 900 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const at = async n => {
    // the n-th time 40px above the reading line (55% of the screen)
    await page.evaluate(i => {
      const t = document.querySelectorAll('#day .day__time')[i];
      window.scrollTo({ top: t.getBoundingClientRect().top + scrollY - innerHeight * 0.55 + 40, behavior: 'instant' });
    }, n);
    await page.waitForTimeout(250);
    return page.$eval('[data-day]', l => ({ p: Number(l.style.getPropertyValue('--p')), passed: [...l.querySelectorAll('.day__item')].map(i => i.classList.contains('is-passed')) }));
  };
  const first = await at(0);
  const third = await at(2);
  const back = await at(1);
  assert(first.passed.join() === 'true,false,false,false', `first: ${first.passed}`);
  assert(third.passed.join() === 'true,true,true,false', `third: ${third.passed}`);
  assert(back.passed.join() === 'true,true,false,false', `back: ${back.passed}`);
  assert(third.p > back.p && back.p > 0, `lane ${first.p} → ${third.p} → ${back.p}`);
  const lane = await page.$eval('[data-day]', l => getComputedStyle(l, '::after').transform);
  assert(lane !== 'none', `the lane isn't drawn: ${lane}`);
  await ctx.close();
  return `lane ${first.p.toFixed(2)} → ${third.p.toFixed(2)} → ${back.p.toFixed(2)}`;
});

await check('the early access track draws itself as it arrives', async () => {
  const { ctx, page } = await newPage({ width: 1440, height: 900 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const before = await page.$eval('.cta-panel__lanes path', p => parseFloat(getComputedStyle(p).strokeDashoffset));
  await page.evaluate(() => { const el = document.querySelector('#early-access'); window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 80, behavior: 'instant' }); });
  await page.waitForTimeout(3200);
  const after = await page.$$eval('.cta-panel__lanes path:not(.cta-panel__runner)', ps => ps.map(p => parseFloat(getComputedStyle(p).strokeDashoffset)));
  assert(before > 1000 && after.every(v => v < 1), `before ${before}, after ${after.join(',')}`);
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------
// Responsive matrix
// ---------------------------------------------------------------------------------------------------------------
const SIZES = [[280, 653], [320, 568], [360, 740], [375, 667], [390, 844], [414, 896], [430, 932], [560, 900], [600, 960], [720, 1000], [768, 1024], [820, 1180], [1024, 768], [1040, 800], [1100, 820], [1160, 860], [1280, 800], [1440, 900], [1920, 1080], [2560, 1440], [667, 375], [844, 390], [932, 430]];
await check(`no horizontal overflow or clipped text at ${SIZES.length} sizes (incl. landscape and 2560)`, async () => {
  const { ctx, page } = await newPage({ reducedMotion: 'reduce' });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const problems = [];
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(120);
    const measure = () => page.evaluate(() => {
      const de = document.documentElement;
      const out = [];
      if (de.scrollWidth > de.clientWidth) out.push(`page ${de.scrollWidth}>${de.clientWidth}`);
      // text that doesn't fit its own box (clipped headings, labels, buttons)
      for (const el of document.querySelectorAll('h1, h2, h3, h4, .btn, .brand__word, .beat__what, .beat__pts, .site-nav__link, .store, .segmented span, .ui-quest__text')) {
        if (el.closest('[hidden]') || el.closest('.mobile-menu')) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (el.matches('.ui-quest__text')) continue; // ellipsis by design
        if (el.scrollWidth > el.clientWidth + 1 && cs.overflow !== 'visible') out.push(`clipped ${el.className || el.tagName}`);
        if (el.matches('.site-nav__link') && el.getBoundingClientRect().height > 48) out.push(`nav link wraps: ${el.textContent}`);
        const rect = el.getBoundingClientRect();
        if (rect.right > de.clientWidth + 1 && !el.closest('.hero__visual, .phone, .rewards, .cta-panel')) out.push(`off-screen ${el.className || el.tagName} ${Math.round(rect.right)}`);
      }
      return out;
    });
    let r = await measure();
    // WebKit can paint one stale frame right after a very large resize (the interlude's nowrap line still at its old
    // size); a real problem is still there a moment later
    if (r.length) {
      await page.waitForTimeout(400);
      r = await measure();
    }
    // header items must not collide: brand, nav and actions each keep their own space
    const collide = await page.evaluate(() => {
      const boxes = ['.brand', '.site-nav', '.site-header__actions'].map(s => document.querySelector(s)).filter(el => el && getComputedStyle(el).display !== 'none').map(el => el.getBoundingClientRect());
      for (let i = 1; i < boxes.length; i += 1) if (boxes[i].left < boxes[i - 1].right - 1) return true;
      return false;
    });
    if (collide) r.push('header items overlap');
    if (r.length) problems.push(`${w}x${h}: ${r.slice(0, 4).join('; ')}`);
  }
  await ctx.close();
  assert(problems.length === 0, problems.join(' | '));
});

await check('nav switches to the menu button below 1120px, and the hero stays readable at 320px', async () => {
  const { ctx, page } = await newPage({ width: 320, height: 568, reducedMotion: 'reduce' });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  assert(await page.isVisible('[data-menu-toggle]') && !(await page.isVisible('.site-nav')), '320: nav');
  const title = await page.$eval('.hero__title', el => ({ size: parseFloat(getComputedStyle(el).fontSize), w: el.scrollWidth, cw: el.clientWidth }));
  assert(title.size >= 36, `hero title only ${title.size}px`);
  assert(title.w <= title.cw + 1, `hero title overflows ${title.w} > ${title.cw}`);
  await page.setViewportSize({ width: 1119, height: 800 });
  await page.waitForTimeout(150);
  assert(await page.isVisible('[data-menu-toggle]') && !(await page.isVisible('.site-nav')), '1119: menu button');
  await page.setViewportSize({ width: 1120, height: 800 });
  await page.waitForTimeout(150);
  assert(!(await page.isVisible('[data-menu-toggle]')) && await page.isVisible('.site-nav'), '1120: nav');
  await ctx.close();
  return `320px hero title ${title.size.toFixed(1)}px`;
});

await check('larger text (browser font size 130%) still fits at 390px', async () => {
  const { ctx, page } = await newPage({ width: 390, height: 844, reducedMotion: 'reduce' });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: 'html { font-size: 130% !important; }' });
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 0, `overflow ${overflow}px`);
  await ctx.close();
});

await check('touch targets on phones are at least 44px', async () => {
  const { ctx, page } = await newPage({ width: 390, height: 844, reducedMotion: 'reduce' });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const small = await page.$$eval('.btn, .menu-toggle, .share__link, .segmented span, .wswitch label > span, .qa summary, .field__input', els =>
    els.filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44); })
       .map(el => `${el.className} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`));
  assert(small.length === 0, small.join(' | '));
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------
// Accessibility (axe-core) and performance
// ---------------------------------------------------------------------------------------------------------------
for (const [label, path, w, h] of [['home desktop', '/', 1440, 900], ['home phone', '/', 390, 844], ['404', '/nope', 390, 844], ['privacy', '/privacy-policy', 1280, 800]]) {
  await check(`axe (WCAG 2.2 A/AA + best practice): ${label}`, async () => {
    const { ctx, page } = await newPage({ width: w, height: h, reducedMotion: 'reduce' });
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    // open the FAQ and the menu states are checked separately; scan the page as a visitor first sees it, fully revealed
    await page.addScriptTag({ content: AXE });
    const result = await page.evaluate(async () => (await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
    })));
    const v = result.violations.map(x => `${x.id} (${x.impact}, ${x.nodes.length}): ${x.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' ; ')}`);
    writeFileSync(`${OUT}/axe-${label.replace(/\s/g, '-')}.json`, JSON.stringify(result.violations, null, 2));
    assert(v.length === 0, v.join(' | '));
    await ctx.close();
    return `${result.passes.length} rules passed`;
  });
}

await check('axe with the widgets in their dark look', async () => {
  const { ctx, page } = await newPage({ width: 1440, height: 900, reducedMotion: 'reduce' });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.click('.wswitch label:has(input[value="dark"])');
  await page.waitForTimeout(200);
  await page.addScriptTag({ content: AXE });
  const result = await page.evaluate(async () => (await window.axe.run(document.querySelector('#widgets'), {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
  })));
  const v = result.violations.map(x => `${x.id} (${x.impact}, ${x.nodes.length}): ${x.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' ; ')}`);
  assert(v.length === 0, v.join(' | '));
  await ctx.close();
  return `${result.passes.length} rules passed`;
});

await check('axe with the phone menu open and a FAQ answer open', async () => {
  const { ctx, page } = await newPage({ width: 390, height: 844, reducedMotion: 'reduce' });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.click('.qa summary');
  await page.click('[data-menu-toggle]');
  await page.waitForSelector('[data-menu].is-open');
  await page.addScriptTag({ content: AXE });
  const result = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })));
  const v = result.violations.map(x => `${x.id}: ${x.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' ; ')}`);
  assert(v.length === 0, v.join(' | '));
  await ctx.close();
});

await check('performance: page weight, requests, LCP', async () => {
  const { ctx, page } = await newPage({ width: 390, height: 844 });
  let bytes = 0; let requests = 0;
  page.on('response', async r => { requests += 1; try { bytes += (await r.body()).length; } catch { /* aborted */ } });
  await page.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver(list => { for (const e of list.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const lcp = await page.evaluate(() => window.__lcp);
  const lcpEl = await page.evaluate(() => new Promise(resolve => new PerformanceObserver(list => {
    const e = list.getEntries().at(-1); resolve(e?.element ? `${e.element.tagName}.${e.element.className}` : '?');
  }).observe({ type: 'largest-contentful-paint', buffered: true })));
  await ctx.close();
  assert(bytes < 600 * 1024, `${Math.round(bytes / 1024)} KB`);
  return `${requests} requests, ${Math.round(bytes / 1024)} KB (uncompressed), LCP ${Math.round(lcp)} ms on ${lcpEl}`;
});

await browser.close();
const failed = results.filter(r => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  —  ${r.detail}` : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
writeFileSync(`${OUT}/e2e-results.json`, JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
