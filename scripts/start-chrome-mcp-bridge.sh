#!/bin/bash
# Start the Chrome MCP HTTP Bridge
#
# This allows Claude Code running in Docker to access Chrome MCP tools
# (browser automation via the Claude in Chrome extension).
#
# Prerequisites:
#   - Chrome must be running with Claude extension active
#   - The extension creates a socket at /tmp/claude-mcp-browser-bridge-$USER/
#
# Usage:
#   ./scripts/start-chrome-mcp-bridge.sh              # Default port 9877
#   CHROME_MCP_BRIDGE_PORT=9999 ./scripts/start-chrome-mcp-bridge.sh
#
# From Docker, configure Claude Code MCP settings:
#   {
#     "mcpServers": {
#       "chrome-bridge": {
#         "url": "http://host.docker.internal:9877/mcp"
#       }
#     }
#   }

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Default configuration
export CHROME_MCP_BRIDGE_PORT="${CHROME_MCP_BRIDGE_PORT:-9877}"
export CHROME_MCP_BRIDGE_HOST="${CHROME_MCP_BRIDGE_HOST:-127.0.0.1}"

# Check if Chrome MCP socket exists
SOCKET_DIR="/tmp/claude-mcp-browser-bridge-${USER}"
if [ ! -d "$SOCKET_DIR" ]; then
    echo "⚠️  Warning: Chrome MCP socket directory not found: $SOCKET_DIR"
    echo "   Make sure Chrome is running with Claude extension active."
    echo ""
fi

# Run the bridge
exec npx tsx "$SCRIPT_DIR/chrome-mcp-http-bridge.ts" "$@"
