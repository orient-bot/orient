/**
 * OpenCode Slack Handler
 *
 * This service handles Slack messages by delegating AI processing to an OpenCode server.
 * It manages sessions per channel/thread for conversation continuity and supports model switching.
 *
 * Exported via @orient/bot-slack package.
 */

import { createServiceLogger } from '@orient/core';
import type {
  SlackInternalContext,
  SlackProcessedResponse,
  OpenCodeSlackConfig,
} from '../types.js';

// Alias for compatibility
type SlackMessageContext = SlackInternalContext;
import {
  DEFAULT_AGENT,
  SLACK_DEFAULT_MODEL,
  SLACK_DEFAULT_MODEL_NAME,
  // Shared model switching utilities
  detectModelSwitch as sharedDetectModelSwitch,
  type ModelSwitchResult,
  getModelForContext as sharedGetModelForContext,
  buildModelSwitchConfirmation,
  buildAvailableModelsInfo,
  // Session command utilities
  detectSessionCommand as sharedDetectSessionCommand,
  buildSlackHelpText,
  extractAgentMention,
  OpenCodeHandlerBase,
  type PromptService,
  createOpenCodeClient,
} from '@orient/agents';

const logger = createServiceLogger('opencode-slack');

// Re-export ModelSwitchResult for consumers
export type { ModelSwitchResult };

/**
 * OpenCode Slack Handler
 *
 * Manages Slack message processing through OpenCode server
 */
export class OpenCodeSlackHandler extends OpenCodeHandlerBase<
  SlackMessageContext,
  SlackProcessedResponse,
  OpenCodeSlackConfig
> {
  constructor(config: OpenCodeSlackConfig) {
    const resolvedConfig: OpenCodeSlackConfig = {
      timeout: 120000, // 2 minutes - OpenCode can be slow with complex tool calls
      sessionPrefix: 'slack',
      defaultModel: SLACK_DEFAULT_MODEL,
      ...config,
    };

    const client = createOpenCodeClient(
      resolvedConfig.serverUrl,
      resolvedConfig.defaultModel || SLACK_DEFAULT_MODEL
    );

    super(resolvedConfig, { client, logger, promptServiceLabel: 'Slack handler' });

    logger.info('OpenCode Slack Handler initialized', {
      serverUrl: resolvedConfig.serverUrl,
      defaultAgent: resolvedConfig.defaultAgent,
      defaultModel: resolvedConfig.defaultModel,
    });
  }

  /**
   * Set the prompt service for custom per-channel prompts
   */
  setPromptService(promptService: PromptService): void {
    super.setPromptService(promptService);
  }

  /**
   * Get a unique context key for conversation tracking
   * Uses channel + thread for thread-based conversations
   */
  protected getContextKey(context: SlackMessageContext): string {
    const prefix = this.config.sessionPrefix || 'slack';

    if (context.threadTs) {
      // Thread context - session per thread
      return `${prefix}:${context.channelId}:${context.threadTs}`;
    }

    // Channel/DM context - session per channel
    return `${prefix}:${context.channelId}:main`;
  }

  protected buildSystemResponse(text: string, sessionId: string): SlackProcessedResponse {
    return {
      text,
      sessionId,
      cost: 0,
      tokens: { input: 0, output: 0 },
      model: 'system',
      provider: 'system',
      toolsUsed: [],
    };
  }

  /**
   * Build the session title for OpenCode
   */
  private getSessionTitle(context: SlackMessageContext): string {
    if (context.channelName) {
      return `Slack: #${context.channelName}`;
    }
    if (context.channelType === 'dm') {
      return `Slack DM: ${context.userName || context.userId}`;
    }
    return `Slack: ${context.channelId}`;
  }

  /**
   * Detect if a message is a model switch command
   * Delegates to shared processor
   */
  detectModelSwitch(text: string): ModelSwitchResult {
    return sharedDetectModelSwitch(text);
  }

  /**
   * Get the current model for a context
   * Delegates to shared processor
   */
  getModelForContext(contextKey: string): {
    id: string;
    name: string;
    provider: string;
  } {
    return sharedGetModelForContext(
      contextKey,
      this.modelPreferences,
      this.config.defaultModel || SLACK_DEFAULT_MODEL,
      SLACK_DEFAULT_MODEL_NAME
    );
  }

  /**
   * Set the model preference for a context
   */
  setModelForContext(contextKey: string, modelId: string): void {
    this.modelPreferences.set(contextKey, modelId);
    logger.info('Model preference updated', { contextKey, modelId });
  }

  /**
   * Get list of available models for display
   * Delegates to shared processor
   */
  static getAvailableModelsInfo(): string {
    return buildAvailableModelsInfo(SLACK_DEFAULT_MODEL);
  }

  /**
   * Process a Slack message through OpenCode
   */
  async processMessage(
    text: string,
    context: SlackMessageContext
  ): Promise<SlackProcessedResponse> {
    const contextKey = this.getContextKey(context);
    const sessionTitle = this.getSessionTitle(context);

    // Check for session commands first (/reset, /compact, /help)
    const cmdResult = sharedDetectSessionCommand(text);
    if (cmdResult.isCommand && cmdResult.commandType) {
      return await this.handleSessionCommand(cmdResult.commandType, context, {
        helpText: buildSlackHelpText(),
        resetCommandLabel: '`/reset`',
      });
    }

    // Check if this is a model switch command
    const switchResult = this.detectModelSwitch(text);
    if (switchResult.isModelSwitch && switchResult.modelId) {
      // Update the model preference
      this.setModelForContext(contextKey, switchResult.modelId);

      // Slack has vision support built into models (no need for separate vision model)
      const confirmMessage = buildModelSwitchConfirmation(
        switchResult.modelName || 'Unknown',
        switchResult.provider || 'unknown',
        true, // Slack doesn't need vision model switching
        undefined
      );

      logger.info('Model switched via chat command', {
        contextKey,
        newModel: switchResult.modelId,
        modelName: switchResult.modelName,
      });

      return {
        text: confirmMessage,
        sessionId: this.sessionMap.get(contextKey) || 'model-switch',
        cost: 0,
        tokens: { input: 0, output: 0 },
        model: switchResult.modelId,
        provider: switchResult.provider || 'unknown',
        toolsUsed: [],
      };
    }

    // Get the current model for this context
    const currentModel = this.getModelForContext(contextKey);

    logger.info('Processing Slack message through OpenCode', {
      contextKey,
      textLength: text.length,
      channelId: context.channelId,
      threadTs: context.threadTs,
      model: currentModel.id,
    });

    try {
      // Determine which agent to use
      const { agentId: agentOverride, cleanedMessage } = extractAgentMention(text);
      const effectiveText = agentOverride ? cleanedMessage : text;
      const isPMQuery =
        /\b(jira|issue|sprint|blocker|status|ticket|task|weekly|daily|summary|sla)\b/i.test(
          effectiveText
        );
      // Allow @agent override while keeping default behavior
      const agent = agentOverride || DEFAULT_AGENT;

      // Build message with custom prompt and user identity context
      let messageToSend = effectiveText;

      // Add user identity context so Claude can pass it to admin-restricted tools
      const userIdentityContext = [
        '[User Identity]',
        `Slack User ID: ${context.userId}`,
        context.userName ? `User Name: ${context.userName}` : '',
        `Channel ID: ${context.channelId}`,
        context.channelName ? `Channel Name: #${context.channelName}` : '',
        'Note: When calling skill creation/editing tools, pass slackUserId and channelId for admin verification and notifications.',
        '[End User Identity]',
        '',
      ]
        .filter(Boolean)
        .join('\n');

      if (this.promptService) {
        try {
          const customPrompt = await this.promptService.getPromptForChat(
            'slack',
            context.channelId
          );
          if (customPrompt) {
            // Prepend system instructions and user identity to the message
            messageToSend = `${userIdentityContext}[System Instructions]\n${customPrompt}\n[End System Instructions]\n\n${effectiveText}`;
            logger.debug('Applied custom prompt with user identity', {
              channelId: context.channelId,
              userId: context.userId,
              promptLength: customPrompt.length,
            });
          } else {
            // No custom prompt, but still include user identity
            messageToSend = `${userIdentityContext}${effectiveText}`;
          }
        } catch (promptError) {
          logger.warn('Failed to fetch custom prompt, proceeding with user identity only', {
            error: promptError instanceof Error ? promptError.message : String(promptError),
          });
          messageToSend = `${userIdentityContext}${effectiveText}`;
        }
      } else {
        // No prompt service, but still include user identity
        messageToSend = `${userIdentityContext}${effectiveText}`;
      }

      // Send to OpenCode with the user's preferred model
      const result = await this.client.chat(contextKey, messageToSend, {
        sessionTitle,
        agent,
        model: currentModel.id,
      });

      logger.info('OpenCode response received', {
        contextKey,
        sessionId: result.sessionId,
        responseLength: result.response.length,
        cost: result.cost,
        tokens: result.tokens,
        model: result.model,
        provider: result.provider,
        toolsUsed: result.toolsUsed,
      });

      // Store session mapping for potential future reference
      this.sessionMap.set(contextKey, result.sessionId);

      return {
        text: result.response,
        sessionId: result.sessionId,
        cost: result.cost,
        tokens: result.tokens,
        model: result.model,
        provider: result.provider,
        toolsUsed: result.toolsUsed,
      };
    } catch (error) {
      logger.error('Failed to process message through OpenCode', {
        contextKey,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async clearSession(context: SlackMessageContext): Promise<boolean> {
    return super.clearSession(context);
  }

  getSessionId(context: SlackMessageContext): string | undefined {
    return super.getSessionId(context);
  }

  getActiveSessions(): Map<string, string> {
    return super.getActiveSessions();
  }
}

/**
 * Create an OpenCode Slack handler with the given configuration
 */
export function createOpenCodeSlackHandler(config: OpenCodeSlackConfig): OpenCodeSlackHandler {
  return new OpenCodeSlackHandler(config);
}
