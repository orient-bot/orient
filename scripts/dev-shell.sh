#!/bin/bash
# Start an interactive shell in the development container
# All development happens inside this container
#
# Repos available at:
#   /workspace/personal - Private repo (orient-core)
#   /workspace/oss      - OSS repo (orient-bot)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Build if needed
docker compose -f docker/docker-compose.dev.yml build

# Start interactive shell
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Orient Development Container                                 ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Repositories:                                                ║"
echo "║    /workspace/personal  - Private repo (orient-core)         ║"
echo "║    /workspace/oss       - OSS repo (orient-bot)              ║"
echo "║                                                               ║"
echo "║  First time? Run: cd /workspace/personal && pnpm install     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

docker compose -f docker/docker-compose.dev.yml run --rm dev bash
