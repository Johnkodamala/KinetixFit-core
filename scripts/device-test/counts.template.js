(() => {
  window.__counts = {};
  const k = Object.keys(localStorage).find(k => /^sb-.*auth-token$/.test(k));
  const tok = JSON.parse(localStorage.getItem(k)).access_token;
  const tables = ['profiles','preferences','saved_foods','food_log_entries','water_logs','workouts','gut_checks','morning_checkins','periods','vitals_history','points_ledger','streaks','quest_claims'];
  for (const t of tables) {
    fetch('<SUPABASE_URL>/rest/v1/' + t + '?select=*', { method: 'HEAD', headers: { apikey: '<ANON_KEY>', Authorization: 'Bearer ' + tok, Prefer: 'count=exact' } })
      .then(r => { window.__counts[t] = (r.headers.get('content-range') || '').split('/')[1] ?? ('status ' + r.status); })
      .catch(e => { window.__counts[t] = 'err'; });
  }
  return 'started';
})()
