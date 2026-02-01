#!/usr/bin/env bash
set -euo pipefail

REGISTRY="${NPM_REGISTRY:-http://localhost:4873}"
export NPM_REGISTRY="$REGISTRY"
export ORIENT_SKIP_OPENCODE_CHECK=1
export ORIENT_NONINTERACTIVE=1
export ORIENT_NO_BROWSER=1

bash installer/install-npm.sh

if ! command -v orient >/dev/null 2>&1; then
  echo "orient CLI not found on PATH after install."
  exit 1
fi

orient --version
orient doctor
