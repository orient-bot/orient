/**
 * OAuth Client Provider for MCP Servers
 *
 * Re-exports the OAuth provider from @orient/agents.
 * This provides a clean package import path for MCP OAuth functionality.
 *
 * @example
 * import {
 *   createOAuthProvider,
 *   handleProductionOAuthCallback,
 *   OAUTH_CALLBACK_URL,
 * } from '@orient/mcp-servers/oauth';
 */

export * from '@orient/agents';
