(() => {
  const s = window.__samples || [];
  // collapse the samples into the sequence of states and when each started
  const out = []; let last = null;
  for (const x of s) {
    const state = `${x.pill ? 'REFRESH-PILL' : '-'} | ${x.ticker ? 'MESSAGE-PILL "' + x.tickerText + '"' : '-'}`;
    if (state !== last) { out.push(`${String(x.t).padStart(6)} ms  ${state}`); last = state; }
  }
  const bothAtOnce = s.filter(x => x.pill && x.ticker).length;
  return JSON.stringify({ samples: s.length, bothAtOnce, timeline: out });
})()
