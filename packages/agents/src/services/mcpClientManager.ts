/**
 * MCP Client Manager Service
 *
 * Manages connections to multiple MCP servers and provides a unified
 * interface to access their tools. Supports both local (stdio) and
 * remote (SSE) MCP servers with OAuth 2.1 authentication.
 *
 * Exported via @orient/mcp-servers package.
 *
 * Based on OpenCode's implementation for OAuth flow.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { createServiceLogger } from '@orient/core';
import {
  MCPOAuthClientProvider,
  createOAuthProvider,
  waitForAuthCode,
  getCapturedAuthUrl,
  OAUTH_CALLBACK_URL,
} from './oauthClientProvider.js';

const logger = createServiceLogger('mcp-client-manager');

/**
 * MCP Server configuration from mcp.json
 */
interface MCPServerConfig {
  // For SSE/HTTP servers (remote)
  url?: string;
  type?: 'local' | 'remote';
  enabled?: boolean;
  // For stdio servers (local)
  command?: string | string[];
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

// Support both Cursor's mcp.json format and OpenCode's config format
interface MCPConfig {
  mcpServers?: Record<string, MCPServerConfig>; // Cursor format
  mcp?: Record<string, MCPServerConfig>; // OpenCode format
}

/**
 * MCP Server Status
 */
export type MCPServerStatus =
  | { status: 'connected' }
  | { status: 'disabled' }
  | { status: 'failed'; error: string }
  | { status: 'needs_auth' }
  | { status: 'needs_client_registration'; error: string };

/**
 * Connected MCP server with its client and metadata
 */
interface ConnectedServer {
  name: string;
  client: Client;
  transport: StdioClientTransport | SSEClientTransport;
  tools: Tool[];
  status: MCPServerStatus;
  authProvider?: MCPOAuthClientProvider;
  serverUrl?: string; // For remote servers
}

/**
 * Tool with server context
 */
export interface MCPTool {
  serverName: string;
  name: string;
  prefixedName: string;
  description?: string;
  inputSchema: Tool['inputSchema'];
}

/**
 * Tool call result
 */
export interface MCPToolCallResult {
  success: boolean;
  content?: unknown;
  error?: string;
}

// Store pending OAuth transports
const pendingOAuthTransports = new Map<string, SSEClientTransport>();

/**
 * MCP Client Manager
 *
 * Manages connections to multiple MCP servers and provides unified access
 * to their tools.
 */
export class MCPClientManager {
  private servers: Map<string, ConnectedServer> = new Map();
  private serverStatuses: Map<string, MCPServerStatus> = new Map();
  private isInitialized = false;
  private configPath: string;
  private inlineConfig?: Record<string, MCPServerConfig>;

  constructor(configPathOrInline?: string | Record<string, MCPServerConfig>) {
    if (typeof configPathOrInline === 'object') {
      // Inline config passed directly
      this.inlineConfig = configPathOrInline;
      this.configPath = '';
    } else {
      // Path to config file, or default to Cursor's global MCP config
      this.configPath = configPathOrInline || path.join(os.homedir(), '.cursor', 'mcp.json');
    }
  }

  /**
   * Load MCP configuration from file
   */
  private loadConfig(): MCPConfig | null {
    // If inline config was provided, use it
    if (this.inlineConfig) {
      logger.info('Using inline MCP config', {
        serverCount: Object.keys(this.inlineConfig).length,
        servers: Object.keys(this.inlineConfig),
      });
      return { mcpServers: this.inlineConfig };
    }

    try {
      if (!fs.existsSync(this.configPath)) {
        logger.warn('MCP config file not found', { path: this.configPath });
        return null;
      }

      const configData = fs.readFileSync(this.configPath, 'utf-8');
      const rawConfig = JSON.parse(configData);

      // Normalize config: support both 'mcpServers' (Cursor) and 'mcp' (OpenCode) formats
      const config: MCPConfig = {
        mcpServers: rawConfig.mcpServers || rawConfig.mcp || {},
      };

      logger.info('Loaded MCP config', {
        path: this.configPath,
        serverCount: Object.keys(config.mcpServers ?? {}).length,
        servers: Object.keys(config.mcpServers ?? {}),
        format: rawConfig.mcpServers ? 'cursor' : rawConfig.mcp ? 'opencode' : 'unknown',
      });

      return config;
    } catch (error) {
      logger.error('Failed to load MCP config', {
        error: error instanceof Error ? error.message : String(error),
        path: this.configPath,
      });
      return null;
    }
  }

  /**
   * Create an MCPClientManager with inline config (useful for dashboard)
   */
  static withInlineConfig(servers: Record<string, MCPServerConfig>): MCPClientManager {
    return new MCPClientManager(servers);
  }

  /**
   * Initialize and connect to all configured MCP servers
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('MCPClientManager already initialized');
      return;
    }

    const op = logger.startOperation('initialize');
    const config = this.loadConfig();

    if (!config || !config.mcpServers) {
      logger.warn('No MCP servers configured');
      this.isInitialized = true;
      op.success('No servers to connect');
      return;
    }

    const serverNames = Object.keys(config.mcpServers);
    logger.info('Connecting to MCP servers', { count: serverNames.length, servers: serverNames });

    // Connect to each server
    const connectionPromises = serverNames.map(async (serverName) => {
      const serverConfig = config.mcpServers![serverName];
      try {
        await this.connectToServer(serverName, serverConfig);
        return { serverName, success: true };
      } catch (error) {
        logger.error('Failed to connect to MCP server', {
          serverName,
          error: error instanceof Error ? error.message : String(error),
        });
        return { serverName, success: false, error };
      }
    });

    const results = await Promise.allSettled(connectionPromises);

    const connected = Array.from(this.serverStatuses.values()).filter(
      (s) => s.status === 'connected'
    ).length;
    const needsAuth = Array.from(this.serverStatuses.values()).filter(
      (s) => s.status === 'needs_auth'
    ).length;

    this.isInitialized = true;
    op.success('MCP initialization complete', { connected, needsAuth, total: results.length });

    console.log(`\n🔌 MCP Servers: ${connected}/${results.length} connected`);
    for (const [name] of this.serverStatuses) {
      const status = this.serverStatuses.get(name);
      const icon =
        status?.status === 'connected' ? '✅' : status?.status === 'needs_auth' ? '🔐' : '❌';
      const server = this.servers.get(name);
      const tools = server?.tools.length || 0;
      console.log(`   • ${name}: ${icon} ${status?.status} (${tools} tools)`);
    }
  }

  /**
   * Connect to a single MCP server
   */
  private async connectToServer(serverName: string, config: MCPServerConfig): Promise<void> {
    const op = logger.startOperation('connectToServer', { serverName });

    // Determine transport type based on config
    const isSSE = !!config.url;
    const isStdio = !!config.command;

    if (!isSSE && !isStdio) {
      const status: MCPServerStatus = {
        status: 'failed',
        error: 'Invalid config: missing url or command',
      };
      this.serverStatuses.set(serverName, status);
      throw new Error(`Invalid MCP server config for ${serverName}: missing url or command`);
    }

    // Create the MCP client
    const client = new Client(
      { name: `orienter-${serverName}`, version: '1.0.0' },
      { capabilities: {} }
    );

    let transport: StdioClientTransport | SSEClientTransport;
    let authProvider: MCPOAuthClientProvider | undefined;

    if (isSSE) {
      // SSE transport (for remote servers like Atlassian)
      const serverUrl = new URL(config.url!);

      // Create OAuth provider for authentication
      authProvider = createOAuthProvider(config.url!, serverName);

      transport = new SSEClientTransport(serverUrl, {
        authProvider,
      });

      logger.info('Created SSE transport', { serverName, url: config.url });
    } else {
      // Stdio transport (for local servers)
      let env: Record<string, string> | undefined;
      if (config.env) {
        env = {};
        for (const [key, value] of Object.entries(process.env)) {
          if (value !== undefined) {
            env[key] = value;
          }
        }
        Object.assign(env, config.env);
      }

      transport = new StdioClientTransport({
        command: Array.isArray(config.command) ? config.command[0] : config.command!,
        args: config.args || [],
        cwd: config.cwd,
        env,
      });

      logger.info('Created stdio transport', {
        serverName,
        command: config.command,
        args: config.args,
      });
    }

    // Connect with error handling
    try {
      await client.connect(transport);
      logger.info('Connected to MCP server', { serverName });

      // List available tools
      const toolsResult = await client.listTools();
      const tools = toolsResult.tools || [];

      logger.info('Retrieved tools from MCP server', {
        serverName,
        toolCount: tools.length,
        tools: tools.map((t) => t.name),
      });

      // Store the connected server
      const status: MCPServerStatus = { status: 'connected' };
      this.serverStatuses.set(serverName, status);
      this.servers.set(serverName, {
        name: serverName,
        client,
        transport,
        tools,
        status,
        authProvider,
        serverUrl: config.url,
      });

      op.success('Server connected', { serverName, toolCount: tools.length });
    } catch (error) {
      // Check if this is an auth error that requires user interaction
      if (
        error instanceof UnauthorizedError &&
        authProvider &&
        transport instanceof SSEClientTransport
      ) {
        logger.info('OAuth authorization required - waiting for browser callback', { serverName });

        // Check if this is a "needs registration" error
        const errorMessage = error.message || '';
        if (errorMessage.includes('registration') || errorMessage.includes('client_id')) {
          const status: MCPServerStatus = {
            status: 'needs_client_registration',
            error: 'Server does not support dynamic client registration',
          };
          this.serverStatuses.set(serverName, status);
          op.success('Server requires client registration', { serverName });
          return;
        }

        // Wait for the authorization code from the callback
        try {
          logger.info('Waiting for OAuth authorization code', { serverName });
          const code = await waitForAuthCode(serverName);
          logger.info('Received authorization code', { serverName });

          // Exchange the code for tokens
          await transport.finishAuth(code);
          logger.info('Token exchange complete', { serverName });

          // Create new transport and client for reconnection (reusing the same authProvider)
          const transport2 = new SSEClientTransport(new URL(config.url!), { authProvider });
          const client2 = new Client(
            { name: `orienter-${serverName}`, version: '1.0.0' },
            { capabilities: {} }
          );

          // Reconnect
          await client2.connect(transport2);
          logger.info('Reconnected after OAuth', { serverName });

          // List available tools
          const toolsResult = await client2.listTools();
          const tools = toolsResult.tools || [];

          logger.info('Retrieved tools from MCP server', {
            serverName,
            toolCount: tools.length,
          });

          // Store the connected server
          const status: MCPServerStatus = { status: 'connected' };
          this.serverStatuses.set(serverName, status);
          this.servers.set(serverName, {
            name: serverName,
            client: client2,
            transport: transport2,
            tools,
            status,
            authProvider,
            serverUrl: config.url,
          });

          op.success('Server connected after OAuth', { serverName, toolCount: tools.length });
          return;
        } catch (authError) {
          logger.error('OAuth flow failed', {
            serverName,
            error: authError instanceof Error ? authError.message : String(authError),
          });
          const status: MCPServerStatus = {
            status: 'failed',
            error: `OAuth failed: ${authError instanceof Error ? authError.message : String(authError)}`,
          };
          this.serverStatuses.set(serverName, status);
          op.failure(authError instanceof Error ? authError : new Error(String(authError)));
          return;
        }
      } else {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const status: MCPServerStatus = { status: 'failed', error: errorMsg };
        this.serverStatuses.set(serverName, status);
        op.failure(error instanceof Error ? error : new Error(errorMsg));
        throw error;
      }
    }
  }

  /**
   * Start OAuth authentication flow for an MCP server.
   * Returns the authorization URL that should be opened in a browser.
   *
   * The MCP SDK handles the full OAuth flow including:
   * - Dynamic client registration
   * - PKCE code verifier generation
   * - Building the authorization URL with all required parameters
   */
  async startAuth(serverName: string): Promise<{ authorizationUrl: string; oauthState: string }> {
    const config = this.loadConfig();
    const serverConfig = config?.mcpServers?.[serverName];

    if (!serverConfig?.url) {
      throw new Error(`MCP server not found or not a remote server: ${serverName}`);
    }

    logger.info('Starting OAuth flow', { serverName, url: serverConfig.url });

    // Create a new auth provider for this flow
    const authProvider = new MCPOAuthClientProvider(serverConfig.url, serverName);

    // Create transport with auth provider
    const transport = new SSEClientTransport(new URL(serverConfig.url), {
      authProvider,
    });

    // Try to connect - this will trigger the OAuth flow
    try {
      const client = new Client(
        { name: `orienter-${serverName}`, version: '1.0.0' },
        { capabilities: {} }
      );
      await client.connect(transport);
      // If we get here, we're already authenticated
      logger.info('Already authenticated', { serverName });
      return { authorizationUrl: '', oauthState: '' };
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        // The MCP SDK has called redirectToAuthorization() which captured the URL
        // Store transport for finishAuth
        pendingOAuthTransports.set(serverName, transport);

        // Get the authorization URL that the SDK generated and our provider captured
        const capturedUrl = getCapturedAuthUrl(serverName);

        if (!capturedUrl) {
          logger.error('Failed to capture authorization URL from SDK', { serverName });
          throw new Error('OAuth flow failed - could not capture authorization URL');
        }

        // Extract the state from the URL
        const authUrl = new URL(capturedUrl);
        const oauthState = authUrl.searchParams.get('state') || '';

        logger.info('OAuth authorization URL captured', {
          serverName,
          urlLength: capturedUrl.length,
          hasClientId: authUrl.searchParams.has('client_id'),
          hasScope: authUrl.searchParams.has('scope'),
          hasCodeChallenge: authUrl.searchParams.has('code_challenge'),
          callbackUrl: OAUTH_CALLBACK_URL,
        });

        return {
          authorizationUrl: capturedUrl,
          oauthState,
        };
      }
      throw error;
    }
  }

  /**
   * Complete OAuth authentication after user authorizes in browser.
   * Opens the browser and waits for callback.
   */
  async authenticate(serverName: string): Promise<MCPServerStatus> {
    const { authorizationUrl, oauthState } = await this.startAuth(serverName);

    if (!authorizationUrl) {
      // Already authenticated
      return this.serverStatuses.get(serverName) ?? { status: 'connected' };
    }

    // Open the browser
    logger.info('Opening browser for OAuth', {
      serverName,
      url: authorizationUrl.substring(0, 100),
    });
    const open = (await import('open')).default;
    await open(authorizationUrl);

    // Wait for callback using the server name
    const code = await waitForAuthCode(serverName);

    // Finish auth
    return this.finishAuth(serverName, code);
  }

  /**
   * Complete OAuth authentication with the authorization code.
   */
  async finishAuth(serverName: string, authorizationCode: string): Promise<MCPServerStatus> {
    const transport = pendingOAuthTransports.get(serverName);

    if (!transport) {
      throw new Error(`No pending OAuth flow for MCP server: ${serverName}`);
    }

    try {
      // Call finishAuth on the transport
      await transport.finishAuth(authorizationCode);

      // Now try to reconnect
      const config = this.loadConfig();
      const serverConfig = config?.mcpServers?.[serverName];

      if (!serverConfig) {
        throw new Error(`MCP server not found: ${serverName}`);
      }

      // Remove from pending
      pendingOAuthTransports.delete(serverName);

      // Reconnect
      await this.connectToServer(serverName, serverConfig);

      return (
        this.serverStatuses.get(serverName) ?? {
          status: 'failed',
          error: 'Unknown error after auth',
        }
      );
    } catch (error) {
      logger.error('Failed to finish OAuth', { serverName, error });
      const status: MCPServerStatus = {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
      this.serverStatuses.set(serverName, status);
      return status;
    }
  }

  /**
   * Get all available tools from all connected servers
   */
  getAllTools(): MCPTool[] {
    const allTools: MCPTool[] = [];

    for (const [serverName, server] of this.servers) {
      if (server.status.status !== 'connected') continue;

      for (const tool of server.tools) {
        allTools.push({
          serverName,
          name: tool.name,
          prefixedName: `mcp_${serverName}_${tool.name}`,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      }
    }

    return allTools;
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPToolCallResult> {
    const op = logger.startOperation('callTool', { serverName, toolName });

    const server = this.servers.get(serverName);
    if (!server) {
      op.failure(new Error(`Server not found: ${serverName}`));
      return { success: false, error: `MCP server not found: ${serverName}` };
    }

    if (server.status.status !== 'connected') {
      op.failure(new Error(`Server not connected: ${serverName}`));
      return { success: false, error: `MCP server not connected: ${serverName}` };
    }

    try {
      const result = await server.client.callTool({
        name: toolName,
        arguments: args,
      });

      op.success('Tool called successfully', { serverName, toolName });
      return { success: true, content: result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      op.failure(error instanceof Error ? error : new Error(errorMessage));
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Call a tool by its prefixed name (e.g., "mcp_Atlassian-MCP-Server_searchJiraIssuesUsingJql")
   */
  async callToolByPrefixedName(
    prefixedName: string,
    args: Record<string, unknown>
  ): Promise<MCPToolCallResult> {
    const match = prefixedName.match(/^mcp_(.+?)_(.+)$/);
    if (!match) {
      return { success: false, error: `Invalid prefixed tool name: ${prefixedName}` };
    }

    const [, serverName, toolName] = match;
    return this.callTool(serverName, toolName, args);
  }

  /**
   * Check if a tool name is an MCP tool (prefixed with "mcp_")
   */
  isMCPTool(toolName: string): boolean {
    return toolName.startsWith('mcp_');
  }

  /**
   * Get the list of connected server names
   */
  getConnectedServers(): string[] {
    return Array.from(this.serverStatuses.entries())
      .filter(([, status]) => status.status === 'connected')
      .map(([name]) => name);
  }

  /**
   * Get server status for all servers
   */
  getServerStatuses(): Record<string, MCPServerStatus> {
    const result: Record<string, MCPServerStatus> = {};
    for (const [name, status] of this.serverStatuses) {
      result[name] = status;
    }
    return result;
  }

  /**
   * Get detailed server info
   */
  getServerInfo(): Array<{
    name: string;
    type: 'local' | 'remote';
    url?: string;
    status: MCPServerStatus;
    toolCount: number;
    hasTokens: boolean;
  }> {
    const config = this.loadConfig();
    const result: Array<{
      name: string;
      type: 'local' | 'remote';
      url?: string;
      status: MCPServerStatus;
      toolCount: number;
      hasTokens: boolean;
    }> = [];

    if (!config?.mcpServers) return result;

    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      const server = this.servers.get(name);
      const status = this.serverStatuses.get(name) ?? { status: 'disabled' as const };

      result.push({
        name,
        type: serverConfig.url ? 'remote' : 'local',
        url: serverConfig.url,
        status,
        toolCount: server?.tools.length ?? 0,
        hasTokens: server?.authProvider !== undefined, // Simplified check
      });
    }

    return result;
  }

  /**
   * Disconnect from all servers and cleanup
   */
  async shutdown(): Promise<void> {
    const op = logger.startOperation('shutdown');

    for (const [serverName, server] of this.servers) {
      try {
        await server.transport.close();
        logger.info('Disconnected from MCP server', { serverName });
      } catch (error) {
        logger.warn('Error disconnecting from MCP server', {
          serverName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.servers.clear();
    this.serverStatuses.clear();
    pendingOAuthTransports.clear();
    this.isInitialized = false;
    op.success('All MCP servers disconnected');
  }

  /**
   * Reconnect to a specific server
   */
  async reconnectServer(serverName: string): Promise<boolean> {
    const config = this.loadConfig();
    if (!config || !config.mcpServers![serverName]) {
      logger.warn('Server not found in config', { serverName });
      return false;
    }

    // Disconnect if already connected
    const existingServer = this.servers.get(serverName);
    if (existingServer) {
      try {
        await existingServer.transport.close();
      } catch {
        // Ignore disconnect errors
      }
      this.servers.delete(serverName);
    }

    // Reconnect
    try {
      await this.connectToServer(serverName, config.mcpServers![serverName]);
      return this.serverStatuses.get(serverName)?.status === 'connected';
    } catch (error) {
      logger.error('Failed to reconnect to server', {
        serverName,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Clear OAuth tokens for a server
   */
  async clearAuth(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);
    if (server?.authProvider) {
      server.authProvider.invalidateCredentials('all');
    }
    pendingOAuthTransports.delete(serverName);

    // Update status
    this.serverStatuses.set(serverName, { status: 'needs_auth' });
  }
}

/**
 * Create an MCP Client Manager instance
 */
export function createMCPClientManager(configPath?: string): MCPClientManager {
  return new MCPClientManager(configPath);
}
