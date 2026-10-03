(() => {
  // A flex scroller with bottom padding. Does the engine count the end padding in the scrollable height?
  const build = (display, childH, extra = '') => {
    const s = document.createElement('div');
    s.style.cssText = `position:fixed; left:0; top:0; width:200px; height:400px; overflow-y:auto; box-sizing:border-box; padding:50px 0 150px; display:${display}; flex-direction:column; gap:16px; visibility:hidden; ${extra}`;
    const c = document.createElement('div');
    c.style.cssText = `height:${childH}px; flex:none; background:red;`;
    s.appendChild(c);
    document.body.appendChild(s);
    const r = { childH, clientH: s.clientHeight, scrollH: s.scrollHeight, expectedIfPaddingCounted: 50 + childH + 150 };
    s.remove();
    return r;
  };
  const out = {};
  // padTop 50 + child + padBottom 150 vs the 400 px box: the interesting child heights are those that end inside the bottom padding zone
  for (const h of [150, 200, 250, 300, 350, 400, 500]) out['flex child ' + h] = build('flex', h);
  out['block child 300'] = build('block', 300);
  // the proposed fix: an in-flow spacer instead of padding
  const s = document.createElement('div');
  s.style.cssText = 'position:fixed; left:0; top:0; width:200px; height:400px; overflow-y:auto; box-sizing:border-box; padding:50px 0 0; display:flex; flex-direction:column; gap:16px; visibility:hidden;';
  const st = document.createElement('style'); st.textContent = '#fixbox::after{content:"";flex:none;height:134px}';
  document.head.appendChild(st); s.id = 'fixbox';
  const c = document.createElement('div'); c.style.cssText = 'height:300px;flex:none'; s.appendChild(c);
  document.body.appendChild(s);
  out['spacer fix, child 300 (needs 50+300+16+134 = 500)'] = { clientH: s.clientHeight, scrollH: s.scrollHeight };
  s.remove(); st.remove();
  return JSON.stringify(out);
})()
