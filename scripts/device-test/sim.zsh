# Helpers for driving the iPhone 13 mini simulator with real taps. Source it:  source sim.zsh
S="${0:A:h}"   # this folder (outputs land in inter/, inter-and/, sweep/: all git-ignored)
REPO="${S:h:h}"   # the repo root (scripts/device-test/ is two levels down)
SIMU=A3EAB515-2191-4713-867C-96A34E0B468A   # the "iPhone 13 mini" simulator on this Mac: `xcrun simctl list devices` for yours
export WI_PORT=9222 SIM_NAME="iPhone 13 mini"
mkdir -p $S/inter

# evaluate JS in the simulator's page (synchronous expression; prints the value)
jse() { node $S/wi2.mjs "$1"; }

# real tap on the element a JS expression returns, e.g.  tapjs "document.querySelector('.kx-hs-remove')"
tapjs() {
  local xy
  xy=$(node $S/wi2.mjs "(() => { const e = ($1); if (!e) return 'none'; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return Math.round(r.left + r.width / 2) + ' ' + Math.round(r.top + r.height / 2); })()")
  [ "$xy" = "none" ] && { echo "  (no element for: $1)"; return 1; }
  sleep 0.5; python3 "$REPO/scripts/ios-sim/ui.py" tapxy ${=xy}; echo "  tapped $xy"; sleep 1
}

# tap the first visible button whose text starts with a string
tapbtn() { tapjs "[...document.querySelectorAll('button')].find(b => b.offsetParent && b.textContent.trim().startsWith('$1'))"; }

# screenshot to inter/<name>.png
shot() { xcrun simctl io $SIMU screenshot "$S/inter/$1.png" >/dev/null 2>&1; echo "  shot $1"; }

# layout lint of what is on screen now (without the tab-bar-overlap noise)
lintnow() {
  node $S/wi2.mjs --file=$S/lint.js | python3 -c "
import sys, json
r = json.load(sys.stdin); k = {}
for i in r['issues']:
    if i['t'] == 'overlapping-controls' and ('nav-item-btn' in i['a'] or 'nav-item-btn' in i['b']): continue
    k[i['t']] = k.get(i['t'], 0) + 1
    if i['t'] not in ('overlapping-controls', 'small-tap-target'): print('   ', {a: b for a, b in i.items() if a != 't'}, i['t'])
print('   lint:', k or 'clean', '| page', r['vw'], 'x', r['vh'])"
}
