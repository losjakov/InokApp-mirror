#!/usr/bin/env bash
# emu_store.sh - the Google Play screenshots from the REAL app (1.0.1 A-68; 1.0.2 A-75: N8 no mobile icon, uk words read back, frame 06 = ART; 1.0.3 A-78: map 03 = the three lavras, tablet 06 at the selected row, colours read back) on the Actions emulator, by A-68 (ref/DECISIONS_8.md) and Google Play
# Help 1078870: the live export, NO captions / frames / overlays, no dialog over a screen (the A-64 / A-67 soft questions are answered
# before the run through the app's own settings), status bar in demo mode, gesture navigation. Called by scripts/emulator_smoke.sh on the
# required API 34 image, after its checks, with the app already imported. Three sets, each in uk / ru / en (the app's language switched):
#   phone     8 shots 1080 x 1920 portrait (9:16), 480 dpi = 360 x 640 dp
#   tablet7   6 shots 1920 x 1080 LANDSCAPE (16:9), 320 dpi = 960 x 540 dp (two-pane)
#   tablet10  6 shots 1920 x 1080 landscape, 240 dpi = 1280 x 720 dp (two-pane) - two REAL profiles, never one image in both slots
# The emulator's display stops at 1920 px, so a set that keeps a system navigation area at the bottom is shot TALLER by that area
# (landscape only: the height has room) and cut back to the exact size (scripts/store_png.py, which also drops the alpha channel).
# Then the launcher (A-69): the app's label under its icon = «inok.info» (uiautomator) + its picture.
# Output: $OUT/store/<lang>/<set>/<NN>-<screen>.png, sizes.txt (every rule checked per file), home-label.png, label.txt. Nothing is uploaded.
set -u
OUT="${1:?out dir}"; ROOT="$(cd "$(dirname "$0")/.." && pwd)"; PKG=info.inok.app
S="$OUT/store"; mkdir -p "$S"
NAVJS="$ROOT/scripts/emu_nav.mjs"
nav() { node "$NAVJS" "$@" >> "$S/nav.txt" 2>&1 || echo "nav $* failed" >> "$S/nav.txt"; }
demo() { adb shell am broadcast -a com.android.systemui.demo -e command "$@" >/dev/null 2>&1 || true; }

adb shell cmd overlay enable com.android.internal.systemui.navbar.gestural >> "$S/demo.txt" 2>&1 || true
adb shell settings put global sysui_demo_allowed 1 || true
demo_all() { # D58: re-applied after every size / density change and before every shot
  demo enter; demo clock -e hhmm 1000; demo battery -e level 100 -e plugged false -e powersave false
  # N8 (REVIEW cloud_22): API 34 drew the mobile signal hollow (no data) even at level 4 - Google wants it full OR absent: no mobile icon at all
  demo network -e wifi show -e level 4 -e fully true; demo network -e mobile hide
  demo network -e airplane hide -e nosim hide -e carriernetworkchange hide
  demo notifications -e visible false
  demo status -e volume hide -e bluetooth hide -e location hide -e alarm hide -e zen hide -e sync hide -e tty hide -e eri hide -e mute hide -e speakerphone hide -e managed_profile hide
}
# the top row of the system navigation area that touches the bottom edge (0 = none), from `dumpsys window`
nav_top() {
  adb shell dumpsys window 2>/dev/null | tr -d '\r' | python3 -c '
import re, sys
ys = []
for line in sys.stdin.read().splitlines():
    if "navigationBars" in line and "visible=true" in line:
        for a, b, c, d in re.findall(r"frame=\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]", line):
            if int(d) > int(b) and int(a) == 0: ys.append((int(b), int(d)))
bottom = max((d for _, d in ys), default=0)
print(min((b for b, d in ys if d == bottom), default=0))'
}
adb emu geo fix 30.5571 50.4344 || true   # the Lavra: «Поруч» shows the houses around Kyiv

# ONCE: the app's own settings (Preferences, read at start): both soft questions answered (no dialog in any shot), the own-device mark (A-65:
# the run sends no views); then a clean start. Language and theme are then switched IN the app («Ще → Мова», «Ще → Тема»): writing them
# into Preferences again before a restart did not hold in run 42453919479 (all 60 shots came out uk / light) - each switch is read back.
adb shell am start -n $PKG/.MainActivity >/dev/null; sleep 8
nav eval "(async () => { const P = Capacitor.Plugins.Preferences; const v = (await P.get({ key: 'settings' })).value;
  const s = Object.assign(v ? JSON.parse(v) : {}, { lang: 'uk', theme: 'light', asked: ['articles', 'streams'], ownDevice: true });
  await P.set({ key: 'settings', value: JSON.stringify(s) }); return 'ok'; })()"
adb shell am force-stop $PKG; sleep 3; adb shell am start -n $PKG/.MainActivity >/dev/null; sleep 12
check() { node "$NAVJS" check "$1" 2>/dev/null; } # THE read-backs (scripts/store_checks.mjs; the browser ring makes the same: screens/store.spec.ts)
set_lang() {
  nav go /more/language; sleep 2; nav click "[data-testid=\"lang-$1\"]"; sleep 3
  [ "$(check lang)" = "$1" ] || echo "LANG FAIL $1" >> "$S/nav.txt"
}
set_theme() { # light | dark
  nav go /more; sleep 2; nav click "[data-testid=\"theme-$1\"]"; sleep 2
  local d; d=$(check theme)
  [ "$d" = "$1" ] || echo "THEME FAIL $1 ($d)" >> "$S/nav.txt"
}
# A-75 (1): BEFORE a language is shot, the export's unit words of card 242 and the list are read back in it (uk phone 1.0.1: «Київська diocese»)
units_ok() {
  local r1 r2; nav go /monasteries/242; sleep 3; node "$NAVJS" wait '[data-testid="card"] .card__sub' >> "$S/nav.txt" 2>&1; r1=$(check units)
  nav go /monasteries; sleep 3; node "$NAVJS" wait '[data-testid^="mrow-"]' >> "$S/nav.txt" 2>&1; r2=$(check units)
  echo "units $1: card=$r1 list=$r2" >> "$S/demo.txt"
  [ "$r1" = ok ] && [ "$r2" = ok ] || { echo "UNITS FAIL $1: card=$r1 list=$r2" >> "$S/nav.txt"; return 1; }
}
# N8: the status bar as SystemUI describes it (uiautomator content-desc): Wi-Fi full, battery 100, no mobile icon
statusbar() {
  adb shell uiautomator dump /sdcard/sb.xml >/dev/null 2>&1
  adb exec-out cat /sdcard/sb.xml 2>/dev/null | grep -o 'content-desc="[^"]*"' | sed 's/content-desc="//; s/"$//' \
    | grep -iE 'wi-?fi|battery|phone|signal|mobile|sim|bars?' | sort -u | tr '\n' ';'
}
statusbar_ok() { # $1 = what statusbar() said; only the definite fault stops the run (a mobile icon is there); the strip PNG is the evidence
  ! echo "$1" | grep -qiE 'phone|mobile|no sim'
}
strip() { python3 -c 'import sys; from PIL import Image; im = Image.open(sys.argv[1]); im.crop((0, 0, im.width, 110)).save(sys.argv[2])' "$1" "$2" 2>/dev/null || true; }

# A-75: frame 06 = ONE neutral publication (a monastery's history; no identifiable children on its header; no court subject) - QUESTIONS cloud_23
ART=${STORE_ARTICLE:-1832} # «Лаврський період життя святителя Володимира. Частина 1» (alternative 2736 «Подорож до Густинської обителі»)
# name | path | the element that proves it is drawn | scroll to (or -) | click before the shot (or -); phone: 1-8, tablets: 1-6 (A-68 order)
PHONE=(
  "home|/home|[data-testid=\"home-near\"]|-"
  "card|/monasteries/242|[data-testid=\"card\"] [data-testid=\"views\"]|-"
  "map|/map|[data-testid=\"map\"][data-ready=\"1\"]|-|do:fitLavras"
  "monasteries|/monasteries|[data-testid^=\"mrow-\"]|-"
  "streams|/streams|[data-testid=\"channels\"]|-"
  "article|/articles?id=$ART|[data-testid=\"article\"] .card__title|-"
  "eparchy|/more/eparchies/1|[data-testid=\"eparchy-title\"]|-"
)
# phone 3 (A-78 4): the map fitted to the THREE lavras' bounds with a pin's padding (1.0.2's one «+» step cut Pochaiv and Sviatohirsk) - read back
# (`check lavras`: each pin whole, clear of the controls) before the shot; tablets: 3 = the whole map as fitted (Ukraine centred already);
# 4 = the list beside a card (two-pane), another house than 2's; 6 = the article beside the «Публікації» list (A-75: no court headline),
# the list scrolled to the selected $ART (A-78 4: 1.0.2 showed the top of the list). The 5th field = `;`-separated pre-shot steps: a css click
# or `do:<action>` (scripts/store_checks.mjs ACTIONS).
# shellcheck disable=SC2034 # read through `local -n list` in shoot_set
TABLET=("${PHONE[@]:0:2}" "map|/map|[data-testid=\"map\"][data-ready=\"1\"]|-" "monasteries|/monasteries/37|[data-testid^=\"mrow-\"]|-" "${PHONE[@]:4:1}"
  "article|/articles?id=$ART|[data-testid=\"article\"] .card__title|-|[data-testid=\"kind-tab-publication\"];do:showSelected")

shot() { # file name path ready scroll click
  local f=$1 path=$3 ready=$4 scroll=$5 click=${6:--}
  nav go "$path"; sleep 3
  node "$NAVJS" wait "$ready" >> "$S/nav.txt" 2>&1 || echo "MISSING $f: $ready" >> "$S/nav.txt"
  if [ "$click" != "-" ]; then node "$NAVJS" drawn >> "$S/nav.txt" 2>&1   # a map: the step AFTER the app's own fit
    local step; IFS=';' read -ra steps <<< "$click"
    for step in "${steps[@]}"; do
      case "$step" in do:*) node "$NAVJS" "do" "${step#do:}" >> "$S/nav.txt" 2>&1 || echo "STEP FAIL $f: $step" >> "$S/nav.txt";; *) nav click "$step";; esac; sleep 2
    done
  fi
  [ "$scroll" = "-" ] || nav scroll "$scroll"
  demo_all; sleep 2
  node "$NAVJS" drawn >> "$S/nav.txt" 2>&1 || echo "NOT DRAWN $f" >> "$S/nav.txt"   # D61: MapLibre `idle`, never a timer
  [ "$(check dialog)" = clear ] || echo "DIALOG $f" >> "$S/nav.txt"   # A-68: no dialog over a shot
  if [ "$click" = "do:fitLavras" ]; then local lv; lv=$(check lavras); echo "lavras $f: $lv" >> "$S/demo.txt"; [ "$lv" = ok ] || echo "LAVRAS FAIL $f: $lv" >> "$S/nav.txt"; fi
  case "$click" in *do:showSelected*) local at; at=$(check articleTop); echo "articleTop $f: $at" >> "$S/demo.txt"; [ "$at" = ok ] || echo "ARTICLE TOP FAIL $f: $at" >> "$S/nav.txt";; esac
  adb exec-out screencap -p > "$f"
}

shoot_set() { # set W H density shots-array-name
  local set=$1 W=$2 H=$3 dpi=$4; local -n list=$5; local extra=0
  adb shell wm size ${W}x${H}; adb shell wm density $dpi; sleep 5; demo_all
  local top; top=$(nav_top)
  if [ "${top:-0}" -gt 0 ] && [ "$W" -gt "$H" ]; then extra=$((H - top)); adb shell wm size ${W}x$((H + extra)); sleep 5; demo_all; fi
  echo "$set: ${W}x${H} @${dpi} navigation area ${extra}px (shot ${W}x$((H + extra)), cut to ${W}x${H})" | tee -a "$S/demo.txt"
  for lang in uk ru en; do
    local d="$S/$lang/$set"; mkdir -p "$d"; local i=0
    set_lang "$lang"
    units_ok "$lang" || return 1
    for s in "${list[@]}"; do
      i=$((i + 1)); IFS='|' read -r name path ready scroll click <<< "$s"
      shot "$d/0$i-$name.png" "$name" "$path" "$ready" "$scroll" "$click"
      if [ $i -eq 1 ]; then # A-74 (4) fail fast: the FIRST frame of each language read back before the other frames are shot
        local l t b; l=$(check lang); t=$(check theme); b=$(statusbar)
        echo "first frame $set/$lang: lang=$l theme=$t statusbar=$b" >> "$S/demo.txt"; strip "$d/01-home.png" "$S/statusbar-$set-$lang.png"
        if [ "$l" != "$lang" ] || [ "$t" != light ] || ! statusbar_ok "$b"; then echo "FIRST FRAME FAIL $set/$lang: lang=$l theme=$t statusbar=$b" >> "$S/nav.txt"; return 1; fi
      fi
      # A-78 4 fail fast: the gold eye on the FIRST card frame and the stars' token on the FIRST article frame, before the rest is shot
      if { [ "$name" = card ] || [ "$name" = article ]; } && [ ! -e "$S/colours-$name.txt" ]; then
        local k; k=$([ "$name" = card ] && echo eye || echo stars); local v; v=$(check "$k")
        echo "first $name frame $set/$lang: $k=$v" | tee "$S/colours-$name.txt" >> "$S/demo.txt"
        [ "$v" = ok ] || { echo "COLOUR FAIL $set/$lang $name: $k=$v" >> "$S/nav.txt"; return 1; }
      fi
    done
    if [ "$set" = phone ]; then # 8: «Головна» in the DARK theme
      set_theme dark; shot "$d/08-home-dark.png" home-dark /home '[data-testid="home-near"]' -; set_theme light
    fi
  done
  echo "$set $W $H" >> "$S/sets.txt"
}

shoot_set phone 1080 1920 480 PHONE && shoot_set tablet7 1920 1080 320 TABLET && shoot_set tablet10 1920 1080 240 TABLET \
  || echo "store shots STOPPED early: $(grep -E '^(FIRST FRAME|UNITS|COLOUR) FAIL' "$S/nav.txt" | tail -1)" | tee -a "$S/demo.txt"
adb shell wm size reset; adb shell wm density reset; demo exit

# A-69: the launcher - the label under the icon is the whole «inok.info» (the app list, uk system language as the emulator's)
set_lang uk
adb shell wm size 1080x1920; adb shell wm density 480; sleep 4; demo_all
adb shell input keyevent 3; sleep 3; adb shell input swipe 540 1700 540 300 400; sleep 3
adb exec-out screencap -p > "$S/home-label.png"
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb exec-out cat /sdcard/ui.xml > "$S/launcher.xml" 2>/dev/null || true
LABEL=$(grep -o 'text="inok\.info"' "$S/launcher.xml" | head -1)
OLD=$(grep -o 'text="Монастир[^"]*"' "$S/launcher.xml" | head -1)
echo "launcher label: ${LABEL:-NOT FOUND} (old name: ${OLD:-none})" | tee "$S/label.txt"
adb shell wm size reset; adb shell wm density reset; demo exit; adb shell input keyevent 3

# every rule per file (A-68): exact 9:16 / 16:9, short side >= 1080, PNG 24-bit without alpha, <= 8 MB; counts 8 / 6 / 6 x 3
python3 "$ROOT/scripts/store_png.py" "$S" | tee "$S/sizes.txt"
echo "missing elements: $(grep -c MISSING "$S/nav.txt" 2>/dev/null || true)" | tee -a "$S/sizes.txt"
echo "maps not drawn: $(grep -c 'NOT DRAWN' "$S/nav.txt" 2>/dev/null || true)" | tee -a "$S/sizes.txt"
echo "dialogs over a shot: $(grep -c '^DIALOG' "$S/nav.txt" 2>/dev/null || true)" | tee -a "$S/sizes.txt"
echo "language / theme switches not taken: $(grep -cE '^(LANG|THEME) FAIL' "$S/nav.txt" 2>/dev/null || true)" | tee -a "$S/sizes.txt"
echo "unit words / first frames wrong: $(grep -cE '^(UNITS|FIRST FRAME) FAIL' "$S/nav.txt" 2>/dev/null || true)" | tee -a "$S/sizes.txt"
echo "colours (A-78): $(cat "$S/colours-card.txt" "$S/colours-article.txt" 2>/dev/null | tr '\n' ';'); wrong: $(grep -c '^COLOUR FAIL' "$S/nav.txt" 2>/dev/null || true)" | tee -a "$S/sizes.txt"
echo "lavras whole (A-78, phone 03): $(grep -c '^lavras .*: ok$' "$S/demo.txt" 2>/dev/null || true) of 3; steps failed: $(grep -cE '^(LAVRAS|STEP) FAIL' "$S/nav.txt" 2>/dev/null || true)" | tee -a "$S/sizes.txt"
echo "article top beside the list (A-79 5, tablet 06): $(grep -c '^articleTop .*: ok$' "$S/demo.txt" 2>/dev/null || true) of 6; cut: $(grep -c '^ARTICLE TOP FAIL' "$S/nav.txt" 2>/dev/null || true)" | tee -a "$S/sizes.txt"
echo "status bar (N8): $(grep -m1 '^first frame phone/uk' "$S/demo.txt" | sed 's/.*statusbar=//')" | tee -a "$S/sizes.txt"
grep -h 'STOPPED' "$S/demo.txt" 2>/dev/null | tee -a "$S/sizes.txt" || true
cat "$S/label.txt" >> "$S/sizes.txt"
