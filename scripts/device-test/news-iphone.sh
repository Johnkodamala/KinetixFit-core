#!/bin/zsh
# Real news on the iPhone, with nothing changed on the account: take one drink out of THIS phone's storage (the account has
# it), send the app away for > 60 s and back. The pull finds a drink the account has and this phone lacks = news -> the pill.
# Safety: it refuses to run unless nothing on the phone is waiting to upload, so the removed drink is certainly on the account.
#   news-iphone.sh <label> [background seconds]
S="${0:A:h}"   # this folder (outputs land in inter/, inter-and/, sweep/: all git-ignored)
export WI_PORT=9224
U=00008110-001151D80291801E
L=${1:-news}; BG=${2:-66}
cd $S
echo "$L: dismiss pill: $(node wi2.mjs "(() => { const x = document.querySelector('.kx-refresh-x'); if (x) { x.click(); return 'dismissed'; } return 'none showing'; })()")"
sleep 1
echo "$L: probe: $(node wi2.mjs --file=$S/probe.js)"
REMOVED=$(node wi2.mjs "(() => {
  const outbox = JSON.parse(localStorage.getItem('kx_sync_outbox') || '[]');
  const dirty = JSON.parse(localStorage.getItem('kx_sync_dirtykeys_water_logs') || '[]');
  if (outbox.length || dirty.length) return 'REFUSED: something is waiting to upload (' + JSON.stringify({ outbox, dirty }) + ')';
  if (localStorage.getItem('kx_sync_backfilled_water_logs') !== '1') return 'REFUSED: water log not backfilled';
  const k = 'kinetix_water_log'; const log = JSON.parse(localStorage.getItem(k));
  const day = Object.keys(log).sort().pop();           // today (or the latest day with drinks)
  if (!log[day] || log[day].length < 2) return 'REFUSED: not enough drinks on ' + day;
  const gone = log[day].shift();                        // the oldest drink of that day
  localStorage.setItem(k, JSON.stringify(log));
  const ml = Array.isArray(gone) ? gone[1] : gone.ml;
  return 'removed one drink (' + ml + ' ml) from ' + day + '; total now ' + log[day].reduce((a, e) => a + (Array.isArray(e) ? e[1] : e.ml), 0) + ' ml';
})()")
echo "$L: $REMOVED"
case "$REMOVED" in REFUSED*) exit 1;; esac
xcrun devicectl device process launch --device $U com.apple.Preferences 2>&1 | tail -1
echo "$L: app in background for ${BG}s"
sleep $BG
xcrun devicectl device process launch --device $U com.jnglobalventures.kinetixfit 2>&1 | tail -1
sleep 16
node wi2.mjs --file=$S/read-probe.js > $S/round-$L.json 2>&1
echo "$L result:"; python3 -m json.tool $S/round-$L.json
echo "$L pill: $(node wi2.mjs --file=$S/measure-pill.js)"
node wi2.mjs "1" --shot=$S/iphone-round-$L.png
