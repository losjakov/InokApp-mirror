#!/usr/bin/env bash
# emu_notify.sh - A-84 proof on the emulator (called by scripts/emulator_smoke.sh after the qa smoke):
#   bash scripts/emu_notify.sh <out dir> <app-debug.apk> <webview major> <engine floor>
# The DEBUG build (same key as qa: installed over it, data kept) alone carries PushTestReceiver (android/app/src/debug), which hands a data
# payload to the SAME code as InokMessagingService. Proves on a real NotificationManager: 5 articles = ONE group (5 children + 1 summary),
# a repeat replaces, two «ефір» of one channel = 1, an unknown type = nothing, stream_ended removes; then the app opened on Home (WebView
# >= the floor) = no article notification left while the stream one stays. Shade screenshots light + dark. Writes <out>/notify.txt; exit 1 = red.
set -uo pipefail
OUT="$1"; APK="$2"; WV="$3"; FLOOR="$4"; PKG=info.inok.app
R="$OUT/notify.txt"; : > "$R"
say() { echo "$*" | tee -a "$R"; }
fail=0; check() { if [ "$2" = "$3" ]; then say "ok   $1: $2"; else say "FAIL $1: got $2, want $3"; fail=1; fi; }

adb install -r "$APK" > /dev/null || { say "FAIL install of the debug APK"; exit 1; }
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS 2>/dev/null || true
adb shell am force-stop $PKG; adb shell input keyevent 3; sleep 2   # the app NOT in front (the service draws only then)

send() { adb shell am broadcast -n "$PKG/.PushTestReceiver" --es payload "$(printf '%s' "$1" | base64 -w0)" > /dev/null; sleep 1.5; }
# our active notifications as «tag id» lines: `cmd notification list` (keys user|pkg|id|tag|uid), else dumpsys's ACTIVE records (API 26-27:
# only `NotificationRecord(` lines - the dump's archive of cancelled ones prints `StatusBarNotification(... key=...)` too, run 43020831781)
ours() {
  { adb shell cmd notification list 2>/dev/null | tr -d '\r' | grep "|$PKG|" \
    || adb shell dumpsys notification 2>/dev/null | tr -d '\r' | grep "NotificationRecord(" | grep -o "key=[0-9]*|$PKG|[^: ]*" | sed 's/^key=//' | sort -u; } \
    | awk -F'|' '{ print $4, $3 }'
}
n() { ours | awk -v t="$1" '$1 ~ t' | wc -l | tr -d ' '; }
art() { printf '{"type":"article","id":"%s","kind":"news","title":"{\\"uk\\":\\"Тестова стаття %s\\",\\"ru\\":\\"Тестовая статья %s\\",\\"en\\":\\"Test article %s\\"}"}' "$1" "$1" "$1" "$1"; }
live() { printf '{"type":"%s","channel_id":"%s","video_id":"%s","title":"{\\"uk\\":\\"Тестовий ефір\\",\\"ru\\":\\"Тестовый эфир\\",\\"en\\":\\"Test live\\"}"}' "$1" "$2" "$3"; }

for i in 1 2 3 4 5; do send "$(art 90000$i)"; done
check "5 articles -> children" "$(n '^article$')" 5
check "5 articles -> ONE summary" "$(n '^articles$')" 1
send "$(art 900003)"
check "a repeat replaces" "$(n '^article$')" 5
send "$(live stream_live 990001 v1)"; send "$(live stream_live 990001 v2)"
check "two «ефір» of one channel" "$(n '^live_990001$')" 1
before=$(ours | wc -l | tr -d ' ')
send '{"type":"zzz_future","channel_id":"990001","title":"x"}'
check "an unknown type draws nothing" "$(ours | wc -l | tr -d ' ')" "$before"
send "$(live stream_live 990002 v3)"; send "$(live stream_ended 990002 v3)"
check "stream_ended removes its channel" "$(n '^live_990002$')" 0
# A-161 (4) + A-162 (1) (cloud_44): the site's 409 stream push - the CHANNEL as the title, «🔴 Наживо · …» as the text, in the app's language (uk)
send '{"type":"stream_live","channel_id":"990003","video_id":"v409","title":"{\"uk\":\"Літургія\",\"ru\":\"Литургия\",\"en\":\"Liturgy\"}","n_title":"{\"uk\":\"Тестовий канал\",\"ru\":\"Тестовый канал\",\"en\":\"Test channel\"}","n_text":"{\"uk\":\"🔴 Наживо · Літургія\",\"ru\":\"🔴 В эфире · Литургия\",\"en\":\"🔴 Live · Liturgy\"}"}'
N409=$(adb shell dumpsys notification --noredact 2>/dev/null | tr -d '\r' | grep -A40 "tag=live_990003" | grep -E "android\.(title|text)=" | head -2 | tr '\n' ' ')
echo "409: $N409" >> "$R"
# the title = the CHANNEL in the APP's language (the emulator's app follows the image's English: «Test channel»; emulator 45037147515)
check "409 stream push titled by the channel" "$(echo "$N409" | grep -cE 'android.title=String \((Тестовий канал|Тестовый канал|Test channel)\)')" 1
check "409 text = «🔴 …» line" "$(echo "$N409" | grep -cE 'android.text=String \(🔴 (Наживо|В эфире|Live) · ')" 1
ours > "$OUT/notify_list_before.txt"
adb shell dumpsys notification --noredact 2>/dev/null | tr -d '\r' | grep -A40 "pkg=$PKG" | grep -E "android\.(title|text|textLines|summaryText)|groupKey|mGroupSummary|channel=" | head -60 > "$OUT/notify_dump.txt" || true
grep -E "channel=inok_" "$OUT/notify_dump.txt" | grep -o "channel=[a-z_]*" | sort | uniq -c | tee -a "$R" || true
adb shell dumpsys notification 2>/dev/null | tr -d '\r' | grep -E "NotificationChannel\{mId='inok_" | sed -E "s/.*mId='([a-z_]+)'.*mImportance=([0-9]+).*/channel \1 importance \2/" | sort -u | tee -a "$R" || true
check "the old channel inok_push is gone" "$(adb shell dumpsys notification 2>/dev/null | grep -c "mId='inok_push'")" 0

# the shade, light and dark (the review screens of the grouped tray)
adb shell cmd statusbar expand-notifications 2>/dev/null || adb shell service call statusbar 1 > /dev/null; sleep 2
adb exec-out screencap -p > "$OUT/notify_shade_light.png"
adb shell cmd uimode night yes > /dev/null 2>&1; sleep 3
adb exec-out screencap -p > "$OUT/notify_shade_dark.png"
adb shell cmd uimode night no > /dev/null 2>&1; adb shell cmd statusbar collapse 2>/dev/null || adb shell service call statusbar 2 > /dev/null; sleep 1

# A-84 (b): open the app -> Home seen -> the article notifications go; the «ефір» stays (live-status grace, never «clear everything»)
if [ "$WV" -ge "$FLOOR" ]; then
  adb shell am start -n "$PKG/.MainActivity" > /dev/null; sleep 12
  ours > "$OUT/notify_list_after.txt"
  check "app opened on Home -> article children" "$(n '^article$')" 0
  check "app opened on Home -> summary" "$(n '^articles$')" 0
  check "app opened -> the «ефір» stays" "$(n '^live_990001$')" 1
  CLEAR=ok
  # cloud_46 (A-174): the reminder's countdown - posted by the app (a reminder 2 h ahead, its own silent channel, the chronometer), then the
  # reminder gone -> the countdown gone (`tag countdown` 1 -> 0); the shade shot = the review / history frame
  NAV="$(dirname "$0")/emu_nav.mjs"
  cd1=$(node "$NAV" eval "(async () => { const P = Capacitor.Plugins.InokCountdown; const w = { label: 'НАГАДУВАННЯ · inok.info', in: 'Трансляція почнеться через', started: 'Трансляція почалася — відкрити', open: 'Відкрити', cancel: 'Скасувати', channel: 'Відлік до трансляції' }; return JSON.stringify(await P.sync({ items: [{ id: '3|ringcount1', channel_id: 3, video_id: 'ringcount1', at: Date.now() + 7200000, title: 'Божественна літургія', monastery: 'Свято-Успенська Почаївська Лавра' }], words: w, now: Date.now() })); })()" 2>>"$R" | head -1)
  if [ -n "$cd1" ]; then
    sleep 2; check "countdown posted (A-174)" "$(n '^countdown$')" 1
    adb shell dumpsys notification 2>/dev/null | tr -d '\r' | grep -A3 "channel=countdown\|id=countdown" | head -6 >> "$R"
    adb shell cmd statusbar expand-notifications 2>/dev/null || adb shell service call statusbar 1 > /dev/null; sleep 2
    adb exec-out screencap -p > "$OUT/countdown_shade_light.png"
    adb shell cmd statusbar collapse 2>/dev/null || adb shell service call statusbar 2 > /dev/null; sleep 1
    node "$NAV" eval "Capacitor.Plugins.InokCountdown.sync({ items: [], words: {}, now: Date.now() }).then((x) => JSON.stringify(x))" >> "$R" 2>&1; sleep 2
    check "countdown removed with its reminder (A-174)" "$(n '^countdown$')" 0
  else say "countdown n/a: no answer from the page's eval (the shade proof waits for the next pass)"; fi
else CLEAR="n/a(webview $WV)"; say "skip the Home-seen step: WebView $WV < $FLOOR (error.html, no JS)"; fi
adb shell am force-stop $PKG
say "notify $([ $fail = 0 ] && echo PASS || echo FAIL) clear=$CLEAR"
exit $fail
