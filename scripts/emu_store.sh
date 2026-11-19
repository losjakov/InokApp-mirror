#!/usr/bin/env bash
# emu_store.sh - the Google Play screenshots from the REAL app (1.0.1 A-68; 1.0.2 A-75: N8 no mobile icon, uk words read back, frame 06 = ART; 1.0.3 A-78: map 03 = the three lavras, tablet 06 at the selected row, colours read back) on the Actions emulator, by A-68 (ref/DECISIONS_8.md) and Google Play
# Help 1078870: the live export, NO captions / frames / overlays, no dialog over a screen (the A-64 / A-67 soft questions are answered
# before the run through the app's own settings), status bar in demo mode, gesture navigation. Called by scripts/emulator_smoke.sh on the
# required API 34 image, after its checks, with the app already imported. Three sets, each in uk / ru / en (the app's language switched):
#   phone     8 shots 1080 x 1920 portrait (9:16), 480 dpi = 360 x 640 dp
#   tablet7   7 shots 1920 x 1080 LANDSCAPE (16:9), 320 dpi = 960 x 540 dp (two-pane)
#   tablet10  7 shots 1920 x 1080 landscape, 240 dpi = 1280 x 720 dp (two-pane) - two REAL profiles, never one image in both slots
# 1.0.11 (A-120 (4), A-122): THE line-up = scripts/store_frames.txt (the dark «Головна» first in every set); the frame's shooting and its
# read-backs = scripts/store_lib.sh (shared with the App Store set of the iOS simulator, scripts/ios_sim_tour.sh).
# The emulator's display stops at 1920 px, so a set that keeps a system navigation area at the bottom is shot TALLER by that area
# (landscape only: the height has room) and cut back to the exact size (scripts/store_png.py, which also drops the alpha channel).
# Then the launcher (A-69): the app's label under its icon = «inok.info» (uiautomator) + its picture.
# Output: $OUT/store/<lang>/<set>/<NN>-<screen>.png, sizes.txt (every rule checked per file), home-label.png, label.txt. Nothing is uploaded.
set -u
OUT="${1:?out dir}"; ROOT="$(cd "$(dirname "$0")/.." && pwd)"; PKG=info.inok.app
S="$OUT/store"; mkdir -p "$S"
ART=${STORE_ARTICLE:-1832} # A-122: «Лаврський період життя святителя Володимира. Частина 1» - its cover in uk / ru / en (the live feed, 16.11)
capture() { adb exec-out screencap -p > "$1"; }
# shellcheck source=scripts/store_lib.sh
. "$ROOT/scripts/store_lib.sh"
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

# ONCE: the app's own settings (Preferences, read at start): «Автозавантаження фото» = Wi-Fi and mobile (A-122: no placeholder in a frame),
# both soft questions answered (no dialog in any shot), the own-device mark (A-65:
# the run sends no views); then a clean start. Language and theme are then switched IN the app («Ще → Мова», «Ще → Тема»): writing them
# into Preferences again before a restart did not hold in run 42453919479 (all 60 shots came out uk / light) - each switch is read back.
adb shell am start -n $PKG/.MainActivity >/dev/null; sleep 8
nav eval "(async () => { const P = Capacitor.Plugins.Preferences; const v = (await P.get({ key: 'settings' })).value;
  const s = Object.assign(v ? JSON.parse(v) : {}, { lang: 'uk', theme: 'light', photos: 'any', asked: ['articles', 'streams', 'hint_monastery', 'hint_article'], ownDevice: true });
  await P.set({ key: 'settings', value: JSON.stringify(s) }); return 'ok'; })()"
adb shell am force-stop $PKG; sleep 3; adb shell am start -n $PKG/.MainActivity >/dev/null; sleep 12
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

shoot_set() { # set W H density
  local set=$1 W=$2 H=$3 dpi=$4; local extra=0
  adb shell wm size ${W}x${H}; adb shell wm density $dpi; sleep 5; demo_all
  local top; top=$(nav_top)
  if [ "${top:-0}" -gt 0 ] && [ "$W" -gt "$H" ]; then extra=$((H - top)); adb shell wm size ${W}x$((H + extra)); sleep 5; demo_all; fi
  echo "$set: ${W}x${H} @${dpi} navigation area ${extra}px (shot ${W}x$((H + extra)), cut to ${W}x${H})" | tee -a "$S/demo.txt"
  # cloud_38 D16: a size / density change with pages (the map) kept in the WebView's stack drew the 1.0.11 map frames in a corner - every set
  # starts from a FRESH app process at its final size (the settings, language included, live in Preferences and come back with it)
  adb shell am force-stop $PKG; sleep 2; adb shell am start -n $PKG/.MainActivity >/dev/null; sleep 12; demo_all
  local lists=phone; [ "$set" = phone ] || lists=tablet
  for lang in uk ru en; do
    local d="$S/$lang/$set"
    set_lang "$lang"
    units_ok "$lang" || return 1
    shoot_frames "$lists" "$d" "$lang" || return 1
    # N8: the status bar of the first frame (Wi-Fi full, battery 100, no mobile icon) - the strip PNG is the evidence
    local b; b=$(statusbar); echo "first frame $set/$lang: statusbar=$b" >> "$S/demo.txt"; strip "$d/01-home-dark.png" "$S/statusbar-$set-$lang.png"
    statusbar_ok "$b" || { echo "FIRST FRAME FAIL $set/$lang: statusbar=$b" >> "$S/nav.txt"; return 1; }
  done
  echo "$set $W $H" >> "$S/sets.txt"
}

shoot_set phone 1080 1920 480 && shoot_set tablet7 1920 1080 320 && shoot_set tablet10 1920 1080 240 \
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

# every rule per file (A-68): exact 9:16 / 16:9, short side >= 1080, PNG 24-bit without alpha, <= 8 MB; counts 8 / 7 / 7 x 3
python3 "$ROOT/scripts/store_png.py" "$S" | tee "$S/sizes.txt"
store_summary | tee -a "$S/sizes.txt"
echo "status bar (N8): $(grep -m1 '^first frame phone/uk: statusbar' "$S/demo.txt" | sed 's/.*statusbar=//')" | tee -a "$S/sizes.txt"
grep -h 'STOPPED' "$S/demo.txt" 2>/dev/null | tee -a "$S/sizes.txt" || true
cat "$S/label.txt" >> "$S/sizes.txt"
