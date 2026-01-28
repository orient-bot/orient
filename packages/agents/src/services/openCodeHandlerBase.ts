import type { ServiceLogger } from '@orientbot/core';
import type { PromptService } from './promptService.js';

export interface OpenCodeHandlerConfig {
  serverUrl: string;
  defaultAgent?: string;
  defaultModel?: string;
  timeout?: number;
  sessionPrefix?: string;
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
    tokens: { input: number; output: number; reasoning: number };
    finish?: string;
  };
  parts: Array<{ id: string; type: string; text?: string; [key: string]: unknown }>;
}

export interface OpenCodeSessionClient {
  healthCheck: () => Promise<{ healthy: boolean }>;
  deleteSession: (sessionId: string) => Promise<boolean>;
  summarizeSession: (sessionId: string) => Promise<{ summary: string }>;
  resetTokenUsage: (contextKey: string) => void;
  sendMessage: (
    sessionId: string,
    message: string,
    options?: {
      agent?: string;
      model?: string;
      files?: Array<{ path: string }>;
    }
  ) => Promise<OpenCodeMessage>;
  extractTextResponse: (message: OpenCodeMessage) => string;
  extractToolsUsed: (message: OpenCodeMessage) => string[];
  chat: (
    contextKey: string,
    message: string,
    options?: {
      sessionTitle?: string;
      agent?: string;
      model?: string;
    }
  ) => Promise<{
    response: string;
    sessionId: string;
    cost: number;
    tokens: { input: number; output: number };
    model: string;
    provider: string;
    toolsUsed: string[];
  }>;
}

export interface OpenCodeSystemResponse {
  text: string;
  sessionId: string;
  cost: number;
  tokens: {
    input: number;
    output: number;
  };
  model: string;
  provider: string;
  toolsUsed: string[];
}

export interface OpenCodeSessionCommandOptions {
  helpText: string;
  resetCommandLabel: string;
}

export abstract class OpenCodeHandlerBase<
  TContext,
  TResponse extends OpenCodeSystemResponse,
  TConfig extends OpenCodeHandlerConfig = OpenCodeHandlerConfig,
> {
  protected client: OpenCodeSessionClient;
  protected config: TConfig;
  protected sessionMap: Map<string, string> = new Map(); // contextKey -> sessionId
  protected modelPreferences: Map<string, string> = new Map(); // contextKey -> modelId
  protected promptService: PromptService | null = null; // Optional prompt service for custom prompts
  protected logger: ServiceLogger;
  protected promptServiceLabel?: string;

  constructor(
    config: TConfig,
    deps: {
      client: OpenCodeSessionClient;
      logger: ServiceLogger;
      promptServiceLabel?: string;
    }
  ) {
    this.config = config;
    this.client = deps.client;
    this.logger = deps.logger;
    this.promptServiceLabel = deps.promptServiceLabel;
  }

  /**
   * Set the prompt service for custom per-chat prompts
   */
  setPromptService(promptService: PromptService): void {
    this.promptService = promptService;
    if (this.promptServiceLabel) {
      this.logger.info(`Prompt service attached to ${this.promptServiceLabel}`);
    } else {
      this.logger.info('Prompt service attached to handler');
    }
  }

  /**
   * Check if the OpenCode server is available
   */
  async isServerAvailable(): Promise<boolean> {
    try {
      const health = await this.client.healthCheck();
      return health.healthy;
    } catch (error) {
      this.logger.warn('OpenCode server health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get a unique context key for conversation tracking
   */
  protected abstract getContextKey(context: TContext): string;

  /**
   * Build a standardized system response
   */
  protected abstract buildSystemResponse(text: string, sessionId: string): TResponse;

  /**
   * Handle session commands (/reset, /compact, /help)
   */
  protected async handleSessionCommand(
    command: 'reset' | 'compact' | 'help',
    context: TContext,
    options: OpenCodeSessionCommandOptions
  ): Promise<TResponse> {
    const contextKey = this.getContextKey(context);
    const sessionId = this.sessionMap.get(contextKey);

    switch (command) {
      case 'reset': {
        if (sessionId) {
          try {
            await this.client.deleteSession(sessionId);
            this.sessionMap.delete(contextKey);
            this.logger.info('Session reset via command', { contextKey, sessionId });
          } catch (error) {
            this.logger.warn('Failed to delete session during reset', {
              contextKey,
              sessionId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        return this.buildSystemResponse('Session cleared. Starting fresh conversation.', 'reset');
      }
      case 'compact': {
        if (sessionId) {
          try {
            await this.client.summarizeSession(sessionId);
            this.client.resetTokenUsage(contextKey);
            this.logger.info('Session compacted via command', { contextKey, sessionId });
            return this.buildSystemResponse(
              'Session compacted. Context preserved but history condensed.',
              sessionId
            );
          } catch (error) {
            this.logger.error('Failed to compact session', {
              contextKey,
              sessionId,
              error: error instanceof Error ? error.message : String(error),
            });
            return this.buildSystemResponse(
              `Failed to compact session. Please try again or use ${options.resetCommandLabel} to start fresh.`,
              sessionId || 'compact-error'
            );
          }
        }
        return this.buildSystemResponse(
          'No active session to compact. Send a message first to start a conversation.',
          'compact'
        );
      }
      case 'help': {
        return this.buildSystemResponse(options.helpText, 'help');
      }
    }
  }

  /**
   * Clear session for a context (useful for resetting conversation)
   */
  async clearSession(context: TContext): Promise<boolean> {
    const contextKey = this.getContextKey(context);
    const sessionId = this.sessionMap.get(contextKey);

    if (sessionId) {
      try {
        await this.client.deleteSession(sessionId);
        this.sessionMap.delete(contextKey);
        this.logger.info('Session cleared', { contextKey, sessionId });
        return true;
      } catch (error) {
        this.logger.warn('Failed to clear session', {
          contextKey,
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    }

    return false;
  }

  /**
   * Get session info for a context
   */
  getSessionId(context: TContext): string | undefined {
    const contextKey = this.getContextKey(context);
    return this.sessionMap.get(contextKey);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): Map<string, string> {
    return new Map(this.sessionMap);
  }
}
