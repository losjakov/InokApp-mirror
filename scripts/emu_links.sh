#!/usr/bin/env bash
# emu_links.sh - A-76 App Links on the Actions emulator (Android 12+ = API 31+), called by scripts/emulator_smoke.sh with the app installed and
# imported. A debug APK is signed by a debug key that the site's assetlinks.json never lists, so it never VERIFIES: the domain's state is set
# by hand (`pm set-app-links … 2` = approved, the documented test path), then the system opens real https://inok.info links:
#   an article / a card  -> the app, on THAT screen (read back through the WebView: scripts/emu_nav.mjs url);
#   any other path the filter lets in (/monasteries/table/) -> NOT the app's router (MainActivity hands its own Custom Tab to a browser) - never
#   a dead screen; A-78 1: the same article / card link with the app's process KILLED (`am force-stop`) STARTS the app on THAT screen. Output: $OUT/links.txt (+ link_*.png); the last line = the verdict «links ok» | «links FAIL:<url>».
set -u
OUT="${1:?out dir}"; ROOT="$(cd "$(dirname "$0")/.." && pwd)"; PKG=info.inok.app
L="$OUT/links.txt"; : > "$L"
adb shell pm set-app-links --package "$PKG" 2 inok.info >> "$L" 2>&1
adb shell pm get-app-links "$PKG" >> "$L" 2>&1
top() { adb shell dumpsys activity activities 2>/dev/null | tr -d '\r' | grep -m1 -E 'topResumedActivity|mResumedActivity' | sed 's/^ *//'; }
RES=ok
open_link() { # url  expected in-app url (regex) | browser  shot-name  [cold = the process killed first: the link STARTS the app, A-78 1]
  if [ "${4:-}" = cold ]; then adb shell am force-stop "$PKG"; sleep 2; echo "cold start (force-stop):" >> "$L"; fi
  adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "'$1'" >> "$L" 2>&1; sleep "$([ "${4:-}" = cold ] && echo 15 || echo 7)"
  local t; t=$(top); echo "$1 -> top: $t" >> "$L"
  adb exec-out screencap -p > "$OUT/link_$3.png"
  if [ "$2" = browser ]; then
    case "$t" in *"$PKG/.MainActivity"*) RES="FAIL:$1 stayed in the app"; echo "  stayed in the app" >> "$L";; esac
    grep -a 'InokLinks' "$OUT/logcat_full.txt" 2>/dev/null | tail -2 >> "$L"
    adb shell input keyevent 4; sleep 2; adb shell am start -n "$PKG/.MainActivity" >/dev/null; sleep 4   # back to the app for the rest
  else
    case "$t" in *"$PKG/"*) node "$ROOT/scripts/emu_nav.mjs" expect "$2" >> "$L" 2>&1 || RES="FAIL:$1";; *) RES="FAIL:$1 not in the app";; esac
  fi
}
open_link 'https://inok.info/articles/publications/1832/' '^/articles\?id=1832$' article_1832
open_link 'https://inok.info/articles/publications/1833/?lang=ru' '^/articles\?id=1833$' article_1833_ru
open_link 'https://inok.info/monasteries/242/' '^/monasteries/242$' card_242
open_link 'https://inok.info/monasteries/table/' browser table
open_link 'https://inok.info/articles/publications/1832/' '^/articles\?id=1832$' cold_article_1832 cold
open_link 'https://inok.info/monasteries/242/' '^/monasteries/242$' cold_card_242 cold
open_link 'https://inok.info/articles/publications/1833/?lang=ru' '^/articles\?id=1833$' warm_after_cold_1833_ru
# cloud_42 (A-138 + amendment): the LIST pages and /dioceses/ - the app's own screens, never the browser; running AND cold
open_link 'https://inok.info/monasteries/?lang=ru' '^/monasteries$' list_monasteries
open_link 'https://inok.info/articles/video/' '^/articles$' list_video
open_link 'https://inok.info/dioceses/1/?lang=en' '^/more/eparchies/1$' eparchy_1
open_link 'https://inok.info/live/?lang=ru' '^/streams$' list_live
open_link 'https://inok.info/monasteries/' '^/monasteries$' cold_list_monasteries cold
open_link 'https://inok.info/articles/news/?lang=ru' '^/articles$' cold_list_news cold
open_link 'https://inok.info/live/' '^/streams$' cold_list_live cold
# cloud_43 (T4): the site's «Публікації» umbrella (exact path /articles/) -> «Публікації» «Усі»; running AND cold
open_link 'https://inok.info/articles/?lang=ru' '^/articles$' list_articles_all
open_link 'https://inok.info/articles/' '^/articles$' cold_list_articles_all cold
# cloud_44 (A-166): the site's SHORT / legacy / gallery forms. A gallery link = the card, ITS gallery on top (the viewer «1 / N»), the system Back
# closes the viewer and leaves the card (frames link_<name>_viewer / _back); a plain short link = the card only; a short path that is not a card
# (in the filter by its digit) -> the browser. Running AND cold.
NAV="$ROOT/scripts/emu_nav.mjs"
# emu_nav's `eval` prints «eval: <value>» - the prefix is cut (emulator 45037147515: «eval: closed» read as not closed)
viewer() { node "$NAV" eval "(() => { const m = document.querySelector('ion-modal.viewer:not(.overlay-hidden)'); if (!m) return 'closed'; const c = m.querySelector('[data-testid=viewer-count]'); return c ? c.textContent.trim() : 'open'; })()" 2>/dev/null | sed 's/^eval: //' || echo none; }
gallery_link() { # url  code  shot-name  [cold]
  open_link "$1" "^/monasteries/$2\$" "$3" "${4:-}"
  local v=closed _; for _ in 1 2 3 4 5 6 7 8 9 10; do v=$(viewer); case "$v" in closed|none) sleep 2;; *) break;; esac; done
  adb exec-out screencap -p > "$OUT/link_$3_viewer.png"
  adb shell input keyevent 4; sleep 3
  local after url; after=$(viewer); url=$(node "$NAV" url 2>/dev/null || echo none)
  adb exec-out screencap -p > "$OUT/link_$3_back.png"
  echo "  gallery: viewer=[$v] after Back: viewer=$after url=$url" >> "$L"
  case "$v" in *' / '*|open) ;; *) RES="FAIL:$1 no gallery over the card";; esac
  if [ "$after" != closed ] || ! echo "$url" | grep -q "^/monasteries/$2\$"; then RES="FAIL:$1 Back did not leave the card"; fi
}
gallery_link 'https://inok.info/ru/242/g' 242 short_gallery_ru
gallery_link 'https://inok.info/monasteries/242/?lang=ru&gallery=Y' 242 full_gallery_ru
gallery_link 'https://inok.info/242/G/' 242 cold_short_gallery cold
for f in '/242' '/uk/242/' '/en/242' '/objects/monasteries/242/'; do open_link "https://inok.info$f" '^/monasteries/242$' "short_$(echo "$f" | tr -c 'a-z0-9' '_')"; done
open_link 'https://inok.info/ru/242' '^/monasteries/242$' cold_short_ru cold
open_link 'https://inok.info/242a/' browser short_not_card
echo "links $RES" | tee -a "$L"
