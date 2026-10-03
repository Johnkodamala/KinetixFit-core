#!/bin/zsh
# The S21 FE's login screen under stress: system text size, a narrow screen and the keyboard. Restores everything at the end.
S="${0:A:h}"   # this folder (outputs land in inter/, inter-and/, sweep/: all git-ignored)
SER=RZCT815G2ND
A() { perl -e 'alarm 60; exec @ARGV' adb -s $SER "$@"; }
OUT=$S/sweep/s21-config; mkdir -p $OUT
cd $S
restore() { A shell settings put system font_scale 1.0; A shell wm density reset; A shell wm size reset; }
trap restore EXIT

forward() {   # the WebView socket changes when the app process restarts
  local pid; pid=$(A shell pidof com.jnglobalventures.kinetixfit | tr -d '\r')
  A forward tcp:9223 localabstract:webview_devtools_remote_$pid >/dev/null
}
facts() { node cdp.mjs 9223 "JSON.stringify({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, scrollW: document.documentElement.scrollWidth })"; }
lint()  { node cdp.mjs 9223 "$(cat lint.js)" | python3 -c "
import sys, json
r = json.load(sys.stdin)
kinds = {}
for i in r['issues']: kinds[i['t']] = kinds.get(i['t'], 0) + 1
print('   lint:', kinds or 'none')
for i in r['issues']:
    if i['t'] not in ('overlapping-controls',): print('     ', {k: v for k, v in i.items() if k != 't'}, i['t'])
"; }
tap_email() {
  local xy; xy=$(node cdp.mjs 9223 "(() => { const e = document.querySelector('input[type=email]'); if (!e) return 'none'; e.scrollIntoView({block:'center'}); const r = e.getBoundingClientRect(); return Math.round((r.left + r.width/2) * devicePixelRatio) + ' ' + Math.round((r.top + r.height/2) * devicePixelRatio); })()")
  [ "$xy" = "none" ] && { echo "   no email field"; return; }
  sleep 0.5; xy=$(node cdp.mjs 9223 "(() => { const e = document.querySelector('input[type=email]'); const r = e.getBoundingClientRect(); return Math.round((r.left + r.width/2) * devicePixelRatio) + ' ' + Math.round((r.top + r.height/2) * devicePixelRatio); })()")
  A shell input tap ${=xy}; sleep 1.5
}

run_case() {   # <label> <font_scale> <density|0>
  local label=$1 fs=$2 dens=$3
  echo "== $label (font_scale $fs, density ${dens/0/default})"
  A shell settings put system font_scale $fs
  if [ "$dens" = "0" ]; then A shell wm density reset; else A shell wm density $dens; fi
  sleep 3; forward
  # make sure we are on the login screen at the top
  node cdp.mjs 9223 "(document.querySelector('.app-scroll-body') || document.scrollingElement).scrollTo(0,0); document.activeElement && document.activeElement.blur && document.activeElement.blur(); 'ok'" >/dev/null
  sleep 0.8
  echo "   $(facts)"
  A exec-out screencap -p > $OUT/$label-top.png
  lint
  tap_email
  A exec-out screencap -p > $OUT/$label-keyboard.png
  echo "   after tapping the email field: $(node cdp.mjs 9223 "JSON.stringify({ viewport: innerWidth + 'x' + innerHeight, focused: document.activeElement.tagName + '[' + (document.activeElement.type||'') + ']', fieldTop: Math.round(document.querySelector('input[type=email]').getBoundingClientRect().top), fieldBottom: Math.round(document.querySelector('input[type=email]').getBoundingClientRect().bottom) })")"
  A shell input keyevent 4 >/dev/null; sleep 1   # BACK closes the keyboard
}

run_case default 1.0 0
run_case text-1.3x 1.3 0
run_case text-2x 2.0 0
run_case narrow 1.0 560
run_case narrow-text-1.3x 1.3 560
echo "== restored: font_scale $(A shell settings get system font_scale); $(A shell wm density | tr '\n' ' ')"
