#!/bin/zsh
# Build, install and drive the iOS app on a simulator.
#   scripts/ios-sim/sim.sh build            npm build + cap sync ios + xcodebuild (Debug, simulator) + install
#   scripts/ios-sim/sim.sh launch           (re)launch the app, then (re)start the web-inspector proxy
#   scripts/ios-sim/sim.sh shot <file.png>  screenshot of the simulator
#   scripts/ios-sim/sim.sh proxy            (re)start ios_webkit_debug_proxy (needed after every relaunch)
# SIM_NAME picks the simulator (default "iPhone 17"). Needs Xcode; proxy needs `brew install ios-webkit-debug-proxy`.
set -e
ROOT="${0:A:h:h:h}"
SIM_NAME="${SIM_NAME:-iPhone 17}"
UDID=$(xcrun simctl list devices available | grep -m1 "    $SIM_NAME (" | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')
[ -z "$UDID" ] && { echo "no simulator named $SIM_NAME"; exit 1; }
APP_ID=com.jnglobalventures.kinetixfit
proxy() {
  pkill -f ios_webkit_debug_proxy 2>/dev/null || true
  local sock=$(lsof -aUc launchd_sim 2>/dev/null | awk '/com.apple.webinspectord_sim.socket/{print $NF}' | head -1)
  (ios_webkit_debug_proxy -s unix:$sock -F >/dev/null 2>&1 &) ; sleep 3
}
case "$1" in
  build)
    cd "$ROOT" && npm run build && npx cap sync ios
    cd ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
      -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath build build | grep -E "error:|BUILD (SUCCEEDED|FAILED)"
    xcrun simctl boot "$UDID" 2>/dev/null || true; xcrun simctl bootstatus "$UDID" -b >/dev/null
    xcrun simctl install "$UDID" build/Build/Products/Debug-iphonesimulator/App.app && echo "installed on $SIM_NAME" ;;
  launch) xcrun simctl launch --terminate-running-process "$UDID" $APP_ID >/dev/null; sleep 5; proxy; echo launched ;;
  shot) xcrun simctl io "$UDID" screenshot "${2:-shot.png}" >/dev/null && echo "${2:-shot.png}" ;;
  proxy) proxy; curl -s localhost:9222/json | grep -m1 '"url"' ;;
  *) sed -n '2,8p' "$0" ;;
esac
