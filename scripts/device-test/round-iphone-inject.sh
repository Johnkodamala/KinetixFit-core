#!/bin/zsh
# Controlled round: the app returns from the background, and ~2 s later today's step total is bumped by 1 through a plain
# localStorage write, which is exactly what the app's own Apple Health read does (recordDailyVitalTotal). Nothing changes on the
# account. If the pill shows, the app counted its own write as "news from your account".
#   round-iphone-inject.sh <label> [background seconds]
S="${0:A:h}"   # this folder (outputs land in inter/, inter-and/, sweep/: all git-ignored)
export WI_PORT=9224
U=00008110-001151D80291801E
L=${1:-inject}; BG=${2:-66}
cd $S
echo "$L: dismiss pill: $(node wi2.mjs "(() => { const x = document.querySelector('.kx-refresh-x'); if (x) { x.click(); return 'dismissed'; } return 'none showing'; })()")"
sleep 1
echo "$L: probe: $(node wi2.mjs --file=$S/probe.js)"
xcrun devicectl device process launch --device $U com.apple.Preferences 2>&1 | tail -1
echo "$L: app in background for ${BG}s"
sleep $BG
xcrun devicectl device process launch --device $U com.jnglobalventures.kinetixfit 2>&1 | tail -1
sleep 1
echo "$L: $(node wi2.mjs "(() => { const k='kx_vitals_history'; const o = JSON.parse(localStorage.getItem(k)); const id = Object.keys(o).filter(x => x.startsWith('steps:')).sort().pop(); o[id].value += 1; localStorage.setItem(k, JSON.stringify(o)); const dk = 'kx_sync_dirtykeys_vitals_history'; const keys = new Set(JSON.parse(localStorage.getItem(dk) || '[]')); keys.add(id); localStorage.setItem(dk, JSON.stringify([...keys])); const ob = 'kx_sync_outbox'; const dirty = new Set(JSON.parse(localStorage.getItem(ob) || '[]')); dirty.add('vitals_history'); localStorage.setItem(ob, JSON.stringify([...dirty])); return 'bumped ' + id + ' and marked it unsent, as the Health read does, at ' + Math.round(performance.now()); })()")"
sleep 15
node wi2.mjs --file=$S/read-probe.js > $S/round-$L.json 2>&1
echo "$L result:"; python3 -m json.tool $S/round-$L.json
echo "$L pill geometry: $(node wi2.mjs "(() => { const p = document.querySelector('.kx-refresh-pill'); if (!p) return 'no pill'; const b = p.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height) + ' at top ' + Math.round(b.top); })()")"
node wi2.mjs "1" --shot=$S/iphone-round-$L.png
