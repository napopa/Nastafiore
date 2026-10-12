#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export CASTAFIORE_SIGNING_PROPERTIES="${CASTAFIORE_SIGNING_PROPERTIES:-$HOME/.local/share/castafiore-signing/signing.properties}"
test -f "$CASTAFIORE_SIGNING_PROPERTIES" || { echo 'Create signing material with python scripts/create-signing.py first' >&2; exit 1; }
export ANDROID_HOME="${ANDROID_HOME:-$HOME/.local/share/castafiore-build/android-sdk}"
test -d "$ANDROID_HOME/platforms/android-35" || { echo 'Install Android SDK 35 and build tools first' >&2; exit 1; }
npx expo prebuild --platform android --no-install
cd android
./gradlew "${1:-assembleRelease}" --no-daemon --max-workers="${CASTAFIORE_BUILD_WORKERS:-4}"
