#!/usr/bin/env bash
# preflight.sh - the A-74 local gate (ref/DECISIONS_9.md, ref/REF_app_testing.md «Before a run»): everything the sandbox can prove, BEFORE a push
# that starts build / screens and before any manual or emulator run. No PASS line = no push, no run.
#   bash scripts/preflight.sh                      -> budgets, lint, typecheck, unit tests, actionlint, bash -n + shellcheck, bash 3.2 (macOS), the mirror snapshot
#   bash scripts/preflight.sh '<playwright grep>'  -> + the screens the change touches (Playwright --grep), with THROTTLE=4 (a slow runner)
# Tools: actionlint + shellcheck from PyPI (`pip install actionlint-py shellcheck-py`) - never a runner's first try.
set -euo pipefail
cd "$(dirname "$0")/.."
step() { printf '\n== %s\n' "$1"; }
step budgets;   python3 scripts/doc_budget_check.py | tail -1
step lint;      npm run -s lint
step typecheck; npm run -s typecheck
step unit;      npm test --silent 2>&1 | grep -E '^ +(Test Files|Tests) '
step workflows; SHELLCHECK_OPTS='-S warning' actionlint .github/workflows/*.yml
step ci;        python3 -I scripts/ci_infra.py --self-test; python3 -I scripts/db_read.py --self-test; python3 -I scripts/a11y_report.py --self-test; python3 -I scripts/a11y_dump.py --self-test   # A-87 / A-88: the INFRA / CODE rule, the stdlib DB reads
step java;      bash scripts/java_unit.sh; python3 -I scripts/dex_check.py --self-test; python3 -I scripts/release_check.py --self-test; python3 -I scripts/r8_stats.py --self-test
step shell;     for f in scripts/*.sh; do bash -n "$f"; done; shellcheck -S warning scripts/*.sh
step bash32;    python3 -I scripts/bash32_check.py --self-test; python3 -I scripts/bash32_check.py   # B3 (cloud_39): what macOS runs, read as bash 3.2
# A-104 (cloud_32): the public mirror must build ALONE - the snapshot of HEAD (commit first: never the working tree) in a temp dir, and npm ci +
# lint + typecheck + unit run INSIDE it once; a test that reads a private path fails here, not in the mirror
step mirror;    python3 -I scripts/mirror_snapshot.py --self-test
MIRROR_TMP="$(mktemp -d)"; trap 'rm -rf "$MIRROR_TMP"' EXIT
python3 -I scripts/mirror_snapshot.py build "$MIRROR_TMP/s"
( cd "$MIRROR_TMP/s" && npm ci --prefer-offline --no-audit --no-fund --silent > /dev/null && npm run -s lint && npm run -s typecheck \
  && npm test --silent 2>&1 | grep -E '^ +(Test Files|Tests) ' | sed 's/^/snapshot /' )
if [ -n "${1:-}" ]; then step "screens ~ $1 (THROTTLE=4)"; THROTTLE=4 npx playwright test -c screens/playwright.config.ts --grep "$1" 2>&1 | tail -3; fi
printf '\npre-flight PASS %s %s%s\n' "$(date -u +%FT%TZ)" "$(git rev-parse --short HEAD)" "$([ -n "$(git status --porcelain)" ] && echo ' +dirty')"
