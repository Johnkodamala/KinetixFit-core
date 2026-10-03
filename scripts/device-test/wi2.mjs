// Run JavaScript in the app's WebView on an iPhone (real device or simulator) through ios_webkit_debug_proxy.
// Same protocol handling as scripts/ios-sim/wi.mjs (Target-multiplexed), plus: WI_PORT, --file=<js file>, --shot=<png>.
//   WI_PORT=9224 node wi2.mjs "<js expression>" [--shot=out.png] [--file=probe.js]
const port = process.env.WI_PORT || '9222';
const pages = await (await fetch(`http://localhost:${port}/json`)).json();
const page = pages.find(p => p.url.startsWith('capacitor://'));
if (!page) { console.log('no app page on port ' + port + ' (is the app open? is Web Inspector on?)'); process.exit(2); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let outer = 0, inner = 0, targetId = null; const pending = new Map(); const logs = [];
const raw = (method, params = {}) => ws.send(JSON.stringify({ id: ++outer, method, params }));
const send = (method, params = {}) => new Promise(res => {
  const i = ++inner; pending.set(i, res);
  raw('Target.sendMessageToTarget', { targetId, message: JSON.stringify({ id: i, method, params }) });
});
let gotTarget; const targetReady = new Promise(r => { gotTarget = r; });
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.method === 'Target.targetCreated') { targetId = m.params.targetInfo.targetId; gotTarget(); }
  if (m.method === 'Target.dispatchMessageFromTarget') {
    const x = JSON.parse(m.params.message);
    if (x.id && pending.has(x.id)) { pending.get(x.id)(x); pending.delete(x.id); }
    else if (x.method === 'Console.messageAdded') { const c = x.params.message; logs.push(`[${c.level}] ${c.text}${c.url ? ` (${c.url.split('/').pop()}:${c.line})` : ''}`); }
  }
};
const fs = await import('node:fs');
ws.onopen = async () => {
  await targetReady;
  await send('Console.enable'); await send('Runtime.enable');
  const fileArg = process.argv.find(a => a.startsWith('--file='));
  const expr = fileArg ? fs.readFileSync(fileArg.slice(7), 'utf8') : (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '1');
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  const res = r.result?.result;
  console.log(typeof res?.value === 'string' ? res.value : JSON.stringify(res?.value ?? res?.description ?? r, null, 1));
  if (r.result?.wasThrown) console.log('THROWN');
  const shot = process.argv.find(a => a.startsWith('--shot='));
  if (shot) {
    const dims = await send('Runtime.evaluate', { expression: 'innerWidth + "x" + innerHeight', returnByValue: true });
    const [w, h] = dims.result.result.value.split('x').map(Number);
    const s = await send('Page.snapshotRect', { x: 0, y: 0, width: w, height: h, coordinateSystem: 'Viewport' });
    const url = s.result?.dataURL;
    if (url) { fs.writeFileSync(shot.slice(7), Buffer.from(url.split(',')[1], 'base64')); console.log('saved', shot.slice(7), `${w}x${h} css px`); }
    else console.log('snapshot failed:', JSON.stringify(s).slice(0, 300));
  }
  if (logs.length && process.argv.includes('--console')) console.log('CONSOLE:\n' + [...new Set(logs)].join('\n'));
  ws.close(); process.exit(0);
};
setTimeout(() => { console.log('timeout'); process.exit(1); }, 40000);
