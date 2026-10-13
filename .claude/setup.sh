#!/usr/bin/env bash
# Sets up a Claude Code cloud session: enables pnpm, installs dependencies and
# points the browser tests at the session's preinstalled Chromium. Does
# nothing on other machines.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR"

corepack enable
pnpm install --frozen-lockfile

chromium="${PLAYWRIGHT_BROWSERS_PATH:-}/chromium"
if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -x "$chromium" ]; then
  echo "export CHROMIUM_PATH=$chromium" >> "$CLAUDE_ENV_FILE"
fi
