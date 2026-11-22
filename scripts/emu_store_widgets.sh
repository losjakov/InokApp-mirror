#!/usr/bin/env bash
# emu_store_widgets.sh - A-168 (2) (cloud_44): the Google Play phone frame «02-widgets» = the emulator's REAL home screen (light system theme,
# the status bar in demo mode as every store frame) with the three widgets «Зараз в ефірі», «Найближчі трансляції», «Нове на сайті» placed by
# the LAUNCHER itself: the debug-only WidgetPinActivity asks it (AppWidgetManager.requestPinAppWidget), uiautomator taps the launcher's own
# confirm, the widgets draw the app's LIVE data (the app ran on the live site before). Nothing is drawn, composed or resized: the frame is
# `screencap` of the home screen. NO REAL FRAME = NO FRAME: unless all three of ours are on ONE page, whole, the frame is not written
# (02-home stays in the set) and widgets_store.txt says what happened. x uk / ru / en (the app's language = the widgets' words).
#   bash scripts/emu_store_widgets.sh <out-dir>   (API 34 image, the debug APK installed)
set -u
OUT="${1:?out dir}"; ROOT="$(cd "$(dirname "$0")/.." && pwd)"; PKG=info.inok.app
S="$OUT/store"; mkdir -p "$S"; L="$S/widgets_store.txt"; : > "$L"
export ART=${STORE_ARTICLE:-1832}  # store_lib.sh frames() reads it
capture() { adb exec-out screencap -p > "$1"; }
demo() { adb shell am broadcast -a com.android.systemui.demo -e command "$@" >/dev/null 2>&1 || true; }
demo_all() { demo enter; demo clock -e hhmm 1000; demo battery -e level 100 -e plugged false -e powersave false; demo network -e wifi show -e level 4 -e fully true
  demo network -e mobile hide; demo notifications -e visible false; }
# shellcheck source=scripts/store_lib.sh
. "$ROOT/scripts/store_lib.sh"
ui() { adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1; adb exec-out cat /sdcard/ui.xml 2>/dev/null; }
# the centre of the first node whose text matches (case-insensitive) - the launcher's own button
tap_text() { local xy; xy=$(ui | python3 -I -c 'import re,sys; s=sys.stdin.read(); p=sys.argv[1]
for m in re.finditer(r"<node [^>]*>", s):
    n=m.group(0); t=re.search(r"text=\"([^\"]*)\"", n); b=re.search(r"bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"", n)
    if t and b and re.fullmatch(p, t.group(1), re.I): print((int(b[1])+int(b[3]))//2, (int(b[2])+int(b[4]))//2); break' "$1")
  [ -n "$xy" ] && { adb shell input tap $xy; echo "tapped «$1» at $xy" >> "$L"; return 0; }; echo "no «$1» on screen" >> "$L"; return 1; }
# how many of OUR widgets the home page shows whole (AppWidgetHostView nodes holding our package's views), and their bounds
ours() { ui | python3 -I -c 'import re,sys; s=sys.stdin.read()
w=[b for b in re.findall(r"class=\"android.appwidget.AppWidgetHostView\"[^>]*package=\"info.inok.app\"[^>]*bounds=\"(\[[^\"]*\])\"", s)]
w+= [b for b in re.findall(r"package=\"info.inok.app\"[^>]*class=\"android.appwidget.AppWidgetHostView\"[^>]*bounds=\"(\[[^\"]*\])\"", s)]
print(len(set(w)), " ".join(sorted(set(w))))'; }
adb shell cmd uimode night no > /dev/null 2>&1
adb shell wm size 1080x1920; adb shell wm density 400; sleep 5; demo_all
adb shell am start -n "$PKG/.MainActivity" > /dev/null; sleep 10
for kind in live upcoming new; do
  adb shell am start -n "$PKG/.WidgetPinActivity" --es kind "$kind" > /dev/null; sleep 3
  capture "$S/widgets_pin_dialog_$kind.png"
  tap_text '(add|add to home screen|add automatically|додати|добавить)' || true; sleep 3
done
adb logcat -d -s InokWidgets:I 2>/dev/null | grep 'requestPinAppWidget' >> "$L"
for lang in uk ru en; do
  set_lang "$lang"; sleep 4   # the app writes its data in that language; every placed widget redrawn (InokWidgetsPlugin.set)
  adb shell input keyevent 3; sleep 3; demo_all; sleep 2
  read -r n where <<< "$(ours)"
  echo "$lang: our widgets on the home page = ${n:-0} ($where)" >> "$L"
  if [ "${n:-0}" -ge 3 ]; then mkdir -p "$S/$lang/phone"; capture "$S/$lang/phone/02-widgets.png"; echo "$lang: 02-widgets REAL frame written" >> "$L"
  else capture "$S/widgets_home_$lang-NOT-A-FRAME.png"; echo "$lang: NO FRAME (02-home stays)" >> "$L"; fi
done
adb shell wm size reset; adb shell wm density reset; demo exit
echo "widgets-store $(grep -c 'REAL frame written' "$L") of 3 languages" | tee -a "$L"
