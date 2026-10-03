(() => {
  const es = performance.getEntriesByType('resource').filter(e => /supabase|kinetixfit|vercel/.test(e.name)).sort((a, b) => a.startTime - b.startTime);
  const lab = e => /auth\/v1\/user/.test(e.name) ? 'getUser' : /grant_type=refresh/.test(e.name) ? 'token-refresh' : (/\/rest\/v1\/([a-z_]+)/.exec(e.name)?.[1] ?? e.name.replace(/^https?:\/\/[^/]+/, '').slice(0, 28));
  const rest = es.filter(e => /\/rest\/v1\//.test(e.name));
  const first = es[0];
  return JSON.stringify({
    probeInstalled: !!window.__kxProbe,
    pillNow: !!document.querySelector('.kx-refresh-pill'),
    visibility: document.visibilityState,
    events: (window.__kxLog || []).map(x => `${x.t} ${x.ev}${x.k ? ' ' + x.k : ''}`),
    requests: es.length,
    getUserCalls: es.filter(e => /auth\/v1\/user/.test(e.name)).length,
    firstReqAt: first ? Math.round(first.startTime) : null,
    lastRestEndAt: rest.length ? Math.round(Math.max(...rest.map(e => e.responseEnd))) : null,
    pullSpanMs: rest.length && first ? Math.round(Math.max(...rest.map(e => e.responseEnd)) - first.startTime) : null,
    nowAt: Math.round(performance.now()),
  });
})()
