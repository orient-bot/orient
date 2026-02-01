/**
 * OAuth Client Provider for MCP Servers
 *
 * Re-exports the OAuth provider from @orient-bot/agents.
 * This provides a clean package import path for MCP OAuth functionality.
 *
 * @example
 * import {
 *   createOAuthProvider,
 *   handleProductionOAuthCallback,
 *   OAUTH_CALLBACK_URL,
 * } from '@orient-bot/mcp-servers/oauth';
 */

export * from '@orient-bot/agents';
