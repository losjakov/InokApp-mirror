#!/bin/bash
# ios_sim_tour.sh - cloud_37 (A-121, A-122): the iOS simulator ring WITH TAPS, on the newest and on the oldest iOS runtime the runner has
# (or can download), iPhone + iPad. The app's simulator bundle carries the remote hand (src/app/simDriver.ts, VITE_SIM_DRIVER=1); the
# SAME commands as the Android emulator (scripts/emu_nav.mjs: go, click, wait, check, do, drawn) reach it through scripts/ios_relay.mjs.
# A «tap» = a DOM click on the element inside the real WKWebView (as on the emulator); the system's own UI (share sheet, Safari view,
# permission prompts) has no DOM - those spots are screenshots or NOT-PROVABLE (a line for the owner's iPhone).
#   bash scripts/ios_sim_tour.sh <App.app> <out dir> newest|oldest [iphone|ipad|both] [walk|appstore]
# cloud_38 (A-124 / P10): one device and one task per CI job (the 1.0.11 release job ran out of its 150 min); a walk exits 1 on ANY FAIL
# spot (the TestFlight upload waits for every simulator job to be green); the App Store task exits 1 unless its set is whole and checked.
# Output: <out>/runtimes.txt (what the runner has and what was downloaded), a3.txt (one line per trouble spot: device | runtime | spot |
# PASS / FAIL / NOT-PROVABLE | evidence), a3-<spot>__<device>.png, <device>_console.txt; newest only: appstore/<lang>/<iphone|ipad>/NN-*.png
# (A-122: the App Store set from the LIVE export, the frames of scripts/store_frames.txt, the read-backs of scripts/store_lib.sh) + sizes.txt.
set -uo pipefail
APP="$1"; OUT="$2"; WHICH="$3"; DEV="${4:-both}"; MODE="${5:-$([ "$WHICH" = newest ] && echo both || echo walk)}"; ROOT="$(cd "$(dirname "$0")/.." && pwd)"; BUNDLE=info.inok.app
mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"
export INOK_NAV_RELAY=http://localhost:8765
NAVJS="$ROOT/scripts/emu_nav.mjs"
S="$OUT"; ART=${STORE_ARTICLE:-1832}
# shellcheck source=scripts/store_lib.sh
. "$ROOT/scripts/store_lib.sh"
# cloud_38 (E5, ios run 2: the App Store frames of iOS 26.5 showed the real clock): the status bar override is re-applied before EVERY frame
# cloud_39 (ios run 1 of the session, iOS 26.5 / Xcode 26.6): `--time 10:00` is refused («Invalid, non-ISO date/time string») and the REAL
# clock showed in the App Store frames (E5 again) - an ISO time first, the short form only where an older simctl wants it; ONE override
# cloud_40 (NOTE 4 of REVIEW cloud_39): the forms are tried in order and the one Xcode 26.6 TOOK is written (statusbar.txt) with simctl's own
# read-back (`status_bar list`) - the REPORT says which, measured; none taken = the real clock, said so (one clock for the set either way)
sb_override() {
  local a=(--dataNetwork wifi --wifiMode active --wifiBars 3 --cellularMode notSupported --batteryState charged --batteryLevel 100) t
  for t in 2026-11-16T10:00:00Z 2026-11-16T10:00:00+00:00 "Mon Nov 16 10:00:00 UTC 2026" 10:00; do
    if xcrun simctl status_bar "$U" override --time "$t" "${a[@]}" 2>>"$OUT/nav.txt"; then
      [ -s "$OUT/statusbar.txt" ] || { echo "time form taken: ${t}"; xcrun simctl status_bar "$U" list 2>&1 | head -5; } >> "$OUT/statusbar.txt"; return 0
    fi
  done
  [ -s "$OUT/statusbar.txt" ] || echo "time form taken: NONE (the real clock)" >> "$OUT/statusbar.txt"
  xcrun simctl status_bar "$U" override "${a[@]}" 2>>"$OUT/nav.txt" || true
}
# ios run 1 (cloud_39): a snackbar lives 2.5 s and one remote-hand call can take longer - every toast shown is RECORDED in the page from
# before the tap (testid|message, every 100 ms) and read back after it; never a poll from outside
toast_watch() { ev "(() => { window.__toasts = []; clearInterval(window.__toastTimer); window.__toastTimer = setInterval(() => document.querySelectorAll('ion-toast').forEach((t) => {
  const k = (t.getAttribute('data-testid') || '') + '|' + (t.message || ''); if (t.message && !window.__toasts.includes(k)) window.__toasts.push(k); }), 100); return 'ok'; })()" > /dev/null; }
toasts() { ev "(window.__toasts || []).join(' ; ') || 'no toast'"; }
demo_all() { sb_override; sleep 1; }
ev() { local o; o=$(node "$NAVJS" eval "$1" 2>>"$OUT/nav.txt") || true; o="${o%%$'\n'*}"; printf '%s\n' "${o#eval: }"; }

# ---- the runtime: newest / oldest iOS the runner has; for «oldest» first try to download iOS 15 (the app's floor), then 16, 17
runtimes() { xcrun simctl list runtimes -j | python3 -I -c '
import json, sys
rs = [r for r in json.load(sys.stdin)["runtimes"] if r.get("platform", "iOS") == "iOS" and r.get("isAvailable")]
rs.sort(key=lambda r: [int(x) for x in r["version"].split(".")])
for r in rs: print(r["identifier"], r["version"], len(r.get("supportedDeviceTypes", [])))'; }
{ echo "== Xcode: $(xcodebuild -version | tr '\n' ' ')"; echo "== iOS runtimes available at start:"; runtimes; } > "$OUT/runtimes.txt"
if [ "$WHICH" = oldest ]; then
  have="$(runtimes | head -1 | awk '{print $2}')"
  for v in 15.5 16.4 17.5; do
    [ -n "$have" ] && [ "${have%%.*}" -le "${v%%.*}" ] && break
    echo "== download iOS $v: xcodebuild -downloadPlatform iOS -buildVersion $v" >> "$OUT/runtimes.txt"
    # macOS has no `timeout`: perl's alarm stops each download after 15 min (three tries <= 45 min of the job's 150)
    if perl -e 'alarm shift; exec @ARGV' 900 xcodebuild -downloadPlatform iOS -buildVersion "$v" > "$OUT/download-$v.log" 2>&1; then
      echo "   downloaded" >> "$OUT/runtimes.txt"; break
    else echo "   FAILED (exit $?): $(grep -iE 'error|not|unable|unsupported' "$OUT/download-$v.log" | head -3 | tr '\n' ' ' | cut -c1-300)" >> "$OUT/runtimes.txt"; fi
  done
  { echo "== iOS runtimes after the download attempts:"; runtimes; } >> "$OUT/runtimes.txt"
fi
RT="$( (runtimes | { [ "$WHICH" = oldest ] && head -1 || tail -1; }) | awk '{print $1" "$2}')"
RTID="${RT%% *}"; RTV="${RT#* }"
echo "== chosen ($WHICH): $RTID ($RTV)" | tee -a "$OUT/runtimes.txt"
[ -n "$RTID" ] || { echo "::error::no iOS runtime"; exit 1; }
# the device types this runtime serves: the NEWEST biggest iPhone (Pro Max: 1320 x 2868 = Apple's 6.9") and iPad (Pro 13": 2064 x 2752)
devtype() { xcrun simctl list runtimes -j | python3 -I -c '
import json, re, sys
rid, kind = sys.argv[1], sys.argv[2]
r = next(r for r in json.load(sys.stdin)["runtimes"] if r["identifier"] == rid)
ts = [t for t in r.get("supportedDeviceTypes", []) if t["name"].startswith(kind)]
pref = [t for t in ts if re.search(r"Pro Max|Pro 13", t["name"])] or [t for t in ts if re.search(r"Plus|Pro \(12\.9", t["name"])]
num = lambda t: [float(x) for x in re.findall(r"\d+(?:\.\d+)?", t["name"])]  # ios run 1: the list is not newest-last (iPhone 11 Pro Max came)
t = max(pref or ts, key=num); print(t["identifier"] + "|" + t["name"])' "$RTID" "$1"; }

A3="$OUT/a3.txt"
OFFER14="not met"   # the A2 offer as spot 14 meets it
a3() { echo "$TAG | iOS $RTV | $1 | $2 | $3" | tee -a "$A3"; }
# A-127: «yes» when the text is the app's honest iOS cast line (`cast.ios`) in one of the three languages - read from the app's own i18n files
honest() { "${PY:-python3}" -I -c 'import json, sys; t = sys.argv[1]; print("yes" if any(json.load(open(f"{sys.argv[2]}/src/i18n/{l}.json", encoding="utf-8"))["cast.ios"] in t for l in ("uk", "ru", "en")) else "no")' "$1" "$ROOT"; }
# cloud_38 (A8: «blank screenshots on iOS 26.5 while the DOM checks passed»): every shot is read by its pixels (scripts/store_png.py --paint);
# a BLANK one is taken again after 3 s and both verdicts are written to blank.txt - the cause is measured, never guessed
shot() {
  xcrun simctl io "$U" screenshot --type=png "$1" > /dev/null 2>&1 || { echo "SHOT FAIL $1" >> "$OUT/nav.txt"; return 1; }
  local p; p=$("${PY:-python3}" -I "$ROOT/scripts/store_png.py" --paint "$1" 2>/dev/null || echo '?')
  case "$p" in BLANK*) sleep 3; xcrun simctl io "$U" screenshot --type=png "$1" > /dev/null 2>&1
    local q; q=$("${PY:-python3}" -I "$ROOT/scripts/store_png.py" --paint "$1" 2>/dev/null || echo '?')
    echo "$(basename "$1") | iOS $RTV | first: $p | after 3 s: $q" >> "$OUT/blank.txt";; esac
}
# REVIEW cloud_37 NOTE 5 (the «gallery» frame showed the eparchy): a frame is shot only when what its NAME promises is on the screen -
# $2 = the CSS that proves it (on the page on top or an open overlay); else the file gets «-WRONG» and the spot FAILs
shotof() {
  local on; on=$(ev "(() => { const e = Array.from(document.querySelectorAll('$2')).find((x) => x.getClientRects().length > 0 && !x.closest('.ion-page-hidden') && !x.closest('.overlay-hidden')); return e ? 'yes' : 'no'; })()")
  if [ "$on" = yes ]; then shot "$1"; return 0; fi
  shot "${1%.png}-WRONG.png"; echo "WRONG CONTENT $(basename "$1"): no $2" >> "$OUT/nav.txt"; return 1
}
capture() { shot "$1"; }
launch() { # (re)start the app with its console captured; wait for «home painted» and for the remote hand to ask the relay
  xcrun simctl terminate "$U" "$BUNDLE" > /dev/null 2>&1 || true
  xcrun simctl launch --console-pty --terminate-running-process "$U" "$BUNDLE" -AppleLanguages '(uk)' -AppleLocale uk_UA >> "$OUT/${TAG}_console.txt" 2>&1 &
  local _; for _ in $(seq 1 90); do grep -q 'home painted' "$OUT/${TAG}_console.txt" 2>/dev/null && break; sleep 2; done
  for _ in $(seq 1 30); do [ "$(curl -s localhost:8765/health | python3 -I -c 'import json,sys; a=json.load(sys.stdin)["ago"]; print(1 if a is not None and a < 20000 else 0)')" = 1 ] && return 0; sleep 2; done
  echo "the remote hand never asked the relay ($TAG)" | tee -a "$OUT/nav.txt"; return 1
}

# ios run 1 (D12): a WebGL map leaves the simulator's picture white / frozen (the DOM goes on) even across app restarts - the device itself
# is restarted after every screen with a map; the app's data stays on it
# A-127 (cloud_39): a WebGL map on screen since the last reboot = the simulator's PICTURE is not evidence (AFTER_GL=1) - a frame that fails
# ONLY by its pixels then is OUT (outside the A-124 lock, written, never FAIL); its DOM checks stay in the lock
AFTER_GL=0
reboot_sim() {
  AFTER_GL=0
  xcrun simctl shutdown "$U" > /dev/null 2>&1 || true
  xcrun simctl boot "$U"; xcrun simctl bootstatus "$U" -b > /dev/null
  xcrun simctl ui "$U" appearance light
  sb_override
  xcrun simctl location "$U" set 50.4344,30.5571 2>>"$OUT/nav.txt" || true
  launch
}

# a crash screen left by the step before (A-48's «Щось пішло не так») is written down with its code and the app restarted - one fault, one line
guard_crash() {
  local c; c=$(ev "(() => { const e = document.querySelector('[data-testid=crash]'); return e ? ((e.innerText.match(/R-[A-Za-z]+-[0-9a-f]+/) || ['crash'])[0] + ' ' + (e.innerText.split('\\n').pop() || '').slice(0, 120)) : 'ok'; })()")
  [ "$c" = ok ] && return 0
  shot "$OUT/a3-crash-before-$1__$TAG.png"; a3 "no crash before «${1}»" FAIL "$c"
  # «Спробувати ще раз» clears the kept crash and reloads (a plain restart shows the last launch's crash again - ios run 2)
  ev "(document.querySelector('#inok-crash button') || {}).click?.(), 'ok'" > /dev/null; sleep 12
  [ "$(ev "document.querySelector('[data-testid=crash]') ? 'crash' : 'ok'")" = ok ] || launch
}

# ---- the trouble spots Android paid for (ref/REF_gotchas*, reports/PHONE_TEST_BACKLOG.md), walked with taps (A-121)
a3_walk() {
  local v
  guard_crash spot1
  # 0 cloud_40 (A1, red on the 1.0.13 code): the app's LOCAL plugins (the App target's AppAttest + FcmTopics, registered by the app's own
  # bridge InokBridgeViewController) must ANSWER. A simulator's App Attest answers {"supported":false}; a rejection «UNIMPLEMENTED» = the
  # plugin is not in the bridge (the root view controller is not the app's own) - App Attest and the FCM topics are then dead on every iPhone
  v=$(ev "(async () => { const r = []; for (const [n, m] of [['AppAttest', 'isSupported'], ['FcmTopics', 'consumedArticles']]) {
    try { const x = await Capacitor.Plugins[n][m](); r.push(n + '=' + JSON.stringify(x === undefined ? 'resolved' : x)); }
    catch (e) { r.push(n + '=REJECT ' + ((e && e.code) || '') + ' ' + String((e && e.message) || e).slice(0, 60)); } } return r.join('; '); })()")
  case "$v" in 'AppAttest={"supported":'*'; FcmTopics='*) case "$v" in *UNIMPLEMENTED*|*'not implemented'*) a3 "local plugins answer (A1)" FAIL "$v";;
      *) a3 "local plugins answer (A1)" PASS "$v";; esac;;
    *) a3 "local plugins answer (A1)" FAIL "${v:-no answer}";; esac
  # 0b cloud_40 (A1 g): «Про застосунок» - «Перевірка Apple: …» on a simulator = «not supported by this device» (Apple's own answer), never
  # «the call failed» (= the plugin not in the bridge); «Скопіювати подробиці» shows the text (no key id / install id in it)
  nav go /more/about; sleep 3
  nav click '[data-testid="attest-copy"]'; sleep 2
  v=$(ev "(() => { const c = document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=attest-check]'); const d = document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=attest-details]');
    return (c ? c.dataset.state : 'none') + ' | ' + (d ? d.textContent.replace(/\\n/g, ' / ') : 'no details'); })()")
  shot "$OUT/a3-attest-check__$TAG.png"
  case "$v" in 'unsupported | Inok '*'App Attest: isSupported = false'*) a3 "«Перевірка Apple» line (A1)" PASS "$v";; *) a3 "«Перевірка Apple» line (A1)" FAIL "${v:-no answer}";; esac
  # 1 the bars and the safe areas: the header under the status bar / Dynamic Island, the tab bar on the bottom edge, its buttons above the home indicator
  nav go /home; node "$NAVJS" wait '[data-testid="home-near"]' >> "$OUT/nav.txt" 2>&1
  v=$(ev "(() => { const p = document.createElement('div'); p.style.cssText = 'position:fixed;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)'; document.body.append(p);
    const cs = getComputedStyle(p); const st = parseFloat(cs.paddingTop), sb = parseFloat(cs.paddingBottom); p.remove();
    const tb = Array.from(document.querySelectorAll('ion-header [data-testid=page-title]')).find((e) => e.getClientRects().length > 0).getBoundingClientRect(); const bar = document.querySelector('ion-tab-bar').getBoundingClientRect();
    const btn = Math.max(...Array.from(document.querySelectorAll('ion-tab-button')).map((b) => b.getBoundingClientRect().bottom));
    const ok = tb.top >= st - 1 && bar.bottom >= innerHeight - 1 && btn <= innerHeight - sb + 1;
    return (ok ? 'PASS' : 'FAIL') + ' safe top ' + st + ' bottom ' + sb + '; the title top ' + Math.round(tb.top) + '; tab bar bottom ' + Math.round(bar.bottom) + ' / ' + innerHeight + '; buttons end ' + Math.round(btn); })()")
  a3 "bars + safe areas" "${v%% *}" "${v#* }"; shot "$OUT/a3-safe__$TAG.png"
  guard_crash spot2
  # 2 «назад»: list -> card -> the header arrow -> the list; eparchy -> its map -> arrow -> the eparchy (A-25 #1)
  # (each arrow tapped after the page's transition and its map are over - a tap during the transition is refused, D45)
  nav go /monasteries; node "$NAVJS" wait '[data-testid^="mrow-"]' >> "$OUT/nav.txt" 2>&1; sleep 2; nav click '[data-testid^="mrow-"]'; sleep 4
  local c1; c1=$(node "$NAVJS" url); nav click '[data-testid="back"]'; sleep 3; local u1; u1=$(node "$NAVJS" url)
  nav go /more/eparchies/1; node "$NAVJS" wait '[data-testid="eparchy-title"]' >> "$OUT/nav.txt" 2>&1; sleep 2; AFTER_GL=1; nav click '[data-testid="eparchy-map"]'; sleep 4
  node "$NAVJS" drawn >> "$OUT/nav.txt" 2>&1; sleep 2
  local m1; m1=$(node "$NAVJS" url); nav click '[data-testid="back"]'; sleep 3; local u2; u2=$(node "$NAVJS" url)
  local wide; wide=$(ev "innerWidth >= 600 ? 'wide' : 'phone'")
  if [ "$wide" = wide ] || { [ "${c1#/monasteries/}" != "$c1" ] && [ "$u1" = /monasteries ]; }; then
    a3 "back (header arrow)" PASS "list->$c1->back=$u1 ($wide)"; else a3 "back (header arrow)" FAIL "list->$c1->back=$u1 ($wide)"; fi
  # A-127: the eparchy's way back crosses its WebGL map - outside the lock (ios run 1 of cloud_39: the page stopped answering on the map)
  if [ "${m1#/map}" != "$m1" ] && [ "$u2" = /more/eparchies/1 ]; then a3 "back over the map (header arrow)" PASS "eparchy->$m1->back=$u2"
  else a3 "back over the map (header arrow)" OUT "eparchy->$m1->back=$u2 - the WebGL map on the way (A-127)"; fi
  a3 "back (edge swipe)" NOT-PROVABLE "a system gesture: no DOM tap reaches it - the owner's iPhone (PHONE_TEST_BACKLOG cloud_37)"
  reboot_sim   # the eparchy's mini-map (WebGL) of spot 2: the next frames from a fresh simulator (ios run 1, D12)
  guard_crash spot3
  # 3 the map online: drawn, clustered houses + the three lavras whole
  AFTER_GL=1; nav go /map; sleep 3; node "$NAVJS" drawn >> "$OUT/nav.txt" 2>&1
  node "$NAVJS" "do" fitLavras >> "$OUT/nav.txt" 2>&1; sleep 2; node "$NAVJS" drawn >> "$OUT/nav.txt" 2>&1
  v=$(ev "(() => { const m = window.__inokMap; if (!m) return 'none'; return m.queryRenderedFeatures({ layers: ['points', 'clusters', 'lavras'] }).length + ' marks drawn'; })()")
  local lv; lv=$(check lavras)
  # why a map may stay empty on a CI simulator (a VM without a GPU): the address, WebGL, the map's own «drawn»
  v="$v; at $(node "$NAVJS" url); $(ev "(() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl'); const m = Array.from(document.querySelectorAll('.maplibregl-map')).map((e) => e.dataset.drawn); const mp = window.__inokMap; const w = performance.getEntriesByType('resource').map((x) => x.name).filter((n) => /mapWorker|worker/i.test(n));
      return (g ? 'webgl ' + (g.getParameter(g.VERSION) || '?') : 'NO webgl') + ', maps drawn=' + (m.join('/') || 'none') + (mp ? ', style loaded ' + mp.isStyleLoaded() + ', loaded ' + mp.loaded()
        + ', houses source ' + (mp.getSource('monasteries') ? mp.isSourceLoaded('monasteries') : 'none') : '') + ', worker fetched ' + (w.join(' ').slice(-80) || 'no') + ', worker ' + JSON.stringify(window.__inokMapWorker || null) + ', map errors [' + (window.__inokMapErrors || []).join(' | ') + ']'; })()")"
  # A-127: the WebGL map is OUTSIDE the A-124 lock (a GPU-less runner cannot draw it): measured and written, never FAIL - proven by the Android
  # emulator, the browser set and the owner's iPhone
  [ "$lv" = ok ] && [ "${v%% *}" -gt 0 ] 2>/dev/null && a3 "map online" PASS "$v; lavras $lv" || a3 "map online" OUT "$v; lavras $lv"; shot "$OUT/a3-map__$TAG.png"
  reboot_sim   # D12: after a WebGL map the simulator's picture stays frozen / white - every later frame from a fresh simulator
  a3 "map offline" NOT-PROVABLE "the simulator shares the Mac's network (no airplane mode) - the browser ring proves the logic (map-offline, map-offline-weak x4 profiles); the owner's iPhone in airplane mode"
  guard_crash spot4
  # 4 the gallery in the app's viewer: card 242 -> «Фотогалерея» -> «1 / N» -> next -> «2 / N» -> close
  nav go /monasteries/242; node "$NAVJS" wait '[data-testid="card"]' >> "$OUT/nav.txt" 2>&1; sleep 2
  nav click '[data-testid="card"] [data-testid="photo-load"]'; sleep 3; node "$NAVJS" wait '[data-testid="card"] [data-testid="gallery"]' >> "$OUT/nav.txt" 2>&1
  nav click '[data-testid="card"] [data-testid="gallery"]'; sleep 5
  local g1 g2 g3 gs=ok; g1=$(ev "(document.querySelector('[data-testid=viewer-count]')||{}).textContent||'none'")
  sleep 2; shotof "$OUT/a3-gallery__$TAG.png" 'ion-modal.viewer [data-testid=viewer-count]' || gs=WRONG
  ev "document.querySelector('ion-modal.viewer [data-testid=viewer-next]').click(), 'ok'" > /dev/null; sleep 3
  g2=$(ev "(document.querySelector('[data-testid=viewer-count]')||{}).textContent||'none'")
  ev "document.querySelector('ion-modal.viewer [data-testid=viewer-close]').click(), 'ok'" > /dev/null; sleep 3
  g3=$(ev "document.querySelector('ion-modal.viewer:not(.overlay-hidden)') ? 'open' : 'closed'")
  case "$g1|$g2|$g3|$gs" in "1 / "*"|2 / "*"|closed|ok") a3 "gallery (app's viewer)" PASS "$g1 -> $g2 -> $g3; the frame = the viewer";; *) a3 "gallery (app's viewer)" FAIL "$g1 -> $g2 -> $g3; frame $gs";; esac
  guard_crash spot5
  # 5 «Автозавантаження фото» = «Вручну» (the select's dialog, tapped), then a card's cover waits with its button; back to Wi-Fi and mobile
  nav go /more; sleep 2; nav click '[data-testid="photos-mode"]'; sleep 2
  # the radio and «OK» in two taps (one script doing both: OK read the choice before the radio had taken it - measured in WebKit)
  ev "(() => { const b = Array.from(document.querySelectorAll('ion-alert .alert-radio-button')); b[b.length - 1].click(); return 'ok'; })()" > /dev/null; sleep 1
  ev "(() => { const ok = document.querySelectorAll('ion-alert .alert-button'); ok[ok.length - 1].click(); return 'ok'; })()" > /dev/null; sleep 2
  local pm; pm=$(ev "(async () => JSON.parse((await Capacitor.Plugins.Preferences.get({ key: 'settings' })).value || '{}').photos || 'unknown')()")
  nav go /monasteries/37; sleep 4; v=$(ev "document.querySelectorAll('.ion-page:not(.ion-page-hidden) [data-testid=photo-wait]').length")
  shot "$OUT/a3-photos-manual__$TAG.png"
  [ "$pm" = manual ] && [ "${v:-0}" -gt 0 ] 2>/dev/null && a3 "photo setting «Вручну»" PASS "setting=$pm; the card waits: $v placeholder(s)" || a3 "photo setting «Вручну»" FAIL "setting=$pm; placeholders $v"
  nav go /more; sleep 2; nav click '[data-testid="photos-mode"]'; sleep 2   # back to «Wi-Fi і мобільний» (PHOTO_MODES[1]) by the same dialog
  ev "(() => { document.querySelectorAll('ion-alert .alert-radio-button')[1].click(); return 'ok'; })()" > /dev/null; sleep 1
  ev "(() => { const ok = document.querySelectorAll('ion-alert .alert-button'); ok[ok.length - 1].click(); return 'ok'; })()" > /dev/null; sleep 2
  guard_crash spot6
  # 6 «Очистити збережені фото»: the space read (the gallery above saved photos), the button, its confirmation, the toast, the space after
  nav go /more; sleep 3; local before after
  before=$(ev "(document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=photos-used]')||{}).textContent||'none'")
  nav click '[data-testid="photos-clear"]'; sleep 2; toast_watch
  ev "(document.querySelector('ion-alert [data-testid=photos-confirm-do]')||{}).click?.(), 'ok'" > /dev/null; sleep 4; shot "$OUT/a3-photos-clear__$TAG.png"
  case "$(toasts)" in *photos-cleared\|*) v=toast;; *) v=none;; esac; sleep 2
  after=$(ev "(document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=photos-used]')||{}).textContent||'none'")
  [ "$v" = toast ] && a3 "clear saved photos" PASS "$before -> $after, the toast shown" || a3 "clear saved photos" FAIL "$before -> $after, toast: $v"
  guard_crash spot7
  # 7 search + sorts: the directory's search narrows the list; «Публікації»: search, then the sort sheet -> «за переглядами»
  nav go /monasteries; node "$NAVJS" wait '[data-testid^="mrow-"]' >> "$OUT/nav.txt" 2>&1; sleep 2
  local n0 n1; n0=$(ev "document.querySelectorAll('.ion-page:not(.ion-page-hidden) [data-testid^=mrow-]').length")
  ev "(() => { const s = document.querySelector('.ion-page:not(.ion-page-hidden) ion-searchbar[data-testid=search]'); s.value = 'Лавра'; s.dispatchEvent(new CustomEvent('ionInput', { detail: { value: 'Лавра' } })); return 'ok'; })()" > /dev/null; sleep 3
  n1=$(ev "document.querySelectorAll('.ion-page:not(.ion-page-hidden) [data-testid^=mrow-]').length"); shot "$OUT/a3-search__$TAG.png"
  nav go /articles; sleep 3; nav click '[data-testid="sort-open"]'; sleep 2
  ev "(document.querySelector('ion-action-sheet [data-testid=sort-views_week]') || {}).click?.(), 'ok'" > /dev/null; sleep 4
  local so; so=$(ev "(document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=sort-open]')||{}).dataset?.sort||'none'"); shot "$OUT/a3-sort__$TAG.png"
  [ "${n1:-0}" -gt 0 ] 2>/dev/null && [ "${n1:-0}" -lt "${n0:-0}" ] && [ "$so" = views_week ] && a3 "search + sort" PASS "list $n0 -> «Лавра» $n1; articles sort=$so" || a3 "search + sort" FAIL "list $n0 -> «Лавра» $n1; articles sort=$so"
  guard_crash spot8
  # 8 favourites survive a restart
  nav go /monasteries/242; node "$NAVJS" wait '[data-testid="fav"]' >> "$OUT/nav.txt" 2>&1
  [ "$(ev "(document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=fav]')||{}).dataset?.on")" = 1 ] || nav click '[data-testid="fav"]'; sleep 2
  launch; nav go /more/favourites; sleep 3; v=$(ev "document.querySelectorAll('.ion-page:not(.ion-page-hidden) [data-testid=mrow-242]').length"); shot "$OUT/a3-favourites__$TAG.png"
  [ "$v" = 1 ] && a3 "favourites after a restart" PASS "card 242 listed after terminate + launch" || a3 "favourites after a restart" FAIL "rows of 242: $v"
  guard_crash spot9
  # 9 a link inside an article opens the linked article in the app (R-39: 1832 -> 1833)
  nav go "/articles?id=1832"; node "$NAVJS" wait '[data-testid="article"] .card__title' >> "$OUT/nav.txt" 2>&1; sleep 2
  nav click '[data-testid="article"] .aview__body a[href*="1833"]'; sleep 4; v=$(node "$NAVJS" url)
  [ "${v#*id=1833}" != "$v" ] && a3 "link inside an article" PASS "1832 -> $v" || a3 "link inside an article" FAIL "1832 -> $v"
  guard_crash spot10
  # 10 the dark theme by the system (the app on «system»)
  nav go /more; sleep 1; nav click '[data-testid="theme-system"]'; sleep 1
  xcrun simctl ui "$U" appearance dark; sleep 3; nav go /home; sleep 3; v=$(check theme); shot "$OUT/a3-dark__$TAG.png"
  xcrun simctl ui "$U" appearance light; sleep 2
  [ "$v" = dark ] && a3 "dark theme (system)" PASS "the system dark -> the app $v" || a3 "dark theme (system)" FAIL "the system dark -> the app $v"
  guard_crash spot11
  # 11 the largest text (Dynamic Type, accessibility XXXL): what the WebView's text does; the home must not overflow sideways
  xcrun simctl ui "$U" content_size accessibility-extra-extra-extra-large; sleep 2; launch
  nav go /home; sleep 3
  v=$(ev "(() => { const fs = getComputedStyle(document.documentElement).fontSize; const ov = document.documentElement.scrollWidth > innerWidth + 1; return (ov ? 'FAIL' : 'PASS') + ' root font ' + fs + ', sideways overflow ' + ov + ', text-large ' + (document.documentElement.dataset.textLarge || '0'); })()")
  shot "$OUT/a3-font-largest__$TAG.png"; a3 "largest system text" "${v%% *}" "${v#* } (Dynamic Type accessibility-XXXL)"
  xcrun simctl ui "$U" content_size large; launch
  guard_crash spot12
  # 12 «Перевірити оновлення»: the App Store's answer under the row
  nav go /more/about; sleep 2; nav click '[data-testid="about-update"]'; sleep 6
  v=$(ev "(document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=about-update-note]')||{}).textContent||'none'"); shot "$OUT/a3-update__$TAG.png"
  [ "$v" != none ] && a3 "update check" PASS "«${v}»" || a3 "update check" FAIL "no answer under the row"
  guard_crash spot13
  # 13 the social block (A-120 (1)) and an outside link: «Про застосунок» -> Telegram -> the system's Safari view over the app
  nav go /more/about; sleep 2; nav scroll '[data-testid="social"]'; sleep 1; shot "$OUT/a3-social__$TAG.png"
  v=$(ev "Array.from(document.querySelectorAll('.ion-page:not(.ion-page-hidden) [data-testid=social] a')).map((a) => a.textContent + '=' + a.getAttribute('href')).join(' ')")
  nav click '[data-testid="social-telegram"]'; sleep 6; shot "$OUT/a3-external__$TAG.png"
  case "$v" in *Telegram=https://t.me/inokinfo*Facebook=*Instagram=*) a3 "social block + outside link" PASS "$v; the Safari view = a3-external__$TAG.png";; *) a3 "social block + outside link" FAIL "$v";; esac
  launch
  guard_crash spot14
  # 14 A1 (A-124: «оцінки й лайки не ставляться» on iOS): a star and a like on article 1833 (it has comments) - the server's own answer read back
  nav go "/articles?id=1833"; node "$NAVJS" wait '[data-testid="article"] [data-testid="rating"]' >> "$OUT/nav.txt" 2>&1; sleep 4
  # ios run 1: the A2 offer («Повідомляти про нові публікації?») comes over the first opened article (as on Android) - read (the A2 evidence)
  # and answered «Ні, дякую» before the star
  OFFER14=$(ev "(() => { const a = Array.from(document.querySelectorAll('ion-alert.soft-ask--articles')).find((e) => !e.classList.contains('overlay-hidden')); return a ? 'offer: ' + a.querySelector('.alert-title')?.textContent + ' / ' + Array.from(a.querySelectorAll('.alert-button')).map((b) => b.textContent.trim()).join(' | ') : 'no offer'; })()")
  shotof "$OUT/a3-push-offer__$TAG.png" 'ion-alert.soft-ask--articles' > /dev/null
  ev "(() => { const b = Array.from(document.querySelectorAll('ion-alert.soft-ask:not(.overlay-hidden) .alert-button')).pop(); b && b.click(); return 'ok'; })()" > /dev/null; sleep 2
  local r0 r1 rt v0 v1 vs
  r0=$(ev "(document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=star-5]')||{}).disabled ? 'cast before' : 'open'")
  ev "window.__inokLastCast = null, 'ok'" > /dev/null; toast_watch
  nav click '[data-testid="article"] [data-testid="star-5"]'; sleep 3
  rt=$(toasts)
  r1=$(ev "(() => { const s = document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=star-5]'); return (s && s.dataset.lit === '1' ? 'lit' : 'not lit') + '; server ' + (window.__inokLastCast || 'ok'); })()")
  shot "$OUT/a3-rating__$TAG.png"
  # A-127: a simulator has no App Attest (isSupported = false) - the ring checks the HONEST line there (`cast.ios`, never «try again»); the
  # live cast with an assertion is the owner's iPhone (PHONE_TEST_BACKLOG cloud_39), outside the lock
  case "$r1|$(honest "$rt")" in "not lit; server 403 integrity_required|yes") a3 "rating cast (A1)" PASS "$r0 -> $r1; the honest line «${rt}»";;
    *) a3 "rating cast (A1)" FAIL "$r0 -> $r1; toast «${rt}»";; esac
  nav scroll '[data-testid^="vote-up-"]'; sleep 2
  ev "window.__inokLastCast = null, 'ok'" > /dev/null
  v0=$(ev "(document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid^=vote-up-]')||{}).dataset?.mine || 'none'")
  nav click '[data-testid^="vote-up-"]'; sleep 3   # the vote's status line lives 6 s (CommentsBlock): read inside it
  v1=$(ev "((document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid^=vote-up-]')||{}).dataset?.mine || 'none') + '; server ' + (window.__inokLastCast || 'ok')")
  vs=$(ev "(document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=vote-status]')||{}).textContent || ''")
  shot "$OUT/a3-like__$TAG.png"
  case "$v0|$v1|$(honest "$vs")" in "n|n; server 403 integrity_required|yes") a3 "comment like (A1)" PASS "mine $v0 -> $v1; the honest line «${vs}»";;
    *) a3 "comment like (A1)" FAIL "mine $v0 -> $v1; «${vs}»";; esac
  a3 "App Attest cast (A1)" NOT-PROVABLE "no App Attest on a simulator (isSupported false) - the stars / like with an assertion: the owner's iPhone from TestFlight (A-127; unit appAttest.test.ts proves the client)"
  guard_crash spot15
  # 15 A2: the soft offer (read in spot 14) and «Ще → Сповіщення»
  v="$OFFER14"   # spot 14 met the offer over the first opened article - THE moment Android asks (a re-ask after a reset is not the rule)
  case "$v" in offer:*) a3 "notifications offer (A2)" PASS "$v (over the first opened article, as on Android)";; *) a3 "notifications offer (A2)" FAIL "$v";; esac
  ev "(() => { const b = Array.from(document.querySelectorAll('ion-alert.soft-ask--articles .alert-button')).pop(); b && b.click(); return 'ok'; })()" > /dev/null; sleep 2   # «Ні, дякую»
  nav go /more/notifications; sleep 3
  v=$(ev "(document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=push-status]')||{}).textContent || 'none'")
  shotof "$OUT/a3-notifications__$TAG.png" '[data-testid=push-list]' > /dev/null
  [ "$v" != none ] && a3 "«Сповіщення» screen (A2)" PASS "«${v}»" || a3 "«Сповіщення» screen (A2)" FAIL "no status line"
  a3 "system permission prompt + delivery (A2)" NOT-PROVABLE "a simulator shows no APNs prompt result / no FCM delivery - the owner's iPhone (PHONE_TEST_BACKLOG cloud_38)"
  # 16 A8 (A-124 «все, що забаговано»): EVERY screen of the app - the frame, its pixels (never blank), no crash, the page's title on top
  local sc path name
  for sc in home:/home monasteries:/monasteries card:/monasteries/242 map:/map streams:/streams articles:/articles article:/articles?id=1832 \
    more:/more favourites:/more/favourites language:/more/language notifications:/more/notifications commission:/more/commission \
    contacts:/more/contacts eparchies:/more/eparchies eparchy:/more/eparchies/1 about:/more/about; do
    name="${sc%%:*}"; path="${sc#*:}"; guard_crash "a8-$name"
    case "$name" in map|eparchy|contacts) AFTER_GL=1;; esac   # a WebGL map (or mini-map) on this screen
    nav go "$path"; sleep 5; [ "$name" = map ] && node "$NAVJS" drawn >> "$OUT/nav.txt" 2>&1
    # an A2 offer left open (a modal over every screen until answered - ios run 2's sheet) is answered «Ні, дякую» before the frame
    ev "(() => { Array.from(document.querySelectorAll('ion-alert.soft-ask:not(.overlay-hidden)')).forEach((a) => Array.from(a.querySelectorAll('.alert-button')).pop()?.click()); return 'ok'; })()" > /dev/null; sleep 2
    v=$(ev "(() => { const pg = Array.from(document.querySelectorAll('ion-tabs ion-router-outlet > .ion-page')).filter((x) => !x.classList.contains('ion-page-hidden')).pop(); if (!pg) return 'no page';
      const t = Array.from(pg.querySelectorAll('[data-testid=page-title], ion-title')).find((e) => e.getClientRects().length > 0); const ov = document.documentElement.scrollWidth > innerWidth + 1;
      return (document.querySelector('[data-testid=crash]') ? 'CRASH' : 'ok') + ' title «' + ((t && t.textContent) || '').trim().slice(0, 40) + '» ' + (ov ? 'SIDEWAYS' : 'fits') + ' ' + location.pathname + location.search; })()")
    shot "$OUT/a8-${name}__$TAG.png"; local p; p=$("${PY:-python3}" -I "$ROOT/scripts/store_png.py" --paint "$OUT/a8-${name}__$TAG.png" 2>/dev/null || echo '?')
    # ios run 1 (cloud_39): «Мова» on an iPad is a white page with 3 rows - 99 % one colour is a sparse page, not a blank one; only 100 % is
    case "$p" in "BLANK (100%"*) ;; BLANK*) p="ok (sparse: ${p#BLANK })";; esac
    local ok8=no; case "$v|$p" in "ok title «"*"» fits "*"|ok"*) ok8=yes;; esac
    # A-127: a screen WITH a WebGL map (the map; the eparchy's and «Контакти»'s mini-maps) whose page stopped answering or painting is outside
    # the lock (ios run 2 of cloud_39: «Контакти» on the iPad 26.5 - no answer, white); its DOM checks count whenever the page answers
    local gl8=no; case "$name" in map) gl8=yes;; eparchy|contacts) [ -z "$v" ] && gl8=yes;; esac
    if [ "$gl8" = yes ] && [ "$ok8" = no ]; then
      a3 "screen $name (A8)" OUT "${v:-no answer from the page}; pixels $p - a WebGL map on this screen (A-127: outside the lock)"; else
    case "$v|$p|$AFTER_GL" in "ok title «"*"» fits "*"|ok"*) a3 "screen $name (A8)" PASS "$v; pixels $p";;
      "ok title «"*"» fits "*"|1") a3 "screen $name (A8)" OUT "$v; pixels $p - the picture after a WebGL map (A-127: outside the lock; the DOM checks passed)";;
      *) a3 "screen $name (A8)" FAIL "$v; pixels $p";; esac
    fi
    case "$name" in map|eparchy|contacts) reboot_sim;; esac   # a WebGL map on screen: the next frame from a fresh simulator (D12)
  done
  a3 "VoiceOver" NOT-PROVABLE "the simulator has no VoiceOver - names / roles / order are the a11y tree of the same DOM (axe 0); the owner's iPhone"
  a3 "share sheet / call / directions (Apple Maps)" NOT-PROVABLE "system sheets and other apps - the owner's iPhone"
}

# ---- the App Store set (newest runtime only): the frames of store_frames.txt, uk / ru / en, the LIVE export
appstore() { # set(phone|tablet) dir-name
  local lang
  ev "(async () => { const P = Capacitor.Plugins.Preferences; const v = (await P.get({ key: 'settings' })).value;
    const s = Object.assign(v ? JSON.parse(v) : {}, { theme: 'light', photos: 'any', asked: ['articles', 'streams'], ownDevice: true });
    await P.set({ key: 'settings', value: JSON.stringify(s) }); return 'ok'; })()" > /dev/null
  launch
  # cloud_40 (A-129, C1): THE device's own layout numbers for the browser frames 04 / 05 - the safe-area insets (env), the root text size
  # (WKWebView follows -apple-system-body), the CSS viewport and the scale; the join (scripts/appstore_join.py) cuts the marks at THESE edges
  mkdir -p "$OUT/appstore"
  ev "(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.append(d); const c = getComputedStyle(d); const r = { top: parseFloat(c.paddingTop), right: parseFloat(c.paddingRight), bottom: parseFloat(c.paddingBottom), left: parseFloat(c.paddingLeft),
    rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize), w: innerWidth, h: innerHeight, dpr: devicePixelRatio }; d.remove(); return JSON.stringify(r); })()" > "$OUT/appstore/insets-$2.json"
  for lang in uk ru en; do
    set_lang "$lang"; units_ok "$lang" || return 1
    # A-127: the App Store set goes WITHOUT 04-eparchy / 05-map - a GPU-less runner's simulator cannot draw a WebGL map (ios run 1, D12);
    # phone 6, iPad 5 per language (Apple takes 1-10); those two frames: the owner's iPhone or the browser engine (REPORT cloud_39 C2)
    STORE_SKIP='eparchy|map' shoot_frames "$1" "$OUT/appstore/$lang/$2" "$lang" || return 1
  done
}

node "$ROOT/scripts/ios_relay.mjs" > "$OUT/relay.log" 2>&1 &
RELAY=$!
trap 'kill $RELAY 2>/dev/null' EXIT
RC=0
KINDS="iPhone iPad"; case "$DEV" in iphone) KINDS=iPhone;; ipad) KINDS=iPad;; esac
for kind in $KINDS; do
  TAG="$(echo "$kind" | tr 'A-Z' 'a-z')"
  DT="$(devtype "$kind")"; [ -n "$DT" ] || { echo "::error::no $kind for $RTID"; RC=1; continue; }
  U="$(xcrun simctl create "inok-$TAG-$WHICH" "${DT%%|*}" "$RTID")"
  echo "== $TAG: ${DT#*|} on iOS $RTV ($U)" | tee -a "$OUT/runtimes.txt"
  xcrun simctl boot "$U"; xcrun simctl bootstatus "$U" -b > /dev/null
  xcrun simctl ui "$U" appearance light
  sb_override
  xcrun simctl location "$U" set 50.4344,30.5571 2>>"$OUT/nav.txt" || true   # the Lavra: «Поруч»
  xcrun simctl install "$U" "$APP"
  xcrun simctl privacy "$U" grant location "$BUNDLE" 2>>"$OUT/nav.txt" || true
  if ! launch; then a3 "start" FAIL "no «home painted» / no remote hand - ${TAG}_console.txt"; RC=1; xcrun simctl shutdown "$U"; continue; fi
  a3 "start + live import" PASS "$(grep -a 'InokBoot' "$OUT/${TAG}_console.txt" | tail -2 | sed 's/.*InokBoot: //' | tr '\n' ';' | cut -c1-200)"
  case "$MODE" in walk|both) a3_walk;; esac
  case "$MODE" in appstore|both)
    if [ "$kind" = iPhone ]; then appstore phone iphone; else appstore tablet ipad; fi || { echo "App Store set STOPPED ($TAG): $(grep -E 'FAIL' "$OUT/nav.txt" | tail -1)" | tee -a "$OUT/demo.txt"; RC=1; };;
  esac
  xcrun simctl shutdown "$U" || true
done
if [ "$MODE" = appstore ] || [ "$MODE" = both ]; then
  "${PY:-python3}" -I "$ROOT/scripts/store_png.py" --appstore "$OUT/appstore" "$(echo "$KINDS" | tr 'A-Z' 'a-z')" | tee "$OUT/sizes.txt"
  store_summary | tee -a "$OUT/sizes.txt"
  # A-124 / E11: the set counts only when whole and every read-back clean (every summary line «…: 0»)
  grep -q 'store screenshots: PASS' "$OUT/sizes.txt" || RC=1
  grep -E ': [1-9][0-9]*$' "$OUT/sizes.txt" | grep -v '^on air' && RC=1
fi
# A-124: a walk with ANY FAIL spot is red - the TestFlight upload of this run waits for every simulator job to be green
if grep -q '| FAIL |' "$A3" 2>/dev/null; then echo "::error::A3: $(grep -c '| FAIL |' "$A3") spot(s) FAIL - $A3"; RC=1; fi
exit $RC
