/**
 * OAuth Client Provider for MCP Servers
 *
 * Re-exports the OAuth provider from @orientbot/agents.
 * This provides a clean package import path for MCP OAuth functionality.
 *
 * @example
 * import {
 *   createOAuthProvider,
 *   handleProductionOAuthCallback,
 *   OAUTH_CALLBACK_URL,
 * } from '@orientbot/mcp-servers/oauth';
 */

export * from '@orientbot/agents';
