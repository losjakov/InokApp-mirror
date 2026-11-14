#!/usr/bin/env bash
# ci_step.sh - A-87 (1b, 1c): every CI step that can meet the network runs through here (one source, the workflows only name it).
#   bash scripts/ci_step.sh "<label>" net  -- <cmd...>   a fetch / a build that downloads: on a NETWORK signature (scripts/ci_infra.py)
#                                                       retried with back-off (CI_TRIES, default 3; CI_TIMEOUT s per attempt, optional);
#                                                       still unreachable = the job's verdict «INFRA: <host> unreachable … re-run, not code»
#   bash scripts/ci_step.sh "<label>" test -- <cmd...>  our tests / the smoke: once; a failure = «CODE …» (never INFRA from its log)
# Any failure WITHOUT a network signature is CODE at once (no retry: a lock-file mismatch or a compile error is never retried).
# The verdict and the collected summary lines go to the job summary in the workflow's last step (`ci_infra.py verdict`).
set -uo pipefail
LABEL="${1:?label}"; KIND="${2:?net|test}"; shift 2; [ "${1:-}" = -- ] && shift
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
D="${INOK_CI_DIR:-/tmp/inok-ci}"; mkdir -p "$D"
LOG="$D/$(printf '%s' "$LABEL" | tr -c 'A-Za-z0-9' '_').log"
TRIES="${CI_TRIES:-3}"; [ "$KIND" = test ] && TRIES=1
WAITS=(20 60 120)
n=1
while :; do
  if [ -n "${CI_TIMEOUT:-}" ]; then timeout "$CI_TIMEOUT" "$@" 2>&1 | tee "$LOG"; rc=${PIPESTATUS[0]}
  else "$@" 2>&1 | tee "$LOG"; rc=${PIPESTATUS[0]}; fi
  [ "$rc" -eq 0 ] && exit 0
  v="$(python3 -I "$ROOT/scripts/ci_infra.py" classify "$KIND" "$LOG" "$rc")"
  case "$v" in
    INFRA*)
      host="${v#INFRA }"
      if [ "$n" -lt "$TRIES" ]; then
        w="${WAITS[$((n - 1))]:-120}"; echo "::warning title=INFRA retry::$LABEL: $host unreachable (attempt $n of $TRIES) - again in $w s"
        sleep "$w"; n=$((n + 1)); continue
      fi
      line="$(python3 -I "$ROOT/scripts/ci_infra.py" mark INFRA "$host" "$LABEL")"
      echo "::error title=INFRA::$line"; exit 75 ;;
    *)
      line="$(python3 -I "$ROOT/scripts/ci_infra.py" mark CODE - "$LABEL")"
      echo "::error title=CODE::$line"; exit "$rc" ;;
  esac
done
