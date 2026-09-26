#!/bin/zsh
# A real iOS tap on an element of the app's page:  scripts/ios-sim/tap-el.sh "<css selector>"
# Finds the element through wi.mjs (scrolls it into view), then taps its centre with ui.py — the WebView is full
# screen and edge to edge, so page pixels are iOS points. Use this (not .click()) to open the keyboard for real.
DIR="${0:A:h}"
xy=$(node "$DIR/wi.mjs" "(() => { const e = document.querySelector('$1'); if (!e) return 'none'; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return Math.round(r.left + r.width / 2) + ' ' + Math.round(r.top + r.height / 2) })()" | head -1 | tr -d '"')
[ "$xy" = "none" ] && { echo "no element $1"; exit 1; }
sleep 0.4; python3 "$DIR/ui.py" tapxy ${=xy}; echo "tapped $1 at $xy"
