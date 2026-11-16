#!/bin/bash
# ios_sim_tour.sh - cloud_37 (A-121, A-122): the iOS simulator ring WITH TAPS, on the newest and on the oldest iOS runtime the runner has
# (or can download), iPhone + iPad. The app's simulator bundle carries the remote hand (src/app/simDriver.ts, VITE_SIM_DRIVER=1); the
# SAME commands as the Android emulator (scripts/emu_nav.mjs: go, click, wait, check, do, drawn) reach it through scripts/ios_relay.mjs.
# A «tap» = a DOM click on the element inside the real WKWebView (as on the emulator); the system's own UI (share sheet, Safari view,
# permission prompts) has no DOM - those spots are screenshots or NOT-PROVABLE (a line for the owner's iPhone).
#   bash scripts/ios_sim_tour.sh <App.app> <out dir> newest|oldest
# Output: <out>/runtimes.txt (what the runner has and what was downloaded), a3.txt (one line per trouble spot: device | runtime | spot |
# PASS / FAIL / NOT-PROVABLE | evidence), a3-<spot>__<device>.png, <device>_console.txt; newest only: appstore/<lang>/<iphone|ipad>/NN-*.png
# (A-122: the App Store set from the LIVE export, the frames of scripts/store_frames.txt, the read-backs of scripts/store_lib.sh) + sizes.txt.
set -uo pipefail
APP="$1"; OUT="$2"; WHICH="$3"; ROOT="$(cd "$(dirname "$0")/.." && pwd)"; BUNDLE=info.inok.app
mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"
export INOK_NAV_RELAY=http://localhost:8765
NAVJS="$ROOT/scripts/emu_nav.mjs"
S="$OUT"; ART=${STORE_ARTICLE:-1832}
# shellcheck source=scripts/store_lib.sh
. "$ROOT/scripts/store_lib.sh"
demo_all() { :; } # the status bar is overridden once per device (simctl status_bar), nothing to re-apply
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
    if timeout 1800 xcodebuild -downloadPlatform iOS -buildVersion "$v" > "$OUT/download-$v.log" 2>&1; then
      echo "   downloaded" >> "$OUT/runtimes.txt"; break
    else echo "   FAILED (exit $?): $(grep -iE 'error|not|unable|unsupported' "$OUT/download-$v.log" | head -3 | tr '\n' ' ' | cut -c1-300)" >> "$OUT/runtimes.txt"; fi
  done
  { echo "== iOS runtimes after the download attempts:"; runtimes; } >> "$OUT/runtimes.txt"
fi
RT="$( (runtimes | { [ "$WHICH" = oldest ] && head -1 || tail -1; }) | awk '{print $1" "$2}')"
RTID="${RT%% *}"; RTV="${RT#* }"
echo "== chosen ($WHICH): $RTID ($RTV)" | tee -a "$OUT/runtimes.txt"
[ -n "$RTID" ] || { echo "::error::no iOS runtime"; exit 1; }
# the device types this runtime serves: the biggest iPhone (Pro Max / Plus) and the biggest iPad (Pro 13 / 12.9), else the last of each
devtype() { xcrun simctl list runtimes -j | python3 -I -c '
import json, re, sys
rid, kind = sys.argv[1], sys.argv[2]
r = next(r for r in json.load(sys.stdin)["runtimes"] if r["identifier"] == rid)
ts = [t for t in r.get("supportedDeviceTypes", []) if t["name"].startswith(kind)]
pref = [t for t in ts if re.search(r"Pro Max|Pro 13|Pro \(12\.9", t["name"])]
t = (pref or ts)[-1]; print(t["identifier"] + "|" + t["name"])' "$RTID" "$1"; }

A3="$OUT/a3.txt"
a3() { echo "$TAG | iOS $RTV | $1 | $2 | $3" | tee -a "$A3"; }
shot() { xcrun simctl io "$U" screenshot --type=png "$1" > /dev/null 2>&1 || echo "SHOT FAIL $1" >> "$OUT/nav.txt"; }
capture() { shot "$1"; }
launch() { # (re)start the app with its console captured; wait for «home painted» and for the remote hand to ask the relay
  xcrun simctl terminate "$U" "$BUNDLE" > /dev/null 2>&1 || true
  xcrun simctl launch --console-pty --terminate-running-process "$U" "$BUNDLE" -AppleLanguages '(uk)' -AppleLocale uk_UA >> "$OUT/${TAG}_console.txt" 2>&1 &
  local _; for _ in $(seq 1 90); do grep -q 'home painted' "$OUT/${TAG}_console.txt" 2>/dev/null && break; sleep 2; done
  for _ in $(seq 1 30); do [ "$(curl -s localhost:8765/health | python3 -I -c 'import json,sys; a=json.load(sys.stdin)["ago"]; print(1 if a is not None and a < 20000 else 0)')" = 1 ] && return 0; sleep 2; done
  echo "the remote hand never asked the relay ($TAG)" | tee -a "$OUT/nav.txt"; return 1
}

# ---- the trouble spots Android paid for (ref/REF_gotchas*, reports/PHONE_TEST_BACKLOG.md), walked with taps (A-121)
a3_walk() {
  local v
  # 1 the bars and the safe areas: the header under the status bar / Dynamic Island, the tab bar on the bottom edge, its buttons above the home indicator
  nav go /home; node "$NAVJS" wait '[data-testid="home-near"]' >> "$OUT/nav.txt" 2>&1
  v=$(ev "(() => { const p = document.createElement('div'); p.style.cssText = 'position:fixed;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)'; document.body.append(p);
    const cs = getComputedStyle(p); const st = parseFloat(cs.paddingTop), sb = parseFloat(cs.paddingBottom); p.remove();
    const tb = document.querySelector('ion-toolbar').getBoundingClientRect(); const bar = document.querySelector('ion-tab-bar').getBoundingClientRect();
    const btn = Math.max(...Array.from(document.querySelectorAll('ion-tab-button')).map((b) => b.getBoundingClientRect().bottom));
    const ok = tb.top >= st - 1 && bar.bottom >= innerHeight - 1 && btn <= innerHeight - sb + 1;
    return (ok ? 'PASS' : 'FAIL') + ' safe top ' + st + ' bottom ' + sb + '; toolbar top ' + Math.round(tb.top) + '; tab bar bottom ' + Math.round(bar.bottom) + ' / ' + innerHeight + '; buttons end ' + Math.round(btn); })()")
  a3 "bars + safe areas" "${v%% *}" "${v#* }"; shot "$OUT/a3-safe__$TAG.png"
  # 2 «назад»: list -> card -> the header arrow -> the list; eparchy -> its map -> arrow -> the eparchy (A-25 #1)
  # (each arrow tapped after the page's transition and its map are over - a tap during the transition is refused, D45)
  nav go /monasteries; node "$NAVJS" wait '[data-testid^="mrow-"]' >> "$OUT/nav.txt" 2>&1; sleep 2; nav click '[data-testid^="mrow-"]'; sleep 4
  local c1; c1=$(node "$NAVJS" url); nav click '[data-testid="back"]'; sleep 3; local u1; u1=$(node "$NAVJS" url)
  nav go /more/eparchies/1; node "$NAVJS" wait '[data-testid="eparchy-title"]' >> "$OUT/nav.txt" 2>&1; sleep 2; nav click '[data-testid="eparchy-map"]'; sleep 4
  node "$NAVJS" drawn >> "$OUT/nav.txt" 2>&1; sleep 2
  local m1; m1=$(node "$NAVJS" url); nav click '[data-testid="back"]'; sleep 3; local u2; u2=$(node "$NAVJS" url)
  local wide; wide=$(ev "innerWidth >= 600 ? 'wide' : 'phone'")
  if { [ "$wide" = wide ] || { [ "${c1#/monasteries/}" != "$c1" ] && [ "$u1" = /monasteries ]; }; } && [ "${m1#/map}" != "$m1" ] && [ "$u2" = /more/eparchies/1 ]; then
    a3 "back (header arrow)" PASS "list->$c1->back=$u1; eparchy->$m1->back=$u2 ($wide)"; else a3 "back (header arrow)" FAIL "list->$c1->back=$u1; eparchy->$m1->back=$u2 ($wide)"; fi
  a3 "back (edge swipe)" NOT-PROVABLE "a system gesture: no DOM tap reaches it - the owner's iPhone (PHONE_TEST_BACKLOG cloud_37)"
  # 3 the map online: drawn, clustered houses + the three lavras whole
  nav go /map; sleep 3; node "$NAVJS" drawn >> "$OUT/nav.txt" 2>&1
  node "$NAVJS" "do" fitLavras >> "$OUT/nav.txt" 2>&1; sleep 2; node "$NAVJS" drawn >> "$OUT/nav.txt" 2>&1
  v=$(ev "(() => { const m = window.__inokMap; if (!m) return 'none'; return m.queryRenderedFeatures({ layers: ['points', 'clusters', 'lavras'] }).length + ' marks drawn'; })()")
  local lv; lv=$(check lavras)
  [ "$lv" = ok ] && [ "${v%% *}" -gt 0 ] 2>/dev/null && a3 "map online" PASS "$v; lavras $lv" || a3 "map online" FAIL "$v; lavras $lv"; shot "$OUT/a3-map__$TAG.png"
  a3 "map offline" NOT-PROVABLE "the simulator shares the Mac's network (no airplane mode) - the browser ring proves the logic (map-offline, map-offline-weak x4 profiles); the owner's iPhone in airplane mode"
  # 4 the gallery in the app's viewer: card 242 -> «Фотогалерея» -> «1 / N» -> next -> «2 / N» -> close
  nav go /monasteries/242; node "$NAVJS" wait '[data-testid="card"]' >> "$OUT/nav.txt" 2>&1; sleep 2
  nav click '[data-testid="card"] [data-testid="photo-load"]'; sleep 3; node "$NAVJS" wait '[data-testid="card"] [data-testid="gallery"]' >> "$OUT/nav.txt" 2>&1
  nav click '[data-testid="card"] [data-testid="gallery"]'; sleep 5
  local g1 g2 g3; g1=$(ev "(document.querySelector('[data-testid=viewer-count]')||{}).textContent||'none'")
  shot "$OUT/a3-gallery__$TAG.png"
  ev "document.querySelector('ion-modal.viewer [data-testid=viewer-next]').click(), 'ok'" > /dev/null; sleep 3
  g2=$(ev "(document.querySelector('[data-testid=viewer-count]')||{}).textContent||'none'")
  ev "document.querySelector('ion-modal.viewer [data-testid=viewer-close]').click(), 'ok'" > /dev/null; sleep 3
  g3=$(ev "document.querySelector('ion-modal.viewer:not(.overlay-hidden)') ? 'open' : 'closed'")
  case "$g1|$g2|$g3" in "1 / "*"|2 / "*"|closed") a3 "gallery (app's viewer)" PASS "$g1 -> $g2 -> $g3";; *) a3 "gallery (app's viewer)" FAIL "$g1 -> $g2 -> $g3";; esac
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
  # 6 «Очистити збережені фото»: the space read (the gallery above saved photos), the button, its confirmation, the toast, the space after
  nav go /more; sleep 3; local before after
  before=$(ev "(document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=photos-used]')||{}).textContent||'none'")
  nav click '[data-testid="photos-clear"]'; sleep 2
  ev "(document.querySelector('ion-alert [data-testid=photos-confirm-do]')||{}).click?.(), 'ok'" > /dev/null; sleep 1
  v=$(ev "Array.from(document.querySelectorAll('ion-toast')).some((t) => !t.classList.contains('overlay-hidden')) ? 'toast' : 'none'"); shot "$OUT/a3-photos-clear__$TAG.png"; sleep 3
  after=$(ev "(document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=photos-used]')||{}).textContent||'none'")
  [ "$v" = toast ] && a3 "clear saved photos" PASS "$before -> $after, the toast shown" || a3 "clear saved photos" FAIL "$before -> $after, toast: $v"
  # 7 search + sorts: the directory's search narrows the list; «Публікації»: search, then the sort sheet -> «за переглядами»
  nav go /monasteries; node "$NAVJS" wait '[data-testid^="mrow-"]' >> "$OUT/nav.txt" 2>&1; sleep 2
  local n0 n1; n0=$(ev "document.querySelectorAll('.ion-page:not(.ion-page-hidden) [data-testid^=mrow-]').length")
  ev "(() => { const s = document.querySelector('.ion-page:not(.ion-page-hidden) ion-searchbar[data-testid=search]'); s.value = 'Лавра'; s.dispatchEvent(new CustomEvent('ionInput', { detail: { value: 'Лавра' } })); return 'ok'; })()" > /dev/null; sleep 3
  n1=$(ev "document.querySelectorAll('.ion-page:not(.ion-page-hidden) [data-testid^=mrow-]').length"); shot "$OUT/a3-search__$TAG.png"
  nav go /articles; sleep 3; nav click '[data-testid="sort-open"]'; sleep 2
  ev "(document.querySelector('ion-action-sheet [data-testid=sort-views_week]') || {}).click?.(), 'ok'" > /dev/null; sleep 4
  local so; so=$(ev "(document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=sort-open]')||{}).dataset?.sort||'none'"); shot "$OUT/a3-sort__$TAG.png"
  [ "${n1:-0}" -gt 0 ] 2>/dev/null && [ "${n1:-0}" -lt "${n0:-0}" ] && [ "$so" = views_week ] && a3 "search + sort" PASS "list $n0 -> «Лавра» $n1; articles sort=$so" || a3 "search + sort" FAIL "list $n0 -> «Лавра» $n1; articles sort=$so"
  # 8 favourites survive a restart
  nav go /monasteries/242; node "$NAVJS" wait '[data-testid="fav"]' >> "$OUT/nav.txt" 2>&1
  [ "$(ev "(document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=fav]')||{}).dataset?.on")" = 1 ] || nav click '[data-testid="fav"]'; sleep 2
  launch; nav go /more/favourites; sleep 3; v=$(ev "document.querySelectorAll('.ion-page:not(.ion-page-hidden) [data-testid=mrow-242]').length"); shot "$OUT/a3-favourites__$TAG.png"
  [ "$v" = 1 ] && a3 "favourites after a restart" PASS "card 242 listed after terminate + launch" || a3 "favourites after a restart" FAIL "rows of 242: $v"
  # 9 a link inside an article opens the linked article in the app (R-39: 1832 -> 1833)
  nav go "/articles?id=1832"; node "$NAVJS" wait '[data-testid="article"] .card__title' >> "$OUT/nav.txt" 2>&1; sleep 2
  nav click '[data-testid="article"] .aview__body a[href*="1833"]'; sleep 4; v=$(node "$NAVJS" url)
  [ "${v#*id=1833}" != "$v" ] && a3 "link inside an article" PASS "1832 -> $v" || a3 "link inside an article" FAIL "1832 -> $v"
  # 10 the dark theme by the system (the app on «system»)
  nav go /more; sleep 1; nav click '[data-testid="theme-system"]'; sleep 1
  xcrun simctl ui "$U" appearance dark; sleep 3; nav go /home; sleep 3; v=$(check theme); shot "$OUT/a3-dark__$TAG.png"
  xcrun simctl ui "$U" appearance light; sleep 2
  [ "$v" = dark ] && a3 "dark theme (system)" PASS "the system dark -> the app $v" || a3 "dark theme (system)" FAIL "the system dark -> the app $v"
  # 11 the largest text (Dynamic Type, accessibility XXXL): what the WebView's text does; the home must not overflow sideways
  xcrun simctl ui "$U" content_size accessibility-extra-extra-extra-large; sleep 2; launch
  nav go /home; sleep 3
  v=$(ev "(() => { const fs = getComputedStyle(document.documentElement).fontSize; const ov = document.documentElement.scrollWidth > innerWidth + 1; return (ov ? 'FAIL' : 'PASS') + ' root font ' + fs + ', sideways overflow ' + ov + ', text-large ' + (document.documentElement.dataset.textLarge || '0'); })()")
  shot "$OUT/a3-font-largest__$TAG.png"; a3 "largest system text" "${v%% *}" "${v#* } (Dynamic Type accessibility-XXXL)"
  xcrun simctl ui "$U" content_size large; launch
  # 12 «Перевірити оновлення»: the App Store's answer under the row
  nav go /more/about; sleep 2; nav click '[data-testid="about-update"]'; sleep 6
  v=$(ev "(document.querySelector('.ion-page:not(.ion-page-hidden) [data-testid=about-update-note]')||{}).textContent||'none'"); shot "$OUT/a3-update__$TAG.png"
  [ "$v" != none ] && a3 "update check" PASS "«$v»" || a3 "update check" FAIL "no answer under the row"
  # 13 the social block (A-120 (1)) and an outside link: «Про застосунок» -> Telegram -> the system's Safari view over the app
  nav go /more/about; sleep 2; nav scroll '[data-testid="social"]'; sleep 1; shot "$OUT/a3-social__$TAG.png"
  v=$(ev "Array.from(document.querySelectorAll('.ion-page:not(.ion-page-hidden) [data-testid=social] a')).map((a) => a.textContent + '=' + a.getAttribute('href')).join(' ')")
  nav click '[data-testid="social-telegram"]'; sleep 6; shot "$OUT/a3-external__$TAG.png"
  case "$v" in *Telegram=https://t.me/inokinfo*Facebook=*Instagram=*) a3 "social block + outside link" PASS "$v; the Safari view = a3-external__$TAG.png";; *) a3 "social block + outside link" FAIL "$v";; esac
  launch
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
  for lang in uk ru en; do
    set_lang "$lang"; units_ok "$lang" || return 1
    shoot_frames "$1" "$OUT/appstore/$lang/$2" "$lang" || return 1
  done
}

node "$ROOT/scripts/ios_relay.mjs" > "$OUT/relay.log" 2>&1 &
RELAY=$!
trap 'kill $RELAY 2>/dev/null' EXIT
RC=0
for kind in iPhone iPad; do
  TAG="$(echo "$kind" | tr 'A-Z' 'a-z')"
  DT="$(devtype "$kind")"; [ -n "$DT" ] || { echo "::error::no $kind for $RTID"; RC=1; continue; }
  U="$(xcrun simctl create "inok-$TAG-$WHICH" "${DT%%|*}" "$RTID")"
  echo "== $TAG: ${DT#*|} on iOS $RTV ($U)" | tee -a "$OUT/runtimes.txt"
  xcrun simctl boot "$U"; xcrun simctl bootstatus "$U" -b > /dev/null
  xcrun simctl ui "$U" appearance light
  xcrun simctl status_bar "$U" override --time 10:00 --dataNetwork wifi --wifiMode active --wifiBars 3 --cellularMode notSupported --batteryState charged --batteryLevel 100 2>>"$OUT/nav.txt" || true
  xcrun simctl location "$U" set 50.4344,30.5571 2>>"$OUT/nav.txt" || true   # the Lavra: «Поруч»
  xcrun simctl install "$U" "$APP"
  xcrun simctl privacy "$U" grant location "$BUNDLE" 2>>"$OUT/nav.txt" || true
  if ! launch; then a3 "start" FAIL "no «home painted» / no remote hand - ${TAG}_console.txt"; RC=1; xcrun simctl shutdown "$U"; continue; fi
  a3 "start + live import" PASS "$(grep -a 'InokBoot' "$OUT/${TAG}_console.txt" | tail -2 | sed 's/.*InokBoot: //' | tr '\n' ';' | cut -c1-200)"
  a3_walk
  if [ "$WHICH" = newest ]; then
    if [ "$kind" = iPhone ]; then appstore phone iphone; else appstore tablet ipad; fi || echo "App Store set STOPPED ($TAG): $(grep -E 'FAIL' "$OUT/nav.txt" | tail -1)" | tee -a "$OUT/demo.txt"
  fi
  xcrun simctl shutdown "$U" || true
done
if [ "$WHICH" = newest ]; then
  "${PY:-python3}" -I "$ROOT/scripts/store_png.py" --appstore "$OUT/appstore" | tee "$OUT/sizes.txt"
  store_summary | tee -a "$OUT/sizes.txt"
fi
grep -c '| FAIL |' "$A3" > /dev/null && { echo "::warning::A3: $(grep -c '| FAIL |' "$A3") spot(s) FAIL - $A3"; }
exit $RC
