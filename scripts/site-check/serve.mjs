// Serves the website build (npm run build:web → dist-web/) the way Vercel serves this project: the filesystem first (a
// folder serves its index.html), then vercel.json's rewrites, then 404.html with status 404; text is compressed like
// Vercel does. /api/* answers 501, so nothing reaches production (tests answer /api/early-access themselves).
// Usage (from the project root): node scripts/site-check/serve.mjs [root=dist-web] [port=5190]
import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [root = resolve(project, 'dist-web'), port = '5190'] = process.argv.slice(2);
const vercelPath = resolve(project, 'vercel.json');
const vercel = JSON.parse(readFileSync(vercelPath, 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml' };
function fileFor(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  let p = join(root, clean);
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  return existsSync(p) && statSync(p).isFile() ? p : null;
}
// Vercel compresses text responses (brotli or gzip); do the same so audits see realistic sizes
const TEXT = new Set(['.html', '.js', '.css', '.svg', '.json', '.txt', '.xml']);
let currentReq = null;
function send(res, status, file, headers = {}) {
  let body = readFileSync(file);
  const accept = String(currentReq?.headers['accept-encoding'] ?? '');
  const extra = {};
  if (TEXT.has(extname(file))) {
    if (accept.includes('br')) { body = brotliCompressSync(body); extra['content-encoding'] = 'br'; }
    else if (accept.includes('gzip')) { body = gzipSync(body); extra['content-encoding'] = 'gzip'; }
    extra.vary = 'Accept-Encoding';
  }
  res.writeHead(status, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', ...headers, ...extra });
  res.end(body);
}
createServer((req, res) => {
  currentReq = req;
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) { res.writeHead(501, { 'content-type': 'application/json' }); return res.end('{"error":"not in local tests"}'); }
  const headers = {};
  for (const h of vercel.headers ?? []) {
    const re = new RegExp('^' + h.source.replace(/\(\.\*\)/g, '(.*)') + '$');
    if (re.test(url.pathname)) for (const { key, value } of h.headers) headers[key] = value;
  }
  let file = fileFor(url.pathname);
  if (!file) {
    const rw = (vercel.rewrites ?? []).find(r => !r.source.includes('(') && r.source === url.pathname);
    if (rw) file = fileFor(rw.destination);
  }
  if (file) return send(res, 200, file, headers);
  const notFound = join(root, '404.html');
  if (existsSync(notFound)) return send(res, 404, notFound);
  res.writeHead(404); res.end('Not found');
}).listen(Number(port), () => console.log(`serving ${root} on http://localhost:${port}`));
