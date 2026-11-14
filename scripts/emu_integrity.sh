#!/bin/bash
# emu_integrity.sh - A-66 / cloud_29 item 3: a Play Integrity STANDARD token through OUR plugin on the R8 (qa) build. Called by
# emulator.yml instead of emulator_smoke.sh on a `google_apis_playstore` image ($1 = <api>-<target><tag>, the out dir's name):
# the Standard API lives in the Play Store app (PLAY_STORE_NOT_FOUND on google_apis / default); no account is needed; such an image
# has no `adb root` -> no app files here, only logcat + the qa WebView's DevTools socket (scripts/emu_nav.mjs eval).
# NEVER a write to inok.info: the plugin is called with a dummy requestHash, the token goes nowhere and is never printed (its length only).
# result.txt: «TOKEN len=<n> ...» | «NO TOKEN - Play answered <code> ...» (the R8 code reached Play: the image's limit, not ours)
#           | «FAIL ...» (exit 1: R8 broke a class / the plugin did not answer / no WebView).
set -uo pipefail
TAG="${1:?<api>-<target>[tag]}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/screens/emu-$TAG"; mkdir -p "$OUT"
APK="$ROOT/android/app/build/outputs/apk/qa/app-qa.apk"
PKG=info.inok.app
# the ONE source of the Cloud project number (A-66) is src/native/integrity.ts
CPN=$(grep -oE "CLOUD_PROJECT_NUMBER = '[0-9]+'" "$ROOT/src/native/integrity.ts" | grep -oE '[0-9]+')
fail() { echo "FAIL $*" | tee "$OUT/result.txt"; python3 -I "$ROOT/scripts/ci_infra.py" mark CODE - "integrity $TAG: $*" || true; exit 1; }
[ -n "$CPN" ] || fail "no CLOUD_PROJECT_NUMBER in src/native/integrity.ts"

adb wait-for-device
# the Play side as measured (no published minimum Play Store version for the Standard API - research, JOURNAL cloud_29)
for p in com.android.vending com.google.android.gms; do echo "$p $(adb shell dumpsys package $p | grep -m1 -oE 'versionName=[^ ]+' || echo 'absent')"; done | tee "$OUT/play.txt"
adb install -r "$APK" > /dev/null || fail "adb install app-qa.apk"
adb logcat -c
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 > /dev/null 2>&1
# the page is up when Capacitor's bridge is (≤ 90 s: the first launch imports the export); emu_nav eval exits 1 on 'none'
READY="(window.Capacitor && typeof window.Capacitor.nativePromise === 'function') ? 'ok' : 'none'"
up=0; for _ in $(seq 1 9); do node "$ROOT/scripts/emu_nav.mjs" eval "$READY" >> "$OUT/nav.txt" 2>&1 && { up=1; break; }; sleep 10; done
[ "$up" = 1 ] || fail "no debuggable qa WebView page with the Capacitor bridge (nav.txt)"
adb exec-out screencap -p > "$OUT/integrity_home.png" || true

# the native plugin exactly as src/native/integrity.ts calls it (registerPlugin -> nativePromise), with a 60 s cap of our own
JS="Promise.race([window.Capacitor.nativePromise('PlayIntegrity', 'token', { requestHash: 'inok-ci-probe-' + Date.now(), cloudProjectNumber: '$CPN' })
  .then((r) => 'TOKEN len=' + String((r && r.token) || '').length, (e) => 'ERROR ' + String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 240)),
  new Promise((ok) => setTimeout(() => ok('TIMEOUT 60 s'), 60000))])"
R=''
for i in 1 2 3; do  # -3 / -12 / -18 / -100 are transient on Google's side: back off and ask again (the plugin prepares again itself)
  R=$(node "$ROOT/scripts/emu_nav.mjs" eval "$JS" 2>&1 | tail -1 | sed 's/^eval: //')
  echo "attempt $i: $R" >> "$OUT/integrity.txt"
  case "$R" in TOKEN*) break ;; esac
  code=$(echo "$R" | grep -oE '\((-?[0-9]+)\)' | head -1 | tr -d '()')
  case "$code" in -3|-12|-18|-100) sleep $((i * 15)) ;; *) break ;; esac
done
adb logcat -d > "$OUT/logcat_full.txt" 2>/dev/null || true
grep -aE "InokIntegrity" "$OUT/logcat_full.txt" > "$OUT/integrity_log.txt" || true
# R8: a lookup R8 broke shows as one of these naming the library or our plugin
grep -aE "ClassNotFoundException|NoSuchMethodError|NoSuchFieldError|NoClassDefFoundError|AbstractMethodError|VerifyError" "$OUT/logcat_full.txt" \
  | grep -aE "play\.core|play\.integrity|info\.inok|IntegrityPlugin" > "$OUT/r8.txt" || true
rm -f "$OUT/logcat_full.txt"
cat "$OUT/integrity.txt" "$OUT/integrity_log.txt"
[ -s "$OUT/r8.txt" ] && fail "R8 broke the Integrity path: $(head -c 300 "$OUT/r8.txt")"
PLAY="$(tr '\n' ' ' < "$OUT/play.txt")"
case "$R" in
  TOKEN\ len=*) n=${R#TOKEN len=}; [ "${n:-0}" -ge 20 ] || fail "a token of $n characters"; echo "TOKEN len=$n (qa R8 build, our plugin; $PLAY)" | tee "$OUT/result.txt" ;;
  ERROR*\(-*\)*) echo "NO TOKEN - Play answered $(echo "$R" | grep -oE '\(-?[0-9]+\)' | head -1) (the R8 library reached Play; $PLAY): ${R#ERROR }" | tee "$OUT/result.txt" ;;
  *) fail "the plugin gave no Integrity answer: $R" ;;
esac
