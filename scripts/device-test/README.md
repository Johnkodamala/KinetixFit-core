# Device test scripts

Used in the 3 Oct 2026 test pass to drive the real phones and the iOS simulator from the Mac: read and tap the app's screen,
walk every screen and lint the layout, watch every network call, count the account's rows. **Nothing here is needed to build
or run the app.** The unverified tests that still need them are listed in `CLAUDE.md` (status block at the top).

Everything is set up for this Mac: the S21 FE's serial (`RZCT815G2ND`), the iPhone 13 mini's hardware id and the simulator's id
are at the top of the scripts, and `S` is the folder the script sits in (it writes `inter/`, `inter-and/` and `sweep/` next to
itself; those, `*.png`, `*.log` and `.testacct` are git-ignored). **Never put an account's login in this folder** (put it in a
git-ignored `.testacct` that you `source`, or type it).

## Drive an app page from the Mac
- `cdp.mjs` Android: `node cdp.mjs <port> "<js>"` after `adb forward tcp:<port> localabstract:webview_devtools_remote_<pid>` (promises are awaited).
- `wi2.mjs` iOS (device or simulator, through `ios_webkit_debug_proxy`): `WI_PORT=<port> node wi2.mjs "<js>" [--shot=f.png] [--file=f.js]`.
  The inspector ignores `awaitPromise`: set `window.__x` in a `.then` and read it later.
  Real iPhone (needs the **USB cable** and Settings > Safari > Advanced > Web Inspector ON): `ios_webkit_debug_proxy -u <hardware-udid>:9224 -F`.
  Simulator: `ios_webkit_debug_proxy -s unix:<webinspectord_sim socket> -F` (port 9222; `scripts/ios-sim/sim.sh proxy` does it).

## Real taps
- `and.zsh` (source it) S21 FE: `A` (adb with a timeout), `fwd`, `jsa`, `atap "<js element>"`, `abtn "<button text>"`, `ashot <name>`, `alint`.
  Taps are `adb input tap` at CSS px x devicePixelRatio.
- `sim.zsh` (source it) simulator: `jse`, `tapjs`, `tapbtn`, `shot`, `lintnow` (idb through `scripts/ios-sim/ui.py`).

## Walk every screen and lint the layout (no taps, nothing is written)
- `sweep.mjs <android|ios> <port> <outDir> [--theme=light] [--simshot=<sim udid>] [--tag=x]`, `lint.js` (the in-page check it runs: overflow,
  clipped text, tiny targets, overlaps, text under the tab bar at the end of a page), `summarize.py <dir under sweep/>`,
  `sheet.py` (contact sheets, needs Pillow: `python3 -m venv venv && venv/bin/pip install pillow`).
- `android-config-sweep.sh` (login screen) and `android-text-sweeps.sh` (all screens at 1.3x, 2x and a narrow screen) change the S21 FE's
  font scale / density and **restore them on exit**.

## The network and the account
- `netwatch2.mjs <port> <seconds>` a timeline of every request the Android WebView makes, failed ones included (`Network.enable`).
- `counts.template.js` row counts of the 13 account tables through a signed-in page's own session (fill in the URL and the anon key).

## Sync / refresh pill experiments on the iPhone (use `devicectl` to background and foreground the app)
`probe.js`, `read-probe.js`, `round-iphone.sh`, `round-iphone-inject.sh`, `news-iphone.sh`, `toast-iphone.sh`, `toast-*.js`, `measure-pill.js`.
Cross-engine check of the flex-scroller padding quirk: `padquirk.js`.

## Seeding a phone or simulator with data but NO account session (so nothing syncs)
Copy the iPhone's `localstorage.sqlite3` (+ `-wal`), `VACUUM INTO` a new file, delete rows where key like `sb-%`, and write it into the
simulator's WebKit LocalStorage folder; on Android `localStorage.setItem` every key over CDP. Back the phone up first
(`xcrun devicectl device copy from ... --domain-type appDataContainer`, see the CLAUDE.md note on how the iPhone's data was inspected) and restore it afterwards.

## Tricks that cost time once
- Android: a photo for the scan goes in with `adb push x.jpg /sdcard/Pictures/` + a MediaStore scan broadcast; **Choose from gallery**, find the thumbnail
  with `uiautomator dump` (the picker sorts by `date_modified`, newest first), tap it, then **Done**. Delete the file afterwards.
- Samsung's first tap on **Log in** right after `input text` + Back often does not register: tap it again.
- `adb shell cmd connectivity airplane-mode enable|disable` works; do not put the restore in a `trap ... EXIT` of one command.
- `timeout` does not exist on macOS: `perl -e 'alarm N; exec @ARGV' cmd ...`.
