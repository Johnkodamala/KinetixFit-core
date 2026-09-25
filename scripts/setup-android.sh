#!/usr/bin/env bash
# Installs everything listed in requirements.txt and builds a debug APK. Safe to re-run.
set -euo pipefail

cd "$(dirname "$0")/.."

brew list node >/dev/null 2>&1 || brew install node
brew list openjdk@21 >/dev/null 2>&1 || brew install openjdk@21
brew list --cask android-commandlinetools >/dev/null 2>&1 || brew install --cask android-commandlinetools
if [[ "${SKIP_STUDIO:-0}" != 1 ]]; then
  brew list --cask android-studio >/dev/null 2>&1 || brew install --cask android-studio
fi

export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
mkdir -p "$ANDROID_HOME"

yes | sdkmanager --sdk_root="$ANDROID_HOME" --licenses >/dev/null || true
sdkmanager --sdk_root="$ANDROID_HOME" \
  "platform-tools" "platforms;android-36" "build-tools;36.0.0" "cmdline-tools;latest" "emulator"

echo "sdk.dir=$ANDROID_HOME" > android/local.properties
chmod +x android/gradlew

npm install
npm run build
npx cap sync android
(cd android && ./gradlew assembleDebug)

echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"
