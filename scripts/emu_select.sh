#!/usr/bin/env bash
# emu_select.sh - A-170 (cloud_46) on the emulator: the system's OWN text selection on a reading text, and none on a list row.
# (1) an article (the live feed's newest) -> a held finger (`input swipe x y x y 900`) on its body -> `getSelection()` holds text + the frame
# with the system's selection bar («Копіювати» / «Copy»); (2) the «Монастирі» list -> the same press on a row -> the quick sheet (A-142),
# the selection empty. Output: $OUT/select.txt (+ select_*.png); the last line = «select ok» | «select FAIL:<what>».
#   bash scripts/emu_select.sh <out-dir>
set -u
OUT="${1:?out dir}"; ROOT="$(cd "$(dirname "$0")/.." && pwd)"; PKG=info.inok.app; NAV="$ROOT/scripts/emu_nav.mjs"
L="$OUT/select.txt"; : > "$L"; RES=ok
ev() { local o; o=$(node "$NAV" eval "$1" 2>>"$L") || true; o="${o%%$'\n'*}"; printf '%s\n' "${o#eval: }"; }
# the element's centre in SCREEN pixels: CSS px x the page's devicePixelRatio (the WebView fills the screen edge to edge, A-83)
centre() { ev "(() => { const e = Array.from(document.querySelectorAll('$1')).find((x) => !x.closest('.ion-page-hidden') && x.getClientRects().length > 0); if (!e) return 'none';
  e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); const d = devicePixelRatio; return Math.round((r.left + Math.min(r.width / 2, 120)) * d) + ' ' + Math.round((r.top + Math.min(r.height / 2, 60)) * d); })()"; }
ART=$(curl -s -H 'X-Inok-App: eb741a6e64315c8aff6281ad13c21378' 'https://inok.info/api/app/v1/articles?lang=uk&limit=1' | python3 -I -c 'import json,sys; i=json.load(sys.stdin).get("items") or []; print(i[0]["id"] if i else "")' 2>/dev/null || true)
echo "article: ${ART:-none}" >> "$L"
adb shell am start -n "$PKG/.MainActivity" > /dev/null; sleep 6
if [ -n "$ART" ]; then
  node "$NAV" go "/articles?id=$ART" >> "$L" 2>&1; sleep 6
  xy=$(centre '[data-testid=article] .aview__body p'); [ "$xy" = none ] && xy=$(centre '[data-testid=article] .aview__body')
  echo "body at: $xy" >> "$L"; sleep 1; xy=$(centre '[data-testid=article] .aview__body p'); [ "$xy" = none ] && xy=$(centre '[data-testid=article] .aview__body')
  if [ "$xy" != none ] && [ -n "$xy" ]; then
    # shellcheck disable=SC2086
    adb shell input swipe $xy $xy 900; sleep 2
    n=$(ev "String((getSelection() || '').toString().length)"); echo "selected chars after the press: $n" >> "$L"
    adb exec-out screencap -p > "$OUT/select_article.png"
    adb shell uiautomator dump /sdcard/sel.xml > /dev/null 2>&1; adb exec-out cat /sdcard/sel.xml > "$OUT/select_ui.xml" 2>/dev/null
    bar=$(grep -o -E 'text="(Копіювати|Копировать|Copy)"' "$OUT/select_ui.xml" | head -1); echo "system bar: ${bar:-not in the dump}" >> "$L"
    [ "${n:-0}" -gt 0 ] 2>/dev/null || RES="FAIL:no selection on the article body"
    ev "(getSelection() && getSelection().removeAllRanges(), 'cleared')" >> "$L"
  else RES="FAIL:article body not found"; fi
else echo "no live article id (network): the article step skipped" >> "$L"; fi
node "$NAV" go /monasteries >> "$L" 2>&1; sleep 5
xy=$(centre '.mrow'); echo "row at: $xy" >> "$L"
if [ "$xy" != none ] && [ -n "$xy" ]; then
  # shellcheck disable=SC2086
  adb shell input swipe $xy $xy 900; sleep 2
  sh=$(ev "document.querySelector('ion-action-sheet.quick-sheet:not(.overlay-hidden)') ? 'sheet' : 'no sheet'"); n=$(ev "String((getSelection() || '').toString().length)")
  echo "row press: $sh, selected chars $n" >> "$L"; adb exec-out screencap -p > "$OUT/select_row.png"
  [ "$sh" = sheet ] && [ "${n:-1}" = 0 ] || RES="${RES/ok/}FAIL:row press = $sh, selection $n"
  adb shell input keyevent 4; sleep 1
else RES="FAIL:no list row"; fi
echo "select $RES" | tee -a "$L"
