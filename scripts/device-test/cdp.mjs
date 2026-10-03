// Run JavaScript inside the app's WebView on an Android phone over CDP (adb forward tcp:<port> localabstract:webview_devtools_remote_<pid>).
//   node cdp.mjs <port> "<js expression>" [--shot=out.png]      -> prints the value (promises are awaited)
//   node cdp.mjs <port> --list                                  -> prints the page list
const port = process.argv[2];
const list = await (await fetch(`http://localhost:${port}/json`)).json();
if (process.argv.includes('--list')) { console.log(JSON.stringify(list.map(p => ({ title: p.title, url: p.url, type: p.type })), null, 1)); process.exit(0); }
const page = list.find(p => p.type === 'page');
if (!page) { console.log('no page'); process.exit(2); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
ws.onopen = async () => {
  const expr = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : '1';
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  const res = r.result?.result;
  console.log(typeof res?.value === 'string' ? res.value : JSON.stringify(res?.value ?? res?.description ?? r.result, null, 1));
  if (r.result?.exceptionDetails) console.log('THROWN:', JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails));
  const shot = process.argv.find(a => a.startsWith('--shot='));
  if (shot) {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    (await import('node:fs')).writeFileSync(shot.slice(7), Buffer.from(s.result.data, 'base64'));
    console.log('saved', shot.slice(7));
  }
  ws.close(); process.exit(0);
};
setTimeout(() => { console.log('timeout'); process.exit(1); }, 30000);
