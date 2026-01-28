/**
 * OpenCode Client Service
 *
 * This service provides a client interface to interact with an OpenCode server.
 * It can be used by WhatsApp/Slack bots to leverage OpenCode as their AI processing backend.
 */

import { createServiceLogger, AVAILABLE_MODELS, parseModelName } from '@orientbot/core';
import type { ModelKey } from '@orientbot/core';

// Re-export model types and functions for backward compatibility
export { AVAILABLE_MODELS, parseModelName };
export type { ModelKey };

const logger = createServiceLogger('opencode-client');

export interface OpenCodeConfig {
  baseUrl: string; // e.g., 'http://localhost:4096'
  defaultAgent?: string; // e.g., 'build', 'plan', 'pm-assistant'
  defaultModel?: string; // Default model ID (e.g., 'anthropic/claude-sonnet-4-20250514')
  timeout?: number; // Request timeout in ms
  password?: string; // Server password for authentication (Basic auth)
}

export interface OpenCodeSession {
  id: string;
  version: string;
  projectID: string;
  directory: string;
  title: string;
  time: {
    created: number;
    updated: number;
  };
}

export interface OpenCodeMessage {
  info: {
    id: string;
    sessionID: string;
    role: string;
    time: {
      created: number;
      completed?: number;
    };
    modelID: string;
    providerID: string;
    agent: string;
    cost: number;
    tokens: {
      input: number;
      output: number;
      reasoning: number;
    };
    finish?: string;
  };
  parts: Array<{
    id: string;
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
}

export interface OpenCodeHealth {
  healthy: boolean;
  version: string;
}

// Auto-compact threshold: ~78% of 256K limit to leave room for responses
const AUTO_COMPACT_THRESHOLD = 200_000;

export class OpenCodeClient {
  private config: OpenCodeConfig;
  private sessionCache: Map<string, OpenCodeSession> = new Map();
  private tokenUsage: Map<string, number> = new Map(); // contextKey -> cumulative tokens

  constructor(config: OpenCodeConfig) {
    this.config = {
      timeout: 120000, // 2 minutes - OpenCode can be slow with complex MCP tool calls
      defaultModel: 'anthropic/claude-haiku-4-5-20251001',
      ...config,
    };
    logger.info('OpenCode client initialized', {
      baseUrl: config.baseUrl,
      defaultModel: this.config.defaultModel,
      passwordSet: !!this.config.password,
      passwordLength: this.config.password?.length || 0,
    });
  }

  /**
   * Get the default model ID
   */
  getDefaultModel(): string {
    return this.config.defaultModel || 'anthropic/claude-haiku-4-5-20251001';
  }

  /**
   * Check if the OpenCode server is healthy
   */
  async healthCheck(): Promise<OpenCodeHealth> {
    const response = await this.fetch('/global/health');
    return response.json() as Promise<OpenCodeHealth>;
  }

  /**
   * Create a new conversation session
   */
  async createSession(title?: string): Promise<OpenCodeSession> {
    const response = await this.fetch('/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title || 'Bot Session' }),
    });

    const session = (await response.json()) as OpenCodeSession;
    this.sessionCache.set(session.id, session);
    logger.info('Session created', { sessionId: session.id, title });
    return session;
  }

  /**
   * Get or create a session for a specific conversation context
   * Useful for maintaining conversation continuity per user/channel
   *
   * On startup or cache miss, queries OpenCode for existing sessions with matching
   * title to resume conversations across bot restarts.
   */
  async getOrCreateSession(contextKey: string, title?: string): Promise<OpenCodeSession> {
    // Check in-memory cache first (fast path)
    const cached = this.sessionCache.get(contextKey);
    if (cached) {
      return cached;
    }

    const sessionTitle = title || `Session: ${contextKey}`;

    // Query OpenCode for existing sessions with matching title
    try {
      const sessions = await this.listSessions();

      // Find session with matching title, preferring most recently updated
      const matchingSession = sessions
        .filter((s) => s.title === sessionTitle)
        .sort((a, b) => b.time.updated - a.time.updated)[0];

      if (matchingSession) {
        logger.info('Found existing session', {
          contextKey,
          sessionId: matchingSession.id,
          title: matchingSession.title,
        });
        this.sessionCache.set(contextKey, matchingSession);
        return matchingSession;
      }
    } catch (error) {
      logger.warn('Failed to query existing sessions', {
        contextKey,
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue to create new session on failure
    }

    // Create new session and cache with context key
    const session = await this.createSession(sessionTitle);
    this.sessionCache.set(contextKey, session);
    return session;
  }

  /**
   * Send a message to a session and wait for the response
   */
  async sendMessage(
    sessionId: string,
    message: string,
    options?: {
      agent?: string;
      model?: string; // Model ID to use for this message
      files?: Array<{ path: string }>;
    }
  ): Promise<OpenCodeMessage> {
    const messageParts: Array<{ type: string; text?: string; path?: string }> = [
      { type: 'text', text: message },
    ];

    // Add file references if provided
    if (options?.files) {
      for (const file of options.files) {
        messageParts.push({ type: 'file', path: file.path });
      }
    }

    const body: Record<string, unknown> = { parts: messageParts };
    if (options?.agent) {
      body.agent = options.agent;
    }

    // Add model selection if specified (as object with providerID and modelID)
    const modelId = options?.model || this.config.defaultModel;
    if (modelId) {
      // Format: "provider/model" or just "model" (defaults to xai provider for grok models)
      const modelParts = modelId.split('/');
      if (modelParts.length === 2) {
        body.model = { providerID: modelParts[0], modelID: modelParts[1] };
      } else {
        // Default provider based on model name
        const providerID = modelId.startsWith('grok') ? 'xai' : 'anthropic';
        body.model = { providerID, modelID: modelId };
      }
    }

    logger.debug('Sending message', {
      sessionId,
      messageLength: message.length,
      model: modelId,
    });

    const response = await this.fetch(`/session/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    let result: OpenCodeMessage;
    try {
      result = (await response.json()) as OpenCodeMessage;
    } catch (jsonError) {
      // If JSON parsing fails, it likely means the session doesn't exist
      // or OpenCode returned an invalid response
      const errorMsg = jsonError instanceof Error ? jsonError.message : String(jsonError);
      throw new Error(
        `Failed to parse OpenCode response for session ${sessionId}: ${errorMsg}. Session may not exist.`
      );
    }

    logger.info('Message processed', {
      sessionId,
      messageId: result.info.id,
      tokens: result.info.tokens,
      cost: result.info.cost,
      model: result.info.modelID,
    });

    return result;
  }

  /**
   * Extract the text response from an OpenCode message
   */
  extractTextResponse(message: OpenCodeMessage): string {
    const textParts = message.parts
      .filter((p) => p.type === 'text' && p.text)
      .map((p) => p.text as string);

    return textParts.join('\n');
  }

  /**
   * Extract tool calls from an OpenCode message
   * Returns a list of tool names that were used
   */
  extractToolsUsed(message: OpenCodeMessage): string[] {
    const toolNames: string[] = [];

    for (const part of message.parts) {
      // OpenCode uses 'tool' type with the tool name in the 'tool' field
      // Tool names are prefixed with MCP server name, e.g., "orienter_ai_first_get_blockers"
      if (part.type === 'tool') {
        const fullToolName = part.tool as string | undefined;
        if (fullToolName) {
          // Strip MCP server prefix (e.g., "orienter_" -> "ai_first_...")
          const toolName = fullToolName.includes('_')
            ? fullToolName.replace(/^[^_]+_/, '')
            : fullToolName;
          if (!toolNames.includes(toolName)) {
            toolNames.push(toolName);
          }
        }
      }
      // Also handle other possible formats from different providers
      if (
        part.type === 'tool-use' ||
        part.type === 'tool_use' ||
        part.type === 'tool-call' ||
        part.type === 'tool-invocation'
      ) {
        const toolName = (part.name || part.toolName || part.tool_name || part.tool) as
          | string
          | undefined;
        if (toolName && !toolNames.includes(toolName)) {
          toolNames.push(toolName);
        }
      }
    }

    return toolNames;
  }

  /**
   * Get messages for a session (includes tool call history)
   */
  async getSessionMessages(sessionId: string): Promise<OpenCodeMessage[]> {
    const response = await this.fetch(`/session/${sessionId}/message`);
    return response.json() as Promise<OpenCodeMessage[]>;
  }

  /**
   * Extract all tools used across multiple messages
   */
  extractAllToolsUsed(messages: OpenCodeMessage[]): string[] {
    const toolNames: string[] = [];
    for (const message of messages) {
      for (const tool of this.extractToolsUsed(message)) {
        if (!toolNames.includes(tool)) {
          toolNames.push(tool);
        }
      }
    }
    return toolNames;
  }

  /**
   * High-level method: Send a message and get the text response
   * This is the main method bots should use
   *
   * Handles stale sessions automatically by creating a new session if the cached one
   * no longer exists (e.g., after server restart or storage loss).
   */
  async chat(
    contextKey: string,
    message: string,
    options?: {
      sessionTitle?: string;
      agent?: string;
      model?: string; // Model ID to use for this chat
    }
  ): Promise<{
    response: string;
    sessionId: string;
    cost: number;
    tokens: { input: number; output: number };
    model: string;
    provider: string;
    toolsUsed: string[];
  }> {
    let session = await this.getOrCreateSession(contextKey, options?.sessionTitle);

    try {
      const result = await this.sendMessage(session.id, message, {
        agent: options?.agent,
        model: options?.model,
      });

      // Track cumulative token usage for this context
      const currentTokens =
        (this.tokenUsage.get(contextKey) || 0) +
        result.info.tokens.input +
        result.info.tokens.output;
      this.tokenUsage.set(contextKey, currentTokens);

      // Check if we need to auto-compact for the NEXT message
      if (currentTokens > AUTO_COMPACT_THRESHOLD) {
        await this.autoCompact(contextKey, session.id);
      }

      // Extract tools used from the current reply only (not full session history)
      const toolsUsed = this.extractToolsUsed(result);

      return {
        response: this.extractTextResponse(result),
        sessionId: session.id,
        cost: result.info.cost,
        tokens: {
          input: result.info.tokens.input,
          output: result.info.tokens.output,
        },
        model: result.info.modelID,
        provider: result.info.providerID,
        toolsUsed,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if error is due to context/token limit exceeded
      const isTokenLimitError =
        errorMessage.includes('maximum prompt length') ||
        errorMessage.includes('context_length_exceeded') ||
        errorMessage.includes('token');

      if (isTokenLimitError) {
        logger.warn('Token limit exceeded, attempting recovery via compaction', {
          contextKey,
          sessionId: session.id,
          error: errorMessage,
        });

        try {
          // Try to compact and retry
          await this.summarizeSession(session.id);
          this.tokenUsage.set(contextKey, 0);

          // Retry with the compacted session
          const result = await this.sendMessage(session.id, message, {
            agent: options?.agent,
            model: options?.model,
          });

          // Track tokens for the retry
          const currentTokens = result.info.tokens.input + result.info.tokens.output;
          this.tokenUsage.set(contextKey, currentTokens);

          return {
            response: this.extractTextResponse(result),
            sessionId: session.id,
            cost: result.info.cost,
            tokens: {
              input: result.info.tokens.input,
              output: result.info.tokens.output,
            },
            model: result.info.modelID,
            provider: result.info.providerID,
            toolsUsed: this.extractToolsUsed(result),
          };
        } catch (compactError) {
          logger.error('Compaction recovery failed, creating fresh session', {
            contextKey,
            error: compactError instanceof Error ? compactError.message : String(compactError),
          });
          // Fall through to session reset below
        }
      }

      // Check if the error is due to a stale/missing session
      const isSessionError =
        errorMessage.includes('404') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('NotFoundError') ||
        errorMessage.includes('session') ||
        isTokenLimitError; // Also reset session if compaction failed

      if (isSessionError) {
        logger.warn('Session not found or unrecoverable, creating new session', {
          contextKey,
          oldSessionId: session.id,
          error: errorMessage,
        });

        // Clear the stale session and token tracking from cache
        this.sessionCache.delete(contextKey);
        this.tokenUsage.delete(contextKey);

        // Create a new session
        session = await this.createSession(options?.sessionTitle || `Session: ${contextKey}`);
        this.sessionCache.set(contextKey, session);

        logger.info('New session created after error recovery', {
          contextKey,
          newSessionId: session.id,
        });

        // Retry with the new session
        const result = await this.sendMessage(session.id, message, {
          agent: options?.agent,
          model: options?.model,
        });

        // Track tokens for the new session
        const currentTokens = result.info.tokens.input + result.info.tokens.output;
        this.tokenUsage.set(contextKey, currentTokens);

        return {
          response: this.extractTextResponse(result),
          sessionId: session.id,
          cost: result.info.cost,
          tokens: {
            input: result.info.tokens.input,
            output: result.info.tokens.output,
          },
          model: result.info.modelID,
          provider: result.info.providerID,
          toolsUsed: this.extractToolsUsed(result),
        };
      }

      // Re-throw other errors
      throw error;
    }
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<OpenCodeSession[]> {
    const response = await this.fetch('/session');
    return response.json() as Promise<OpenCodeSession[]>;
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    // Find and remove token tracking for this session
    for (const [contextKey, session] of this.sessionCache) {
      if (session.id === sessionId) {
        this.tokenUsage.delete(contextKey);
        break;
      }
    }

    const response = await this.fetch(`/session/${sessionId}`, {
      method: 'DELETE',
    });
    this.sessionCache.delete(sessionId);
    return response.ok;
  }

  /**
   * Summarize/compact a session to reduce context size
   * This calls OpenCode's summarize endpoint which uses AI to compress conversation history
   */
  async summarizeSession(sessionId: string): Promise<{ summary: string }> {
    logger.info('Summarizing session', { sessionId });

    // Build model info for the summarization request
    const modelId = this.config.defaultModel || 'anthropic/claude-haiku-4-5-20251001';
    const modelParts = modelId.split('/');
    const model =
      modelParts.length === 2
        ? { providerID: modelParts[0], modelID: modelParts[1] }
        : { providerID: 'opencode', modelID: modelId };

    const response = await this.fetch(`/session/${sessionId}/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(model),
    });

    const result = (await response.json()) as { summary: string };
    logger.info('Session summarized', { sessionId, summaryLength: result.summary?.length || 0 });
    return result;
  }

  /**
   * Get current token usage for a context
   */
  getTokenUsage(contextKey: string): number {
    return this.tokenUsage.get(contextKey) || 0;
  }

  /**
   * Reset token usage for a context (used after compaction)
   */
  resetTokenUsage(contextKey: string): void {
    this.tokenUsage.delete(contextKey);
  }

  /**
   * Auto-compact a session when token limit is approached
   */
  private async autoCompact(contextKey: string, sessionId: string): Promise<void> {
    const tokens = this.tokenUsage.get(contextKey) || 0;
    logger.info('Auto-compacting session due to token limit', {
      contextKey,
      sessionId,
      tokens,
      threshold: AUTO_COMPACT_THRESHOLD,
    });

    try {
      await this.summarizeSession(sessionId);
      this.tokenUsage.set(contextKey, 0); // Reset counter after compaction
      logger.info('Auto-compaction completed', { contextKey, sessionId });
    } catch (error) {
      // Log but don't fail - better to continue with potential issues than break the chat
      logger.error('Auto-compaction failed, continuing anyway', {
        contextKey,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Internal fetch wrapper with timeout and error handling
   */
  private async fetch(path: string, options?: RequestInit): Promise<Response> {
    const url = `${this.config.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    // Build headers with optional Basic auth
    const headers = new Headers(options?.headers);
    if (this.config.password) {
      const credentials = Buffer.from(`opencode:${this.config.password}`).toString('base64');
      headers.set('Authorization', `Basic ${credentials}`);
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenCode API error (${response.status}): ${error}`);
      }

      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`OpenCode request timed out after ${this.config.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Create an OpenCode client with default configuration
 * Automatically uses OPENCODE_SERVER_PASSWORD from environment if available
 */
export function createOpenCodeClient(
  baseUrl: string = 'http://localhost:4099',
  defaultModel: string = 'anthropic/claude-haiku-4-5-20251001',
  password?: string
): OpenCodeClient {
  // Use provided password or fall back to environment variable
  const serverPassword = password || process.env.OPENCODE_SERVER_PASSWORD;
  return new OpenCodeClient({ baseUrl, defaultModel, password: serverPassword });
}

// Export a singleton instance for convenience
let defaultClient: OpenCodeClient | null = null;

export function getDefaultOpenCodeClient(): OpenCodeClient {
  if (!defaultClient) {
    defaultClient = createOpenCodeClient();
  }
  return defaultClient;
}
