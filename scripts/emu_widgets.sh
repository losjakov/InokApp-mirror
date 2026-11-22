#!/usr/bin/env bash
# emu_widgets.sh - the widgets on the emulator (the DEBUG APK is installed - its WidgetPreviewActivity applies the SAME RemoteViews a launcher
# gets, at a widget's size in dp). 1.0.18 (A-160, A-161, A-163; the CD kit README «Acceptance»):
#   app data: kind x size (2x1 170x80, 4x1 344x80, 2x2 170x176, 4x2 344x176, 4x4 344x360) x light / dark at the normal text size, and 4x2 + 2x2
#             at 1.3 and 2.0 (A-155 (1): fewer rows, «…» only there);
#   samples:  the Android 15+ generated preview (the renderer + the kit's data) and the Android 12-14 previewLayout, x uk / ru / en x light / dark;
#   the push path: a stream_live data message (PushTestReceiver) must change «Зараз в ефірі» at once.
# Writes $OUT/widgets/*.png + widgets.txt (last line = the verdict).   bash scripts/emu_widgets.sh <out-dir> <api>
set -uo pipefail
OUT="${1:?out dir}"; API="${2:-0}"; PKG=info.inok.app; D="$OUT/widgets"; mkdir -p "$D"; L="$OUT/widgets.txt"; : > "$L"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
shot() { local _; for _ in 1 2 3; do adb exec-out screencap -p > "$1"; python3 -I "$ROOT/scripts/png_ink.py" "$1" > /dev/null 2>&1 && return 0; sleep 1; done; return 0; }
# preview <file name> <extras...>
preview() { local f="$1"; shift; adb shell am start -W -n "$PKG/.WidgetPreviewActivity" "$@" > /dev/null 2>&1; sleep 2; shot "$D/$f.png"; adb shell input keyevent 4; sleep 1; }
SIZES="tiny:170:80 strip:344:80 small:170:176 medium:344:176 large:344:360"
theme() { if [ "$1" = dark ]; then adb shell cmd uimode night yes > /dev/null 2>&1; else adb shell cmd uimode night no > /dev/null 2>&1; fi; sleep 2; }
for th in light dark; do
  theme "$th"
  for kind in live upcoming new; do for s in $SIZES; do IFS=: read -r name w h <<< "$s"; preview "$kind-$name-$th" --es kind "$kind" --ei w "$w" --ei h "$h"; done; done
done
theme light
for fs in 1.3 2.0; do
  adb shell settings put system font_scale "$fs"; sleep 2
  for kind in live upcoming new; do preview "$kind-medium-font${fs/./}" --es kind "$kind" --ei w 344 --ei h 176; preview "$kind-small-font${fs/./}" --es kind "$kind" --ei w 170 --ei h 176; done
done
adb shell settings put system font_scale 1.0; sleep 2
# the picker samples (the API 34 image only: the same resources on every API; the kit's sheets are compared with these)
SAMPLES=0
case "$API" in 34*)
  for th in light dark; do
    theme "$th"
    for lang in uk ru en; do for kind in live upcoming new; do
      preview "sample-$kind-medium-$th-$lang" --es kind "$kind" --ei w 344 --ei h 176 --es sample "$lang"
      preview "sample-$kind-small-$th-$lang" --es kind "$kind" --ei w 170 --ei h 176 --es sample "$lang"
      preview "sample-$kind-large-$th-$lang" --es kind "$kind" --ei w 344 --ei h 360 --es sample "$lang"
      preview "sample-$kind-strip-$th-$lang" --es kind "$kind" --ei w 344 --ei h 80 --es sample "$lang"
      preview "sample-$kind-tiny-$th-$lang" --es kind "$kind" --ei w 170 --ei h 80 --es sample "$lang"
      preview "layout-$kind-$th-$lang" --es kind "$kind" --ei w 344 --ei h 176 --es sample "$lang" --es mode layout
    done; done
  done
  theme light; SAMPLES=$(find "$D" -name 'sample-*.png' -o -name 'layout-*.png' | wc -l | tr -d ' ');;
esac
N=$(find "$D" -name '*.png' | wc -l | tr -d ' ')
DATA=$(adb logcat -d -s InokWidgets:I 2>/dev/null | grep -c 'data=true' || true)
# the Android 15+ generated previews (WidgetSamples.publishOnce at the app's start): the platform's answer per kind
GEN=$(adb logcat -d -s InokWidgets:I 2>/dev/null | grep -o 'setWidgetPreview [A-Za-z]* [a-z]* = [a-z]*' | sort -u | tr '\n' ';' || true)
# the push path: a stream_live for a channel -> the live list now starts with it (the widgets' own data, WidgetPush)
PAY=$(printf '{"type":"stream_live","channel_id":"1686","video_id":"emuWidget01","title":"{\\"uk\\":\\"Тест віджета\\",\\"ru\\":\\"Тест\\",\\"en\\":\\"Test\\"}"}' | base64 | tr -d '\n')
adb shell am broadcast -n "$PKG/.PushTestReceiver" --es payload "$PAY" > /dev/null 2>&1; sleep 3
PUSHED=$(timeout 60 adb exec-out cat "/data/data/$PKG/shared_prefs/CapacitorStorage.xml" 2>/dev/null | grep -c 'emuWidget01' || true)
preview live-medium-pushed --es kind live --ei w 344 --ei h 176
echo "generated previews (API 35+): ${GEN:-none}" >> "$L"
echo "widgets shots=$N samples=$SAMPLES with-data=$DATA push=$([ "${PUSHED:-0}" -gt 0 ] && echo ok || echo FAIL)" | tee -a "$L"
