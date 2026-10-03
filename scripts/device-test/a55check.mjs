// a55check.mjs — checks for the isolated "a55check" test app, over the WebView debugger (CDP).
// It never taps the screen, never writes to Health Connect, never prints raw health values (verdicts and day counts only).
//
//   node a55check.mjs <port> guard            which app is this port attached to?
//   node a55check.mjs <port> seed             fake a logged-in, Health-Connect-connected profile in the TEST app's own storage, reload
//   node a55check.mjs <port> raw  [--any]     read Health Connect (7 days) and work out what the cards SHOULD say
//   node a55check.mjs <port> check            open Steps + Heart rate cards, read them, compare with Health Connect (TEST app only)
//   node a55check.mjs <port> net <seconds>    watch /api requests + console warnings (is timeZone sent? anything unexpected?)
//   node a55check.mjs <port> faked <iso>      reload the page with its clock set to <iso> (a day with more steps), run `check`,
//                                             then reload with the real clock. Only the page's JS clock moves, not the phone's.
//
// Modes that write (seed, faked) and `check` (it expands cards) refuse to run unless the attached app id ends with .a55check.
// `raw` and `guard` are read-only and may be run on another build with --any (e.g. to rehearse on the S21 FE).

import { STRIDE, MIN_STEPS, expectedAverage, oldAverage, labelFor, digits, mask } from './a55check.lib.mjs';

const TEST_ID = 'com.jnglobalventures.kinetixfit.a55check';
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const [port, mode = 'guard', arg] = args;
const ANY = process.argv.includes('--any');
if (!port) { console.log('usage: node a55check.mjs <port> <guard|seed|raw|check|net|faked> [arg] [--any]'); process.exit(1); }
setTimeout(() => { console.log('TIMEOUT: no answer in 150 s (phone locked, screen off or the app frozen?)'); process.exit(3); }, 150000);

const targets = await (await fetch(`http://localhost:${port}/json`)).json();
const page = targets.find(t => t.type === 'page');
if (!page) { console.log('no page target on that port'); process.exit(2); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('websocket failed')); });
let nextId = 0; const waiting = new Map(); const listeners = new Set();
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && waiting.has(m.id)) { const [res, rej] = waiting.get(m.id); waiting.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  else if (m.method) for (const l of listeners) l(m);
};
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++nextId; waiting.set(id, [res, rej]); ws.send(JSON.stringify({ id, method, params })); });
const js = async expression => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails));
  return r.result.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
// flush stdout before exiting: process.exit() right after console.log can drop the last lines when stdout is a pipe
const done = code => new Promise(() => { try { ws.close(); } catch { /* ignore */ } process.stdout.write('', () => process.exit(code)); }); // never resolves: the script stops here

// ---- guard --------------------------------------------------------------------------------------------------------
const appId = await js(`Capacitor.Plugins.App.getInfo().then(i => i.id)`).catch(() => null);
const isTest = appId === TEST_ID;
console.log(`attached to: ${appId ?? 'unknown'}${isTest ? '  (the isolated test app)' : ''}`);
const needsTest = mode === 'seed' || mode === 'faked' || mode === 'check';
if (needsTest && !isTest) { console.log(`REFUSING: "${mode}" only runs on ${TEST_ID}`); await done(4); }
if (!isTest && !ANY) { console.log('REFUSING: not the test app (add --any for the read-only modes on another build)'); await done(4); }
if (mode === 'guard') await done(0);

// ---- seed ---------------------------------------------------------------------------------------------------------
if (mode === 'seed') {
  const email = 'a55check@offlinesandbox.invalid';
  const profile = {
    name: 'Test', email, height: 170, weight: 70, target: 'Cardio Endurance', personalAllergens: [], workoutsLogged: [],
    smartDeviceConnected: 'Health Connect', wearable: 'yes', sex: null, age: 30, activityLevel: 'moderate',
    lastPeriodStartDate: null, averageCycleLength: 28, region: null, country: 'GB', diet: 'everything',
  };
  await js(`(() => {
    const s = localStorage;
    s.setItem('kinetix_profile', ${JSON.stringify(JSON.stringify(profile))});
    s.setItem('kinetix_logged_in', 'true');
    s.setItem('kinetix_onboarded_email', ${JSON.stringify(email)});
    s.setItem('kx_notifications_skipped', '1');   // never show the notification permission prompt
    s.setItem('kx_more_health_asked', '1');
    s.setItem('kx_workouts_asked', '1');
    sessionStorage.setItem('kx_intro_seen', '1');
    setTimeout(() => location.reload(), 50);
    return 'ok';
  })()`);
  console.log('seeded (profile height 170 cm, country GB, no email/session that exists anywhere); the page reloads');
  await sleep(500); await done(0);
}

// ---- in-page readers ----------------------------------------------------------------------------------------------
const PAGE_RAW = `(async () => {
  const H = Capacitor.Plugins.Health;
  const key = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const now = new Date();
  const start = new Date(now); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);          // the card's 7 local days
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const agg = (dataType, from, aggregation) => H.queryAggregated({ dataType, startDate: from.toISOString(), endDate: now.toISOString(), bucket: 'day', aggregation });
  const [steps, hr, dist, stepsToday, distToday] = await Promise.all([
    agg('steps', start, 'sum'), agg('heartRate', start, 'average'), agg('distance', start, 'sum'),
    agg('steps', startOfToday, 'sum'), agg('distance', startOfToday, 'sum'),
  ]);
  const byDay = r => { const m = {}; for (const s of r.samples) m[key(new Date(s.startDate))] = s.value; return m; };
  const keys = []; for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); keys.push(key(d)); }
  let height = null; try { height = JSON.parse(localStorage.getItem('kinetix_profile') || '{}').height ?? null; } catch { /* none */ }
  return {
    todayKey: key(now), keys, steps: byDay(steps), hr: byDay(hr), dist: byDay(dist),
    stepsToday: stepsToday.samples[0]?.value ?? null, distToday: distToday.samples[0]?.value ?? null,
    height, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, nowLocal: now.toString().slice(0, 21),
  };
})()`;

const PAGE_CARDS = `(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const find = t => [...document.querySelectorAll('.btc-card')].find(c => c.querySelector('.btc-title')?.textContent?.trim() === t);
  const read = c => ({
    reading: c.querySelector('.btc-reading')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
    open: c.classList.contains('btc-open'),
    readout: c.querySelector('.btc-readout')?.innerText?.replace(/\\s+/g, ' ').trim() ?? null,
    submetrics: [...c.querySelectorAll('.btc-submetric')].map(s => s.innerText.replace(/\\s+/g, ' ').trim()),
    trackable: !c.querySelector('.btc-header')?.disabled,
  });
  const out = {};
  for (const title of ['Steps', 'Heart rate']) {
    let card = find(title);
    if (!card) { out[title] = null; continue; }
    const wasOpen = card.classList.contains('btc-open');
    if (!wasOpen) { card.querySelector('.btc-header').click(); await wait(1500); card = find(title); }
    out[title] = read(card);
    if (!wasOpen) { card.querySelector('.btc-header').click(); await wait(400); }
  }
  return out;
})()`;

// ---- expectations (the app's own rules: src/lib/trendAverage.ts, src/lib/vitals.ts) -----------------------------------
function printRaw(raw) {
  console.log(`phone clock (page): ${raw.nowLocal}  zone: ${raw.tz}  today=${raw.todayKey}`);
  const days = raw.keys.map(k => ({ k, steps: raw.steps[k], hr: raw.hr[k], dist: raw.dist[k] }));
  console.log(`days with steps: ${days.filter(d => Math.round(d.steps ?? 0) > 0).length}/7   with heart rate: ${days.filter(d => Math.round(d.hr ?? 0) > 0).length}/7   with distance: ${days.filter(d => (d.dist ?? 0) > 0).length}/7`);
  const es = expectedAverage(raw.steps, raw.keys, raw.todayKey), eh = expectedAverage(raw.hr, raw.keys, raw.todayKey);
  console.log(`expected Steps average: ${es ? `${es.days}-day (today left out)` : 'none (needs 2 full days)'}   expected Heart rate average: ${eh ? `${eh.days}-day (today left out)` : 'none'}`);
  const todayHasSteps = Math.round(raw.steps[raw.todayKey] ?? 0) > 0;
  console.log(`today has steps: ${todayHasSteps}; today's partial day would have changed the Steps average (old rule): ${es && todayHasSteps ? oldAverage(raw.steps, raw.keys) !== es.avg : 'n/a'}`);
  console.log('--- the distance rule on each day (distance as % of what the steps imply at a 41.5%-of-height stride; height ' + raw.height + ' cm) ---');
  for (const d of days) {
    if (!(Math.round(d.steps ?? 0) >= MIN_STEPS) || !((d.dist ?? 0) > 0)) { console.log(`  ${d.k}${d.k === raw.todayKey ? ' (today)' : ''}: ${Math.round(d.steps ?? 0) < MIN_STEPS ? 'under 500 steps, not judged' : 'no distance written'}`); continue; }
    const covered = (d.steps * raw.height * STRIDE) / 100;
    console.log(`  ${d.k}${d.k === raw.todayKey ? ' (today)' : ''}: distance = ${Math.round((d.dist / covered) * 100)}% of the steps' → "${labelFor(d.dist, d.steps, raw.height)}"`);
  }
  console.log(`today's label the card should show: ${(raw.distToday ?? 0) > 0 ? `"${labelFor(raw.distToday, raw.stepsToday, raw.height)}"` : 'no distance row (no distance today)'}`);
}

async function runCheck() {
  const raw = await js(PAGE_RAW);
  printRaw(raw);
  const cards = await js(PAGE_CARDS);
  let fails = 0;
  const verdict = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); if (!ok) fails++; };

  const steps = cards['Steps'];
  console.log('\n--- Steps card ---');
  if (!steps || !steps.open || !steps.readout) { console.log(`card did not open or has no readout (reading: "${steps?.reading ?? 'card missing'}", trackable: ${steps?.trackable}) — no data yet, or the phone is not on screen`); fails++; }
  else {
    console.log(`reading: ${mask(steps.reading)}   readout: ${mask(steps.readout)}`);
    const es = expectedAverage(raw.steps, raw.keys, raw.todayKey);
    const m = steps.readout.match(/(\d+)-day average ([\d.,]+)/);
    if (!es) verdict('Steps: no average expected (fewer than 2 full days)', !m);
    else if (!m) verdict('Steps: the readout names an average', false, 'no "N-day average" in the readout');
    else {
      verdict(`Steps: says how many days it averaged (${es.days})`, Number(m[1]) === es.days, `shown ${m[1]}`);
      verdict('Steps: the average = Health Connect\'s full days, today left out', Math.abs(digits(m[2]) - es.avg) <= 1, Math.abs(digits(m[2]) - es.avg) <= 1 ? 'matches' : `shown ${digits(m[2])}, expected ${es.avg}`);
    }
    const dist = steps.submetrics.find(s => /distance/i.test(s));
    const want = (raw.distToday ?? 0) > 0 ? labelFor(raw.distToday, raw.stepsToday, raw.height) : null;
    if (want === null) verdict('Steps: no distance row when there is no distance today', !dist);
    else verdict(`Steps: the distance row is labelled "${want}"`, !!dist && dist.startsWith(want), `row label: ${dist ? dist.replace(/[\d.,]+\s*(km|mi|m)?$/i, '').trim() : 'missing'}`);
  }

  const hrCard = cards['Heart rate'];
  console.log('\n--- Heart rate card ---');
  if (!hrCard || !hrCard.open || !hrCard.readout) { console.log(`card did not open or has no readout (reading: "${hrCard?.reading ?? 'card missing'}", trackable: ${hrCard?.trackable})`); fails++; }
  else {
    console.log(`reading: ${mask(hrCard.reading)}   readout: ${mask(hrCard.readout)}`);
    verdict('Heart rate: the open card says "Average on <day>", not "Latest"', /^[\d.,]+\s*bpm\s*Average on /.test(hrCard.readout) && !/Latest/.test(hrCard.readout));
    const eh = expectedAverage(raw.hr, raw.keys, raw.todayKey);
    const m = hrCard.readout.match(/(\d+)-day average ([\d.,]+)/);
    if (!eh) verdict('Heart rate: no average expected', !m);
    else if (!m) verdict('Heart rate: the readout names an average', false);
    else {
      verdict(`Heart rate: says how many days it averaged (${eh.days})`, Number(m[1]) === eh.days, `shown ${m[1]}`);
      verdict('Heart rate: the average = Health Connect\'s full days, today left out', Math.abs(digits(m[2]) - eh.avg) <= 1, Math.abs(digits(m[2]) - eh.avg) <= 1 ? 'matches' : `shown ${digits(m[2])}, expected ${eh.avg}`);
    }
  }
  console.log(`\n${fails === 0 ? 'ALL PASSED' : fails + ' FAILED / not checkable'}`);
  return fails;
}

// ---- modes --------------------------------------------------------------------------------------------------------
if (mode === 'raw') { printRaw(await js(PAGE_RAW)); await done(0); }

if (mode === 'check') { await done((await runCheck()) === 0 ? 0 : 5); }

// ---- network + console watcher (used by `net` and by `faked`) -------------------------------------------------------
async function startWatch() {
  await send('Network.enable'); await send('Runtime.enable');
  const reqs = []; const logs = [];
  listeners.add(async m => {
    if (m.method === 'Network.requestWillBeSent') {
      const r = m.params.request; let u; try { u = new URL(r.url); } catch { return; }
      if (!u.pathname.startsWith('/api/')) return;
      let post = r.postData;
      if (!post && r.hasPostData) post = (await send('Network.getRequestPostData', { requestId: m.params.requestId }).catch(() => ({}))).postData;
      let body = null; try { body = post ? JSON.parse(post) : null; } catch { /* not json */ }
      reqs.push({ method: r.method, host: u.host, path: u.pathname, keys: body ? Object.keys(body).sort() : [], timeZone: body?.timeZone ?? null });
    }
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'warning' || m.params.type === 'error')) {
      const show = a => a.value ?? (a.preview ? `{${(a.preview.properties ?? []).map(p => `${p.name}=${String(p.value).slice(0, 60)}`).join(', ')}}` : null) ?? a.description ?? '';
      logs.push(`[${m.params.type}] ` + m.params.args.map(show).join(' ').slice(0, 220));
    }
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + String(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 150));
  });
  return () => {
    const byPath = {};
    for (const r of reqs) { const k = `${r.method} ${r.path}`; (byPath[k] ??= []).push(r); }
    console.log(`/api requests seen: ${reqs.length}   hosts: ${[...new Set(reqs.map(r => r.host))].join(', ') || 'none'}`);
    for (const [k, list] of Object.entries(byPath)) console.log(`  ${k}  x${list.length}  body keys: [${list[0].keys.join(', ')}]  timeZone: ${[...new Set(list.map(r => r.timeZone))].join(', ')}`);
    const syncs = reqs.filter(r => r.path === '/api/sync-health-data' && r.method === 'POST'); // the OPTIONS preflight has no body
    console.log(syncs.length ? `${syncs.every(r => r.timeZone) ? 'PASS' : 'FAIL'}  every sync-health-data body carries timeZone (${syncs.length} seen)` : 'no sync-health-data attempt in the window (needs a reading + a profile email; it retries every 30 s)');
    const expected = /Failed to fetch|Health data sync failed|NetworkError|ERR_NAME_NOT_RESOLVED|offlinesandbox|Supabase URL\/anon key not set|RevenueCat public SDK key not set/i; // the last two are this offline test build's own, deliberate
    const other = [...new Set(logs.filter(l => !expected.test(l)))];
    console.log(`console warnings/errors: ${logs.length} (expected offline failures filtered) -> unexpected: ${other.length}`);
    for (const l of other.slice(0, 12)) console.log('   ! ' + l);
    return { reqs, unexpected: other.length };
  };
}

if (mode === 'net') {
  const secs = Number(arg ?? 40);
  const report = await startWatch();
  console.log(`watching ${secs} s ...`);
  await sleep(secs * 1000);
  console.log('');
  report();
  await done(0);
}

if (mode === 'faked') {
  const base = new Date(arg);
  if (!arg || isNaN(base)) { console.log('give an ISO time, e.g. 2026-10-03T21:00:00+05:30'); await done(1); }
  const src = `(() => { const R = Date; const off = ${base.getTime()} - R.now();
    class F extends R { constructor(...a) { if (a.length === 0) super(R.now() + off); else super(...a); } static now() { return R.now() + off; } }
    window.Date = F; })();`;
  const report = await startWatch();   // before the reload, so the first requests after it are caught
  const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: src });
  await send('Page.enable');
  await send('Page.reload');
  console.log(`page reloaded with its clock at ${arg}; waiting 25 s for the app to read Health Connect ...`);
  await sleep(25000);
  const fails = await runCheck();
  console.log('\n--- network + console while the page ran with the moved clock ---');
  report();
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  await send('Page.reload');
  console.log('\nreloaded with the real clock');
  await sleep(500);
  await done(fails === 0 ? 0 : 5);
}

console.log('unknown mode'); await done(1);
