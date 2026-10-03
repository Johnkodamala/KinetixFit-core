#!/bin/zsh
# One foreground-return round on the physical iPhone: dismiss the pill, install the probe, send the app to the background
# (Settings in front) for > 60 s, bring it back, wait for the pull to finish, then read the probe.
#   round-iphone.sh <n> [background seconds]
S="${0:A:h}"   # this folder (outputs land in inter/, inter-and/, sweep/: all git-ignored)
export WI_PORT=9224
U=00008110-001151D80291801E
N=${1:-1}; BG=${2:-66}
cd $S
echo "round $N: dismiss pill: $(node wi2.mjs "(() => { const x = document.querySelector('.kx-refresh-x'); if (x) { x.click(); return 'dismissed'; } return 'none showing'; })()")"
sleep 1
echo "round $N: probe: $(node wi2.mjs --file=$S/probe.js)"
xcrun devicectl device process launch --device $U com.apple.Preferences 2>&1 | tail -1
echo "round $N: app in background for ${BG}s"
sleep $BG
xcrun devicectl device process launch --device $U com.jnglobalventures.kinetixfit 2>&1 | tail -1
sleep 16
node wi2.mjs --file=$S/read-probe.js > $S/round-$N.json 2>&1
echo "round $N result:"; python3 -m json.tool $S/round-$N.json
