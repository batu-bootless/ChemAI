#!/bin/bash
# Installs npm dependencies when a Claude Code cloud session starts, so it can
# type-check, lint and run `npm run build:web` right away.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# package-lock.json is generated on Windows and misses a few Linux-only
# optional packages, so `npm ci` refuses it. `npm install --no-save` installs
# the same versions without rewriting the lock file.
npm install --no-audit --no-fund --no-save
