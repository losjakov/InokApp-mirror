#!/bin/bash
# SessionStart hook for Claude Code cloud sessions (CLAUDE_CODE_REMOTE=true only): installs npm dependencies from the
# lock file, skipping the install when package-lock.json / package.json / this script are unchanged since the last
# successful run (hash file lives inside node_modules, which git ignores). Local machines: no-op.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

hashes=node_modules/.session-start.sha256
if ! sha256sum --check --status "$hashes" 2>/dev/null; then
  rm -f "$hashes"
  echo "[install_pkgs] npm ci (lock file changed or first run)" >&2
  npm ci --no-audit --no-fund --loglevel=error
  sha256sum scripts/install_pkgs.sh package.json package-lock.json > "$hashes"
else
  echo "[install_pkgs] node_modules up to date" >&2
fi

# Playwright's Chromium is pre-installed in the cloud image; nothing to download here.
