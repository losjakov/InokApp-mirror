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
  # ios run 2 of cloud_40: Xcode 26.6 refused all four («Invalid, non-ISO date/time string» / «Invalid argument») - once NONE is written,
  # the forms are not tried again before every frame (the rest of the override still is)
  grep -q 'NONE' "$OUT/statusbar.txt" 2>/dev/null && { xcrun simctl status_bar "$U" override "${a[@]}" 2>>"$OUT/nav.txt" || true; return 0; }
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

# ---- the runtime: the newest iOS the runner has; «oldest» (A-169, cloud_45) = the LOWEST rung of OLDEST_LADDER whose simulator STARTS
# this Xcode's simulator build - measured in every run (the device loop below), each rung present or downloaded, each refusal written with
# the loader's own line. Xcode 26.6 (macos-26): its simulator app links SwiftUICore (iOS 18+) - 16.4 printed «dyld: Library not loaded:
# SwiftUICore» (cloud_44, ios 45037644332 / 45052241324); 15.5 «is not available for download». iOS 15-17 = the archive check (ios.yml:
# «release links SwiftUICore: none», minimumOS 15.0) + TestFlight on real phones. The rungs: ref/REF_ios_state.md
OLDEST_LADDER="17.5 18.0 18.6"
runtimes() { xcrun simctl list runtimes -j | python3 -I -c '
import json, sys
rs = [r for r in json.load(sys.stdin)["runtimes"] if r.get("platform", "iOS") == "iOS" and r.get("isAvailable")]
rs.sort(key=lambda r: [int(x) for x in r["version"].split(".")])
for r in rs: print(r["identifier"], r["version"], len(r.get("supportedDeviceTypes", [])))'; }
{ echo "== Xcode: $(xcodebuild -version | tr '\n' ' ')"; echo "== iOS runtimes available at start:"; runtimes; } > "$OUT/runtimes.txt"
# one rung: iOS $1 present (its version or $1.x), else downloaded now -> RTID / RTV; exit 1 = not to be had on this runner (written)
rung() {
  local v="$1" r; r="$(runtimes | awk -v v="$v" '$2 == v || index($2, v ".") == 1 { print $1 " " $2; exit }')"
  if [ -z "$r" ]; then
    echo "== download iOS $v: xcodebuild -downloadPlatform iOS -buildVersion $v" >> "$OUT/runtimes.txt"
    # macOS has no `timeout`: perl's alarm stops each download after 15 min
    if perl -e 'alarm shift; exec @ARGV' 900 xcodebuild -downloadPlatform iOS -buildVersion "$v" > "$OUT/download-$v.log" 2>&1; then echo "   downloaded" >> "$OUT/runtimes.txt"
    else echo "   FAILED (exit $?): $(grep -iE 'error|not|unable|unsupported' "$OUT/download-$v.log" | head -3 | tr '\n' ' ' | cut -c1-300)" >> "$OUT/runtimes.txt"; return 1; fi
    r="$(runtimes | awk -v v="$v" '$2 == v || index($2, v ".") == 1 { print $1 " " $2; exit }')"
  fi
  [ -n "$r" ] || { echo "   iOS $v: not in the runtime list after the download" >> "$OUT/runtimes.txt"; return 1; }
  RTID="${r%% *}"; RTV="${r#* }"
}
RTID=""; RTV=""
if [ "$WHICH" != oldest ]; then
  RT="$(runtimes | tail -1 | awk '{print $1" "$2}')"; RTID="${RT%% *}"; RTV="${RT#* }"
  echo "== chosen ($WHICH): $RTID ($RTV)" | tee -a "$OUT/runtimes.txt"
  [ -n "$RTID" ] || { echo "::error::no iOS runtime"; exit 1; }
fi
# the device types this runtime serves: the NEWEST biggest iPhone (Pro Max: 1320 x 2868 = Apple's 6.9") and iPad (Pro 13": 2064 x 2752)
devtype() { xcrun simctl list runtimes -j | python3 -I -c '
import json, re, sys
rid, kind = sys.argv[1], sys.argv[2]
r = next(r for r in json.load(sys.stdin)["runtimes"] if r["identifier"] == rid)
six3 = kind == "iPhone63"  # cloud_41 (E): the 6.3-inch iPhone Pro (1206 x 2622) - the REQUIRED «medium display» size of App Store Connect
ts = [t for t in r.get("supportedDeviceTypes", []) if t["name"].startswith("iPhone" if six3 else kind)]
pref = ([t for t in ts if re.search(r"^iPhone \d+ Pro$", t["name"])] if six3 else
        [t for t in ts if re.search(r"Pro Max|Pro 13", t["name"])] or [t for t in ts if re.search(r"Plus|Pro \(12\.9", t["name"])])
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
launch() { # (re)start the app with its console captured; wait for a NEW «home painted» and for the remote hand to ask the relay
  # cloud_41 (NOTE 2 of REVIEW cloud_40, «favourites after a restart: rows of 242: 2»): the console file is APPENDED across launches, so
  # `grep -q 'home painted'` matched the PREVIOUS start at once and the relay's health was still the old process's - the spot could read
  # the app while it was going down / coming up (two pages in the DOM). Now: the count of «home painted» lines must GROW.
  local n0; n0=$(grep -c 'home painted' "$OUT/${TAG}_console.txt" 2>/dev/null || true); n0=${n0:-0}
  xcrun simctl terminate "$U" "$BUNDLE" > /dev/null 2>&1 || true
  xcrun simctl launch --console-pty --terminate-running-process "$U" "$BUNDLE" -AppleLanguages '(uk)' -AppleLocale uk_UA >> "$OUT/${TAG}_console.txt" 2>&1 &
  # cloud_44 (REVIEW cloud_43 backlog): `grep -c … || echo 0` printed «0» TWICE (grep prints 0 and exits 1) -> «[: 0\n0: integer expression
  # expected»; the same form as n0 above. The OLDEST runtime's FIRST launch (iOS 16.4 iPad «start» timed out twice on 22.11: a cold simulator
  # compiles the WebKit caches) waits up to 300 s, every other launch 180 s; the time it took is written down (measured, not guessed)
  # cloud_44 (ios 45031613354: iPhone AND iPad 16.4 - a runtime DOWNLOADED in the job - printed nothing for 318 s): the first launch waits 600 s
  local tries=90 t0=$SECONDS n _; if [ "$WHICH" = oldest ] && [ "${FIRST_LAUNCH_DONE:-}" != "$TAG" ]; then tries=300; fi; FIRST_LAUNCH_DONE="$TAG"
  # cloud_45 (E6 of cloud_44 - read the console first): the loader's refusal ends the wait at once (exit 2 - the runtime cannot start this
  # build; the oldest rung is then the next one), never 600 s of «nothing painted»
  for _ in $(seq 1 "$tries"); do n=$(grep -c 'home painted' "$OUT/${TAG}_console.txt" 2>/dev/null || true); [ "${n:-0}" -gt "$n0" ] && break
    if grep -aqE 'Library not loaded|Symbol not found' "$OUT/${TAG}_console.txt" 2>/dev/null; then
      echo "launch $TAG: the loader refused after $((SECONDS - t0)) s - $(grep -aE -m1 'Library not loaded|Symbol not found' "$OUT/${TAG}_console.txt" | cut -c1-200)" >> "$OUT/nav.txt"; return 2; fi
    sleep 2; done
  echo "launch $TAG: home painted after $((SECONDS - t0)) s (limit $((tries * 2)) s)" >> "$OUT/nav.txt"
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

# an A2 offer still open (ion-alert.soft-ask: «Повідомляти …?», a modal over every screen until answered) is answered «Ні, дякую» - THE one
# copy of that tap (spot 14, the A8 frames, the live tap); the answer is the app's own (asked once, kept)
answer_offers() { ev "(() => { Array.from(document.querySelectorAll('ion-alert.soft-ask:not(.overlay-hidden)')).forEach((a) => Array.from(a.querySelectorAll('.alert-button')).pop()?.click()); return 'ok'; })()" > /dev/null; sleep 2; }

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
  # release ios run of cloud_40: the plugin's answer is a Swift dictionary - its KEY ORDER is random per launch ({"os":…,"supported":false}
  # failed a pattern that wanted «supported» first) -> the answer is read by its keys, never by their order
  case "$v" in *UNIMPLEMENTED*|*'not implemented'*|*REJECT*) a3 "local plugins answer (A1)" FAIL "$v";;
    'AppAttest={'*'"supported":'*'; FcmTopics='*) a3 "local plugins answer (A1)" PASS "$v";;
    *) a3 "local plugins answer (A1)" FAIL "${v:-no answer}";; esac
  # cloud_43 (T9, A-156 (3)): the widgets' REVIEW snapshots - the SAME WidgetBody the extension draws, from the App Group data the app wrote
  # (InokWidgets.set), rendered in the app (ImageRenderer, iOS 16+) and copied out of its container; informational (the REPORT's frames)
  # cloud_44: the simulator build weak-links SwiftUICore (Xcode 26; absent before iOS 18) - SwiftUI drawing cannot run on an older SIMULATOR
  # runtime; the release binary needs no SwiftUICore (ios.yml archive check) - iOS 16 / 17 widgets = the owner's phone
  if [ "${RTV%%.*}" -lt 17 ] 2>/dev/null; then v="skipped on iOS $RTV (the simulator build's weak SwiftUICore)"; else
  v=$(ev "Capacitor.Plugins.InokWidgets.snapshot().then((x) => JSON.stringify(x)).catch((e) => 'REJECT ' + String((e && e.message) || e))"); fi
  local wc wd; wc="$(xcrun simctl get_app_container "$U" "$BUNDLE" data 2>/dev/null || true)"; wd="$OUT/widgets-$TAG"; mkdir -p "$wd"
  [ -n "$wc" ] && cp "$wc"/Documents/widgets/*.png "$wd/" 2>/dev/null
  # 1.0.18: kind x small / medium / large x light / dark x (the app's data + the gallery sample uk / ru / en) = 72 (the kit's acceptance sheets)
  if [ "$(find "$wd" -name '*.png' | wc -l | tr -d ' ')" -ge 72 ]; then a3 "widgets snapshot (A-163)" PASS "$v"; else a3 "widgets snapshot (A-163)" NOT-PROVABLE "${v:-no answer}"; fi
  # cloud_44 A-166: the gallery links through THE router - the system's hand-over (Universal Links of the short forms need the site's AASA after
  # the release, A-166 (4)): the card, ITS gallery on top «1 / N»; the viewer closed -> the card
  local f; for f in 'https://inok.info/ru/242/g' 'https://inok.info/monasteries/242/?lang=ru&gallery=Y'; do
    nav go /home; sleep 2
    ev "(window.dispatchEvent(new CustomEvent('inok-url-open', { detail: '$f' })), 'ok')" > /dev/null
    v=no; for _ in 1 2 3 4 5 6 7 8 9 10; do v=$(ev "(() => { const c = document.querySelector('ion-modal.viewer:not(.overlay-hidden) [data-testid=viewer-count]'); return (location.pathname === '/monasteries/242' && c) ? c.textContent.trim() : 'no'; })()"); [ "$v" != no ] && break; sleep 2; done
    shot "$OUT/a3-link-gallery-$(echo "$f" | tr -c 'a-z0-9' '_' | cut -c1-40)__$TAG.png"
    ev "(document.querySelector('ion-modal.viewer [data-testid=viewer-close]') || {}).click?.(), 'ok'" > /dev/null; sleep 2
    local back; back=$(ev "(() => (document.querySelector('ion-modal.viewer:not(.overlay-hidden)') ? 'open' : 'closed') + ' ' + location.pathname)()")
    case "$v $back" in *' / '*' closed /monasteries/242') a3 "gallery link $f (A-166)" PASS "viewer $v; closed -> $back";; *) a3 "gallery link $f (A-166)" FAIL "viewer $v; after close $back";; esac
  done
  # cloud_45 (ring 45062829310: «Перевірка Apple» FAIL x4, its frame = «Головна»): the link router PUSHED the card (pushedByRoute /home) and the
  # remote hand's `go` is a popstate - Ionic's router reads a POP over a pushed route as BACK (-> /home, never /more/about). The person's way
  # out first: the card's own arrow (-> /home); every `go` after it is a plain one
  nav click '[data-testid="back"]'; sleep 3
  echo "after the gallery links, the card's arrow -> $(node "$NAVJS" url)" >> "$OUT/nav.txt"
  # 0b cloud_40 (A1 g): «Про застосунок» - «Перевірка Apple: …» on a simulator = «not supported by this device» (Apple's own answer), never
  # «the call failed» (= the plugin not in the bridge); «Скопіювати подробиці» shows the text (no key id / install id in it)
  nav go /more/about; sleep 3
  # release ios run 1 of cloud_40: one tap lost while the page entered («no details») - tapped again until the copied text shows (<= 3)
  local t; for t in 1 2 3; do nav click '[data-testid="attest-copy"]'; sleep 2
    [ "$(ev "document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=attest-details]') ? 'yes' : 'no'")" = yes ] && break; done
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
  # cloud_41 (NOTE 3 of REVIEW cloud_40): the verdict is read HERE, before the eparchy page - its embedded WebGL mini-map stops a GPU-less
  # simulator answering (relay 504 x N, ios 44075276669 / 44107648718 iOS 16.4 iPad, 44166204628 iOS 26.5 iPad) and the old spot read the
  # width AFTER it (empty = FAIL) although list -> card -> back had already returned to /monasteries. A tablet opens the card in its
  # second pane (`/monasteries?code=N`), a phone as its own page (`/monasteries/N`).
  local wide; wide=$(ev "innerWidth >= 600 ? 'wide' : 'phone'")
  if [ "$u1" = /monasteries ] && { [ "${c1#/monasteries/}" != "$c1" ] || [ "${c1#/monasteries?code=}" != "$c1" ]; }; then
    a3 "back (header arrow)" PASS "list->$c1->back=$u1 ($wide)"; else a3 "back (header arrow)" FAIL "list->$c1->back=$u1 ($wide)"; fi
  nav go /more/eparchies/1; node "$NAVJS" wait '[data-testid="eparchy-title"]' >> "$OUT/nav.txt" 2>&1; sleep 2; AFTER_GL=1; nav click '[data-testid="eparchy-map"]'; sleep 4
  node "$NAVJS" drawn >> "$OUT/nav.txt" 2>&1; sleep 2
  local m1; m1=$(node "$NAVJS" url); nav click '[data-testid="back"]'; sleep 3; local u2; u2=$(node "$NAVJS" url)
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
  nav go /more; nav wait '[data-testid="photos-mode"]'; nav click '[data-testid="photos-mode"]'; sleep 2
  # the radio and «OK» in two taps (one script doing both: OK read the choice before the radio had taken it - measured in WebKit)
  ev "(() => { const b = Array.from(document.querySelectorAll('ion-alert .alert-radio-button')); b[b.length - 1].click(); return 'ok'; })()" > /dev/null; sleep 1
  ev "(() => { const ok = document.querySelectorAll('ion-alert .alert-button'); ok[ok.length - 1].click(); return 'ok'; })()" > /dev/null; sleep 2
  local pm; pm=$(ev "(async () => JSON.parse((await Capacitor.Plugins.Preferences.get({ key: 'settings' })).value || '{}').photos || 'unknown')()")
  nav go /monasteries/37; sleep 4; v=$(ev "document.querySelectorAll('.ion-page:not(.ion-page-hidden) [data-testid=photo-wait]').length")
  shot "$OUT/a3-photos-manual__$TAG.png"
  [ "$pm" = manual ] && [ "${v:-0}" -gt 0 ] 2>/dev/null && a3 "photo setting «Вручну»" PASS "setting=$pm; the card waits: $v placeholder(s)" || a3 "photo setting «Вручну»" FAIL "setting=$pm; placeholders $v"
  nav go /more; nav wait '[data-testid="photos-mode"]'; nav click '[data-testid="photos-mode"]'; sleep 2   # back to «Wi-Fi і мобільний» (PHOTO_MODES[1]) by the same dialog
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
  nav go /articles; nav wait '[data-testid="sort-open"]'; nav click '[data-testid="sort-open"]'; sleep 2
  ev "(document.querySelector('ion-action-sheet [data-testid=sort-views_week]') || {}).click?.(), 'ok'" > /dev/null; sleep 4
  local so; so=$(ev "(document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=sort-open]')||{}).dataset?.sort||'none'"); shot "$OUT/a3-sort__$TAG.png"
  [ "${n1:-0}" -gt 0 ] 2>/dev/null && [ "${n1:-0}" -lt "${n0:-0}" ] && [ "$so" = views_week ] && a3 "search + sort" PASS "list $n0 -> «Лавра» $n1; articles sort=$so" || a3 "search + sort" FAIL "list $n0 -> «Лавра» $n1; articles sort=$so"
  guard_crash spot8
  # 8 favourites survive a restart
  nav go /monasteries/242; node "$NAVJS" wait '[data-testid="fav"]' >> "$OUT/nav.txt" 2>&1
  [ "$(ev "(document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=fav]')||{}).dataset?.on")" = 1 ] || nav click '[data-testid="fav"]'; sleep 2
  # cloud_41 (A-133 C3): «Я тут був» on the same card, read back after the SAME restart below (the mark lives in the app's own table)
  [ "$(ev "(document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=visited]')||{}).dataset?.on")" = 1 ] || nav click '[data-testid="visited"]'; sleep 2
  # cloud_41 (NOTE 2): rows of 242 on the TOP page (the last shown), read until the page has settled (<= 3 reads, 2 s apart)
  launch; nav go /more/favourites; sleep 3; local k; for k in 1 2 3; do
    v=$(ev "(() => { const ps = Array.from(document.querySelectorAll('.ion-page:not(.ion-page-hidden)')).filter((e) => e.querySelector('[data-testid=fav-empty], [data-testid^=mrow-]')); const top = ps[ps.length - 1]; return top ? top.querySelectorAll('[data-testid=mrow-242]').length + (ps.length > 1 ? ' (' + ps.length + ' pages shown)' : '') : 'no page'; })()")
    case "$v" in 1|'1 ('*) break;; esac; sleep 2; done; shot "$OUT/a3-favourites__$TAG.png"
  # cloud_41 ios run 44243995446 (iOS 16.4 iPad): «1 (3 pages shown)» - the remote hand's `go` (pushState + popstate) leaves earlier pages in the
  # DOM without `ion-page-hidden` (Home's «near me» lists 242 too: the old «rows of 242: 2»); the TOP page decides, the page count is written
  case "$v" in 1|'1 ('*) a3 "favourites after a restart" PASS "card 242 listed once on the top page after terminate + launch: $v";; *) a3 "favourites after a restart" FAIL "rows of 242 on the top page: $v";; esac
  # cloud_41 (A-133 C3): «Я тут був» after the same restart - «Ще -> Я тут був»: the row of 242 and «Відвідано 1 з N»
  nav go /more/visited; sleep 3; for k in 1 2 3; do
    v=$(ev "(() => { const ps = Array.from(document.querySelectorAll('.ion-page:not(.ion-page-hidden)')).filter((e) => e.querySelector('[data-testid=visited-count]')); const top = ps[ps.length - 1]; return top ? top.querySelectorAll('[data-testid=mrow-242]').length + ' | ' + top.querySelector('[data-testid=visited-count]').textContent : 'no page'; })()")
    case "$v" in '1 | Відвідано '*' з '*) break;; esac; sleep 2; done; shot "$OUT/a3-visited__$TAG.png"
  case "$v" in '1 | Відвідано '*' з '*) a3 "«Я тут був» after a restart" PASS "$v";; *) a3 "«Я тут був» after a restart" FAIL "${v:-no answer}";; esac
  a3 "quick actions on the icon" NOT-PROVABLE "a Home Screen gesture (long press) has no simctl command - the owner's iPhone (PHONE_TEST_BACKLOG cloud_41); the router = the browser ring (quick-cold-* / quick-warm-*)"
  a3 "the store's rating window" NOT-PROVABLE "StoreKit decides alone whether it shows - the rule = unit reviewAsk, the moment = the browser ring (review-moment)"
  guard_crash spot9
  # 9 a link inside an article opens the linked article in the app (R-39: 1832 -> 1833)
  nav go "/articles?id=1832"; node "$NAVJS" wait '[data-testid="article"] .card__title' >> "$OUT/nav.txt" 2>&1; sleep 2
  nav click '[data-testid="article"] .aview__body a[href*="1833"]'; sleep 4; v=$(node "$NAVJS" url)
  [ "${v#*id=1833}" != "$v" ] && a3 "link inside an article" PASS "1832 -> $v" || a3 "link inside an article" FAIL "1832 -> $v"
  guard_crash spot10
  # 10 the dark theme by the system (the app on «system»)
  nav go /more; nav wait '[data-testid="theme-system"]'; nav click '[data-testid="theme-system"]'; sleep 1
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
  nav go /more/about; nav wait '[data-testid="about-update"]'; nav click '[data-testid="about-update"]'; sleep 6
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
  answer_offers
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
  nav click '[data-testid^="vote-up-"]'
  # cloud_43 (T14; ios 44907976664 newest iPhone: the status read EMPTY at a fixed +3 s): the status line (it lives 6 s) is WAITED for
  local _; vs=''; for _ in 1 2 3 4 5 6 7 8 9 10; do sleep 0.5
    vs=$(ev "(document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=vote-status]')||{}).textContent || ''"); [ -n "$vs" ] && break; done
  v1=$(ev "((document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid^=vote-up-]')||{}).dataset?.mine || 'none') + '; server ' + (window.__inokLastCast || 'ok')")
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
    answer_offers   # an A2 offer left open (a modal over every screen until answered - ios run 2's sheet): «Ні, дякую» before the frame
    v=$(ev "(() => { const pg = Array.from(document.querySelectorAll('ion-tabs ion-router-outlet > .ion-page')).filter((x) => !x.classList.contains('ion-page-hidden')).pop(); if (!pg) return 'no page';
      const t = Array.from(pg.querySelectorAll('[data-testid=page-title], ion-title')).find((e) => e.getClientRects().length > 0); const ov = document.documentElement.scrollWidth > innerWidth + 1;
      return (document.querySelector('[data-testid=crash]') ? 'CRASH' : 'ok') + ' title «' + ((t && t.textContent) || '').trim().slice(0, 40) + '» ' + (ov ? 'SIDEWAYS' : 'fits') + ' ' + location.pathname + location.search; })()")
    shot "$OUT/a8-${name}__$TAG.png"; local p; p=$("${PY:-python3}" -I "$ROOT/scripts/store_png.py" --paint "$OUT/a8-${name}__$TAG.png" 2>/dev/null || echo '?')
    # ios run 1 (cloud_39): «Мова» on an iPad is a white page with 3 rows - 99 % one colour is a sparse page, not a blank one; only 100 % is
    case "$p" in "BLANK (100%"*) ;; BLANK*) p="ok (sparse: ${p#BLANK })";; esac
    local ok8=no; case "$v|$p" in "ok title «"*"» fits "*"|ok"*) ok8=yes;; esac
    # A-127: a screen WITH a WebGL map (the map; the eparchy's and «Контакти»'s mini-maps) whose page stopped answering or painting is outside
    # the lock (ios run 2 of cloud_39: «Контакти» on the iPad 26.5 - no answer, white); its DOM checks count whenever the page answers
    # ios run 2 of cloud_40 (iOS 16.4 iPhone, the eparchy): «no page» with a 100 % white picture = the same GPU-less stop (the page in its
    # transition never painted); any other answer of these screens still counts
    local gl8=no; case "$name" in map) gl8=yes;; eparchy|contacts) case "$v|$p" in "|"*|"no page|BLANK (100%"*) gl8=yes;; esac;; esac
    if [ "$gl8" = yes ] && [ "$ok8" = no ]; then
      a3 "screen $name (A8)" OUT "${v:-no answer from the page}; pixels $p - a WebGL map on this screen (A-127: outside the lock)"; else
    case "$v|$p|$AFTER_GL" in "ok title «"*"» fits "*"|ok"*) a3 "screen $name (A8)" PASS "$v; pixels $p";;
      "ok title «"*"» fits "*"|1") a3 "screen $name (A8)" OUT "$v; pixels $p - the picture after a WebGL map (A-127: outside the lock; the DOM checks passed)";;
      *) a3 "screen $name (A8)" FAIL "$v; pixels $p";; esac
    fi
    case "$name" in map|eparchy|contacts) reboot_sim;; esac   # a WebGL map on screen: the next frame from a fresh simulator (D12)
  done
  # cloud_45 (E8 of cloud_44, release ring 45052241324): the LAST spot - after the walk's own «Трансляції» (A8) met and answered the A2 offer
  # «Повідомляти, коли починається трансляція?»; opened earlier, that offer covered «Перевірка Apple» and «rating cast» (FAIL)
  # cloud_44 A-161 (3): the widget's live row - the address inokapp://tab/streams?play=<id> handed to the app's ONE link path (as the gallery links
  # above). Not `simctl openurl`: it raises the system's «Open in “inok.info”?» alert (no DOM; ios 45031613354 - the alert then blocked the next
  # spot); a widget's own Link opens with no alert (the owner's iPhone). «Трансляції», the stream's sheet on top (no DOM: the frame), closed
  nav go /home; sleep 2; answer_offers
  ev "(window.dispatchEvent(new CustomEvent('inok-url-open', { detail: 'inokapp://tab/streams?play=DWCj8tI47q4' })), 'ok')" > /dev/null; sleep 8
  v=$(ev "location.pathname"); shot "$OUT/a3-live-tap-sheet__$TAG.png"
  ev "Capacitor.Plugins.Browser.close().then(() => 'closed').catch(() => 'none')" > /dev/null; sleep 3
  local after; after=$(ev "location.pathname"); shot "$OUT/a3-live-tap-back__$TAG.png"
  if [ "$v" = /streams ] && [ "$after" = /streams ]; then a3 "live tap -> «Трансляції» + the stream (A-161 (3))" PASS "the address -> $v; sheet closed -> $after"; else a3 "live tap -> «Трансляції» + the stream (A-161 (3))" FAIL "the address -> $v; after $after"; fi
  a3 "VoiceOver" NOT-PROVABLE "the simulator has no VoiceOver - names / roles / order are the a11y tree of the same DOM (axe 0); the owner's iPhone"
  a3 "share sheet / call / directions (Apple Maps)" NOT-PROVABLE "system sheets and other apps - the owner's iPhone"
  a3_cloud46   # 1.0.19's own spots - after every older one (E8: a new spot goes last)
}

# ---- cloud_46 (1.0.19): A-170 selection styles in WKWebView; A-183 Apple's map where our WebGL map cannot draw (the flag set by the ring)
a3_cloud46() {
  local v
  guard_crash spot46
  # A-170: the reading texts take the system's selection (computed in WebKit itself); a list row keeps A-142's held finger (no selection)
  # (cloud_46 E2, ring 45328638031: the card's route is a two-pane list on an iPad - the article's page is one page on every device; E6: the
  # live tap before PUSHED a route - `go` after it is read as Back (cloud_45 E2) - so a fresh start first)
  launch; answer_offers
  nav go "/articles?id=$ART"; node "$NAVJS" wait '[data-testid="article"] .aview__body' >> "$OUT/nav.txt" 2>&1; sleep 2
  v=$(ev "(() => { const u = (s) => { const e = Array.from(document.querySelectorAll(s)).find((x) => x.getClientRects().length > 0); return e ? getComputedStyle(e).webkitUserSelect || getComputedStyle(e).userSelect : 'missing'; };
    return [u('[data-testid=article] h1.card__title'), u('[data-testid=article] .aview__body'), document.documentElement.classList.contains('plt-mobile') ? 'plt-mobile' : 'no plt-mobile'].join(' / '); })()")
  nav go /monasteries; node "$NAVJS" wait '[data-testid^="mrow-"]' >> "$OUT/nav.txt" 2>&1; sleep 2
  local r; r=$(ev "(() => { const e = document.querySelector('.mrow'); return e ? getComputedStyle(e).webkitUserSelect || getComputedStyle(e).userSelect : 'missing'; })()")
  case "$v|$r" in 'text / text / plt-mobile|none') a3 "text selection styles (A-170)" PASS "article title / body / platform: $v; list row: $r";;
    *) a3 "text selection styles (A-170)" FAIL "article title / body / platform: $v; list row: $r";; esac
  # A-183: the A-182 flag of THIS app + OS version (what a real GL failure writes) -> the «Карта» tab = Apple's map with our houses
  local ver; ver=$(node -p "require('$ROOT/package.json').version")
  v=$(ev "(async () => { const i = await Capacitor.Plugins.Device.getInfo(); await Capacitor.Plugins.Preferences.set({ key: 'map_gl_failed', value: JSON.stringify({ app_version: '$ver', os_version: String(i.osVersion) }) }); return 'set ' + i.osVersion; })()")
  echo "A-183 flag: $v" >> "$OUT/nav.txt"
  launch; answer_offers
  nav go /map; sleep 6
  local st n; st=$(ev "Capacitor.Plugins.InokAppleMap.state().then((x) => JSON.stringify(x)).catch((e) => 'REJECT ' + String((e && e.message) || e))")
  n=$(ev "(document.querySelector('[data-testid=apple-map]') || { dataset: {} }).dataset.houses || 'none'")
  shot "$OUT/a3-apple-map__$TAG.png"
  xcrun simctl ui "$U" appearance dark; sleep 3; shot "$OUT/a3-apple-map-dark__$TAG.png"; xcrun simctl ui "$U" appearance light; sleep 2
  local nh hid; nh=$(printf '%s' "$st" | sed -n 's/.*"houses":\([0-9]*\).*/\1/p'); case "$st" in *'"hidden":false'*) hid=no;; *) hid=yes;; esac
  if [ -n "$nh" ] && [ "$nh" = "$n" ] && [ "$hid" = no ]; then a3 "Apple map when our map cannot draw (A-183)" PASS "native $st = the page's houses $n"
  else a3 "Apple map when our map cannot draw (A-183)" FAIL "native ${st:-no answer}; the page's houses $n"; fi
  # a web overlay over the map -> the native view hidden; closed -> shown
  local h1 h2; h1=$(ev "(async () => { const a = document.createElement('ion-alert'); a.header = 'ring'; a.buttons = ['OK']; a.id = 'ring-alert'; document.body.append(a); await a.present(); await new Promise((r) => setTimeout(r, 1500)); return JSON.stringify(await Capacitor.Plugins.InokAppleMap.state()); })()")
  h2=$(ev "(async () => { await document.getElementById('ring-alert').dismiss(); await new Promise((r) => setTimeout(r, 1500)); return JSON.stringify(await Capacitor.Plugins.InokAppleMap.state()); })()")
  case "$h1|$h2" in *'"hidden":true'*'|'*'"hidden":false'*) a3 "Apple map hides under a sheet (A-183 (3))" PASS "open: $h1; closed: $h2";;
    *) a3 "Apple map hides under a sheet (A-183 (3))" FAIL "open: $h1; closed: $h2";; esac
  # a pin's «›» -> the house card (the callout's own path, the pin selected on the map)
  v=$(ev "Capacitor.Plugins.InokAppleMap.selectForRing({ code: 242 }).then((x) => JSON.stringify(x))"); sleep 4
  local at; at=$(ev "location.pathname"); local gone; gone=$(ev "Capacitor.Plugins.InokAppleMap.state().then((x) => JSON.stringify(x))")
  shot "$OUT/a3-apple-map-card__$TAG.png"
  case "$v|$at|$gone" in '{"found":true}|/monasteries/242|'*'"hidden":true'*|'{"found":true}|/monasteries/242|{"exists":false}') a3 "Apple map pin -> the card (A-183 (2))" PASS "$v -> $at; the map then $gone";;
    *) a3 "Apple map pin -> the card (A-183 (2))" FAIL "$v -> $at; the map then $gone";; esac
  ev "Capacitor.Plugins.Preferences.remove({ key: 'map_gl_failed' }).then(() => 'cleared')" >> "$OUT/nav.txt"
  launch; answer_offers   # the app as a person opens it (the map flag gone)
  # A-173 (C): the reminder's Live Activity - started by the app in the foreground (a reminder 2 h ahead), then ended (Activity.activities 1 -> 0)
  local la1 la2
  la1=$(ev "(async () => { const P = Capacitor.Plugins.InokCountdown; const w = { label: 'НАГАДУВАННЯ · inok.info', in: 'Трансляція почнеться через', started: 'Трансляція почалася — відкрити', open: 'Відкрити', cancel: 'Скасувати', channel: 'Відлік' };
    await P.sync({ items: [{ id: '3|ringcount1', channel_id: 3, video_id: 'ringcount1', at: Date.now() + 7200000, title: 'Божественна літургія', monastery: 'Свято-Успенська Почаївська Лавра' }], words: w, now: Date.now() });
    return JSON.stringify(await P.state()); })().catch((e) => 'REJECT ' + String((e && e.message) || e))")
  shot "$OUT/a3-live-activity__$TAG.png"
  la2=$(ev "(async () => { const P = Capacitor.Plugins.InokCountdown; await P.sync({ items: [], words: {}, now: Date.now() }); return JSON.stringify(await P.state()); })().catch((e) => 'REJECT ' + String((e && e.message) || e))")
  case "$la1|$la2" in *'"active":1'*'|'*'"active":0'*) a3 "reminder Live Activity 1 -> 0 (A-173 (C))" PASS "started: $la1; ended: $la2";;
    *'"enabled":false'*) a3 "reminder Live Activity 1 -> 0 (A-173 (C))" NOT-PROVABLE "Live Activities off on this simulator: $la1 / $la2 - the owner's iPhone";;
    *) a3 "reminder Live Activity 1 -> 0 (A-173 (C))" FAIL "started: $la1; ended: $la2";; esac
  a3_tray
}

# ---- cloud_46 (A-171 Part A, FUTURE_notifications_ios.md §5): the iPhone tray rules with `simctl push` (the app in the background, as a phone)
apns() { # file type extra-json-fields [category]
  local cat=""; [ -n "${4:-}" ] && cat=", \"category\": \"$4\""
  printf '{"Simulator Target Bundle":"%s","aps":{"alert":{"title":"inok.info","body":"ring %s"},"mutable-content":1%s},"type":"%s"%s}\n' "$BUNDLE" "$2" "$cat" "$2" "$3" > "$1"
}
a3_tray() {
  local v d st
  v=$(ev "Capacitor.Plugins.FcmTopics.trayState().then((x) => JSON.stringify(x)).catch((e) => 'REJECT ' + String((e && e.message) || e))")
  case "$v" in *'"INOK_ARTICLE"'*'"INOK_MARK_READ"'*) a3 "category INOK_ARTICLE + «Позначити прочитаним» registered (A6)" PASS "$v";;
    *) a3 "category INOK_ARTICLE + «Позначити прочитаним» registered (A6)" FAIL "${v:-no answer}";; esac
  d="$OUT/apns-$TAG"; mkdir -p "$d"
  apns "$d/live3.apns" stream_live ', "channel_id": "3", "video_id": "ring3"'
  apns "$d/live5.apns" stream_live ', "channel_id": "5", "video_id": "ring5"'
  apns "$d/art1.apns" article ', "id": "2869", "kind": "publication"' INOK_ARTICLE
  apns "$d/art2.apns" article ', "id": "2868", "kind": "publication"' INOK_ARTICLE
  xcrun simctl launch "$U" com.apple.Preferences > /dev/null 2>&1; sleep 3   # our app to the background (a notification shows in the tray)
  local f; for f in live3 live5 art1 art2; do xcrun simctl push "$U" "$BUNDLE" "$d/$f.apns" >> "$OUT/nav.txt" 2>&1; sleep 2; done
  shot "$OUT/a3-tray-pushed__$TAG.png"
  xcrun simctl launch "$U" "$BUNDLE" > /dev/null 2>&1; sleep 4   # back to the app (the same process: no restart)
  st=$(ev "Capacitor.Plugins.FcmTopics.trayState().then((x) => JSON.stringify(x.delivered))")
  echo "tray after simctl push: $st" >> "$OUT/nav.txt"
  case "$st" in *'"article":2'*'"stream_live":2'*|*'"stream_live":2'*'"article":2'*) ;;
    *) a3 "tray rules on iPhone (A2 / A3 / A5)" NOT-PROVABLE "delivered after 4 simctl pushes: ${st:-no answer} (the simulator shows pushes only with the notification permission granted - the A2 offer answered «no» in this walk; the owner's iPhone)"; return;; esac
  local s1 s2 s3
  s1=$(ev "Capacitor.Plugins.FcmTopics.liveChannels({ ids: ['3'] }).then(() => Capacitor.Plugins.FcmTopics.trayState()).then((x) => JSON.stringify(x.delivered))")
  s2=$(ev "Capacitor.Plugins.FcmTopics.consumedArticles({ ids: ['2869'] }).then(() => Capacitor.Plugins.FcmTopics.trayState()).then((x) => JSON.stringify(x.delivered))")
  s3=$(ev "Capacitor.Plugins.FcmTopics.consumedArticles({}).then(() => Capacitor.Plugins.FcmTopics.trayState()).then((x) => JSON.stringify(x.delivered))")
  case "$s1|$s2|$s3" in *'"stream_live":1'*'|'*'"article":1'*'|'*) case "$s3" in *'"article"'*) a3 "tray rules on iPhone (A2 / A3 / A5)" FAIL "live [3] -> $s1; opened 2869 -> $s2; Home seen -> $s3";;
      *'"stream_live":1'*) a3 "tray rules on iPhone (A2 / A3 / A5)" PASS "2 «ефір» + 2 articles; live [3] -> $s1; opened 2869 -> $s2; Home seen -> $s3";;
      *) a3 "tray rules on iPhone (A2 / A3 / A5)" FAIL "Home seen removed «ефір» too: $s3";; esac;;
    *) a3 "tray rules on iPhone (A2 / A3 / A5)" FAIL "live [3] -> $s1; opened 2869 -> $s2; Home seen -> $s3";; esac
  a3 "apns-collapse-id / apns-expiration / stream_ended background (A4 a, S1-S3)" NOT-PROVABLE "simctl push carries no APNs headers and wakes no background push reliably - the owner's iPhone (PHONE_TEST_BACKLOG cloud_46)"
}

# ---- the App Store set (newest runtime only): the frames of store_frames.txt, uk / ru / en, the LIVE export
appstore() { # set(phone|tablet) dir-name
  local lang
  ev "(async () => { const P = Capacitor.Plugins.Preferences; const v = (await P.get({ key: 'settings' })).value;
    const s = Object.assign(v ? JSON.parse(v) : {}, { theme: 'light', photos: 'any', asked: ['articles', 'streams', 'hint_monastery', 'hint_article'], ownDevice: true });
    await P.set({ key: 'settings', value: JSON.stringify(s) }); return 'ok'; })()" > /dev/null
  launch
  # cloud_40 (A-129, C1): THE device's own layout numbers for the browser frames 04 / 05 - the safe-area insets (env), the root text size
  # (WKWebView follows -apple-system-body), the CSS viewport and the scale; the join (scripts/appstore_join.py) cuts the marks at THESE edges
  mkdir -p "$OUT/appstore"
  ev "(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.append(d); const c = getComputedStyle(d); const r = { top: parseFloat(c.paddingTop), right: parseFloat(c.paddingRight), bottom: parseFloat(c.paddingBottom), left: parseFloat(c.paddingLeft),
    rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize), w: innerWidth, h: innerHeight, dpr: devicePixelRatio }; d.remove(); return JSON.stringify(r); })()" > "$OUT/appstore/insets-$2.json"
  for lang in uk ru en; do
    sim_lang "$lang"   # cloud_41 (NOTE 7): the simulator's OWN language = the status bar in the frame's language (a fresh boot)
    set_lang "$lang"; units_ok "$lang" || return 1
    # A-127: without 04-eparchy / 05-map - cloud_41 MEASURED it again natively from a FRESH simulator (ios 44251885403, appstore ipad: all six
    # files BLANK, «MAP NOT PAINTED»): a GPU-less runner cannot draw WebGL; those two stay the joined frames (store/ios/screenshots/README)
    # cloud_41 (E, REVIEW cloud_40 «APP STORE SUBMISSION»): the App Store iPad home NOT scrolled - its frames go without `do:wholeRows`
    STORE_NOSCROLL=1 STORE_SKIP='eparchy|map' shoot_frames "$1" "$OUT/appstore/$lang/$2" "$lang" || return 1
    visited_frame "$1" "$OUT/appstore/$lang/$2"
  done
}
# cloud_41 (NOTE 7 of REVIEW cloud_40): the status bar is the SYSTEM's, not the app's - the simulator's own language and region, then a boot
sim_lang() {
  local loc; case "$1" in uk) loc=uk_UA;; ru) loc=ru_RU;; *) loc=en_US;; esac
  xcrun simctl spawn "$U" defaults write -g AppleLanguages -array "$1" 2>>"$OUT/nav.txt" || true
  xcrun simctl spawn "$U" defaults write -g AppleLocale -string "$loc" 2>>"$OUT/nav.txt" || true
  reboot_sim
}
# cloud_41 (A-133 C3, E): the «Я тут був» frame - the three lavras marked through the card's own toggle (the list's first rows); phone = the
# list (green checks + «· відвідано 3»), tablet = the card 242 beside the list (its filled check at the name + the list's checks and counter)
# ios 44270077149 (cloud_41): the FIRST shown page's toggle was read (the remote hand leaves the previous card page un-hidden) - the count
# said 1, not 3 -> the toggle of the LAST shown page (the card just opened), set to the wanted state by its own click; the marks are taken
# off again after the frame, so the next language's 01-07 carry none (each language marks its own)
mark_visited() { # code on|off
  nav go "/monasteries/$1"; sleep 3; node "$NAVJS" wait '[data-testid="visited"]' >> "$OUT/nav.txt" 2>&1
  local want; want=$([ "$2" = on ] && echo 1 || echo 0)
  ev "(() => { const b = Array.from(document.querySelectorAll('.ion-page:not(.ion-page-hidden) [data-testid=visited]')).pop(); if (!b) return 'none';
    if (b.dataset.on !== '$want') b.click(); return 'ok'; })()" > /dev/null; sleep 3
}
visited_frame() { # set dir
  local c
  for c in 242 111 98; do mark_visited "$c" on; done
  if [ "$1" = phone ]; then shot_frame "$2/09-visited.png" 09-visited /monasteries '[data-testid="visited-count"]' -
  else shot_frame "$2/08-visited.png" 08-visited /monasteries/242 '[data-testid="visited-count"]' -; fi
  local v; v=$(ev "(Array.from(document.querySelectorAll('.ion-page:not(.ion-page-hidden) [data-testid=visited-count]')).pop()||{}).textContent||'none'"); echo "visited frame $2: $v" >> "$OUT/demo.txt"
  case "$v" in *3) ;; *) echo "VISITED FAIL $2: $v" >> "$OUT/nav.txt";; esac
  for c in 242 111 98; do mark_visited "$c" off; done
}

# one device of $1 (iPhone | iPhone63 | iPad) on RTID, booted, the app installed and started: 0 = started; 1 = no «home painted» / no remote
# hand; 2 = the loader refused the build (this runtime cannot start it); 4 = no device type
start_on() {
  DT="$(devtype "$1")"; [ -n "$DT" ] || { echo "::error::no $1 for $RTID"; return 4; }
  U="$(xcrun simctl create "inok-$TAG-$WHICH" "${DT%%|*}" "$RTID")"
  echo "== $TAG: ${DT#*|} on iOS $RTV ($U)" | tee -a "$OUT/runtimes.txt"
  xcrun simctl boot "$U"; xcrun simctl bootstatus "$U" -b > /dev/null
  xcrun simctl ui "$U" appearance light
  sb_override
  xcrun simctl location "$U" set 50.4344,30.5571 2>>"$OUT/nav.txt" || true   # the Lavra: «Поруч»
  xcrun simctl install "$U" "$APP"
  xcrun simctl privacy "$U" grant location "$BUNDLE" 2>>"$OUT/nav.txt" || true
  # cloud_46 (T9, CD S335 on artifact 45087016904: the 6.3" frames said «Місцезнаходження недоступне»): the place set AGAIN once the app's
  # permission exists - a simulator that had no location client yet may keep no fix from the first `set`
  xcrun simctl location "$U" set 50.4344,30.5571 2>>"$OUT/nav.txt" || true
  # cloud_44: a cold simulator's FIRST start may never paint (its caches build meanwhile) - ONE more launch, written down; never after a refusal
  local r; launch; r=$?
  if [ "$r" = 1 ]; then echo "launch $TAG: once more after a cold first start" >> "$OUT/nav.txt"; launch; r=$?; fi
  return "$r"
}

node "$ROOT/scripts/ios_relay.mjs" > "$OUT/relay.log" 2>&1 &
RELAY=$!
trap 'kill $RELAY 2>/dev/null' EXIT
RC=0
KINDS="iPhone iPad"; case "$DEV" in iphone) KINDS=iPhone;; iphone63) KINDS=iPhone63;; ipad) KINDS=iPad;; esac
for kind in $KINDS; do
  TAG="$(echo "$kind" | tr 'A-Z' 'a-z')"
  if [ "$WHICH" != oldest ]; then start_on "$kind"; LRC=$?
  else # A-169: the rungs from the lowest; the first whose simulator starts the build is «oldest» (written with every refusal before it)
    LRC=3; for v in $OLDEST_LADDER; do
      rung "$v" || continue
      FIRST_LAUNCH_DONE=""; start_on "$kind"; LRC=$?
      [ "$LRC" = 2 ] || break
      echo "== iOS $RTV: cannot start this Xcode's simulator build - $(grep -aE -m1 'Library not loaded|Symbol not found' "$OUT/${TAG}_console.txt" | cut -c1-200)" | tee -a "$OUT/runtimes.txt"
      mv "$OUT/${TAG}_console.txt" "$OUT/${TAG}_console-$RTV.txt"; xcrun simctl shutdown "$U" > /dev/null 2>&1; xcrun simctl delete "$U" > /dev/null 2>&1 || true
    done
    [ "$LRC" = 0 ] && echo "== chosen (oldest): $RTID ($RTV) - the lowest rung of «${OLDEST_LADDER}» that starts this Xcode's simulator build (A-169)" | tee -a "$OUT/runtimes.txt"
  fi
  case "$LRC" in
    0) ;;
    2|3) if [ "$WHICH" = oldest ]; then a3 "start" FAIL "no rung of ${OLDEST_LADDER} started the app (runtimes.txt: each rung's download / loader line)"
      else a3 "start" FAIL "the loader refused the build on iOS $RTV - ${TAG}_console.txt"; xcrun simctl shutdown "$U"; fi; RC=1; continue;;
    4) RC=1; continue;;
    *) a3 "start" FAIL "no «home painted» / no remote hand - ${TAG}_console.txt"; RC=1; xcrun simctl shutdown "$U"; continue;;
  esac
  a3 "start + live import" PASS "$(grep -a 'InokBoot' "$OUT/${TAG}_console.txt" | tail -2 | sed 's/.*InokBoot: //' | tr '\n' ';' | cut -c1-200)"
  # A-144 (cloud_43): a fresh simulator = an empty database -> the directory built into the app is imported first (no network wait)
  if grep -aq 'InokBoot: bundled export .* imported' "$OUT/${TAG}_console.txt"; then a3 "bundled directory (A-144)" PASS "$(grep -a 'InokBoot: bundled export' "$OUT/${TAG}_console.txt" | head -1 | sed 's/.*InokBoot: //')"
  else a3 "bundled directory (A-144)" FAIL "no «bundled export … imported» in ${TAG}_console.txt"; RC=1; fi
  case "$MODE" in walk|both) a3_walk;; esac
  case "$MODE" in appstore|both)
    case "$kind" in iPhone) appstore phone iphone;; iPhone63) appstore phone iphone63;; *) appstore tablet ipad;; esac || { echo "App Store set STOPPED ($TAG): $(grep -E 'FAIL' "$OUT/nav.txt" | tail -1)" | tee -a "$OUT/demo.txt"; RC=1; };;
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
