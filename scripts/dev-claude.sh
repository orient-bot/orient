#!/bin/bash
# Start Claude Code inside the development container
# First run will prompt for authentication (persisted in volume)
#
# Usage:
#   ./scripts/dev-claude.sh                    # Start in /workspace/personal
#   ./scripts/dev-claude.sh --oss              # Start in /workspace/oss
#   ./scripts/dev-claude.sh --dir /workspace/oss  # Specify directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Parse arguments
WORKDIR="/workspace/personal"
CLAUDE_ARGS=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --oss)
            WORKDIR="/workspace/oss"
            shift
            ;;
        --dir)
            WORKDIR="$2"
            shift 2
            ;;
        *)
            CLAUDE_ARGS+=("$1")
            shift
            ;;
    esac
done

# Build if needed
docker compose -f docker/docker-compose.dev.yml build

# Run Claude Code in specified directory
docker compose -f docker/docker-compose.dev.yml run --rm -w "$WORKDIR" dev claude "${CLAUDE_ARGS[@]}"
