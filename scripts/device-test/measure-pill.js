(() => {
  const pill = document.querySelector('.kx-refresh-pill');
  if (!pill) return 'no pill';
  const round = n => Math.round(n * 10) / 10;
  const box = e => { const b = e.getBoundingClientRect(); return { left: round(b.left), right: round(b.right), top: round(b.top), width: round(b.width), height: round(b.height) }; };
  const span = pill.querySelector('span'), go = pill.querySelector('.kx-refresh-go'), x = pill.querySelector('.kx-refresh-x');
  const cs = getComputedStyle(span); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.25;
  const p = box(pill);
  return JSON.stringify({ viewportW: innerWidth, pill: p, gapLeft: p.left, gapRight: round(innerWidth - p.right), textLines: round(span.getBoundingClientRect().height / lh), refresh: box(go), dismiss: box(x), messagePillShowing: !!document.querySelector('.alert-ticker') });
})()
