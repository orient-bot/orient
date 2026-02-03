/**
 * OpenCode WhatsApp Handler
 *
 * This service handles WhatsApp messages by delegating AI processing to an OpenCode server.
 * It replaces the direct Claude integration with OpenCode's HTTP API, which provides:
 * - Session management
 * - Access to MCP tools (JIRA, Slack, etc.)
 * - Support for multiple LLM providers
 *
 * Exported via @orient-bot/bot-whatsapp package.
 */

import { createDedicatedServiceLogger } from '@orient-bot/core';
import {
  DEFAULT_AGENT,
  WHATSAPP_DEFAULT_MODEL,
  WHATSAPP_DEFAULT_MODEL_NAME,
  preprocessImage as sharedPreprocessImage,
  buildEnrichedMessage,
  type ImageData as ProcessorImageData,
  type MessageEnrichment,
  extractAgentMention,
  // Shared model switching utilities
  detectModelSwitch as sharedDetectModelSwitch,
  type ModelSwitchResult,
  getModelForContext as sharedGetModelForContext,
  buildModelSwitchConfirmation,
  buildAvailableModelsInfo,
  getProviderFromModelId,
  getVisionModelName as sharedGetVisionModelName,
  getDefaultVisionModelId,
  AVAILABLE_MODELS,
  // Session command utilities
  detectSessionCommand as sharedDetectSessionCommand,
  buildWhatsAppHelpText,
  OpenCodeHandlerBase,
  type PromptService,
  createOpenCodeClient,
} from '@orient-bot/agents';

// Use dedicated WhatsApp logger
const logger = createDedicatedServiceLogger('whatsapp', {
  maxSize: '20m',
  maxDays: '14d',
  compress: true,
});

export interface OpenCodeWhatsAppConfig {
  serverUrl: string; // OpenCode server URL (e.g., 'http://localhost:4096')
  defaultAgent?: string; // Default agent to use (e.g., 'build', 'pm-assistant')
  defaultModel?: string; // Default model ID (e.g., 'grok-code') - used for text-only messages
  visionModel?: string; // Vision-capable model ID (e.g., 'anthropic/claude-sonnet-4-20250514') - used when images are present
  timeout?: number; // Request timeout in ms (default: 60000)
  sessionPrefix?: string; // Prefix for session context keys
}

// Re-export ModelSwitchResult for consumers
export type { ModelSwitchResult };

export interface MessageContext {
  phone: string; // Sender's phone number
  jid: string; // WhatsApp JID (for groups or DMs)
  isGroup: boolean; // Whether this is a group message
  groupId?: string; // Group ID if group message
  groupName?: string; // Group name/subject for display
  transcribedText?: string; // If audio was transcribed
  transcribedLanguage?: string;
}

export interface ImageData {
  buffer: Buffer;
  mimeType: string;
}

export interface ProcessedResponse {
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

/**
 * OpenCode WhatsApp Handler
 *
 * Manages WhatsApp message processing through OpenCode server
 */
export class OpenCodeWhatsAppHandler extends OpenCodeHandlerBase<
  MessageContext,
  ProcessedResponse,
  OpenCodeWhatsAppConfig
> {
  private readonly visionModel: string;
  private readonly visionModelName: string;

  constructor(config: OpenCodeWhatsAppConfig) {
    const resolvedConfig: OpenCodeWhatsAppConfig = {
      timeout: 120000, // 2 minutes - OpenCode can be slow with complex tool calls
      sessionPrefix: 'whatsapp',
      defaultModel: WHATSAPP_DEFAULT_MODEL,
      visionModel: getDefaultVisionModelId(),
      ...config,
    };

    const visionModel = resolvedConfig.visionModel || getDefaultVisionModelId();
    const visionModelName = sharedGetVisionModelName(visionModel);
    const client = createOpenCodeClient(
      resolvedConfig.serverUrl,
      resolvedConfig.defaultModel || WHATSAPP_DEFAULT_MODEL
    );

    super(resolvedConfig, { client, logger, promptServiceLabel: 'WhatsApp handler' });

    this.visionModel = visionModel;
    this.visionModelName = visionModelName;

    logger.info('OpenCode WhatsApp Handler initialized', {
      serverUrl: resolvedConfig.serverUrl,
      defaultAgent: resolvedConfig.defaultAgent,
      defaultModel: resolvedConfig.defaultModel,
      visionModel: this.visionModel,
      note: 'Grok is default for text; vision model auto-switches for images',
    });

    // Initialize LLM classifier for intelligent context control
    this.initializeLLMClassifier();
  }

  /**
   * Set the prompt service for custom per-chat prompts
   */
  setPromptService(promptService: PromptService): void {
    super.setPromptService(promptService);
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
  getModelForContext(contextKey: string): { id: string; name: string; provider: string } {
    return sharedGetModelForContext(
      contextKey,
      this.modelPreferences,
      this.config.defaultModel || WHATSAPP_DEFAULT_MODEL,
      WHATSAPP_DEFAULT_MODEL_NAME
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
    return (
      buildAvailableModelsInfo(WHATSAPP_DEFAULT_MODEL) +
      '\n_Note: Images auto-switch to vision model, then revert to your preferred model._'
    );
  }

  /**
   * Get a unique context key for conversation tracking
   */
  protected getContextKey(context: MessageContext): string {
    const prefix = this.config.sessionPrefix || 'whatsapp';

    if (context.isGroup && context.groupId) {
      return `${prefix}:group:${context.groupId}`;
    }
    return `${prefix}:dm:${context.phone}`;
  }

  protected buildSystemResponse(text: string, sessionId: string): ProcessedResponse {
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
  private getSessionTitle(context: MessageContext): string {
    if (context.isGroup) {
      // Use group name if available, otherwise fall back to group ID
      const groupIdentifier = context.groupName || context.groupId || 'Unknown';
      return `WhatsApp Group: ${groupIdentifier}`;
    }
    return `WhatsApp: ${context.phone}`;
  }

  /**
   * Preprocess image data for OpenCode
   *
   * OpenCode can accept images through the message parts.
   * We convert the buffer to base64 and include it in the message.
   */
  /**
   * Preprocess image data for OpenCode
   * Delegates to shared processor for consistent handling across platforms
   */
  private preprocessImage(image: ImageData): string {
    return sharedPreprocessImage(image);
  }

  /**
   * Build the message text with context
   */
  /**
   * Build the message text with context
   * Delegates to shared processor for consistent handling across platforms
   */
  private buildMessageText(text: string, context: MessageContext, image?: ImageData): string {
    // Build enrichment object from context
    const enrichment: MessageEnrichment = {};

    // Add audio transcription context if available
    if (context.transcribedText && context.transcribedLanguage) {
      enrichment.audio = {
        transcribedText: context.transcribedText,
        transcribedLanguage: context.transcribedLanguage,
      };
    }

    // Add image if present
    if (image) {
      enrichment.image = image;
    }

    // Use shared processor for consistent message building
    return buildEnrichedMessage(text, Object.keys(enrichment).length > 0 ? enrichment : undefined);
  }

  /**
   * Process a WhatsApp message through OpenCode
   *
   * If the message is a model switch command, it will switch the model and return
   * a confirmation message without sending to OpenCode.
   */
  async processMessage(
    text: string,
    context: MessageContext,
    image?: ImageData
  ): Promise<ProcessedResponse> {
    const contextKey = this.getContextKey(context);
    const sessionTitle = this.getSessionTitle(context);

    // Check for session commands first (/reset, /compact, /help)
    const cmdResult = sharedDetectSessionCommand(text);
    if (cmdResult.isCommand && cmdResult.commandType) {
      // Reset context counters on clear/compact commands
      if (cmdResult.commandType === 'reset' || cmdResult.commandType === 'compact') {
        await this.resetContextCounters('whatsapp', context.jid);
      }
      return await this.handleSessionCommand(cmdResult.commandType, context, {
        helpText: buildWhatsAppHelpText(),
        resetCommandLabel: '/reset',
      });
    }

    // Analyze message for context management suggestions (topic shift, frustration)
    const analysisResult = await this.analyzeMessageForContext(text, 'whatsapp', context.jid);

    // Check if this is a model switch command
    const switchResult = this.detectModelSwitch(text);
    if (switchResult.isModelSwitch && switchResult.modelId) {
      // Update the model preference
      this.setModelForContext(contextKey, switchResult.modelId);

      // Check if the new model supports vision and build confirmation
      const modelInfo = AVAILABLE_MODELS[switchResult.modelKey as keyof typeof AVAILABLE_MODELS];
      const supportsVision = modelInfo?.supportsVision ?? false;
      const confirmMessage = buildModelSwitchConfirmation(
        switchResult.modelName || 'Unknown',
        switchResult.provider || 'unknown',
        supportsVision,
        this.visionModelName
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

    // Get the current model for this context (user's preferred model or default Grok)
    const currentModel = this.getModelForContext(contextKey);

    // If message contains an image, use vision-capable model instead
    // Grok doesn't support vision, so we auto-switch to configured vision model (default: Claude Sonnet 4)
    // This switch is temporary - the user's preferred model is preserved for future text messages
    const modelToUse = image
      ? {
          id: this.visionModel,
          name: this.visionModelName,
          provider: getProviderFromModelId(this.visionModel),
        }
      : currentModel;

    if (image && modelToUse.id !== currentModel.id) {
      logger.info('Image detected - temporarily switching to vision model', {
        contextKey,
        userPreferredModel: currentModel.id,
        visionModel: modelToUse.id,
        note: 'User preference preserved for future text messages',
      });
    }

    logger.info('Processing message through OpenCode', {
      contextKey,
      textLength: text.length,
      hasImage: !!image,
      isGroup: context.isGroup,
      model: modelToUse.id,
    });

    try {
      const { agentId: agentOverride, cleanedMessage } = extractAgentMention(text);
      const messageText = agentOverride ? cleanedMessage : text;

      // Build the full message with context
      let fullMessage = this.buildMessageText(messageText, context, image);

      // Fetch and prepend custom prompt if available
      if (this.promptService) {
        try {
          const customPrompt = await this.promptService.getPromptForChat('whatsapp', context.jid);
          if (customPrompt) {
            // Prepend system instructions to the message
            fullMessage = `[System Instructions]\n${customPrompt}\n[End System Instructions]\n\n${fullMessage}`;
            logger.debug('Applied custom prompt', {
              chatId: context.jid,
              promptLength: customPrompt.length,
            });
          }
        } catch (promptError) {
          logger.warn('Failed to fetch custom prompt, proceeding without', {
            error: promptError instanceof Error ? promptError.message : String(promptError),
          });
        }
      }

      // Allow @agent override when present
      const agent = agentOverride || DEFAULT_AGENT;

      // Send to OpenCode with the appropriate model (vision model for images, user's preferred otherwise)
      const result = await this.client.chat(contextKey, fullMessage, {
        sessionTitle,
        agent,
        model: modelToUse.id,
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

      // Update context with extracted keywords
      await this.updateContextAfterMessage('whatsapp', context.jid, analysisResult);

      // Append context management suggestion if any
      const suggestion = this.formatContextSuggestion(analysisResult.suggestion, 'whatsapp');
      const finalResponse = suggestion ? result.response + suggestion : result.response;

      return {
        text: finalResponse,
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

  /**
   * Handle a poll vote with optional session continuity
   *
   * If sessionId is provided, continues that session instead of creating new context.
   * This allows the AI to maintain conversation context from when the poll was created.
   *
   * @param voterPhone - Phone number of the voter
   * @param pollQuestion - The original poll question
   * @param selectedOptions - Array of selected option texts
   * @param jid - WhatsApp JID where the poll was
   * @param sessionId - Optional OpenCode session ID to continue
   * @param originalQuery - Optional original user query that triggered the poll
   */
  async handlePollVote(
    voterPhone: string,
    pollQuestion: string,
    selectedOptions: string[],
    jid: string,
    sessionId?: string,
    originalQuery?: string
  ): Promise<ProcessedResponse> {
    const isGroup = jid.endsWith('@g.us');

    // Build a contextual message that includes the poll response
    let message: string;
    if (originalQuery) {
      message = `[Poll Response to my question]\nOriginal request: ${originalQuery}\nMy question was: ${pollQuestion}\nUser selected: ${selectedOptions.join(', ')}\n\nPlease proceed with the user's selection.`;
    } else {
      message = `[Poll Response]\nQuestion: ${pollQuestion}\nSelected options: ${selectedOptions.join(', ')}\n\nPlease process this poll response.`;
    }

    // Prepend custom prompt if available
    if (this.promptService) {
      try {
        const customPrompt = await this.promptService.getPromptForChat('whatsapp', jid);
        if (customPrompt) {
          message = `[System Instructions]\n${customPrompt}\n[End System Instructions]\n\n${message}`;
        }
      } catch {
        // Ignore prompt fetch errors for poll votes
      }
    }

    // Get the current model for this context
    const contextKey = this.getContextKey({
      phone: voterPhone,
      jid,
      isGroup,
      groupId: isGroup ? jid : undefined,
    });
    const currentModel = this.getModelForContext(contextKey);

    // If we have a session ID, continue that session directly
    if (sessionId) {
      logger.info('Continuing existing session for poll vote', {
        sessionId,
        voterPhone,
        selectedOptions,
        model: currentModel.id,
      });

      try {
        // Always use default agent from shared processor (consistent with processMessage)
        const agent = DEFAULT_AGENT;

        // Send directly to the existing session with the user's preferred model
        const result = await this.client.sendMessage(sessionId, message, {
          agent,
          model: currentModel.id,
        });
        const responseText = this.client.extractTextResponse(result);

        logger.info('Poll vote processed with session continuity', {
          sessionId,
          responseLength: responseText.length,
          cost: result.info.cost,
          model: result.info.modelID,
          provider: result.info.providerID,
        });

        return {
          text: responseText,
          sessionId,
          cost: result.info.cost,
          tokens: {
            input: result.info.tokens.input,
            output: result.info.tokens.output,
          },
          model: result.info.modelID,
          provider: result.info.providerID,
          toolsUsed: this.client.extractToolsUsed(result),
        };
      } catch (error) {
        logger.warn('Failed to continue session, falling back to new context', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to create new context
      }
    }

    // No session ID or session continuation failed - create new context
    const context: MessageContext = {
      phone: voterPhone,
      jid,
      isGroup,
      groupId: isGroup ? jid : undefined,
    };

    return this.processMessage(message, context);
  }

  async clearSession(context: MessageContext): Promise<boolean> {
    return super.clearSession(context);
  }

  getSessionId(context: MessageContext): string | undefined {
    return super.getSessionId(context);
  }

  getActiveSessions(): Map<string, string> {
    return super.getActiveSessions();
  }
}

/**
 * Create an OpenCode WhatsApp handler with the given configuration
 */
export function createOpenCodeWhatsAppHandler(
  config: OpenCodeWhatsAppConfig
): OpenCodeWhatsAppHandler {
  return new OpenCodeWhatsAppHandler(config);
}
