#!/usr/bin/env node
/**
 * Coding MCP Server
 *
 * Minimal toolset for coding tasks in Cursor/Claude Code.
 * Includes:
 * - Google Slides tools (example-presentation-automation skill)
 * - Apps tools (mini-apps creation)
 * - Agents tools (orchestration)
 * - Basic JIRA (get_issue, health_check)
 * - Tool discovery
 *
 * Usage:
 *   node dist/mcp-servers/coding-server.js
 */

import { main } from './base-server.js';

main('coding');
