#!/bin/bash
# MCP Server wrapper script - ensures proper working directory
cd /app
exec node /app/dist/mcp-servers/coding-server.js "$@"




