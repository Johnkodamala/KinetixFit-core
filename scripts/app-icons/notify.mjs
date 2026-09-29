// Renders the notification badges (src/lib/notifications.ts): a gradient tile with a white glyph for each kind of
// reminder. Android shows it as the notification's large icon (res/drawable-nodpi/kx_notif_<kind>.png); iOS attaches it
// as the notification's thumbnail (public/notify/<kind>.png, bundled with the web assets). Glyphs are the app's own
// icon shapes (src/components/Icons.tsx, Lucide-style strokes).
//   PW_DIR=/tmp/kx-icons node scripts/app-icons/notify.mjs      (see render.mjs for PW_DIR)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pwDir = process.env.PW_DIR;
if (!pwDir) throw new Error('Set PW_DIR to a folder with playwright installed.');
const { chromium } = createRequire(join(pwDir, 'package.json'))('playwright');

// kind → gradient + glyph paths on a 24-unit grid (stroke, round caps)
export const BADGES = {
  water: { from: '#6FE3F4', to: '#0E8FB8', paths: ['M12 3.2c3.4 4.2 6 7.6 6 10.8a6 6 0 0 1-12 0c0-3.2 2.6-6.6 6-10.8Z', 'M9.5 14.5a2.6 2.6 0 0 0 2.5 2.4'] },
  move: { from: '#FFB08A', to: '#E8552B', paths: [
    'M8.5 3.5c1.7 0 2.7 1.9 2.4 4.4-.2 1.6-.9 2.9-2.2 3.1-1.4.2-2.4-1-2.6-2.8C5.8 5.6 6.8 3.5 8.5 3.5Z', 'M6.6 13.6 10.8 13l.3 2.4c.2 1.4-.7 2.6-2 2.7-1.2.2-2.2-.7-2.4-1.9Z',
    'M15.5 6.5c1.7 0 2.7 2.1 2.4 4.6-.2 1.8-1.2 3-2.6 2.8-1.3-.2-2-1.5-2.2-3.1-.3-2.5.7-4.3 2.4-4.3Z', 'M13.2 16.1 17.4 16.7l-.4 2.4c-.2 1.2-1.2 2.1-2.4 1.9-1.3-.1-2.2-1.3-2-2.7Z'] },
  gut: { from: '#86E6BB', to: '#138A58', paths: ['M3 11h18a9 9 0 0 1-18 0Z', 'M7 21h10', 'M12 7c0-2 1.5-3.5 3.5-4', 'M9 7.5c-.5-1.5-.2-3 .8-4'] },
  goal: { from: '#FFD884', to: '#D98E0B', paths: ['M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18Z', 'M12 7a5 5 0 1 1 0 10a5 5 0 1 1 0-10Z', 'M12 11a1 1 0 1 1 0 2a1 1 0 1 1 0-2Z'] },
  streak: { from: '#FFA071', to: '#D8401F', paths: ['M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z'] },
};

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><body></body>');
for (const [kind, b] of Object.entries(BADGES)) {
  const dataUrl = await page.evaluate(({ b }) => {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    // tile: gradient, a soft light at the top, a darker base
    const grad = g.createLinearGradient(0, 0, S * 0.4, S);
    grad.addColorStop(0, b.from); grad.addColorStop(1, b.to);
    g.fillStyle = grad;
    g.beginPath(); g.roundRect(0, 0, S, S, S * 0.23); g.fill();
    const sheen = g.createRadialGradient(S * 0.3, S * 0.05, 0, S * 0.3, S * 0.05, S * 0.8);
    sheen.addColorStop(0, 'rgba(255,255,255,0.35)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sheen; g.fill();
    // glyph: white strokes, centred in the middle 56% (Android may crop the large icon to a circle)
    const scale = (S * 0.56) / 24;
    g.save();
    g.translate(S * 0.22, S * 0.22);
    g.scale(scale, scale);
    g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 2;
    g.strokeStyle = '#FFFFFF';
    g.shadowColor = 'rgba(0,0,0,0.18)'; g.shadowBlur = 4; g.shadowOffsetY = 0.6;
    for (const d of b.paths) g.stroke(new Path2D(d));
    g.restore();
    return c.toDataURL('image/png');
  }, { b });
  const png = Buffer.from(dataUrl.split(',')[1], 'base64');
  for (const path of [
    join(root, 'android/app/src/main/res/drawable-nodpi', `kx_notif_${kind}.png`),
    join(root, 'public/notify', `${kind}.png`),
  ]) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, png);
  }
}
await browser.close();
console.log('Notification badges written.');
