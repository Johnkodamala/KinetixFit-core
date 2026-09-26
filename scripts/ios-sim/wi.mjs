// Run JavaScript in the app's WebView on the simulator (via ios_webkit_debug_proxy — start it with sim.sh proxy).
// WebKit's inspector is Target-multiplexed: commands go through Target.sendMessageToTarget.
//   node scripts/ios-sim/wi.mjs "<js expression>" [--reload] [--wait=ms]   → prints the value + new console lines
const pages = await (await fetch('http://localhost:9222/json')).json();
const page = pages.find(p => p.url.startsWith('capacitor://'));
if (!page) { console.log('no app page (is the app open? restart ios_webkit_debug_proxy)'); process.exit(2); }
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
ws.onopen = async () => {
  await targetReady;
  await send('Console.enable'); await send('Runtime.enable');
  const wait = +((process.argv.find(a => a.startsWith('--wait=')) || '--wait=6000').split('=')[1]);
  if (process.argv.includes('--reload')) { await send('Page.reload'); await new Promise(r => setTimeout(r, wait)); }
  const r = await send('Runtime.evaluate', { expression: process.argv[2] || '1', returnByValue: true });
  const res = r.result?.result; console.log(JSON.stringify(res?.value ?? res?.description ?? r, null, 1));
  if (r.result?.wasThrown) console.log('THROWN');
  if (logs.length) console.log('CONSOLE:\n' + [...new Set(logs)].join('\n'));
  ws.close(); process.exit(0);
};
setTimeout(() => { console.log('timeout; logs:', logs); process.exit(1); }, 30000);
