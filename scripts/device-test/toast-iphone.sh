#!/bin/zsh
# Does the refresh pill wait while a message pill is showing? News pill first (as in news-iphone.sh), then a message from the Get help form.
S="${0:A:h}"   # this folder (outputs land in inter/, inter-and/, sweep/: all git-ignored)
export WI_PORT=9224
cd $S
$S/news-iphone.sh toast 62 > $S/toast-news.log 2>&1
tail -4 $S/toast-news.log
echo "pill showing now: $(node wi2.mjs "!!document.querySelector('.kx-refresh-pill')")"
node wi2.mjs "location.hash = '#account/help'; 'ok'" >/dev/null; sleep 2
echo "$(node wi2.mjs --file=$S/toast-sampler.js)"
sleep 15
node wi2.mjs --file=$S/toast-summary.js | python3 -c "
import sys, json
r = json.load(sys.stdin)
print('samples', r['samples'], '| moments with both pills on screen:', r['bothAtOnce'])
print('\n'.join(r['timeline']))"
node wi2.mjs "1" --shot=$S/iphone-toast-after.png >/dev/null
