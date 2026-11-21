#!/usr/bin/env bash
# emu_widgets.sh - T9 (cloud_43, A-156 (3)): the review snapshots of the three widgets on the emulator (the DEBUG APK is installed - its
# WidgetPreviewActivity applies the SAME RemoteViews a launcher gets): kind x size x light / dark, at the normal text size and at 1.3.
# Also the push path: a stream_live data message (PushTestReceiver) must change «Зараз в ефірі» at once. Writes $OUT/widgets/*.png + widgets.txt.
#   bash scripts/emu_widgets.sh <out-dir>
set -uo pipefail
OUT="${1:?out dir}"; PKG=info.inok.app; D="$OUT/widgets"; mkdir -p "$D"; L="$OUT/widgets.txt"; : > "$L"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
shot() { local _; for _ in 1 2 3; do adb exec-out screencap -p > "$1"; python3 -I "$ROOT/scripts/png_ink.py" "$1" > /dev/null 2>&1 && return 0; sleep 1; done; return 0; }
preview() { adb shell am start -W -n "$PKG/.WidgetPreviewActivity" --es kind "$1" --es size "$2" > /dev/null 2>&1; sleep 2; shot "$D/$1-$2-$3.png"; adb shell input keyevent 4; sleep 1; }
for theme in light dark; do
  [ "$theme" = dark ] && adb shell cmd uimode night yes > /dev/null 2>&1 || adb shell cmd uimode night no > /dev/null 2>&1
  sleep 2
  for kind in live upcoming new; do for size in small medium; do preview "$kind" "$size" "$theme"; done; done
done
adb shell cmd uimode night no > /dev/null 2>&1
adb shell settings put system font_scale 1.3; sleep 2
for kind in live upcoming new; do preview "$kind" medium font130; done
adb shell settings put system font_scale 1.0; sleep 2
N=$(find "$D" -name '*.png' | wc -l | tr -d ' ')
DATA=$(adb logcat -d -s InokWidgets:I 2>/dev/null | grep -c 'data=true' || true)
# the push path: a stream_live for a channel -> the live list now starts with it (the widgets' own data, WidgetPush)
PAY=$(printf '{"type":"stream_live","channel_id":"1686","video_id":"emuWidget01","title":"{\\"uk\\":\\"Тест віджета\\",\\"ru\\":\\"Тест\\",\\"en\\":\\"Test\\"}"}' | base64 | tr -d '\n')
adb shell am broadcast -n "$PKG/.PushTestReceiver" --es payload "$PAY" > /dev/null 2>&1; sleep 3
PUSHED=$(timeout 60 adb exec-out cat "/data/data/$PKG/shared_prefs/CapacitorStorage.xml" 2>/dev/null | grep -c 'emuWidget01' || true)
preview live medium pushed
echo "widgets shots=$N with-data=$DATA push=$([ "${PUSHED:-0}" -gt 0 ] && echo ok || echo FAIL)" | tee -a "$L"
