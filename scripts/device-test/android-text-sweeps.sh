#!/bin/zsh
# All-screens sweeps on the S21 FE under system text sizes and a narrow screen. Restores the phone's settings at the end.
S="${0:A:h}"   # this folder (outputs land in inter/, inter-and/, sweep/: all git-ignored)
source $S/and.zsh
cd $S
restore() { A shell settings put system font_scale 1.0; A shell wm density reset; A shell wm size reset; }
trap restore EXIT

run_case() {   # <label> <font_scale> <density|0>
  local label=$1 fs=$2 dens=$3
  echo "=== $label (font_scale $fs, density ${dens/0/default})"
  A shell settings put system font_scale $fs
  if [ "$dens" = "0" ]; then A shell wm density reset; else A shell wm density $dens; fi
  sleep 4; fwd
  jsa "location.hash = '#vitals'; 'ok'" >/dev/null; sleep 1.5
  if [ "$(jsa "!!document.querySelector('.kx-confirm')")" = "true" ]; then atap "document.querySelector('.kx-confirm .modal-close-btn')" >/dev/null; fi
  jsa "JSON.stringify({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, sheet: !!document.querySelector('.kx-confirm') })"
  mkdir -p sweep/s21-$label
  node sweep.mjs android 9223 sweep/s21-$label --tag=s21-$label 2>&1 | tail -15
}

run_case text13 1.3 0
run_case text20 2.0 0
run_case narrow 1.0 560
run_case narrow13 1.3 560
echo "=== restored: font_scale $(A shell settings get system font_scale); $(A shell wm density | tr '\n' ' ')"
