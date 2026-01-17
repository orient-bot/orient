#!/usr/bin/env node
/**
 * Core MCP Server
 *
 * Essential tools that should always be available.
 * Includes:
 * - System tools (health check, config)
 * - Skills management
 * - Agents (orchestration, handoffs)
 * - Tool discovery
 *
 * Usage:
 *   node dist/mcp-servers/core-server.js
 */

import { main } from './base-server.js';

main('core');
