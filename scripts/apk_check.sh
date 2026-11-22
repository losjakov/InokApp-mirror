#!/usr/bin/env bash
# apk_check.sh - A-83 / A-84 read-backs of the BUILT packages (build.yml; ref/FUTURE_play_quality.md §5). Prints one line per fact.
#   bash scripts/apk_check.sh <build-tools dir> <app-debug.apk> <app-qa.apk> <app-qa.aab> <qa mapping.txt>
# Fails (exit 1) on: the qa APK debuggable; Play Integrity's code / plugin / R8 path missing from the qa AAB (A-66, release_check.py);
# a by-name resource (res/raw/keep.xml) missing; a deprecated edge-to-edge call site in the qa DEX (scripts/dex_check.py);
# the debug-only push entry (PushTestReceiver) in qa or missing from debug; the qa WebView not inspectable.
# The R8 percentages come from Google's `android analyze` (the numbers Play shows); a tool that cannot run = «NOT CHECKED», never red.
set -uo pipefail
BT="$1"; DEBUG="$2"; QA="$3"; AAB="$4"; MAP="$5"
fail=0; bad() { echo "::error::$1"; echo "FAIL: $1"; fail=1; }
size() { stat -c %s "$1"; }
dexsize() { unzip -l "$1" | awk '$4 ~ /^classes[0-9]*\.dex$/ { s += $1 } END { print s + 0 }'; }

"$BT/aapt2" dump badging "$QA" > /tmp/qa_badging.txt
echo "qa: $(head -1 /tmp/qa_badging.txt)"
if grep -q "application-debuggable" /tmp/qa_badging.txt; then bad "app-qa.apk is debuggable (it must run R8's release code as Play will)"; fi

# resources looked up BY NAME survive shrinkResources (res/raw/keep.xml)
"$BT/aapt2" dump resources "$QA" > /tmp/qa_res.txt
for r in drawable/ic_stat_push drawable/splash mipmap/ic_launcher mipmap/ic_launcher_round; do
  grep -qE "resource 0x[0-9a-f]+ $r( |$)" /tmp/qa_res.txt && echo "keep.xml: $r present" || bad "resource $r missing from app-qa.apk (shrinkResources; res/raw/keep.xml)"
done
# cloud_30 (optimized resource shrinking, A-93): what the manifest / native code name must survive too - A-92 asset_statements (its JSON
# text read back), the notification channel words (InokNotifications), the launcher name
for r in string/asset_statements string/push_channel_articles string/push_channel_live string/app_name; do
  grep -qE "resource 0x[0-9a-f]+ $r( |$)" /tmp/qa_res.txt && echo "kept: $r" || bad "resource $r missing from app-qa.apk (optimized resource shrinking)"
done
grep -A3 'string/asset_statements' /tmp/qa_res.txt | grep -q 'common.handle_all_urls' && echo "A-92 asset_statements: handle_all_urls for https://inok.info" || bad "A-92 asset_statements text missing in app-qa.apk"
grep -A2 'bool/inok_webview_inspectable' /tmp/qa_res.txt | grep -q 'true' && echo "qa WebView inspectable: true (emulator DevTools)" || bad "qa: inok_webview_inspectable is not true"

# A-66 (cloud_29): Play Integrity in the qa AAB = the release's code (R8) - the SAME check as the tag's, on every push, so an R8 / library
# change is red here and not first at the tag (run 43148661649)
python3 -I "$(dirname "$0")/release_check.py" --integrity "$AAB" "$MAP" || bad "Play Integrity not proven in app-qa.aab (scripts/release_check.py --integrity)"

# the DEX search (deprecated edge-to-edge APIs; the debug-only push entry)
python3 -I "$(dirname "$0")/dex_check.py" "$BT/dexdump" "$QA" "$MAP" || bad "deprecated edge-to-edge call sites in app-qa.apk"
QA_DBG=$(python3 -I "$(dirname "$0")/dex_check.py" "$BT/dexdump" "$QA" "$MAP" | grep -o '«PushTestReceiver» in the DEX = [0-9]*' | grep -o '[0-9]*$')
DB_DBG=$(python3 -I "$(dirname "$0")/dex_check.py" "$BT/dexdump" "$DEBUG" | tee /tmp/debug_dex.txt | grep -o '«PushTestReceiver» in the DEX = [0-9]*' | grep -o '[0-9]*$')
echo "debug build: $(tail -1 /tmp/debug_dex.txt)"
QA_MAN=$("$BT/aapt2" dump xmltree --file AndroidManifest.xml "$QA" | grep -c PushTestReceiver || true)
DB_MAN=$("$BT/aapt2" dump xmltree --file AndroidManifest.xml "$DEBUG" | grep -c PushTestReceiver || true)
echo "debug-only push entry PushTestReceiver: debug dex=$DB_DBG manifest=$DB_MAN; qa dex=$QA_DBG manifest=$QA_MAN"
[ "${QA_DBG:-1}" = 0 ] && [ "$QA_MAN" = 0 ] || bad "the debug-only PushTestReceiver is in app-qa.apk"
[ "${DB_DBG:-0}" -gt 0 ] && [ "$DB_MAN" -gt 0 ] || bad "PushTestReceiver missing from app-debug.apk (the emulator's notification proof needs it)"
# 1.0.18 (A-168 (2)): the store frame's pin trigger is debug-only - never in qa (= the release build's code and manifest)
QA_PIN=$("$BT/aapt2" dump xmltree --file AndroidManifest.xml "$QA" | grep -c WidgetPinActivity || true)
DB_PIN=$("$BT/aapt2" dump xmltree --file AndroidManifest.xml "$DEBUG" | grep -c WidgetPinActivity || true)
echo "debug-only widget pin trigger WidgetPinActivity: debug manifest=$DB_PIN; qa manifest=$QA_PIN"
[ "$QA_PIN" = 0 ] || bad "the debug-only WidgetPinActivity is in app-qa.apk"
[ "${DB_PIN:-0}" -gt 0 ] || bad "WidgetPinActivity missing from app-debug.apk (the 02-widgets store frame needs it)"

# sizes: the unminified debug build (= 1.0.4's release code: minify was off) vs the R8 qa build
echo "sizes: app-debug.apk $(size "$DEBUG") b, DEX $(dexsize "$DEBUG") b uncompressed | app-qa.apk $(size "$QA") b, DEX $(dexsize "$QA") b | app-qa.aab $(size "$AAB") b; mapping.txt $(wc -l < "$MAP") lines"

# Google's numbers (android analyze = what Play's «DEX code optimization» shows; developer.android.com/tools/agents/android-cli)
A=/tmp/android-cli
if curl -fsSL -o "$A" https://dl.google.com/android/cli/latest/linux_x86_64/android && chmod +x "$A"; then
  for f in "$AAB" "$DEBUG"; do
    if timeout 600 "$A" --sdk="$ANDROID_HOME" analyze --analysis=optimization --format=json "$f" > /tmp/analyze.json 2>/tmp/analyze.err; then
      python3 -I "$(dirname "$0")/r8_stats.py" "$f" /tmp/analyze.json
      mkdir -p r8-analyze; cp /tmp/analyze.json "r8-analyze/analyze_$(basename "$f").json"
    else echo "android analyze $(basename "$f"): NOT CHECKED (the tool failed: $(head -c 300 /tmp/analyze.err | tr '\n' ' '))"; fi
  done
else echo "android analyze: NOT CHECKED (the Android CLI could not be downloaded)"; fi
exit $fail
