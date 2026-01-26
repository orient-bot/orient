#!/bin/bash
# Start the MCP HTTP Bridge
# This allows Claude Code running in Docker to access Chrome MCP on the host
#
# Usage:
#   ./scripts/start-mcp-bridge.sh          # Start with defaults
#   ./scripts/start-mcp-bridge.sh --port 9999  # Custom port
#
# From Docker, configure Claude Code to use:
#   http://host.docker.internal:9876/mcp

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Default configuration
export MCP_BRIDGE_PORT="${MCP_BRIDGE_PORT:-9876}"
export MCP_BRIDGE_HOST="${MCP_BRIDGE_HOST:-127.0.0.1}"

# Find Claude binary
CLAUDE_BIN="${HOME}/.local/share/claude/versions/$(ls -1 ${HOME}/.local/share/claude/versions/ 2>/dev/null | sort -V | tail -1)"
if [ -z "$CLAUDE_BIN" ] || [ ! -f "$CLAUDE_BIN" ]; then
    # Try alternative location
    CLAUDE_BIN="$(which claude 2>/dev/null || echo "")"
fi

if [ -z "$CLAUDE_BIN" ] || [ ! -f "$CLAUDE_BIN" ]; then
    echo "Error: Claude binary not found"
    echo "Please install Claude Code first: https://claude.ai/download"
    exit 1
fi

export MCP_COMMAND="$CLAUDE_BIN"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  MCP HTTP Bridge                                              ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Exposing Chrome MCP over HTTP for Docker containers         ║"
echo "║                                                               ║"
echo "║  Bridge URL: http://${MCP_BRIDGE_HOST}:${MCP_BRIDGE_PORT}/mcp            ║"
echo "║  Docker URL: http://host.docker.internal:${MCP_BRIDGE_PORT}/mcp          ║"
echo "║                                                               ║"
echo "║  Claude binary: $CLAUDE_BIN"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Run the bridge
exec npx tsx "$SCRIPT_DIR/mcp-http-bridge.ts" "$@"
