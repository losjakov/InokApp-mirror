#!/bin/bash
# Ring-2 smoke on the Actions emulator (called by .github/workflows/emulator.yml: $1 = API level).
# Always writes screens/emu-<api>/{webview.txt,logcat_filtered.txt,home.png,result.txt}; then either
#   FULL     — WebView ≥ 89 (Ionic 9 minimum): the app imported the live export; db_meta.txt = meta.fts + count;
#   WEBVIEW  — the image's WebView is older than 89: the app must show error.html (not a white screen) — this proves
#              minSdk 26 install/launch and the honest message; the web layer cannot run on such an emulator image.
# Exit code ≠ 0 = a real failure of the chosen path.
set -euo pipefail
API="${1:?api level[-target]}"   # e.g. 34 or 34-google_apis (the out dir is named by it)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/screens/emu-$API"; mkdir -p "$OUT"
# cloud_27 (A-83): the smoke runs the QA build = R8 as release (minified, debug key, not debuggable); the debug APK only for the
# notification proof (its debug-only PushTestReceiver, scripts/emu_notify.sh)
APK="$ROOT/android/app/build/outputs/apk/qa/app-qa.apk"
DEBUG_APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
PKG=info.inok.app
DB=databases/inokSQLite.db
WV=0

# A-87 (1c): the job's verdict mark (scripts/ci_infra.py; the first mark wins). A FAIL is CODE - unless the app never got its database
# AND the runner cannot reach the live export either: then the site is down (INFRA, re-run), not our import.
SITE_MANIFEST="https://inok.info/api/app/v1/export/manifest.json"   # the contract's §1 address (src/data/api/client.ts API_BASE)
verdict_mark() {
  local rc=$1 res; res="$(head -c 120 "$OUT/result.txt" 2>/dev/null || true)"
  [ "$rc" -ne 0 ] || [ "${res#FAIL}" != "$res" ] || return 0
  # cloud_32 (REVIEW cloud_31 answer 3): the device itself gone (adb «error: device offline») = the emulator died, INFRA - not the app
  timeout 20 adb get-state > "$OUT/adb_state.txt" 2>&1 || true
  local dev; dev="$(python3 -I "$ROOT/scripts/ci_infra.py" classify emu "$OUT/adb_state.txt" 1)"
  if [ "${dev#INFRA }" != "$dev" ]; then
    python3 -I "$ROOT/scripts/ci_infra.py" mark INFRA "${dev#INFRA }" "emulator smoke $API: the device" || true
  elif [ "$(head -c 15 "$OUT/inok.db" 2>/dev/null)" != "SQLite format 3" ] && [ "$WV" -ge "${FLOOR:-999}" ] &&
     ! curl -sS --max-time 20 --retry 2 -o /dev/null "$SITE_MANIFEST" 2>/dev/null; then
    python3 -I "$ROOT/scripts/ci_infra.py" mark INFRA "inok.info (the live export)" "emulator smoke $API: live import" || true
  else
    python3 -I "$ROOT/scripts/ci_infra.py" mark CODE - "emulator smoke $API: ${res:-stopped before its verdict (exit $rc)}" || true
  fi
}
finish() {
  local rc=$?
  verdict_mark "$rc"
  [ -n "${LOGCAT_PID:-}" ] && { kill "$LOGCAT_PID" 2>/dev/null; pkill -P "$LOGCAT_PID" 2>/dev/null; logsync; } || true
  # D22: the HEAD of the run (first launch → import → first home), not only the tail; the app's own phase lines
  if [ -s "$OUT/logcat_full.txt" ]; then
    head -n 1500 "$OUT/logcat_full.txt" > "$OUT/logcat_head.txt"
    grep -E "InokBoot|InokPush|InokBridge|InokInsets|AndroidRuntime|FATAL" "$OUT/logcat_full.txt" > "$OUT/logcat_boot.txt" || true
    rm -f "$OUT/logcat_full.txt"; echo "--- boot lines (D22) ---"; head -n 120 "$OUT/logcat_boot.txt" || true
  fi
  adb logcat -d 2>/dev/null | grep -iE "fts5|sqlite|capacitor|chromium|console|AndroidRuntime|FATAL" | tail -n 400 > "$OUT/logcat_filtered.txt" || true
  rm -f "$OUT/inok.db"
}
trap finish EXIT

( cd "$ROOT/android" && ./gradlew --no-daemon -q assembleQa assembleDebug )
ls -l "$APK"
adb wait-for-device
# the qa APK is not debuggable: `run-as` is refused -> adbd as root (google_apis / default images allow it), the app's files by path
adb root > /dev/null 2>&1 || true; sleep 2; adb wait-for-device
# cloud_28 (emulator 43077824891, API 35): `adb exec-out screencap` can deliver a TRUNCATED PNG (png_ink: «incomplete or truncated
# stream»), which stopped the smoke before its verdict - a shot is taken again (3 tries) until the file is a whole PNG
shot() { local _; for _ in 1 2 3; do adb exec-out screencap -p > "$1"; python3 -I "$ROOT/scripts/png_ink.py" "$1" > /dev/null 2>&1 && return 0; sleep 1; done; return 0; }
appls() { adb shell ls "/data/data/$PKG/$1" 2>/dev/null; }
# cloud_36 (REVIEW cloud_34 NOTE 1, cloud_33 / 34 / 35): API 35 printed «adb: device offline» WHILE copying the database - the copy itself
# is retried (adb reconnects the transport, waits for the device), up to 3 tries; an empty / failed copy is never taken for the file
appcopy() {
  local i
  for i in 1 2 3; do
    if timeout 90 adb exec-out cat "/data/data/$PKG/$1" > "$2" 2> "$2.err" && [ -s "$2" ] && ! grep -qi 'offline\|not found' "$2.err"; then rm -f "$2.err"; return 0; fi
    echo "appcopy $1 try $i: $(head -c 160 "$2.err" 2>/dev/null)" >> "$OUT/adb_retries.txt"
    adb reconnect offline >/dev/null 2>&1 || true; timeout 60 adb wait-for-device || true; sleep 2
  done
  rm -f "$2.err"; return 1
}
# cloud_36 (REVIEW cloud_35 NOTE 2 / E2): `ev` answers «eval: <value>» - the v110 verdict reads the VALUE (1.0.10 compared the whole line with
# «wifi» and printed «not-proved» over correct numbers)
# NOTE 7 (REVIEW cloud_36): ONE line per eval - emu_nav prints «eval: none» AND exits 1 on «none»; 1.0.11 then echoed a second «none»
# (v110 read «none\nnone»). Nothing printed (node failed before its answer) = «none».
ev() { local o; o=$(node "$ROOT/scripts/emu_nav.mjs" eval "$1" 2>>"$OUT/nav.txt") || true; printf '%s\n' "${o:-none}" | head -n 1; }
v110_verdict() { case "${1#eval: }" in wifi|saver|manual) echo proved;; *) echo "not-proved(reason=${1#eval: }: the full file was allowed on this network)";; esac; }
adb shell dumpsys webviewupdate | tee "$OUT/webview.txt" | head -n 5
# line looks like: Current WebView package (name, version): (com.google.android.webview, 58.0.3029.125)
WV=$(grep 'Current WebView package' "$OUT/webview.txt" | grep -oE ', [0-9]+\.' | head -1 | grep -oE '[0-9]+' || true)
WV=${WV:-0}
echo "webview_major=$WV" | tee -a "$OUT/webview.txt"
# A-46: THE engine floor (package.json browserslist «chrome >= N») - the same number as minWebViewVersion
FLOOR=$(node -p "require('$ROOT/package.json').browserslist.join(' ').match(/chrome\\s*>=\\s*(\\d+)/i)[1]")
echo "engine_floor=$FLOOR" | tee -a "$OUT/webview.txt"
adb install -r "$APK"
adb logcat -c || true
# D22: from the very first line of the launch. cloud_29 (emulator 43151732899 + 43154087270, API 35): the STREAMING `adb logcat` stalled
# ~6 s into the launch - alive, writing nothing more (no exit, so a restart loop never fired) - while `adb logcat -d` held every line
# («InokPush: subscribed test»), and A-36 counted 0 screens twice. Now the file is a SNAPSHOT of the device's ring (one 64 MB ring for the
# whole smoke, cleared above), refreshed every 2 s and on demand (`logsync`) before a decisive count.
adb logcat -G 64M > /dev/null 2>&1 || true; adb logcat -g > "$OUT/logcat_ring.txt" 2>&1 || true   # the ring sizes, as set
# cloud_41 (NOTE 4 of REVIEW cloud_40): the 2-s loop and the foreground both call this - ONE tmp file per writer ($BASHPID), and a lost
# `mv` never ends the smoke under `set -e` (it was the last command of an && list: emulator 44046052975, API 35, after a green walk).
logsync() { local t="$OUT/logcat_full.$BASHPID.tmp"; { adb logcat -d -v threadtime > "$t" 2>/dev/null && mv -f "$t" "$OUT/logcat_full.txt"; } || rm -f "$t"; return 0; }
( while :; do logsync; sleep 2; done ) &
LOGCAT_PID=$!
# stage 3: notifications allowed up front (Android 13+ runtime permission) so the app registers its FCM token at boot
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS 2>/dev/null || true
# A-36: Firebase Analytics debug logging (FA / FA-SVC «Logging event») — the proof of what leaves the device
adb shell setprop debug.firebase.analytics.app $PKG || true
adb shell setprop log.tag.FA VERBOSE || true; adb shell setprop log.tag.FA-SVC VERBOSE || true
adb shell am start -n $PKG/.MainActivity

# cloud_27 (A-83): what only the MINIFIED build can break - a class / member R8 removed or renamed that is still looked up by name
r8_scan() {
  logsync; grep -aE "ClassNotFoundException|NoSuchMethodError|NoSuchFieldError|NoClassDefFoundError|AbstractMethodError" "$OUT/logcat_full.txt" > "$OUT/r8.txt" 2>/dev/null || true
  local ours; ours=$(grep -aE "info\.inok|getcapacitor|capacitorjs|capawesome|zetetic|AndroidRuntime" "$OUT/r8.txt" | head -3 | tr '\n' ' ' || true)
  R8="lines=$(wc -l < "$OUT/r8.txt" | tr -d ' ') ours=$( [ -z "$ours" ] && echo 0 || echo "$ours")"
  echo "R8 scan: $R8" | tee -a "$OUT/r8.txt"
  [ -z "$ours" ] || { echo "::error::API $API: R8 broke a lookup in the qa build: $ours"; echo "FAIL r8 $ours" > "$OUT/result.txt"; exit 1; }
}
# ref/FUTURE_play_quality.md §3.6: native paths the smoke above does not already walk - the share sheet and the in-app browser tab
# (A-85 «Додайте свій канал»); each = the activity in front read back, then Back
front() { adb shell dumpsys activity activities 2>/dev/null | grep -E "topResumedActivity|mResumedActivity" | head -1; }
native_paths() {
  adb shell am start -n $PKG/.MainActivity > /dev/null; sleep 8   # the smoke above ended with the app folded (Back on Home)
  tab streams; nav click '[data-testid="share-footer"] ion-button'; sleep 4; local f; f=$(front)
  local share=fail; echo "$f" | grep -qiE "chooser|resolver|intentresolver" && share=ok; shot "$OUT/native_share.png"; adb shell input keyevent 4; sleep 2
  tab streams; nav click '[data-testid="channel-add"]'; sleep 8; f=$(front)
  local browser=fail; echo "$f" | grep -qiE "chrome|customtab|browser" && browser=ok; shot "$OUT/native_channel_tab.png"; adb shell input keyevent 4; sleep 3
  NATIVE="share=$share browser_tab=$browser"; echo "native paths: $NATIVE (front: $f)" | tee "$OUT/native.txt"
  [ "$share" = ok ] && [ "$browser" = ok ] || echo "::warning::API $API: a native path did not show its activity ($NATIVE)"
}
# cloud_41 (A-133 C1): the four app shortcuts - the launcher's list (`dumpsys shortcut`: the manifest's four, in order) and each one's OWN
# intent (an explicit VIEW of MainActivity with `inokapp://tab/<id>`, what the launcher sends) from a COLD start and from the BACKGROUND;
# the address the app lands on read back. Not gating (the browser ring gates the router): written, a wrong tab = a warning.
quick_actions() {
  QUICK=""
  local listed; listed=$(adb shell dumpsys shortcut 2>/dev/null | grep -aoE "inokapp://tab/[a-z]+" | awk '!s[$0]++' | sed 's#inokapp://tab/##' | tr '\n' ',' || true)
  QUICK="listed=${listed%,}"
  local id want got
  for id in streams monasteries map articles; do
    case $id in streams) want=/streams;; monasteries) want=/monasteries;; map) want=/map;; articles) want=/articles;; esac
    adb shell am force-stop $PKG; sleep 2
    adb shell am start -a android.intent.action.VIEW -d "inokapp://tab/$id" -n $PKG/.MainActivity > /dev/null; sleep 14
    got=$(nav url || true); QUICK="$QUICK cold:$id=$([ "$got" = "$want" ] && echo ok || echo "$got")"
    nav go /monasteries/242 > /dev/null 2>&1 || true; sleep 3
    adb shell am start -a android.intent.action.VIEW -d "inokapp://tab/$id" -n $PKG/.MainActivity > /dev/null; sleep 5
    got=$(nav url || true); QUICK="$QUICK warm:$id=$([ "$got" = "$want" ] && echo ok || echo "$got")"
  done
  [ "$id" = articles ] && shot "$OUT/quick_articles.png"
  echo "quick actions: $QUICK" | tee "$OUT/quick.txt"
  echo "$QUICK" | grep -qE "(cold|warm):[a-z]+=[^o]" && echo "::warning::API $API: a quick action landed elsewhere ($OUT/quick.txt)"
  return 0
}
# A-83 edge-to-edge on Android 15+ (API 35/36): Home and an article scrolled down, with gesture AND 3-button navigation (the review shots)
edge_shots() {
  E2E=n/a; [ "${API%%-*}" -ge 35 ] || return 0
  E2E=""
  for mode in gestural threebutton; do
    adb shell cmd overlay enable-exclusive --category "com.android.internal.systemui.navbar.$mode" > /dev/null 2>&1 || { E2E="$E2E $mode:no-overlay"; continue; }
    sleep 4; adb shell am force-stop $PKG; adb shell am start -n $PKG/.MainActivity > /dev/null; sleep 12
    shot "$OUT/e2e_${mode}_home.png"
    node "$ROOT/scripts/emu_nav.mjs" go '/articles?id=1832' >> "$OUT/nav.txt" 2>&1 || true; sleep 6
    adb shell input swipe 160 520 160 120 250; sleep 1; adb shell input swipe 160 520 160 120 250; sleep 1
    shot "$OUT/e2e_${mode}_article.png"
    # 1.0.5 round 2 (P30 Pro): the native overlap the page got in this mode (MainActivity / NavOverlap.java)
    local ins; ins=$(grep -a "InokInsets" "$OUT/logcat_full.txt" | tail -1 | sed 's/.*nav overlap css px //; s/ (nav bar.*//; s/ /_/g' || true)
    E2E="$E2E $mode:shot,overlap=${ins:-none}"
  done
  echo "edge-to-edge shots:$E2E" | tee "$OUT/e2e.txt"
}
# A-88 (4d): the tree TalkBack is given (uiautomator dump) of Home, a card, an article, «Трансляції» - every actionable node of the app named
# (scripts/a11y_dump.py). TalkBack itself ON when the image carries it (google_apis images usually do not - said in a11y.txt); pages are
# reached through DevTools (emu_nav go / click), never by taps (TalkBack turns a tap into «focus»). API 35+ only (the TalkBack job).
a11y_dumps() {
  A11Y=n/a; [ "${API%%-*}" -ge 35 ] || return 0
  # cloud_34 (REVIEW cloud_33 Q2, agreed): the tree is dumped with TalkBack OFF - `uiautomator dump` reads the accessibility tree itself (the
  # names, roles and states TalkBack would be given). TalkBack ON (cloud_28 … 33) put its POST_NOTIFICATIONS dialog over the pages after Home
  # («covered by»), and granting it made `uiautomator dump` drop adb (mirror 43626856972, 43628482267). TalkBack is started only where its
  # SPEECH is checked - no such check exists in this smoke; the line names the mode. Undo = the cloud_33 lines (git show 547511b).
  local tb=off-dump
  adb shell am start -n $PKG/.MainActivity > /dev/null || true; sleep 6
  A11Y="talkback=$tb"
  # REVIEW cloud_34 Q4 (a): the FIRST dump of a run is empty (the WebView builds its tree when the first a11y client connects) - one warm-up
  # dump, thrown away, so Home is measured like every other page. Red on this step = revert this line, not fix it (A-108).
  adb shell uiautomator dump /sdcard/a11y.xml > /dev/null 2>&1 || true; sleep 2
  # cloud_30 (A-95): + the 1.0.6 screens - the gallery viewer, the search header, the sort sheet, «Ще» (incognito), the monasteries' strip
  # cloud_33 (1.0.8, A-109): + the card's gallery - the viewer opened from the card 242's «Фотогалерея» (its cover loaded by hand on a metered emulator)
  for spec in home:/home streams:/streams card:/monasteries/37 article:/articles viewer:/articles?id=1714 search:/articles sort:/articles more:/more monasteries:/monasteries cardgallery:/monasteries/242; do
    local name=${spec%%:*} path=${spec#*:} after=''
    node "$ROOT/scripts/emu_nav.mjs" go "$path" >> "$OUT/nav.txt" 2>&1 || true; sleep 5
    [ "$name" = article ] && { node "$ROOT/scripts/emu_nav.mjs" click '[data-testid^="arow-"]' >> "$OUT/nav.txt" 2>&1 || true; sleep 5; }
    [ "$name" = viewer ] && { node "$ROOT/scripts/emu_nav.mjs" click '[data-testid="gallery-grid"] [data-testid="photo-open"]' >> "$OUT/nav.txt" 2>&1 || true; sleep 5; after=back; }
    [ "$name" = search ] && { node "$ROOT/scripts/emu_nav.mjs" click '[data-testid="search-open"]' >> "$OUT/nav.txt" 2>&1 || true; sleep 3; after=clear; }
    [ "$name" = cardgallery ] && { node "$ROOT/scripts/emu_nav.mjs" click '[data-testid="card"] [data-testid="photo-load"]' >> "$OUT/nav.txt" 2>&1 || true; sleep 6
      node "$ROOT/scripts/emu_nav.mjs" click '[data-testid="card"] [data-testid="gallery"]' >> "$OUT/nav.txt" 2>&1 || true; sleep 6; after=back; }
    [ "$name" = sort ] && { node "$ROOT/scripts/emu_nav.mjs" click '[data-testid="sort-open"]' >> "$OUT/nav.txt" 2>&1 || true; sleep 3; after=back; }
    adb shell uiautomator dump /sdcard/a11y.xml > /dev/null 2>&1 || true
    adb exec-out cat /sdcard/a11y.xml > "$OUT/a11y_$name.xml" 2>/dev/null || true
    shot "$OUT/a11y_$name.png"
    local line; line=$(python3 -I "$ROOT/scripts/a11y_dump.py" "$OUT/a11y_$name.xml" "$name" || true)
    echo "$line" | tee -a "$OUT/a11y.txt"
    A11Y="$A11Y $name:$( (echo "$line" | grep -oE 'actionable=[0-9]+ unnamed=[0-9]+|covered by [^ ]+' || echo 'no-dump') | sed 's/actionable=//; s/ unnamed=/\//; s/covered by /covered:/')"
    [ "$after" = back ] && { adb shell input keyevent 4; sleep 2; }
    [ "$after" = clear ] && { node "$ROOT/scripts/emu_nav.mjs" click '[data-testid="articles-search"] .searchbar-clear-button' >> "$OUT/nav.txt" 2>&1 || true; sleep 2; }
  done
  echo "a11y (TalkBack tree): $A11Y" | tee -a "$OUT/a11y.txt"
  grep -q 'covered by' "$OUT/a11y.txt" && echo "::warning::API $API: A-88 a page was covered by another app's window - its dump is not the app's ($OUT/a11y.txt)" || true
  grep -q 'unnamed=[1-9]' "$OUT/a11y.txt" && echo "::warning::API $API: A-88 actionable nodes without a name - $OUT/a11y.txt" || true
}
notify_proof() {
  if bash "$ROOT/scripts/emu_notify.sh" "$OUT" "$DEBUG_APK" "$WV" "$FLOOR"; then NOTIFY="$(tail -1 "$OUT/notify.txt")"
  else NOTIFY="FAIL $(grep -m1 '^FAIL' "$OUT/notify.txt")"; echo "::error::API $API: A-84 notifications $NOTIFY"; echo "FAIL notify $NOTIFY" > "$OUT/result.txt"; exit 1; fi
}

# A-144 (cloud_43): a FIRST launch with NO network imports the directory built into the app (public/bundled/, scripts/bundle_export.mjs):
# the app's data cleared, airplane mode on, launch -> export_version stored + every house of the bundled manifest in the DB; then the network back
offline_first() {
  OFFLINE=n/a
  local want got ev _ LISTED
  want=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['counts']['monasteries'])" "$ROOT/dist/bundled/manifest.json" 2>/dev/null || echo 0)
  [ "$want" -gt 0 ] || { OFFLINE="FAIL no dist/bundled/manifest.json"; echo "::error::API $API: A-144 the build carries no bundled export"; echo "FAIL offline-first no-bundle" > "$OUT/result.txt"; exit 1; }
  adb shell am force-stop $PKG; adb shell pm clear $PKG > /dev/null
  adb shell cmd connectivity airplane-mode enable 2>/dev/null || { adb shell settings put global airplane_mode_on 1; adb shell am broadcast -a android.intent.action.AIRPLANE_MODE > /dev/null 2>&1 || true; }
  sleep 3; adb shell am start -n $PKG/.MainActivity > /dev/null
  got=0; ev=''
  for _ in $(seq 1 24); do
    sleep 5
    if appcopy $DB "$OUT/offline.db" && [ "$(head -c 15 "$OUT/offline.db")" = "SQLite format 3" ]; then
      ev=$(python3 -I "$ROOT/scripts/db_read.py" "$OUT/offline.db" "select value from meta where key='export_version'" 2>/dev/null || true)
      got=$(python3 -I "$ROOT/scripts/db_read.py" "$OUT/offline.db" "select count(*) from monastery" 2>/dev/null || echo 0)
      [ -n "$ev" ] && [ "${got:-0}" -ge "$want" ] && break
    fi
  done
  shot "$OUT/offline_first.png"
  # NOTE 2 (REVIEW cloud_43, cloud_44): the frame of its SUBJECT - «Монастирі» with every house, still in airplane mode (the count read back)
  node "$ROOT/scripts/emu_nav.mjs" go /monasteries >> "$OUT/nav.txt" 2>&1 || true
  node "$ROOT/scripts/emu_nav.mjs" wait '[data-testid="count"]' >> "$OUT/nav.txt" 2>&1 || true; sleep 3
  LISTED=$(ev "(document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=count]') || {}).textContent || 'none'")
  shot "$OUT/offline_first_list.png"
  adb shell cmd connectivity airplane-mode disable 2>/dev/null || { adb shell settings put global airplane_mode_on 0; adb shell am broadcast -a android.intent.action.AIRPLANE_MODE > /dev/null 2>&1 || true; }
  OFFLINE="houses=$got/$want export=$ev list=[$LISTED]"
  echo "offline first launch: $OFFLINE" | tee "$OUT/offline_first.txt"
  [ "${got:-0}" -ge "$want" ] || { echo "::error::API $API: A-144 the first launch without a network has $got of $want houses"; echo "FAIL offline-first $OFFLINE" > "$OUT/result.txt"; exit 1; }
}

if [ "$WV" -ge "$FLOOR" ]; then
  # the first run downloads the export from the live API and imports it; give a cold emulator up to 3 minutes
  for _ in $(seq 1 36); do
    sleep 5
    if appls $DB >/dev/null 2>&1; then
      appcopy $DB "$OUT/inok.db" || true
      if [ "$(head -c 15 "$OUT/inok.db")" = "SQLite format 3" ] &&
         python3 -I "$ROOT/scripts/db_read.py" "$OUT/inok.db" "select value from meta where key='export_version'" 2>/dev/null | grep -q .; then break; fi
    fi
  done
  # D22 regression check: the first home after the import must SHOW content — wait for the app's own «home painted» line (two frames
  # after mount: the browser drew it), then the screen must not be blank (cloud_05: tab bar only, 3 of 3 runs; the 8-s shot tells slow
  # from stuck). D67: never a fixed «2 s after mount» - a slow runner (API 34, import 16.6 s) painted later than that and went red.
  # cloud_18 (run 41977190605, API 31): «home painted» (two rAF in JS) reached logcat while the screen was still blank (ink 0.013 at +0.5 s,
  # 0.54 at 8 s) - the WebView's compositor frame comes later on a slow emulator. So: after «home painted», poll the SCREEN for content
  # (≤ 8 s, every 0.5 s) - the condition itself, never a timer; a home that stays blank 8 s is the D22 defect.
  PAINTED=no; for _ in $(seq 1 60); do grep -q "InokBoot: home painted" "$OUT/logcat_full.txt" 2>/dev/null && { PAINTED=yes; break; }; sleep 1; done
  T0=$(date +%s%N); for _ in $(seq 1 16); do shot "$OUT/home.png"
    awk "BEGIN{exit !($(python3 "$ROOT/scripts/png_ink.py" "$OUT/home.png") > 0.05)}" && break; sleep 0.5; done
  INK_MS=$(( ($(date +%s%N) - T0) / 1000000 ))
  sleep 7; shot "$OUT/home_8s.png"
  # D22: the app's frame times from launch to here (UI thread + render), the numbers for the REPORT
  adb shell dumpsys gfxinfo $PKG > "$OUT/gfxinfo_home.txt" 2>/dev/null || true
  grep -E "Total frames|Janky frames|percentile|Number Slow UI|Number Frame deadline" "$OUT/gfxinfo_home.txt" | tee -a "$OUT/home_ink.txt" || true
  HOME_INK=$(python3 "$ROOT/scripts/png_ink.py" "$OUT/home.png"); HOME8_INK=$(python3 "$ROOT/scripts/png_ink.py" "$OUT/home_8s.png")
  echo "first home: painted=$PAINTED, content on screen +${INK_MS} ms after it, ink=$HOME_INK, later ink=$HOME8_INK" | tee "$OUT/home_ink.txt"
  grep "InokBoot" "$OUT/logcat_full.txt" | sed 's/.*Msg: //' | tee -a "$OUT/home_ink.txt" || true
  awk "BEGIN{exit !($HOME_INK > 0.05)}" || { echo "::error::API $API: the first home after the import is blank (ink=$HOME_INK) - D22"; echo "FAIL first-home-blank ink=$HOME_INK" > "$OUT/result.txt"; exit 1; }
  # A-48: the reference phone went white BY ITSELF 2-3 s after Home, every launch (the background feed / live / push re-render it).
  # Home must stay alive 10+ s, untouched: no page error, no rejection, no renderer death (src/app/crash.tsx logs each with its code)
  sleep 4; shot "$OUT/home_12s.png"
  HOME_ERR=$(grep -a "InokBoot: error\|InokBoot: rejection\|InokBoot: render process gone" "$OUT/logcat_full.txt" 2>/dev/null | sed 's/.*InokBoot: //' | head -3 || true)
  echo "home 12 s ink=$(python3 "$ROOT/scripts/png_ink.py" "$OUT/home_12s.png") errors=[${HOME_ERR}]" | tee -a "$OUT/home_ink.txt"
  [ -z "$HOME_ERR" ] || { echo "::error::API $API: A-48 Home died within 12 s: $HOME_ERR"; echo "FAIL home-crash $HOME_ERR" > "$OUT/result.txt"; exit 1; }
  # D66: on an OLD engine (WebView < 94: the A-48 class - post-floor Intl data, `outline` radius) the smoke must run the code it proves:
  # Home's calendar block (calendarView -> kyivToday(), the line that threw on WebView 91) must be there, except in the site's own
  # 16:00-16:05 Kyiv rollover when the calendar has no body - then the summary says so instead of passing silently.
  CAL=n/a
  if [ "$WV" -lt 94 ]; then
    KYIV_HM=$(TZ=Europe/Kyiv date +%H%M)
    if [ "$KYIV_HM" -ge 1600 ] && [ "$KYIV_HM" -lt 1606 ]; then CAL="skipped-rollover-$KYIV_HM"; echo "::warning::API $API: calendar not checked - 16:00-16:05 Kyiv ($KYIV_HM)"
    elif node "$ROOT/scripts/emu_nav.mjs" wait '[data-testid="calendar"]' >>"$OUT/nav.txt" 2>&1; then CAL=shown
    else echo "::error::API $API: old engine WebView $WV - Home has no calendar block at $KYIV_HM Kyiv (D66)"; echo "FAIL no-calendar webview=$WV kyiv=$KYIV_HM" > "$OUT/result.txt"; exit 1; fi
    echo "calendar on the old engine: $CAL" | tee -a "$OUT/home_ink.txt"
  fi
  [ "$(head -c 15 "$OUT/inok.db" 2>/dev/null)" = "SQLite format 3" ] || { echo "::error::API $API: no SQLite database after 3 min (WebView $WV)"; echo "FAIL no-db" > "$OUT/result.txt"; exit 1; }
  python3 -I "$ROOT/scripts/db_read.py" "$OUT/inok.db" "select key, value from meta; select 'monasteries', count(*) from monastery;" | tee "$OUT/db_meta.txt"
  grep -q '^fts|' "$OUT/db_meta.txt" || { echo "::error::no meta.fts - the app did not create its database"; echo "FAIL no-meta" > "$OUT/result.txt"; exit 1; }
  grep -q '^fts|trigram' "$OUT/db_meta.txt" || echo "::warning::FTS mode on API $API is $(grep '^fts|' "$OUT/db_meta.txt") - not trigram (see REF_gotchas)"
  adb shell input tap 32 615; sleep 6    # tab «Монастирі» (1st of 5 on the 320x640 skin)
  shot "$OUT/monasteries.png"
  # cloud_34 (A-111): list thumbnails live in files/kept/ (files/covers/ = the legacy folder of 1.0.0 … 1.0.8, never written by 1.0.9)
  COVERS=$( (appls files/kept || true) | wc -l | tr -d ' ')  # pipefail: the folder may not exist yet
  echo "list thumbnails kept on the device: $COVERS"
  [ "$COVERS" -gt 0 ] || echo "::warning::API $API: no list thumbnails were cached (kept/ mkdir or download failed — see logcat_filtered.txt)"
  # stage 2: the map tab (MapLibre in the WebView, tiles from the live config's style), then «near me» with the
  # emulator's GPS set to Kyiv, then the first row of the nearby list → the marker card over the map
  adb shell pm grant $PKG android.permission.ACCESS_FINE_LOCATION || true
  adb shell pm grant $PKG android.permission.ACCESS_COARSE_LOCATION || true
  adb emu geo fix 30.5234 50.4501 || true
  adb shell input tap 96 615; sleep 10    # tab «Карта» (2nd of 5 on the 320x640 skin)
  shot "$OUT/map.png"
  MAP_INK=$(python3 "$ROOT/scripts/png_ink.py" "$OUT/map.png")
  echo "map ink=$MAP_INK"
  awk "BEGIN{exit !($MAP_INK > 0.05)}" || { echo "::error::API $API: the map screen is blank (ink=$MAP_INK)"; echo "FAIL map-blank ink=$MAP_INK" > "$OUT/result.txt"; exit 1; }
  adb shell input tap 296 52; sleep 8     # «near me» in the header → radius ring + list
  shot "$OUT/map_near.png"
  adb shell input tap 160 470; sleep 4    # first row of the nearby list (below the radius chips) → marker card over the map
  shot "$OUT/map_card.png"
  # stage 3 push: the app logs «InokPush: registered» and «InokPush: subscribed <topic>» (never the token). Only an image
  # with Play services (google_apis) and a google-services.json in the build can register; elsewhere it is a warning.
  sleep 5
  adb logcat -d 2>/dev/null | grep -o 'InokPush: [a-z ]*[a-z_0-9]*' | sed 's/InokPush: //' | sort -u | tr '\n' ';' > "$OUT/push.txt" || true
  echo "push: $(cat "$OUT/push.txt")"
  # cloud_27: the qa build has no console lines - a native «subscribed <topic>» (FcmTopicsPlugin) = registered too (a topic needs the token)
  if grep -q 'registered\|subscribed' "$OUT/push.txt"; then PUSH="registered,$(grep -o 'subscribed [a-z_0-9]*' "$OUT/push.txt" | sed 's/subscribed //' | tr '\n' '+' | sed 's/+$//')";
  else PUSH="not-registered"; echo "::warning::API $API: push not registered (no Play services on this image, or no google-services.json)"; fi
  # cloud_04: the live export's new fields on the device (R-10 card 37, R-11 98/110, R-13 sort_lang, R-16 avatars) — from the DB the app built
  appcopy $DB "$OUT/inok.db" || true
  python3 -I "$ROOT/scripts/db_read.py" "$OUT/inok.db" "select 'r10_37', founded_uk, head_role_uk, substr(head_document_uk,1,40), revival_uk is not null, links_json from monastery where code=37;
    select 'r11_110', parent_code, parent_division_uk from monastery where code=110; select 'r11_98', units_uk from monastery where code=98;
    select 'r13', count(*), count(sort_uk), count(eparchy_id) from channel; select 'r16', count(avatar_url), count(distinct avatar_url), count(avatar_sha256) from channel;
    select 'schema', value from meta where key='schema_version';" | tee "$OUT/live_fields.txt"
  # in-page taps / URL through the WebView's DevTools socket (scripts/emu_nav.mjs); the tab buttons are real taps
  nav() { node "$ROOT/scripts/emu_nav.mjs" "$@" 2>>"$OUT/nav.txt" || echo "nav $* failed" >> "$OUT/nav.txt"; }
  tab() { case $1 in monasteries) X=32;; map) X=96;; streams) X=160;; articles) X=224;; more) X=288;; esac; adb shell input tap $X 615; sleep 4; }
  # stage 3 streams with the channels' own avatars (R-16, cached under files/kept/ch* since 1.0.9), then home by the toolbar icon (owner 01.11)
  adb shell input tap 160 615; sleep 12   # tab «Трансляції» (3rd of 5)
  shot "$OUT/streams.png"
  # A-67: the first open of «Трансляції» asks once (the soft question is in streams.png); «Ні, дякую» (the last answer) closes it
  ANSWER_JS="(() => { const b = document.querySelectorAll('ion-alert.soft-ask .alert-button'); if (!b.length) return 'none'; const t = document.querySelector('ion-alert.soft-ask .alert-title').textContent; b[b.length - 1].click(); return t; })()"
  # the question's title, answered «Ні» (the last button); «none» = no question on screen (emu_nav exits 1 then: never fatal under pipefail)
  answer() { node "$ROOT/scripts/emu_nav.mjs" eval "$ANSWER_JS" 2>&1 | tail -1 | sed 's/^eval: //' || true; }
  ASK="streams:$(answer)"; sleep 2
  echo "soft question $ASK" | tee "$OUT/ask.txt"
  # A-73: the two questions are INDEPENDENT - after «Ні» to the streams one, the first opened article asks ITS question in the SAME launch
  tab articles; nav click '[data-testid^="arow-"]'; sleep 6; shot "$OUT/ask_articles.png"
  ASK="$ASK articles:$(answer)"; sleep 2
  echo "soft question $ASK" | tee "$OUT/ask.txt"; tab streams
  AVATARS=$( (appls files/kept || true) | grep -c '^ch' || true)
  echo "avatar files cached on the device: $AVATARS" | tee -a "$OUT/live_fields.txt"
  adb shell input tap 26 52; sleep 6      # the brand icon left of the title → home
  shot "$OUT/home_live.png"
  # the cards: search by the English name (adb input text is ASCII), first row
  card() { adb shell input tap 32 615; sleep 4; adb shell input tap 150 52; sleep 1; adb shell input keycombination 113 29 2>/dev/null || true;
    adb shell input keyevent 67; adb shell input text "$1"; sleep 2; adb shell input keyevent 66; sleep 3; adb shell input tap 160 150; sleep 5;
    shot "$OUT/$2.png"; adb shell input swipe 160 500 160 120 300; sleep 2; shot "$OUT/$2_2.png"; adb shell input keyevent 4; sleep 2; }
  # stage 4: the feed from the live API in the device cache, then the first article
  adb shell input tap 224 615; sleep 10   # tab «Статті» (4th of 5)
  shot "$OUT/articles.png"
  adb shell input tap 160 185; sleep 5    # the first row (under the kind chips) → the article
  shot "$OUT/article.png"
  appcopy $DB "$OUT/inok.db" || true
  ARTICLES=$(python3 -I "$ROOT/scripts/db_read.py" "$OUT/inok.db" "select count(*) from article" 2>/dev/null || echo 0)
  echo "articles cached: $ARTICLES $(python3 -I "$ROOT/scripts/db_read.py" "$OUT/inok.db" "select kind, count(*) from article group by kind" | tr '\n' ' ')" | tee -a "$OUT/live_fields.txt"
  [ "$ARTICLES" -gt 0 ] || echo "::warning::API $API: no articles cached (feed fetch failed - see logcat_filtered.txt)"
  card Tserkovshchyna card_37
  card Sviatohirsk card_98
  # A-27 / D44 (owner, his phone 01.11 20:58): a tab button ALWAYS opens its top screen. Tab buttons = real taps; in-page taps and the URL
  # through the WebView's DevTools socket (scripts/emu_nav.mjs). His exact path + 3 cross jumps; any miss fails the run.
  NAV=ok; navis() { node "$ROOT/scripts/emu_nav.mjs" expect "$1" >> "$OUT/nav.txt" 2>&1 || NAV="FAIL:$2"; tail -1 "$OUT/nav.txt"; }
  # 1. his path: «Ще» → Єпархії → an eparchy → «Обителі на карті» → system Back = the eparchy; then Монастирі → «Ще» = the MENU
  tab more; nav click '[data-testid="more-eparchies"]'; sleep 3; nav click '[data-testid^="erow-"]'; sleep 4
  EP=$(nav url); echo "eparchy page: $EP" | tee -a "$OUT/nav.txt"
  nav click '[data-testid="eparchy-map"]'; sleep 8; navis '^/map\?eparchy=' owner-map
  adb shell input keyevent 4; sleep 4; navis "^$EP\$" owner-back
  tab monasteries; tab more; navis '^/more$' owner-more; shot "$OUT/nav_owner_more.png"
  # 2. card → its map → the header arrow = the card; then «Карта» = the whole map, «Монастирі» = the list
  tab monasteries; nav click '[data-testid^="mrow-"]'; sleep 4; CARD=$(nav url)
  nav click '[data-testid="show-on-map"]'; sleep 8; nav click '[data-testid="back"]'; sleep 4; navis "^$CARD\$" card-map-back
  tab map; navis '^/map$' map-top; tab monasteries; navis '^/monasteries$' list-top
  # 3. eparchy → a house card (another tab) → «Ще» = the menu, its Back = «Головна»
  tab more; nav click '[data-testid="more-eparchies"]'; sleep 3; nav click '[data-testid^="erow-"]'; sleep 4
  nav click '[data-testid="eparchy-houses"] [data-testid^="mrow-"]'; sleep 4; navis '^/monasteries/[0-9]+$' eparchy-card
  tab more; navis '^/more$' card-more; adb shell input keyevent 4; sleep 3; navis '^/home$' more-back-home
  # 4. an article → the ACTIVE tab «Статті» = the list
  tab articles; nav click '[data-testid^="arow-"]'; sleep 4; navis '^/articles\?id=' article; tab articles; navis '^/articles$' articles-top
  # an uncaught page error during these jumps (an unmount cleanup that throws takes React's tree down) fails the scenario too
  if grep -q "InokBoot: error\|InokBoot: rejection" "$OUT/logcat_full.txt" 2>/dev/null; then NAV="FAIL:page-error"; grep -a "InokBoot: error\|InokBoot: rejection" "$OUT/logcat_full.txt" | tee -a "$OUT/nav.txt"; fi
  echo "nav=$NAV" | tee -a "$OUT/nav.txt"
  [ "$NAV" = ok ] || { echo "::error::API $API: A-27 tab navigation $NAV (screens/emu-$API/nav.txt)"; echo "FAIL nav $NAV" > "$OUT/result.txt"; exit 1; }
  # A-96 W-7 (A-36): «Режим інкогніто» off (default) = screen names leave; switched ON in «Ще» = nothing more leaves, also after a restart
  sv() { grep -ac "$1" "$OUT/logcat_full.txt" 2>/dev/null || true; }
  logsync; ON_APP=$(sv 'InokAnalytics: screen'); ON_FA=$(grep -a 'FA' "$OUT/logcat_full.txt" | grep -ac 'screen_view' || true)
  tab more; nav click '[data-testid="incognito-toggle"]'; sleep 3
  logsync; A0=$(sv 'InokAnalytics: screen'); F0=$(grep -a 'FA' "$OUT/logcat_full.txt" | grep -ac 'screen_view' || true)
  tab streams; tab articles; tab monasteries
  adb shell am force-stop $PKG; sleep 2; adb shell am start -n $PKG/.MainActivity; sleep 15; tab streams
  # A-73: a new launch asks nothing more (both answered «Ні» in the first launch)
  tab articles; nav click '[data-testid^="arow-"]'; sleep 6
  ASK="$ASK relaunch:$(answer)"
  echo "soft question $ASK" | tee "$OUT/ask.txt"; tab streams
  logsync; A1=$(sv 'InokAnalytics: screen'); F1=$(grep -a 'FA' "$OUT/logcat_full.txt" | grep -ac 'screen_view' || true)
  # cloud_28 (emulator 43077824891, API 36): no «collection» line in the capture stopped the smoke here with NO verdict (pipefail) - the
  # A-36 checks below must decide, by name
  OFF_LINE=$(grep -a 'InokAnalytics: collection' "$OUT/logcat_full.txt" | tail -1 | sed 's/.*InokAnalytics: //' || true)
  ANALYTICS="on:app=$ON_APP,fa=$ON_FA;off:app=$((A1-A0)),fa=$((F1-F0));last=$OFF_LINE"
  echo "analytics $ANALYTICS" | tee "$OUT/analytics.txt"
  grep -a 'InokAnalytics\|FA.*screen_view' "$OUT/logcat_full.txt" | tail -n 60 >> "$OUT/analytics.txt" || true
  [ "$ON_APP" -gt 0 ] || { echo "::error::API $API: A-36 no screen sent while the switch is on"; echo "FAIL analytics-on" > "$OUT/result.txt"; exit 1; }
  [ "$A1" -ge "$A0" ] && [ "$F1" -ge "$F0" ] || { echo "::error::API $API: A-36 the log ring rotated (logcat_ring.txt) - the OFF count is unreadable"; echo "FAIL analytics-ring" > "$OUT/result.txt"; exit 1; }
  [ $((A1-A0)) -eq 0 ] && [ $((F1-F0)) -eq 0 ] || { echo "::error::API $API: A-36 screens sent while the switch is OFF ($ANALYTICS)"; echo "FAIL analytics-off" > "$OUT/result.txt"; exit 1; }
  [ "$ON_FA" -gt 0 ] || echo "::warning::API $API: Firebase logged no screen_view while on (no google-services.json in this build, or FA debug off) - $ANALYTICS"
  # incognito back off for the rest (the person's default)
  tab more; nav click '[data-testid="incognito-toggle"]'; sleep 2
  # cloud_30 (1.0.6, A-96 W-4 / A-97): the new screens on the device, read back + shot, NOT gating (the browser ring gates them):
  # the live 1714's gallery -> the viewer «1 / 5» -> system Back closes it; the search header asks the live R-44; the sort sheet opens
  nav go '/articles?id=1714'; sleep 8
  nav wait '[data-testid="gallery-grid"] [data-testid="photo-open"]'; nav click '[data-testid="gallery-grid"] [data-testid="photo-open"]'; sleep 6
  G1=$(ev "(document.querySelector('[data-testid=viewer-count]')||{}).textContent||'none'"); G2=$(ev "(document.querySelector('[data-testid=viewer-img]')||{}).dataset?.full||'none'")
  shot "$OUT/v106_viewer.png"; adb shell input keyevent 4; sleep 3
  G3=$(ev "document.querySelector('ion-modal.viewer:not(.overlay-hidden)') ? 'open' : 'closed'")
  tab articles; sleep 2; nav click '[data-testid="search-open"]'; sleep 2; adb shell input text 'Lavra'; sleep 6
  S1=$(ev "(document.querySelector('[data-testid=kinds]')||{}).dataset?.query||'none'"); shot "$OUT/v106_search.png"
  nav click '[data-testid="articles-search"] .searchbar-clear-button'; sleep 2; nav click '[data-testid="sort-open"]'; sleep 2
  S2=$(ev "document.querySelectorAll('ion-action-sheet.sort-sheet button[role=radio]').length"); shot "$OUT/v106_sort.png"; adb shell input keyevent 4; sleep 2
  echo "v106 viewer=$G1 full=$G2 back=$G3 search=$S1 sort_options=$S2" | tee "$OUT/v106.txt"
  # cloud_31 (1.0.7, A-101 / R-47 / R-48), NOT gating (the browser ring gates): the live 1682 = ONE Facebook button above the lead and no
  # «read in full»; the live 1892 = ONE YouTube button, no body, no «read in full»; sort_options above = 4 while the server's articles_sort_v2 is on
  nav go '/articles?id=1682'; sleep 8; nav wait '[data-testid="article-video"]'
  V1=$(ev "[...document.querySelectorAll('.ion-page:not(.ion-page-hidden) [data-testid=article-video]')].map((b)=>b.dataset.host).join(',')+'|read='+document.querySelectorAll('.ion-page:not(.ion-page-hidden) [data-testid=read-site]').length+'|body='+document.querySelectorAll('.ion-page:not(.ion-page-hidden) .aview__body').length")
  shot "$OUT/v107_video_facebook.png"
  nav go '/articles?id=1892'; sleep 8; nav wait '[data-testid="article-video"]'
  V2=$(ev "[...document.querySelectorAll('.ion-page:not(.ion-page-hidden) [data-testid=article-video]')].map((b)=>b.dataset.host).join(',')+'|read='+document.querySelectorAll('.ion-page:not(.ion-page-hidden) [data-testid=read-site]').length+'|body='+document.querySelectorAll('.ion-page:not(.ion-page-hidden) .aview__body').length")
  shot "$OUT/v107_video_youtube.png"
  echo "v107 1682=$V1 1892=$V2 sort_options=$S2" | tee "$OUT/v107.txt"
  # cloud_33 (1.0.8, A-109 / R-49), NOT gating (the browser ring gates): the live card 242 -> its cover loaded by hand when the network is
  # metered -> «Фотогалерея» = the app's viewer «1 / 40» (the live list asked on the tap) -> Back closes it.
  # cloud_35 (1.0.10, A-112): the viewer obeys «Автозавантаження фото» (default «Тільки Wi-Fi»): on the emulator's network the REAL files of
  # photos/ do not grow by opening or paging (the block's reason read back: «wifi» = the network is metered here); the block's button = one
  # file; after it the next photo comes by itself (one more file, nothing ahead). A reason other than wifi / saver / manual = this check proves
  # nothing on this image - said in v110.txt, the browser ring is then the only proof.
  nfiles() { ( appls "files/$1" || true ) | wc -l | tr -d ' '; }
  why() { ev "(document.querySelector('ion-modal.viewer [data-testid=photo-wait]')||{}).dataset?.why||'none'"; }
  full() { ev "(document.querySelector('[data-testid=viewer-img]')||{}).dataset?.full||'none'"; }
  nav go '/monasteries/242'; sleep 8; nav click '[data-testid="card"] [data-testid="photo-load"]'; sleep 6
  nav wait '[data-testid="card"] [data-testid="gallery"]'; P0=$(ev "(document.querySelector('[data-testid=card] [data-testid=gallery]')||{}).dataset?.inApp||'none'")
  N0=$(nfiles photos)
  nav click '[data-testid="card"] [data-testid="gallery"]'; sleep 8
  P1=$(ev "(document.querySelector('[data-testid=viewer-count]')||{}).textContent||'none'"); P2=$(full); W0=$(why); N1=$(nfiles photos)
  shot "$OUT/v110_wait.png"
  nav click 'ion-modal.viewer [data-testid="viewer-next"]'; sleep 6; W1=$(why); N2=$(nfiles photos)
  nav click 'ion-modal.viewer [data-testid="viewer-prev"]'; sleep 3
  nav click 'ion-modal.viewer [data-testid="photo-load"]'; sleep 8; P4=$(full); N3=$(nfiles photos); shot "$OUT/v108_card_gallery.png"
  nav click 'ion-modal.viewer [data-testid="viewer-next"]'; sleep 8; P5=$(full); N4=$(nfiles photos); shot "$OUT/v110_allowed.png"
  adb shell input keyevent 4; sleep 3
  P3=$(ev "document.querySelector('ion-modal.viewer:not(.overlay-hidden)') ? 'open' : 'closed'")
  echo "v108 in_app=$P0 viewer=$P1 back=$P3" | tee "$OUT/v108.txt"
  V110=$(v110_verdict "$W0")
  echo "v110 $V110 photos: before=$N0 open=$N1 (full=$P2 why=$W0) next=$N2 (why=$W1) -> tap full=$P4 photos=$N3 -> next full=$P5 photos=$N4" | tee "$OUT/v110.txt"
  [ "$V110" = proved ] && { [ "$N1" = "$N0" ] && [ "$N2" = "$N0" ] || echo "::warning::API $API: A-112 the viewer saved a file before the tap ($OUT/v110.txt)"; }
  # cloud_34 (1.0.9, A-111), NOT gating (the browser ring gates): the REAL files. After v108's gallery photo, files/photos/ holds it (+ the
  # card's cover); «Ще» reads their bytes; «Очистити збережені фото» -> the dialog's confirm -> photos/ empty, kept/ (list thumbnails, avatars)
  # the same count, «0 МБ», the button unavailable; the card's gallery again (+ the block's button, A-112) = its photo downloaded again into photos/
  K0=$(nfiles kept); C0=$(nfiles photos)
  tab more; sleep 3; nav scroll '[data-testid="more-photos-clear"]' || true; sleep 2
  U0=$(ev "(document.querySelector('[data-testid=photos-used]')||{}).textContent||'none'")
  nav click '[data-testid="photos-clear"]' || true; sleep 2; shot "$OUT/v109_confirm.png"
  OK=$(ev "(() => { const b = document.querySelector('ion-alert.photos-confirm [data-testid=photos-confirm-do]'); if (!b) return 'none'; b.click(); return 'ok'; })()"); sleep 4
  U1=$(ev "(document.querySelector('[data-testid=photos-used]')||{}).textContent||'none'")
  D1=$(ev "document.querySelector('[data-testid=photos-clear]')?.shadowRoot?.querySelector('button')?.disabled ? 'off' : 'on'")
  shot "$OUT/v109_cleared.png"; K1=$(nfiles kept); C1=$(nfiles photos)
  nav go '/monasteries/242'; sleep 6; nav click '[data-testid="card"] [data-testid="gallery"]' || true; sleep 8
  nav click 'ion-modal.viewer [data-testid="photo-load"]' || true; sleep 8 # A-112: a new opening asks again (consent per opening)
  F2=$(ev "(document.querySelector('[data-testid=viewer-img]')||{}).dataset?.full||'none'"); C2=$(nfiles photos)
  adb shell input keyevent 4; sleep 3
  echo "v109 photos=$C0 kept=$K0 used=[$U0] confirm=$OK -> photos=$C1 kept=$K1 used=[$U1] button=$D1 -> gallery full=$F2 photos=$C2" | tee "$OUT/v109.txt"
  # owner 01.11 (after cloud_05): system Back on «Ще» did nothing. Now: tab root → «Головна»; Back on «Головна» folds the app
  adb shell input tap 288 615; sleep 3; adb shell input keyevent 4; sleep 3
  shot "$OUT/back_from_more.png"
  adb shell input keyevent 4; sleep 3
  FG=$(adb shell dumpsys activity activities 2>/dev/null | grep -E "topResumedActivity|mResumedActivity" | head -1 || true)
  echo "after Back on home: $FG" | tee "$OUT/back.txt"
  if echo "$FG" | grep -q "$PKG"; then echo "::error::API $API: Back on home did not fold the app"; echo "FAIL back-home" > "$OUT/result.txt"; exit 1; fi
  BACK=folded
  # A-76 App Links (API 31+: `pm set-app-links`): an article / card link opens that screen in the app, another path leaves the router (scripts/emu_links.sh)
  LINKS=n/a; case "$API" in 26*) ;; *) bash "$ROOT/scripts/emu_links.sh" "$OUT" || true; LINKS="$(tail -1 "$OUT/links.txt" 2>/dev/null | sed 's/^links //' || true)";; esac
  # A-166 (cloud_44): which short / gallery links the filters let in on this Android (the package manager's answer)
  bash "$ROOT/scripts/emu_filter.sh" "$OUT" "$API" || true; FILTER="$(tail -1 "$OUT/filter.txt" 2>/dev/null | sed 's/^filter //' || true)"
  # cloud_13 item 3: the Play screenshots from the live export, once, on the required image (scripts/emu_store.sh)
  STORE=n/a; case "$API" in 34-default*) bash "$ROOT/scripts/emu_store.sh" "$OUT" || true; STORE="$(grep -E '^store screenshots: [A-Z]+|^(missing|maps|pictures|anything|gallery|«Публікації»|language|unit words|status bar|colours|lavras|article top|on air)|^launcher label|STOPPED' "$OUT/store/sizes.txt" 2>/dev/null | sed 's/ (rules:.*//' | tr '\n' ';' || true)";; esac
  native_paths; quick_actions; edge_shots; a11y_dumps; r8_scan; notify_proof
  # T9 (cloud_43): the widgets' review snapshots + the push path (debug APK installed by notify_proof; informational - the verdict in widgets.txt)
  bash "$ROOT/scripts/emu_widgets.sh" "$OUT" "$API" || true; WIDGETS="$(tail -1 "$OUT/widgets.txt" 2>/dev/null | sed 's/^widgets //' || true)"
  # A-161 (3) (cloud_44): a live tap (the widget's row, the stream push) = «Трансляції» + the stream on top, Back -> «Трансляції» (debug APK installed)
  bash "$ROOT/scripts/emu_livetap.sh" "$OUT" || true; LIVETAP="$(tail -1 "$OUT/livetap.txt" 2>/dev/null | sed 's/^livetap //' || true)"
  offline_first
  echo "FULL offline=[$OFFLINE] widgets=[$WIDGETS] livetap=[$LIVETAP] webview=$WV calendar=$CAL $(grep '^monasteries|' "$OUT/db_meta.txt") covers=$COVERS map_ink=$MAP_INK push=$PUSH avatars=$AVATARS articles=$ARTICLES back=$BACK nav=$NAV analytics=$ANALYTICS ask=[$ASK] links=[$LINKS] filter=[$FILTER] store=[$STORE] r8=[$R8] native=[$NATIVE] e2e=[$E2E] a11y=[$A11Y] notify=[$NOTIFY] quick=[$QUICK]" | tee "$OUT/result.txt"
else
  sleep 20
  shot "$OUT/home.png"
  INK=$(python3 "$ROOT/scripts/png_ink.py" "$OUT/home.png")
  echo "webview=$WV (<$FLOOR): expecting error.html; non-white share of the screen = $INK"
  # a blank WebView gives ≈0.02 (status bar only); the error page with its text and button gives > 0.05
  awk "BEGIN{exit !($INK > 0.05)}" || { echo "::error::API $API: WebView $WV < $FLOOR and the screen is blank (error.html not shown)"; echo "FAIL blank webview=$WV ink=$INK" > "$OUT/result.txt"; exit 1; }
  edge_shots; r8_scan; notify_proof
  # A-166 (cloud_44): the short links reach the app on Android 8 too (the .ShortLinks alias) - the package manager's answer, no JavaScript
  bash "$ROOT/scripts/emu_filter.sh" "$OUT" "$API" || true; FILTER="$(tail -1 "$OUT/filter.txt" 2>/dev/null | sed 's/^filter //' || true)"
  INSETS=$(grep -a "InokInsets" "$OUT/logcat_full.txt" | tail -1 | sed 's/.*nav overlap css px //' || true)
  echo "WEBVIEW insets=[$INSETS] webview=$WV ink=$INK (error.html shown; web layer not testable on this image) filter=[$FILTER] r8=[$R8] e2e=[$E2E] notify=[$NOTIFY]" | tee "$OUT/result.txt"
fi
