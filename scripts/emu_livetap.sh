#!/usr/bin/env bash
# emu_livetap.sh - A-161 (3) (cloud_44) on the emulator: a tap on a LIVE stream outside the app = «Трансляції» first, the stream on top, Back ->
# «Трансляції». (1) the widget's live row: the SAME intent its PendingIntent carries (VIEW inokapp://tab/streams?play=<id> -> MainActivity);
# (2) the stream push: a 409 stream_live (PushTestReceiver, the debug APK) -> the notification tapped in the shade (uiautomator). Each: the
# frame on top (YouTube, or the browser when the image has none - written, never hidden), the system Back, the frame and the in-app URL.
# Output: $OUT/livetap.txt (+ livetap_*.png); the last line = «livetap ok» | «livetap FAIL:<what>».   bash scripts/emu_livetap.sh <out-dir>
set -u
OUT="${1:?out dir}"; ROOT="$(cd "$(dirname "$0")/.." && pwd)"; PKG=info.inok.app
L="$OUT/livetap.txt"; : > "$L"; RES=ok
VID=$(curl -s -H 'X-Inok-App: eb741a6e64315c8aff6281ad13c21378' https://inok.info/api/app/v1/live-status | python3 -I -c 'import json,sys; l=json.load(sys.stdin).get("live") or []; print(l[0]["video_id"] if l else "")' 2>/dev/null || true)
VID=${VID:-DWCj8tI47q4}; echo "video: $VID (live now: $([ "$VID" = DWCj8tI47q4 ] && echo no || echo yes))" >> "$L"
top() { adb shell dumpsys activity activities 2>/dev/null | tr -d '\r' | grep -m1 -E 'topResumedActivity|mResumedActivity' | sed 's/^ *//'; }
after() { # name: the stream on top -> Back -> «Трансляції»
  sleep 8; local t u; t=$(top); echo "$1 on top: $t" >> "$L"; adb exec-out screencap -p > "$OUT/livetap_$1_top.png"
  case "$t" in *"$PKG/"*) RES="FAIL:$1 the stream did not open on top";; esac
  adb shell input keyevent 4; sleep 4; t=$(top); u=$(node "$ROOT/scripts/emu_nav.mjs" url 2>/dev/null || echo none)
  echo "$1 after Back: $t url=$u" >> "$L"; adb exec-out screencap -p > "$OUT/livetap_$1_back.png"
  case "$t" in *"$PKG/"*) [ "$u" = /streams ] || RES="FAIL:$1 Back -> $u";; *) RES="FAIL:$1 Back left the app";; esac
}
adb shell am start -n "$PKG/.MainActivity" > /dev/null; sleep 6; node "$ROOT/scripts/emu_nav.mjs" go /home > /dev/null 2>&1 || true; sleep 2
adb shell am start -a android.intent.action.VIEW -d "'inokapp://tab/streams?play=$VID'" -n "$PKG/.MainActivity" >> "$L" 2>&1
after widget
# the push: posted while the app is in the background, tapped in the shade
adb shell input keyevent 3; sleep 2
PAY=$(printf '{"type":"stream_live","channel_id":"1686","video_id":"%s","title":"{\\"uk\\":\\"Тест\\",\\"ru\\":\\"Тест\\",\\"en\\":\\"Test\\"}","n_title":"{\\"uk\\":\\"Почаївська Лавра (тест)\\",\\"ru\\":\\"Почаевская Лавра (тест)\\",\\"en\\":\\"Pochaiv Lavra (test)\\"}","n_text":"{\\"uk\\":\\"🔴 Наживо · Тест\\",\\"ru\\":\\"🔴 В эфире · Тест\\",\\"en\\":\\"🔴 Live · Test\\"}"}' "$VID" | base64 -w0)
adb shell am broadcast -n "$PKG/.PushTestReceiver" --es payload "$PAY" > /dev/null; sleep 2
adb shell cmd statusbar expand-notifications 2>/dev/null; sleep 2; adb exec-out screencap -p > "$OUT/livetap_push_shade.png"
adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1; adb exec-out cat /sdcard/ui.xml > "$OUT/livetap_ui.xml" 2>/dev/null
XY=$(python3 -I -c 'import re,sys; s=open(sys.argv[1],encoding="utf-8",errors="ignore").read(); m=re.search(r"text=\"Почаївська Лавра \(тест\)\"[^>]*bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"", s); print("" if not m else f"{(int(m[1])+int(m[3]))//2} {(int(m[2])+int(m[4]))//2}")' "$OUT/livetap_ui.xml" 2>/dev/null || true)
echo "push in the shade at: ${XY:-not found}" >> "$L"
if [ -n "$XY" ]; then adb shell input tap $XY; after push; else RES="FAIL:push not found in the shade"; adb shell cmd statusbar collapse 2>/dev/null; fi
echo "livetap $RES" | tee -a "$L"
