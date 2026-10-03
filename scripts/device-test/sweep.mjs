// Walks every screen of the app on one device: sets the route through the app's own hash router, scrolls the page in steps,
// takes a screenshot at each step and runs lint.js on it. Nothing is tapped, so nothing is written to the account.
//   node sweep.mjs <android|ios> <port> <outDir> [--theme=light|dark] [--routes=#a,#b/c] [--adb=<serial>] [--simshot=<sim udid>] [--tag=<name>]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const [backend, port, outDir, ...flags] = process.argv.slice(2);
const flag = n => (flags.find(f => f.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=');
const theme = flag('theme');
const serial = flag('adb') || 'RZCT815G2ND';
const simUdid = flag('simshot');
const tag = flag('tag') || 'x';
const only = flag('routes') ? flag('routes').split(',') : null;
fs.mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lintSrc = fs.readFileSync(new URL('./lint.js', import.meta.url), 'utf8');
const ROUTES = ['#vitals', '#nourish', '#rewards', '#account', '#account/details', '#account/allergies', '#account/devices', '#account/reminders',
  '#account/icon', '#account/widgets', '#account/subscription', '#account/promo', '#account/about', '#account/privacy', '#account/help'];

async function connect() {
  const list = await (await fetch(`http://localhost:${port}/json`)).json();
  if (backend === 'android') {
    const page = list.find(p => p.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => { ws.onopen = r; });
    let id = 0; const pending = new Map();
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    return {
      ev: async expr => {
        const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
        if (r.result.exceptionDetails) throw new Error('page error: ' + JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails));
        return r.result.result.value;
      },
      shot: async file => { fs.writeFileSync(file, execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 80e6 })); },
      close: () => ws.close(),
    };
  }
  const page = list.find(p => p.url.startsWith('capacitor://'));
  if (!page) throw new Error('no app page on port ' + port);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let outer = 0, inner = 0, targetId = null; const pending = new Map();
  const raw = (method, params = {}) => ws.send(JSON.stringify({ id: ++outer, method, params }));
  const send = (method, params = {}) => new Promise(res => { const i = ++inner; pending.set(i, res); raw('Target.sendMessageToTarget', { targetId, message: JSON.stringify({ id: i, method, params }) }); });
  let gotTarget; const targetReady = new Promise(r => { gotTarget = r; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Target.targetCreated') { targetId = m.params.targetInfo.targetId; gotTarget(); }
    if (m.method === 'Target.dispatchMessageFromTarget') { const x = JSON.parse(m.params.message); if (x.id && pending.has(x.id)) { pending.get(x.id)(x); pending.delete(x.id); } }
  };
  await new Promise(r => { ws.onopen = r; });
  await targetReady;
  await send('Runtime.enable');
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.result?.wasThrown) throw new Error('page error: ' + JSON.stringify(r.result.result));
    return r.result?.result?.value;
  };
  return {
    ev,
    shot: async file => {
      if (simUdid) { execFileSync('xcrun', ['simctl', 'io', simUdid, 'screenshot', file]); return; }
      const [w, h] = (await ev('innerWidth + "x" + innerHeight')).split('x').map(Number);
      const s = await send('Page.snapshotRect', { x: 0, y: 0, width: w, height: h, coordinateSystem: 'Viewport' });
      fs.writeFileSync(file, Buffer.from(s.result.dataURL.split(',')[1], 'base64'));
    },
    close: () => ws.close(),
  };
}

const slug = r => r.replace('#', '').replace(/\//g, '-') || 'root';
const d = await connect();
const startHash = await d.ev('location.hash');
const startTheme = await d.ev("document.documentElement.getAttribute('data-theme') || ''");
const setTheme = async () => { if (theme) await d.ev(`document.documentElement.setAttribute('data-theme', '${theme}'); 'ok'`); };
const report = [];
for (const route of (only ?? ROUTES)) {
  await d.ev(`location.hash = '${route}'; 'ok'`);
  await sleep(1400);
  await setTheme();
  await sleep(300);
  const top = JSON.parse(await d.ev(lintSrc));
  const sc = top.scroll || { height: 0, client: 0 };
  const shots = [];
  let pos = 0, n = 0, endLint = null;
  for (;;) {
    await d.ev(`(document.querySelector('.app-scroll-body') || document.scrollingElement).scrollTo(0, ${pos}); 'ok'`);
    await sleep(450);
    const file = `${outDir}/${tag}-${slug(route)}-${String(n).padStart(2, '0')}.png`;
    await d.shot(file); shots.push(file);
    const atEnd = pos + sc.client >= sc.height - 2;
    if (atEnd) { endLint = JSON.parse(await d.ev(lintSrc)); break; }
    if (n >= 8) break;
    pos = Math.min(pos + Math.round(sc.client * 0.8), Math.max(0, sc.height - sc.client)); n++;
  }
  await d.ev("(document.querySelector('.app-scroll-body') || document.scrollingElement).scrollTo(0, 0); 'ok'");
  const issues = [...top.issues, ...(endLint ? endLint.issues.filter(i => i.t.endsWith('at-page-end')) : [])];
  report.push({ route, viewport: `${top.vw}x${top.vh}`, scroll: sc, shots: shots.length, issues });
  const kinds = {};
  for (const i of issues) kinds[i.t] = (kinds[i.t] || 0) + 1;
  console.log(`${route.padEnd(24)} page ${sc.height}px (${shots.length} shots)  issues: ${Object.keys(kinds).length ? JSON.stringify(kinds) : 'none'}`);
}
await d.ev(`location.hash = '${startHash || '#vitals'}'; 'ok'`);
await d.ev(`${startTheme ? `document.documentElement.setAttribute('data-theme', '${startTheme}')` : "document.documentElement.removeAttribute('data-theme')"}; 'ok'`);
fs.writeFileSync(`${outDir}/${tag}-report.json`, JSON.stringify(report, null, 1));
d.close();
process.exit(0);
