import type { ServiceLogger } from '@orient-bot/core';
import type { PromptService } from './promptService.js';
import {
  getContextAnalyzer,
  type ContextSuggestion,
  type AnalysisResult,
} from './contextAnalyzer.js';
import { getContextService, type Platform, type PersistentContext } from './contextService.js';

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

  // ============================================
  // INTELLIGENT CONTEXT CONTROL
  // ============================================

  /**
   * Initialize the LLM classifier for more accurate topic shift detection
   * Call this once after the handler is constructed with an active session
   */
  protected initializeLLMClassifier(): void {
    const analyzer = getContextAnalyzer();
    analyzer.setLLMClassifier(async (message: string, contextSummary: string) => {
      return this.classifyWithLLM(message, contextSummary);
    });
    this.logger.debug('LLM classifier initialized for context analyzer');
  }

  /**
   * Classify a message using a fast LLM model
   * Used by the context analyzer for more accurate topic shift detection
   */
  private async classifyWithLLM(
    message: string,
    contextSummary: string
  ): Promise<'topic_shift' | 'frustration' | 'continuation'> {
    const prompt = `You are a conversation classifier. Given the current message and recent context, classify the message.

Recent context: ${contextSummary}
Current message: ${message}

Respond with exactly one word:
- "topic_shift" if this is about a completely different subject
- "frustration" if the user seems confused or frustrated with the conversation
- "continuation" if this continues the current topic

Classification:`;

    try {
      // Use a fast, cheap model for classification
      // Note: This uses a simple heuristic session for classification
      const classificationKey = 'context-classifier';
      const result = await this.client.chat(classificationKey, prompt, {
        sessionTitle: 'Context Classification',
        model: 'anthropic/claude-haiku-4-5-20251001', // Fast, cheap model
      });

      const response = result.response.toLowerCase().trim();
      if (response.includes('topic_shift')) return 'topic_shift';
      if (response.includes('frustration')) return 'frustration';
      return 'continuation';
    } catch (error) {
      this.logger.warn('LLM classification failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error; // Let the analyzer handle the fallback
    }
  }

  /**
   * Analyze a message for context management suggestions
   * Call this before processing the message to detect topic shifts or frustration
   */
  protected async analyzeMessageForContext(
    message: string,
    platform: Platform,
    chatId: string
  ): Promise<AnalysisResult> {
    try {
      const contextService = getContextService();
      const context = await contextService.getContext(platform, chatId);
      const analyzer = getContextAnalyzer();
      return await analyzer.analyze(message, context);
    } catch (error) {
      this.logger.warn('Context analysis failed, continuing without suggestion', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        suggestion: { type: 'none' },
        extractedKeywords: [],
        detectedFrustration: false,
        detectedTopicShift: false,
      };
    }
  }

  /**
   * Format a context suggestion for appending to a response
   * @param suggestion - The suggestion from analysis
   * @param platform - Platform for emoji formatting
   * @returns Formatted suggestion string or empty string if no suggestion
   */
  protected formatContextSuggestion(
    suggestion: ContextSuggestion,
    platform: 'whatsapp' | 'slack'
  ): string {
    if (suggestion.type === 'none') return '';

    const emoji = platform === 'slack' ? ':bulb:' : '💡';
    return `\n\n${emoji} ${suggestion.reason}`;
  }

  /**
   * Update context after processing a message
   * Stores extracted keywords and increments message counter
   */
  protected async updateContextAfterMessage(
    platform: Platform,
    chatId: string,
    analysisResult: AnalysisResult
  ): Promise<void> {
    try {
      const contextService = getContextService();
      const existingContext = await contextService.getContext(platform, chatId);

      // Merge new keywords with existing ones, keeping last 15
      const existingKeywords = existingContext.currentState?.recentKeywords || [];
      const newKeywords = [...analysisResult.extractedKeywords, ...existingKeywords].slice(0, 15);

      // Increment message counter
      const messagesSinceClear = (existingContext.currentState?.messagesSinceClear || 0) + 1;

      await contextService.updateContext(platform, chatId, {
        currentState: {
          ...existingContext.currentState,
          recentKeywords: newKeywords,
          messagesSinceClear,
          topicStartedAt: existingContext.currentState?.topicStartedAt || new Date().toISOString(),
        },
      });
    } catch (error) {
      this.logger.warn('Failed to update context after message', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Reset context counters after a clear/compact command
   */
  protected async resetContextCounters(platform: Platform, chatId: string): Promise<void> {
    try {
      const contextService = getContextService();
      await contextService.updateContext(platform, chatId, {
        currentState: {
          recentKeywords: [],
          messagesSinceClear: 0,
          topicStartedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      this.logger.warn('Failed to reset context counters', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
