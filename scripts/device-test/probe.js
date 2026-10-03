(() => {
  if (window.__kxProbe) { window.__kxLog.length = 0; performance.clearResourceTimings(); return 'reset'; }
  const log = window.__kxLog = [];
  const stamp = () => Math.round(performance.now());
  const P = Storage.prototype, set = P.setItem, rem = P.removeItem;
  P.setItem = function (k, v) {
    let changed = true;
    try { changed = this.getItem(k) !== String(v); } catch (e) { /* ignore */ }
    if (changed && !/^sb-/.test(k)) log.push({ t: stamp(), ev: 'set', k });
    return set.apply(this, arguments);
  };
  P.removeItem = function (k) { log.push({ t: stamp(), ev: 'remove', k }); return rem.apply(this, arguments); };
  new MutationObserver(() => {
    const p = document.querySelector('.kx-refresh-pill');
    if (p && !p.__seen) { p.__seen = 1; log.push({ t: stamp(), ev: 'PILL-SHOWN' }); }
  }).observe(document.body, { childList: true, subtree: true });
  window.__kxProbe = true;
  performance.clearResourceTimings();
  return 'installed';
})()
