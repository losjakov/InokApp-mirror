#!/usr/bin/env bash
# emu_once_more.sh - cloud_39 (A-127, REVIEW cloud_38 NOTE 5): the emulator smoke, and ONCE more when the DEVICE was lost under it.
#   bash scripts/emu_once_more.sh <out dir> <cmd...>
# A failed attempt whose own output carries adb's words for a lost device («adb: device offline», «error: device offline», no devices -
# scripts/ci_infra.py EMU_LOST) is the runner, not the app: adb is restarted, the device waited for (boot completed), the job's verdict mark
# cleared, the smoke run again - once. Both attempts' output stay in <out dir> (attempt1.log, attempt2.log). A second loss = INFRA (re-run
# the job, A-108 + A-127: that one re-run is not counted); a failure without those words = CODE at once (never repeated).
set -uo pipefail
OUT="${1:?out dir}"; shift
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
D="${INOK_CI_DIR:-/tmp/inok-ci}"; mkdir -p "$D" "$OUT"
WAIT="${EMU_WAIT_S:-300}"
attempt() { "$@" 2>&1 | tee "$OUT/attempt$N.log"; return "${PIPESTATUS[0]}"; }
N=1; attempt "$@"; rc=$?
[ "$rc" -eq 0 ] && exit 0
v="$(python3 -I "$ROOT/scripts/ci_infra.py" classify emu "$OUT/attempt1.log" "$rc")"
case "$v" in INFRA*) ;; *) exit "$rc" ;; esac   # CODE: the smoke's own mark stands, nothing is repeated
echo "::warning title=INFRA retry::the device was lost under the smoke (${v#INFRA }) - adb restarted, the smoke runs once more"
adb kill-server > /dev/null 2>&1 || true; adb start-server > /dev/null 2>&1 || true
timeout "$WAIT" adb wait-for-device || true
timeout "$WAIT" bash -c 'until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d "\r")" = 1 ]; do sleep 3; done' || true
echo "- smoke attempt 1: the device lost (${v#INFRA }) - repeated once after an adb restart (A-127)" >> "$D/summary.md"
rm -f "$D/verdict.txt"   # attempt 1's mark (the smoke marks CODE on its way out) is not the verdict of the job
N=2; attempt "$@"; rc=$?
[ "$rc" -eq 0 ] && exit 0
v="$(python3 -I "$ROOT/scripts/ci_infra.py" classify emu "$OUT/attempt2.log" "$rc")"
case "$v" in INFRA*) rm -f "$D/verdict.txt"; python3 -I "$ROOT/scripts/ci_infra.py" mark INFRA "${v#INFRA }" "emulator smoke (twice)" > /dev/null ;; esac
exit "$rc"
