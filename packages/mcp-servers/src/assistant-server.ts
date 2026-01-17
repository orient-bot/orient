#!/usr/bin/env node
/**
 * Assistant MCP Server
 *
 * Full capabilities for WhatsApp/Slack bots and PM assistant.
 * Includes:
 * - Full JIRA (create, update, link, all queries)
 * - Slack messaging tools
 * - WhatsApp messaging tools
 * - Google Slides/Sheets tools
 * - Google OAuth services (Gmail, Calendar, Tasks)
 * - Tool discovery
 *
 * Usage:
 *   node dist/mcp-servers/assistant-server.js
 */

import { main } from './base-server.js';

main('assistant');
