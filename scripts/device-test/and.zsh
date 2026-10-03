# Helpers for driving the S21 FE with real taps. Source it:  source and.zsh
S="${0:A:h}"   # this folder (outputs land in inter/, inter-and/, sweep/: all git-ignored)
SER=RZCT815G2ND
mkdir -p $S/inter-and
A() { perl -e 'alarm 60; exec @ARGV' adb -s $SER "$@"; }
fwd() { local pid; pid=$(A shell pidof com.jnglobalventures.kinetixfit | tr -d '\r'); A forward tcp:9223 localabstract:webview_devtools_remote_$pid >/dev/null; }
jsa() { node $S/cdp.mjs 9223 "$1"; }
# real tap on the element a JS expression returns (CSS px -> device px)
atap() {
  local xy
  xy=$(node $S/cdp.mjs 9223 "(() => { const e = ($1); if (!e) return 'none'; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return Math.round((r.left + r.width / 2) * devicePixelRatio) + ' ' + Math.round((r.top + r.height / 2) * devicePixelRatio); })()")
  [ "$xy" = "none" ] && { echo "  (no element for: $1)"; return 1; }
  sleep 0.5
  xy=$(node $S/cdp.mjs 9223 "(() => { const e = ($1); const r = e.getBoundingClientRect(); return Math.round((r.left + r.width / 2) * devicePixelRatio) + ' ' + Math.round((r.top + r.height / 2) * devicePixelRatio); })()")
  A shell input tap ${=xy}; echo "  tapped $xy"; sleep 1
}
abtn() { atap "[...document.querySelectorAll('button')].find(b => b.offsetParent && b.textContent.trim().startsWith('$1'))"; }
ashot() { A exec-out screencap -p > "$S/inter-and/$1.png"; echo "  shot $1"; }
alint() {
  node $S/cdp.mjs 9223 "$(cat $S/lint.js)" | python3 -c "
import sys, json
r = json.load(sys.stdin); k = {}
for i in r['issues']:
    if i['t'] == 'overlapping-controls' and ('nav-item-btn' in i['a'] or 'nav-item-btn' in i['b']): continue
    k[i['t']] = k.get(i['t'], 0) + 1
    if i['t'] not in ('overlapping-controls', 'small-tap-target'): print('   ', {a: b for a, b in i.items() if a != 't'}, i['t'])
print('   lint:', k or 'clean', '| page', r['vw'], 'x', r['vh'])"
}
