#!/bin/bash
# Execute a command inside the development container
#
# Usage:
#   ./scripts/dev-exec.sh pnpm test
#   ./scripts/dev-exec.sh --oss pnpm test
#   ./scripts/dev-exec.sh --dir /workspace/oss gh pr list

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Parse arguments
WORKDIR="/workspace/personal"
CMD_ARGS=()
PARSING_OPTS=true

while [[ $# -gt 0 ]]; do
    if $PARSING_OPTS; then
        case $1 in
            --oss)
                WORKDIR="/workspace/oss"
                shift
                ;;
            --dir)
                WORKDIR="$2"
                shift 2
                ;;
            --)
                PARSING_OPTS=false
                shift
                ;;
            -*)
                echo "Unknown option: $1"
                echo ""
                echo "Usage: $0 [--oss|--dir PATH] <command> [args...]"
                echo ""
                echo "Options:"
                echo "  --oss         Work in /workspace/oss"
                echo "  --dir PATH    Work in specified directory"
                echo ""
                echo "Examples:"
                echo "  $0 pnpm install              # In personal repo"
                echo "  $0 --oss pnpm test           # In OSS repo"
                echo "  $0 gh pr list"
                exit 1
                ;;
            *)
                PARSING_OPTS=false
                CMD_ARGS+=("$1")
                shift
                ;;
        esac
    else
        CMD_ARGS+=("$1")
        shift
    fi
done

if [ ${#CMD_ARGS[@]} -eq 0 ]; then
    echo "Usage: $0 [--oss|--dir PATH] <command> [args...]"
    echo ""
    echo "Options:"
    echo "  --oss         Work in /workspace/oss"
    echo "  --dir PATH    Work in specified directory"
    echo ""
    echo "Examples:"
    echo "  $0 pnpm install              # In personal repo"
    echo "  $0 --oss pnpm test           # In OSS repo"
    echo "  $0 gh pr list"
    exit 1
fi

docker compose -f docker/docker-compose.dev.yml run --rm -w "$WORKDIR" dev "${CMD_ARGS[@]}"
