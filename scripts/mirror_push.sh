#!/usr/bin/env bash
# mirror_push.sh <snapshot dir> - mirror.yml's push step (A-104, ref/REF_public_mirror.md §2): the built snapshot -> the public mirror over SSH
# with the DEPLOY KEY (write access to that ONE repository). Env: MIRROR_DEPLOY_KEY (secret), MIRROR_REPO (variable, owner/name),
# EMULATOR_MATRIX (optional: «standard» or JSON -> the branch `emulator`). Either of the first two absent = «mirror not configured»,
# exit 0, nothing pushed (so the job is green before CD configures the mirror, and in the mirror itself, which holds neither).
# The key: never on a command line, never echoed, a 0600 file in $RUNNER_TEMP removed on exit (and again by the workflow's always() step).
set -euo pipefail
set +x
SNAP="${1:?snapshot dir}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUM="${INOK_SUMMARY:-/dev/null}"
miss=""; [ -n "${MIRROR_DEPLOY_KEY:-}" ] || miss="$miss secret MIRROR_DEPLOY_KEY"; [ -n "${MIRROR_REPO:-}" ] || miss="$miss variable MIRROR_REPO"
if [ -n "$miss" ]; then
  echo "mirror not configured (missing:$miss) - nothing pushed" | tee -a "$SUM"
  [ -z "${EMULATOR_MATRIX:-}" ] || echo "::warning::an emulator run was requested, but the mirror is not configured - run emulator.yml in this repository instead"
  exit 0
fi
[[ "$MIRROR_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "::error::MIRROR_REPO must be owner/name"; exit 1; }
T="${RUNNER_TEMP:-$(mktemp -d)}"; K="$T/mirror_key"; KH="$T/mirror_known_hosts"
trap 'rm -f "$K"' EXIT
(umask 077; printf '%s\n' "$MIRROR_DEPLOY_KEY" > "$K")
# github.com's SSH host keys from GitHub's own API over HTTPS (survives a key rotation; never `StrictHostKeyChecking=no`)
bash "$ROOT/scripts/ci_step.sh" "github ssh host keys" net -- curl -fsS --retry 3 -o "$T/gh_meta.json" https://api.github.com/meta
python3 -I -c 'import json,sys; print("\n".join("github.com " + k for k in json.load(open(sys.argv[1]))["ssh_keys"]))' "$T/gh_meta.json" > "$KH"
export GIT_SSH_COMMAND="ssh -i $K -o IdentitiesOnly=yes -o UserKnownHostsFile=$KH -o StrictHostKeyChecking=yes -o BatchMode=yes"
ARGS=(); [ -z "${EMULATOR_MATRIX:-}" ] || ARGS=(--emulator-matrix "$EMULATOR_MATRIX")
python3 -I "$ROOT/scripts/mirror_snapshot.py" publish "$SNAP" "git@github.com:$MIRROR_REPO.git" "${ARGS[@]}" | tee -a "$SUM"
