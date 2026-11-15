#!/bin/bash
# cloud_36 (B4): the iOS simulator ring of .github/workflows/ios.yml - the built App.app on an iPhone (6.9", Pro Max) and an iPad (13")
# simulator, Ukrainian, light: launched with its console captured (Capacitor prints the JS console in a Debug build), the app's own
# «home painted» (src/app/bootLog.ts) waited for, then the screen shot and judged NOT white (scripts/png_ink.py, A-46's twin: never a
# white screen). The live export is imported on the first start, as on a phone.
#   bash scripts/ios_sim_shots.sh <App.app> <out dir>
set -euo pipefail
APP="$1"; OUT="$2"; ROOT="$(cd "$(dirname "$0")/.." && pwd)"; mkdir -p "$OUT"
pick() { xcrun simctl list devices available -j | python3 -I -c '
import json, re, sys
d = json.load(sys.stdin)["devices"]; rx = re.compile(sys.argv[1])
c = sorted((k, x["udid"]) for k, v in d.items() if "iOS" in k for x in v if rx.search(x["name"]))
print(c[-1][1] if c else "")' "$1"; }
RC=0
for spec in 'iphone|iPhone [0-9]+ Pro Max' 'ipad|iPad Pro 13'; do
  tag="${spec%%|*}"; rx="${spec#*|}"
  U="$(pick "$rx")"
  if [ -z "$U" ]; then echo "::error::no available simulator matches «$rx»"; xcrun simctl list devices available | head -40; RC=1; continue; fi
  NAME="$(xcrun simctl list devices | grep "$U" | sed 's/ (.*//; s/^ *//')"
  xcrun simctl boot "$U" 2>/dev/null || true
  xcrun simctl bootstatus "$U" -b > /dev/null
  xcrun simctl ui "$U" appearance light
  xcrun simctl install "$U" "$APP"
  LOG="$OUT/${tag}_console.txt"
  xcrun simctl launch --console-pty --terminate-running-process "$U" info.inok.app -AppleLanguages '(uk)' -AppleLocale uk_UA > "$LOG" 2>&1 &
  LP=$!
  PAINTED=no
  for _ in $(seq 1 120); do grep -q 'home painted' "$LOG" 2>/dev/null && { PAINTED=yes; break; }; sleep 2; done
  sleep 8
  SHOT="$OUT/sim-home__${tag}-uk-light.png"
  xcrun simctl io "$U" screenshot --type=png "$SHOT" > /dev/null
  INK="$(python3 -I "$ROOT/scripts/png_ink.py" "$SHOT" 2>/dev/null || echo 0)"
  BOOT="$(grep -a 'InokBoot' "$LOG" | sed 's/.*InokBoot: //' | tr '\n' ';' | cut -c1-400)"
  ERR="$(grep -aE 'InokBoot: (error|rejection)' "$LOG" | head -3 | tr '\n' ' ' || true)"
  echo "ios simulator $tag ($NAME): painted=$PAINTED ink=$INK errors=[${ERR}] boot=[${BOOT}]" | tee -a "$OUT/result.txt"
  kill "$LP" 2>/dev/null || true; xcrun simctl terminate "$U" info.inok.app 2>/dev/null || true; xcrun simctl shutdown "$U" || true
  if [ "$PAINTED" != yes ] || ! awk "BEGIN{exit !($INK > 0.05)}" || [ -n "$ERR" ]; then
    echo "::error::iOS $tag: the app did not paint its home (painted=$PAINTED, ink=$INK, errors=[$ERR]) - $LOG"; RC=1
  fi
done
exit $RC
