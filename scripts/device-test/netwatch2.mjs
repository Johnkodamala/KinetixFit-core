// Timeline of every network call the app makes for N seconds, INCLUDING failed ones (Android WebView over CDP).
//   node netwatch2.mjs <port> <seconds>
const port = process.argv[2], secs = +process.argv[3] || 20;
const list = await (await fetch(`http://localhost:${port}/json`)).json();
const ws = new WebSocket(list.find(p => p.type === 'page').webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const reqs = new Map();
const t0 = Date.now(); const at = () => '+' + ((Date.now() - t0) / 1000).toFixed(1) + 's';
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const short = u => u.replace(/^https?:\/\//, '').replace(/\?.*$/, '').slice(0, 80);
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Network.requestWillBeSent') { const r = m.params.request; reqs.set(m.params.requestId, { method: r.method, url: short(r.url) }); console.log(at(), '->', r.method, short(r.url)); }
  if (m.method === 'Network.responseReceived') { const q = reqs.get(m.params.requestId); console.log(at(), '<-', m.params.response.status, q ? q.method + ' ' + q.url : ''); }
  if (m.method === 'Network.loadingFailed') { const q = reqs.get(m.params.requestId); console.log(at(), 'XX FAILED', m.params.errorText, q ? q.method + ' ' + q.url : ''); }
};
await new Promise(r => { ws.onopen = r; });
await send('Network.enable');
console.log(at(), 'watching');
await new Promise(r => setTimeout(r, secs * 1000));
process.exit(0);
