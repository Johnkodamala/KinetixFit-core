(() => {
  const round = n => Math.round(n * 10) / 10;
  const vw = innerWidth, vh = innerHeight;
  const issues = [];
  const rectOf = e => e.getBoundingClientRect();
  const clsOf = e => (typeof e.className === 'string' ? e.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
  const desc = e => e.tagName.toLowerCase() + (clsOf(e) ? '.' + clsOf(e) : '') + (e.children.length === 0 && e.textContent.trim() ? ` "${e.textContent.trim().slice(0, 30)}"` : (e.getAttribute('aria-label') ? ` [${e.getAttribute('aria-label').slice(0, 24)}]` : ''));
  const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'PATH', 'CIRCLE', 'LINE', 'RECT', 'POLYLINE', 'POLYGON', 'G', 'DEFS', 'ELLIPSE', 'USE', 'STOP', 'LINEARGRADIENT', 'RADIALGRADIENT', 'CLIPPATH', 'MASK', 'FILTER', 'TEXT', 'TSPAN', 'FEGAUSSIANBLUR', 'ANIMATE', 'ANIMATETRANSFORM']);
  const visible = e => {
    const r = rectOf(e);
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(e);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  };
  const all = [...document.querySelectorAll('body *')].filter(e => !SKIP.has(e.tagName.toUpperCase()) && !e.closest('svg') && visible(e));
  const scroller = document.querySelector('.app-scroll-body');
  const hScrollerOf = e => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 1) return p;
    }
    return null;
  };
  const clippedAway = e => {
    const r = rectOf(e);
    for (let p = e.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible') { const pr = rectOf(p); if (r.right <= pr.left + 0.5 || r.left >= pr.right - 0.5) return true; }
    }
    return false;
  };

  if (document.documentElement.scrollWidth > vw + 1) issues.push({ t: 'page-h-overflow', detail: `scrollWidth ${document.documentElement.scrollWidth} > ${vw}` });
  if (scroller && scroller.scrollWidth > scroller.clientWidth + 1) issues.push({ t: 'scroller-h-overflow', detail: `${scroller.scrollWidth} > ${scroller.clientWidth}` });

  // sticking out of the screen sideways
  for (const e of all) {
    const r = rectOf(e);
    if ((r.right > vw + 1 || r.left < -1) && !hScrollerOf(e) && !clippedAway(e)) issues.push({ t: 'outside-screen-x', el: desc(e), left: round(r.left), right: round(r.right) });
  }

  // text that does not fit its box
  for (const e of all) {
    const cs = getComputedStyle(e);
    if (e.children.length === 0 && e.textContent.trim() && !['visible', 'auto', 'scroll'].includes(cs.overflowX) && e.scrollWidth > e.clientWidth + 1) {
      issues.push({ t: cs.textOverflow === 'ellipsis' ? 'ellipsis(info)' : 'text-clipped-x', el: desc(e), scroll: e.scrollWidth, client: e.clientWidth });
    }
    if (e.children.length === 0 && e.textContent.trim() && !['visible', 'auto', 'scroll'].includes(cs.overflowY) && e.scrollHeight > e.clientHeight + 2 && !cs.webkitLineClamp) {
      issues.push({ t: 'text-clipped-y', el: desc(e), scroll: e.scrollHeight, client: e.clientHeight });
    }
  }

  // narrow text blocks wrapping into many short lines (the refresh pill's old failure)
  for (const e of all) {
    if (e.children.length === 0 && e.textContent.trim().length > 12) {
      const r = rectOf(e), lh = parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.25;
      const lines = Math.round(r.height / lh);
      if (lines >= 3 && r.width < 90) issues.push({ t: 'narrow-text-column', el: desc(e), width: round(r.width), lines });
    }
  }

  // controls
  const interactive = all.filter(e => e.matches('button, a[href], [role=button], [role=tab], input:not([type=hidden]), select, textarea, summary'));
  for (const e of interactive) {
    const r = rectOf(e);
    if (Math.min(r.width, r.height) < 32) issues.push({ t: 'small-tap-target', el: desc(e), w: round(r.width), h: round(r.height) });
  }
  for (let i = 0; i < interactive.length; i++) {
    for (let j = i + 1; j < interactive.length; j++) {
      const a = interactive[i], b = interactive[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = rectOf(a), rb = rectOf(b);
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 4 && oy > 4) issues.push({ t: 'overlapping-controls', a: desc(a), b: desc(b), ox: round(ox), oy: round(oy) });
    }
  }

  // at the end of the page, does the last content clear the floating camera button and the tab bar?
  const fab = document.querySelector('.floating-hud-camera-fab');
  const bar = document.querySelector('.kx-tabbar, .floating-nav, nav');
  const obstacles = [['camera-button', fab], ['tab-bar', bar]].filter(([, el]) => el && visible(el));
  let atEnd = null;
  if (scroller && scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 2) {
    atEnd = [];
    for (const [name, o] of obstacles) {
      const orc = rectOf(o);
      for (const e of all) {
        if (e === o || o.contains(e) || e.contains(o) || e.children.length > 0 || !e.textContent.trim()) continue;
        const r = rectOf(e);
        const ox = Math.min(r.right, orc.right) - Math.max(r.left, orc.left), oy = Math.min(r.bottom, orc.bottom) - Math.max(r.top, orc.top);
        if (ox > 2 && oy > 2) atEnd.push({ t: 'text-under-' + name + '-at-page-end', el: desc(e) });
      }
    }
  }

  return JSON.stringify({ vw, vh, hash: location.hash, scroll: scroller ? { top: Math.round(scroller.scrollTop), height: scroller.scrollHeight, client: scroller.clientHeight } : null, nodes: all.length, issues: issues.concat(atEnd || []) });
})()
