// Renders the alternate app icons (src/lib/appIcons.ts) with headless Chromium: the KinetixFit symbol recoloured from
// the original logo art (assets/icon-only.png — its brushed ribbon becomes gold, pearl or white), and "KX" lettering:
// wide KX on the track, an interlocked KX monogram, KX with a heartbeat, brushed chrome. Writes every file the apps need:
//   iOS      ios/App/App/Assets.xcassets/AppIcon-<Name>.appiconset/ (1024 px RGB PNG — App Store icons can't have alpha —
//            + Contents.json)
//   Android  android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_<id>_{foreground,background}.webp (432 px adaptive layers)
//            + mipmap-anydpi-v26/ic_launcher_<id>.xml
//   app      src/assets/app-icons/<id>.webp (264 px previews for Account → App icon)
// Classic is the existing icon: only its preview is written.
//
// Playwright and the fonts aren't project dependencies. Install them in a scratch folder and point PW_DIR at it:
//   mkdir /tmp/kx-icons && cd /tmp/kx-icons && npm i playwright @fontsource/syncopate
//   PW_DIR=/tmp/kx-icons node scripts/app-icons/render.mjs            (from the project root)
// OUT_DIR=/some/folder writes everything there instead (drafts), plus a contact sheet (sheet.png).
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pwDir = process.env.PW_DIR;
if (!pwDir) throw new Error('Set PW_DIR to a folder with playwright + @fontsource fonts installed (see the header).');
const { chromium } = createRequire(join(pwDir, 'package.json'))('playwright');
const outDir = process.env.OUT_DIR ? resolve(process.env.OUT_DIR) : null;

// id → iOS alternate icon name (AppIcon-<Name>); must match ios/App/App/AppIconPlugin.swift and AndroidManifest aliases
export const ICONS = [
  { id: 'classic', ios: null },
  { id: 'midnight', ios: 'Midnight' },
  { id: 'aurora', ios: 'Aurora' },
  { id: 'gold', ios: 'Gold' },
  { id: 'ember', ios: 'Ember' },
  { id: 'kx-track', ios: 'KXTrack' },
  { id: 'kx-mono', ios: 'KXMono' },
  { id: 'kx-pulse', ios: 'KXPulse' },
  { id: 'kx-chrome', ios: 'KXChrome' },
];

const b64 = p => readFileSync(p).toString('base64');
const font = (pkg, file) => `data:font/woff2;base64,${b64(join(pwDir, 'node_modules/@fontsource', pkg, 'files', file))}`;
const assets = {
  logo: `data:image/png;base64,${b64(join(root, 'assets/icon-only.png'))}`,
  classic: `data:image/png;base64,${b64(join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png'))}`,
  fonts: {
    KXDisplay: `data:font/ttf;base64,${b64(join(root, 'android/app/src/main/res/font/kx_display.ttf'))}`,
    Syncopate: font('syncopate', 'syncopate-latin-700-normal.woff2'),
  },
};

// Runs in the page: draws one icon layer onto a canvas and returns a PNG data URL.
async function pageSetup(assets) {
  const load = src => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
  for (const [family, src] of Object.entries(assets.fonts)) {
    const f = new FontFace(family, `url(${src})`);
    await f.load();
    document.fonts.add(f);
  }
  const logo = await load(assets.logo);
  const classic = await load(assets.classic);

  // The symbol, cut from the logo (rows 290–534, cols 140–886 of the 1024 px art: the ribbon, not the wordmark).
  // On black, a pixel's brightness is how much ribbon (and glow) it has: that becomes alpha and a 0–1 shade.
  const CROP = { x: 140, y: 288, w: 748, h: 250 };
  const base = document.createElement('canvas');
  base.width = CROP.w; base.height = CROP.h;
  const bg = base.getContext('2d', { willReadFrequently: true });
  bg.drawImage(logo, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, CROP.w, CROP.h);
  const src = bg.getImageData(0, 0, CROP.w, CROP.h);
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const mapColour = (stops, s) => {
    for (let i = 1; i < stops.length; i++) {
      if (s <= stops[i][0]) {
        const [p0, c0] = stops[i - 1], [p1, c1] = stops[i];
        const t = (s - p0) / (p1 - p0 || 1);
        return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
      }
    }
    return stops[stops.length - 1][1];
  };
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const STYLES = {
    teal: null, // the logo's own colours
    gold: [[0, hex('#3A2406')], [0.3, hex('#7A4E10')], [0.55, hex('#C8962E')], [0.75, hex('#EFC766')], [0.9, hex('#FBE7A6')], [1, hex('#FFF8E0')]],
    pearl: [[0, hex('#9FD8E8')], [0.5, hex('#E6F6FF')], [0.8, hex('#FFFFFF')], [1, hex('#FFFFFF')]],
    white: [[0, hex('#FFE3D6')], [0.5, hex('#FFF6F1')], [1, hex('#FFFFFF')]],
  };
  const symbolCache = {};
  function symbol(style, haze = [0.09, 0.5]) {
    const key = `${style}-${haze}`;
    if (symbolCache[key]) return symbolCache[key];
    const c = document.createElement('canvas');
    c.width = CROP.w; c.height = CROP.h;
    const g = c.getContext('2d');
    const out = g.createImageData(CROP.w, CROP.h);
    const s = src.data, o = out.data, stops = STYLES[style];
    for (let i = 0; i < s.length; i += 4) {
      const L = Math.max(s[i], s[i + 1], s[i + 2]) / 255;
      const a = smooth(haze[0], haze[1], L);
      if (a <= 0) continue;
      let rgb;
      if (!stops) rgb = [s[i] / Math.max(L, 0.01), s[i + 1] / Math.max(L, 0.01), s[i + 2] / Math.max(L, 0.01)].map(v => Math.min(255, v));
      else rgb = mapColour(stops, Math.min(1, Math.max(0, (L - 0.08) / 0.85)));
      o[i] = rgb[0]; o[i + 1] = rgb[1]; o[i + 2] = rgb[2]; o[i + 3] = Math.round(a * 255);
    }
    g.putImageData(out, 0, 0);
    return (symbolCache[key] = c);
  }

  function drawSymbol(g, cx, cy, width, style, { glow = 0, glowColour = 'rgba(255,255,255,0.6)', shadow = null } = {}) {
    const sym = symbol(style);
    const h = width * CROP.h / CROP.w;
    g.save();
    g.imageSmoothingQuality = 'high';
    if (glow) {
      g.save();
      g.filter = `blur(${width * glow}px)`;
      g.globalAlpha = 0.85;
      g.drawImage(sym, cx - width / 2, cy - h / 2, width, h);
      g.restore();
      // tint the glow: draw it again through a colour
      g.save();
      g.globalCompositeOperation = 'source-atop';
      g.restore();
    }
    if (shadow) { g.shadowColor = shadow.colour; g.shadowBlur = shadow.blur * width; g.shadowOffsetY = shadow.y * width; }
    g.drawImage(sym, cx - width / 2, cy - h / 2, width, h);
    g.restore();
  }

  // Fills text with a gradient (plus a highlight edge), for the KX icons.
  function lettering(g, text, cx, cy, fontCss, paint, spacing = '0em') {
    g.save();
    g.font = fontCss;
    g.letterSpacing = spacing; // air between the letters, for faces whose K and X touch
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    const m = g.measureText(text);
    // letter spacing adds space after the last letter too, so centred text sits half of it to the left: shift it back
    const px = Number(g.font.match(/([\d.]+)px/)?.[1] ?? 0);
    cx += (parseFloat(spacing) * px) / 2;
    const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
    const y = cy + (asc - desc) / 2; // optically centred on the glyphs, not the line box
    paint(g, text, cx, y, { width: m.width, asc, desc, top: y - asc, bottom: y + desc, left: cx - m.width / 2 });
    g.restore();
  }

  const lanes = (g, S, colour, count = 5) => {
    g.save();
    g.strokeStyle = colour;
    g.lineWidth = S * 0.006;
    for (let i = 0; i < count; i++) {
      const y = S * (0.2 + i * 0.15);
      g.beginPath();
      g.moveTo(-S * 0.1, y + S * 0.18);
      g.bezierCurveTo(S * 0.3, y + S * 0.12, S * 0.6, y - S * 0.1, S * 1.1, y - S * 0.2);
      g.stroke();
    }
    g.restore();
  };

  // Each icon: bg(g, S) paints the full square; fg(g, S, safe) paints the art centred, `safe` = the width it may use.
  const DESIGNS = {
    midnight: {
      bg(g, S) {
        const r = g.createRadialGradient(S * 0.5, S * 0.42, 0, S * 0.5, S * 0.5, S * 0.75);
        r.addColorStop(0, '#12353A'); r.addColorStop(0.45, '#0A1C21'); r.addColorStop(1, '#04090C');
        g.fillStyle = r; g.fillRect(0, 0, S, S);
      },
      fg(g, S, safe) { drawSymbol(g, S / 2, S / 2, safe * 1.0, 'teal', { glow: 0.035 }); },
    },
    aurora: {
      bg(g, S) {
        g.fillStyle = '#081226'; g.fillRect(0, 0, S, S);
        const blob = (x, y, r, c) => { const gr = g.createRadialGradient(x * S, y * S, 0, x * S, y * S, r * S); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); };
        g.save();
        g.filter = `blur(${S * 0.05}px)`;
        blob(0.05, 0.0, 1.0, 'rgba(34, 214, 176, 0.85)');
        blob(1.0, 0.25, 0.9, 'rgba(123, 97, 255, 0.9)');
        blob(0.45, 1.1, 0.85, 'rgba(58, 104, 255, 0.75)');
        blob(0.95, 1.0, 0.55, 'rgba(255, 93, 177, 0.45)');
        g.restore();
        const v = g.createLinearGradient(0, 0, 0, S); v.addColorStop(0, 'rgba(255,255,255,0.10)'); v.addColorStop(1, 'rgba(0,0,0,0.25)');
        g.fillStyle = v; g.fillRect(0, 0, S, S);
      },
      fg(g, S, safe) { drawSymbol(g, S / 2, S / 2, safe, 'pearl', { glow: 0.03, shadow: { colour: 'rgba(8, 18, 60, 0.45)', blur: 0.03, y: 0.012 } }); },
    },
    gold: {
      bg(g, S) {
        const r = g.createRadialGradient(S * 0.5, S * 0.35, 0, S * 0.5, S * 0.5, S * 0.8);
        r.addColorStop(0, '#2A2418'); r.addColorStop(0.5, '#141210'); r.addColorStop(1, '#050505');
        g.fillStyle = r; g.fillRect(0, 0, S, S);
      },
      fg(g, S, safe) { drawSymbol(g, S / 2, S / 2, safe, 'gold', { glow: 0.03 }); },
    },
    ember: {
      bg(g, S) {
        const l = g.createLinearGradient(0, 0, S, S);
        l.addColorStop(0, '#FF9A6B'); l.addColorStop(0.5, '#F0602F'); l.addColorStop(1, '#B8321A');
        g.fillStyle = l; g.fillRect(0, 0, S, S);
        const r = g.createRadialGradient(S * 0.3, S * 0.2, 0, S * 0.3, S * 0.2, S * 0.7);
        r.addColorStop(0, 'rgba(255,255,255,0.28)'); r.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = r; g.fillRect(0, 0, S, S);
      },
      fg(g, S, safe) { drawSymbol(g, S / 2, S / 2, safe, 'white', { shadow: { colour: 'rgba(120, 30, 10, 0.45)', blur: 0.03, y: 0.015 } }); },
    },
    'kx-track': {
      bg(g, S) {
        g.fillStyle = '#16181F'; g.fillRect(0, 0, S, S);
        const r = g.createRadialGradient(S * 0.85, S * 0.95, 0, S * 0.85, S * 0.95, S * 0.8);
        r.addColorStop(0, 'rgba(229, 83, 45, 0.55)'); r.addColorStop(1, 'rgba(229, 83, 45, 0)');
        g.fillStyle = r; g.fillRect(0, 0, S, S);
        lanes(g, S, 'rgba(244, 243, 238, 0.10)');
      },
      fg(g, S, safe) {
        lettering(g, 'KX', S / 2, S / 2, `${safe * 0.48}px KXDisplay`, (g, t, x, y, m) => {
          g.textAlign = 'left';
          const kW = g.measureText('K').width;
          g.fillStyle = '#F4F3EE';
          g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = safe * 0.03; g.shadowOffsetY = safe * 0.01;
          g.fillText('K', m.left, y);
          const xg = g.createLinearGradient(0, m.top, 0, m.bottom);
          xg.addColorStop(0, '#FF8A5E'); xg.addColorStop(1, '#E5532D');
          g.fillStyle = xg;
          g.fillText('X', m.left + kW, y);
        });
      },
    },
    'kx-mono': {
      // K and X interlocked like a chain: the X passes over the K's arm, the K's leg over the X. Gold on emerald.
      bg(g, S) {
        const r = g.createRadialGradient(S * 0.5, S * 0.36, 0, S * 0.5, S * 0.5, S * 0.8);
        r.addColorStop(0, '#11503F'); r.addColorStop(0.55, '#082B22'); r.addColorStop(1, '#021009');
        g.fillStyle = r; g.fillRect(0, 0, S, S);
      },
      fg(g, S, safe) {
        // strokes on a 100-unit grid, cut flat at the top and bottom (y 18–82); the monogram is ~74 units wide
        const w = 8.5, gap = 2.4, k = (safe * 0.78) / 74;
        const ox = S / 2 - 52 * k, oy = S / 2 - 50 * k;
        const P = (x, y) => [ox + x * k, oy + y * k];
        const ext = (a, b, t0, t1) => { const dx = b[0] - a[0], dy = b[1] - a[1]; return [[a[0] - dx * t0, a[1] - dy * t0], [b[0] + dx * t1, b[1] + dy * t1]]; };
        const K = [[[20, 10], [20, 90]], ext([20, 60], [50, 18], 0, 0.4), ext([30.5, 46], [58, 82], 0.05, 0.4)];
        const X = [ext([38, 18], [86, 82], 0.4, 0.4), ext([38, 82], [86, 18], 0.4, 0.4)];
        const layer = document.createElement('canvas');
        layer.width = S; layer.height = S;
        const L = layer.getContext('2d');
        const strokes = (list, width) => {
          L.lineWidth = width * k; L.lineCap = 'butt';
          L.beginPath();
          for (const [a, b] of list) { L.moveTo(...P(...a)); L.lineTo(...P(...b)); }
          L.stroke();
        };
        L.save();
        const [x0, y0] = P(-20, 18), [x1, y1] = P(140, 82);
        L.beginPath(); L.rect(x0, y0, x1 - x0, y1 - y0); L.clip();
        L.strokeStyle = '#FFFFFF';
        strokes(K, w);
        // the X over the K: a gap around it, then the X
        L.globalCompositeOperation = 'destination-out'; strokes(X, w + gap * 2);
        L.globalCompositeOperation = 'source-over'; strokes(X, w);
        // the K's leg back over the X, only around that crossing
        L.save();
        L.beginPath(); L.arc(...P(49, 69.5), 12 * k, 0, Math.PI * 2); L.clip();
        L.globalCompositeOperation = 'destination-out'; strokes([K[2]], w + gap * 2);
        L.globalCompositeOperation = 'source-over'; strokes([K[2]], w);
        L.restore();
        L.restore();
        // polished gold across it
        const [gx0, gy0] = P(16, 18), [gx1, gy1] = P(88, 82);
        const gold = L.createLinearGradient(gx0, gy0, gx1, gy1);
        gold.addColorStop(0, '#FFF1B8'); gold.addColorStop(0.22, '#E9C46A'); gold.addColorStop(0.45, '#9C6A1A');
        gold.addColorStop(0.62, '#F6D57A'); gold.addColorStop(0.8, '#B8862B'); gold.addColorStop(1, '#FBE7A6');
        L.globalCompositeOperation = 'source-in';
        L.fillStyle = gold; L.fillRect(0, 0, S, S);
        g.save();
        g.shadowColor = 'rgba(0, 0, 0, 0.5)'; g.shadowBlur = safe * 0.03; g.shadowOffsetY = safe * 0.012;
        g.drawImage(layer, 0, 0);
        g.restore();
      },
    },
    'kx-pulse': {
      // Coral KX, leaning forward, over a heartbeat line that ends in a dot (a live trace). White.
      bg(g, S) {
        const l = g.createLinearGradient(0, 0, 0, S);
        l.addColorStop(0, '#FFFFFF'); l.addColorStop(1, '#EEF1F4');
        g.fillStyle = l; g.fillRect(0, 0, S, S);
        const r = g.createRadialGradient(S * 0.9, S, 0, S * 0.9, S, S * 0.7);
        r.addColorStop(0, 'rgba(255, 106, 61, 0.16)'); r.addColorStop(1, 'rgba(255, 106, 61, 0)');
        g.fillStyle = r; g.fillRect(0, 0, S, S);
      },
      fg(g, S, safe) {
        const u = safe / 100, px = safe * 0.46;
        g.save();
        g.font = `${px}px KXDisplay`;
        g.textBaseline = 'alphabetic'; g.textAlign = 'center';
        const m = g.measureText('KX');
        const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
        // letters + line as one block, centred: the line sits 14 units under the letters
        const block = asc + desc + 14 * u + 6 * u;
        const y = S / 2 - block / 2 + asc;
        const coral = g.createLinearGradient(0, y - asc, 0, y);
        coral.addColorStop(0, '#FF8A5E'); coral.addColorStop(1, '#E5402D');
        g.save();
        g.translate(S / 2, y); g.transform(1, 0, -0.16, 1, 0, 0); g.translate(-S / 2, -y);
        g.shadowColor = 'rgba(229, 64, 45, 0.25)'; g.shadowBlur = safe * 0.03; g.shadowOffsetY = safe * 0.01;
        g.fillStyle = coral; g.fillText('KX', S / 2, y);
        g.restore();
        const base = y + desc + 14 * u, x0 = S / 2 - 40 * u;
        g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = safe * 0.04; g.strokeStyle = '#E5532D';
        g.beginPath();
        [[0, 0], [30, 0], [35, -4], [40, 0], [45, 0], [50, -9], [56, 12], [61, -3], [65, 0], [80, 0]]
          .forEach(([x, dy], i) => (i ? g.lineTo(x0 + x * u, base + dy * u) : g.moveTo(x0 + x * u, base + dy * u)));
        g.stroke();
        g.beginPath(); g.arc(x0 + 80 * u, base, safe * 0.035, 0, Math.PI * 2); g.fillStyle = '#E5532D'; g.fill();
        g.restore();
      },
    },
    'kx-chrome': {
      bg(g, S) {
        const l = g.createLinearGradient(0, 0, 0, S);
        l.addColorStop(0, '#3A4148'); l.addColorStop(1, '#101316');
        g.fillStyle = l; g.fillRect(0, 0, S, S);
        // brushed metal: many fine streaks of random brightness (seeded, so every run draws the same)
        let seed = 7;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        g.save();
        for (let i = 0; i < 900; i++) {
          g.globalAlpha = 0.015 + rnd() * 0.045;
          g.fillStyle = rnd() > 0.5 ? '#FFFFFF' : '#000000';
          g.fillRect(0, rnd() * S, S, S * (0.0008 + rnd() * 0.0018));
        }
        g.restore();
        const sheen = g.createLinearGradient(0, 0, S, S);
        sheen.addColorStop(0, 'rgba(255,255,255,0.10)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,0.2)');
        g.fillStyle = sheen; g.fillRect(0, 0, S, S);
      },
      fg(g, S, safe) {
        lettering(g, 'KX', S / 2, S / 2, `700 ${safe * 0.42}px Syncopate`, (g, t, x, y, m) => {
          const gr = g.createLinearGradient(0, m.top, 0, m.bottom);
          gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(0.42, '#D9DFE4'); gr.addColorStop(0.5, '#6E7A84'); gr.addColorStop(0.56, '#B9C3CA'); gr.addColorStop(1, '#F7F9FA');
          g.shadowColor = 'rgba(0,0,0,0.65)'; g.shadowBlur = safe * 0.03; g.shadowOffsetY = safe * 0.012;
          g.fillStyle = gr; g.fillText(t, x, y);
          g.shadowColor = 'transparent';
          g.lineWidth = Math.max(1, safe * 0.004); g.strokeStyle = 'rgba(20, 24, 28, 0.6)'; g.strokeText(t, x, y);
        });
      },
    },
  };

  // layer: 'ios' (1024, everything), 'bg' / 'fg' (Android adaptive layers, 432), 'preview' (264, like iOS).
  // iOS comes back as raw RGBA (Node writes an RGB PNG); the rest as WebP.
  window.renderIcon = (id, layer) => {
    const S = layer === 'ios' ? 1024 : layer === 'preview' ? 264 : 432;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    const done = () => {
      if (layer !== 'ios') return c.toDataURL('image/webp', layer === 'bg' ? 0.9 : 0.92);
      const px = g.getImageData(0, 0, S, S).data;
      let bin = '';
      for (let i = 0; i < px.length; i += 0x8000) bin += String.fromCharCode.apply(null, px.subarray(i, i + 0x8000));
      return 'raw,' + btoa(bin);
    };
    if (id === 'classic') {
      g.imageSmoothingQuality = 'high';
      g.drawImage(classic, 0, 0, S, S);
      return done();
    }
    const d = DESIGNS[id];
    // how wide the art may be: iOS keeps it clear of the rounded corners; Android keeps it in the 66 dp safe circle
    // of the 108 dp canvas (wide symbols get a bit more, their ends are thin)
    const kx = id.startsWith('kx-');
    const safe = layer === 'fg' || layer === 'bg' ? S * (kx ? 0.62 : 0.56) : S * (kx ? 0.8 : 0.84);
    if (layer !== 'fg') d.bg(g, S);
    if (layer !== 'bg') d.fg(g, S, safe);
    return done();
  };
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><body></body>');
await page.evaluate(pageSetup, assets);
const png = async (id, layer) => {
  const data = Buffer.from((await page.evaluate(([i, l]) => window.renderIcon(i, l), [id, layer])).split(',')[1], 'base64');
  return layer === 'ios' ? rgbPng(data, 1024) : data;
};
const write = (path, data) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data); };

// A lossless RGB PNG (no alpha) from RGBA pixels: per row the filter with the smallest output (the usual heuristic).
function rgbPng(rgba, size) {
  const stride = size * 3;
  const rows = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(stride);
    for (let x = 0; x < size; x++) for (let k = 0; k < 3; k++) row[x * 3 + k] = rgba[(y * size + x) * 4 + k];
    let best = null, bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = Buffer.alloc(stride + 1);
      out[0] = f;
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 3 ? row[i - 3] : 0, b = prev[i], c = i >= 3 ? prev[i - 3] : 0;
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        const v = (row[i] - pred) & 0xff;
        out[i + 1] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; best = out; }
    }
    rows.push(best);
    prev = row;
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const icon of ICONS) {
  const preview = await png(icon.id, 'preview');
  if (outDir) {
    write(join(outDir, `${icon.id}-preview.webp`), preview);
    write(join(outDir, `${icon.id}-ios.png`), await png(icon.id, 'ios'));
    if (icon.id !== 'classic') {
      write(join(outDir, `${icon.id}-fg.webp`), await png(icon.id, 'fg'));
      write(join(outDir, `${icon.id}-bg.webp`), await png(icon.id, 'bg'));
    }
    continue;
  }
  write(join(root, 'src/assets/app-icons', `${icon.id}.webp`), preview);
  if (icon.id === 'classic') continue;
  const name = `AppIcon-${icon.ios}`;
  const set = join(root, 'ios/App/App/Assets.xcassets', `${name}.appiconset`);
  write(join(set, `${name}-1024.png`), await png(icon.id, 'ios'));
  write(join(set, 'Contents.json'), JSON.stringify({
    images: [{ filename: `${name}-1024.png`, idiom: 'universal', platform: 'ios', size: '1024x1024' }],
    info: { author: 'xcode', version: 1 },
  }, null, 2) + '\n');
  const res = join(root, 'android/app/src/main/res');
  const key = icon.id.replace(/-/g, '_');
  write(join(res, 'mipmap-xxxhdpi', `ic_launcher_${key}_foreground.webp`), await png(icon.id, 'fg'));
  write(join(res, 'mipmap-xxxhdpi', `ic_launcher_${key}_background.webp`), await png(icon.id, 'bg'));
  write(join(res, 'mipmap-anydpi-v26', `ic_launcher_${key}.xml`),
    `<?xml version="1.0" encoding="utf-8"?>\n<!-- Alternate app icon "${icon.id}" (scripts/app-icons/render.mjs; switched by AppIconPlugin.java) -->\n` +
    `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n` +
    `    <background android:drawable="@mipmap/ic_launcher_${key}_background" />\n` +
    `    <foreground android:drawable="@mipmap/ic_launcher_${key}_foreground" />\n` +
    `</adaptive-icon>\n`);
}

// Contact sheet (drafts): each icon as iOS shows it (rounded) and as Android shows it (circle and squircle masks).
if (outDir) {
  const tiles = ICONS.map(i => `<figure><img class="ios" src="data:image/png;base64,${readFileSync(join(outDir, `${i.id}-ios.png`)).toString('base64')}">` +
    (i.id === 'classic' ? '' : `<span class="and"><img src="data:image/webp;base64,${readFileSync(join(outDir, `${i.id}-bg.webp`)).toString('base64')}"><img src="data:image/webp;base64,${readFileSync(join(outDir, `${i.id}-fg.webp`)).toString('base64')}"></span>`) +
    `<figcaption>${i.id}</figcaption></figure>`).join('');
  await page.setContent(`<body style="margin:0;padding:24px;background:${process.env.SHEET_BG || '#dfe3e6'};font:14px system-ui;display:flex;flex-wrap:wrap;gap:22px;width:1100px">
    <style>figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:8px}
    .ios{width:120px;height:120px;border-radius:27px;box-shadow:0 6px 18px rgba(0,0,0,.25)}
    .and{position:relative;width:120px;height:120px;border-radius:50%;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,.25)}
    .and img{position:absolute;left:-30px;top:-30px;width:180px;height:180px}</style>${tiles}</body>`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(outDir, 'sheet.png'), fullPage: true });
}
await browser.close();
console.log(outDir ? `Drafts in ${outDir}` : 'Icons written.');
