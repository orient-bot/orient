/**
 * OpenCode Message Processor - Shared utilities for bot integrations
 *
 * This module provides common functionality for processing messages
 * through OpenCode, used by both WhatsApp and Slack handlers.
 *
 * Features:
 * - Default agent configuration (pm-assistant)
 *
 * Exported via @orient-bot/agents package.
 * - Image preprocessing (base64 encoding)
 * - Audio transcription context
 * - Vision model auto-switching
 * - Model preference management
 * - Model switching command detection
 * - Session/context key management
 */

import {
  createServiceLogger,
  // Model definitions
  AVAILABLE_MODELS,
  type ModelKey,
  parseModelName,
  getModelById as configGetModelById,
  // Platform defaults
  DEFAULT_AGENT,
  WHATSAPP_DEFAULT_MODEL,
  WHATSAPP_DEFAULT_MODEL_NAME,
  SLACK_DEFAULT_MODEL,
  SLACK_DEFAULT_MODEL_NAME,
  // Vision config
  VISION_MODEL_ID,
  VISION_MODEL_NAME,
  VISION_MODEL_PROVIDER,
  // Helper functions
  getDefaultVisionModelId,
  getVisionModelName as configGetVisionModelName,
  getProviderFromModelId as configGetProviderFromModelId,
  formatModelName as configFormatModelName,
} from '@orient-bot/core';

// Re-export all model-related items for backward compatibility
export {
  AVAILABLE_MODELS,
  parseModelName,
  DEFAULT_AGENT,
  WHATSAPP_DEFAULT_MODEL,
  WHATSAPP_DEFAULT_MODEL_NAME,
  SLACK_DEFAULT_MODEL,
  SLACK_DEFAULT_MODEL_NAME,
  VISION_MODEL_ID,
  VISION_MODEL_NAME,
  VISION_MODEL_PROVIDER,
  getDefaultVisionModelId,
};
export type { ModelKey };

const logger = createServiceLogger('opencode-processor');

// ============================================
// TYPES
// ============================================

export interface ImageData {
  buffer: Buffer;
  mimeType: string;
  filename?: string;
}

export interface AudioData {
  transcribedText: string;
  transcribedLanguage: string;
  originalDuration?: number;
}

export interface MessageEnrichment {
  image?: ImageData;
  audio?: AudioData;
  files?: Array<{ name: string; url: string; mimeType: string }>;
}

export interface ProcessorConfig {
  visionModelId?: string;
  defaultModelId?: string;
}

// ============================================
// IMAGE PROCESSING
// ============================================

/**
 * Preprocess image data for OpenCode
 * Converts buffer to base64 data URL format
 */
export function preprocessImage(image: ImageData): string {
  const base64 = image.buffer.toString('base64');
  const dataUrl = `data:${image.mimeType};base64,${base64}`;

  logger.debug('Preprocessed image', {
    mimeType: image.mimeType,
    size: image.buffer.length,
    base64Length: base64.length,
  });

  return dataUrl;
}

/**
 * Check if an image is present and should trigger vision model
 */
export function shouldUseVisionModel(enrichment?: MessageEnrichment): boolean {
  return !!enrichment?.image;
}

/**
 * Get the appropriate model for a message
 * If image is present, use vision-capable model
 */
export function getModelForMessage(
  preferredModelId: string,
  enrichment?: MessageEnrichment,
  config?: ProcessorConfig
): { modelId: string; switchedForVision: boolean } {
  const visionModelId = config?.visionModelId || getDefaultVisionModelId();

  if (shouldUseVisionModel(enrichment)) {
    const switchedForVision = preferredModelId !== visionModelId;

    if (switchedForVision) {
      logger.info('Image detected - using vision model', {
        userPreferredModel: preferredModelId,
        visionModel: visionModelId,
      });
    }

    return { modelId: visionModelId, switchedForVision };
  }

  return { modelId: preferredModelId, switchedForVision: false };
}

// ============================================
// MESSAGE BUILDING
// ============================================

/**
 * Build enriched message text with context for images, audio, etc.
 */
export function buildEnrichedMessage(text: string, enrichment?: MessageEnrichment): string {
  const parts: string[] = [];

  // Add transcription context if this was a voice message
  if (enrichment?.audio) {
    parts.push(`[Transcribed from voice message in ${enrichment.audio.transcribedLanguage}]`);
  }

  // Add image context if present
  if (enrichment?.image) {
    parts.push('[User sent an image - analyze it if you have vision capabilities]');
    parts.push(`[Image data: ${preprocessImage(enrichment.image)}]`);
  }

  // Add file references if present (but not images)
  if (enrichment?.files && enrichment.files.length > 0) {
    const fileList = enrichment.files.map((f) => `- ${f.name} (${f.mimeType})`).join('\n');
    parts.push(`[User shared files:\n${fileList}]`);
  }

  // Add the actual message
  if (enrichment?.audio?.transcribedText) {
    parts.push(enrichment.audio.transcribedText);
  } else {
    parts.push(text);
  }

  return parts.join('\n\n');
}

/**
 * Extract an @agent mention to override the agent selection.
 * Example: "@explorer please find the config file" -> agentId "explorer"
 */
export function extractAgentMention(message: string): { agentId?: string; cleanedMessage: string } {
  const trimmed = message.trim();
  const match = trimmed.match(/^@([a-z0-9-]+)\s+([\s\S]+)$/i);

  if (!match) {
    return { cleanedMessage: message };
  }

  return {
    agentId: match[1],
    cleanedMessage: match[2].trim(),
  };
}

// ============================================
// RESPONSE FORMATTING
// ============================================

/**
 * Format model name for display in responses
 * Delegates to centralized config
 */
export function formatModelName(modelId: string): string {
  return configFormatModelName(modelId);
}

/**
 * Categorize tools for display
 */
export function categorizeTools(tools: string[]): Record<string, string[]> {
  const categories: Record<string, string[]> = {};

  for (const tool of tools) {
    let category = 'other';
    let simpleName = tool;

    if (tool.startsWith('system_')) {
      category = 'System';
      simpleName = tool.replace('system_', '').replace(/_/g, ' ');
    } else if (tool.startsWith('skills_')) {
      category = 'Skills';
      simpleName = tool.replace('skills_', '').replace(/_/g, ' ');
    } else if (tool.startsWith('apps_')) {
      category = 'Apps';
      simpleName = tool.replace('apps_', '').replace(/_/g, ' ');
    } else if (tool.startsWith('agents_')) {
      category = 'Agents';
      simpleName = tool.replace('agents_', '').replace(/_/g, ' ');
    } else if (tool.startsWith('context_')) {
      category = 'Context';
      simpleName = tool.replace('context_', '').replace(/_/g, ' ');
    } else if (tool.startsWith('media_')) {
      category = 'Media';
      simpleName = tool.replace('media_', '').replace(/_/g, ' ');
    } else if (tool.startsWith('config_')) {
      category = 'Config';
      simpleName = tool.replace('config_', '').replace(/_/g, ' ');
    } else if (tool.startsWith('slack_')) {
      category = 'Slack';
      simpleName = tool.replace('slack_', '').replace(/_/g, ' ');
    } else if (tool.startsWith('whatsapp_')) {
      category = 'WhatsApp';
      simpleName = tool.replace('whatsapp_', '').replace(/_/g, ' ');
    } else if (tool.startsWith('slides_')) {
      category = 'Slides';
      simpleName = tool.replace('slides_', '').replace(/_/g, ' ');
    }

    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(simpleName);
  }

  return categories;
}

/**
 * Format tools used for display
 */
export function formatToolsUsed(tools: string[]): string {
  if (tools.length === 0) return '';

  const categories = categorizeTools(tools);
  const formattedCategories: string[] = [];

  for (const [category, toolNames] of Object.entries(categories)) {
    if (category === 'other') {
      formattedCategories.push(...toolNames);
    } else {
      formattedCategories.push(`${category} (${toolNames.join(', ')})`);
    }
  }

  return formattedCategories.join(', ');
}

// ============================================
// MODEL SWITCHING
// ============================================

/**
 * Model switch command detection result
 */
export interface ModelSwitchResult {
  isModelSwitch: boolean;
  modelKey?: ModelKey;
  modelId?: string;
  modelName?: string;
  provider?: string;
}

/**
 * Detect if a message is a model switch command
 *
 * Supported patterns:
 * - "switch to gpt" / "use gpt" / "change model to gpt"
 * - "switch to openai" / "use openai"
 * - "switch to claude" / "use anthropic" / "switch to opus" / "switch to sonnet"
 * - "switch to grok" / "use grok" (default)
 * - "what model" / "current model" / "which model" (returns isModelSwitch: false)
 */
export function detectModelSwitch(text: string): ModelSwitchResult {
  const normalized = text.toLowerCase().trim();

  // Pattern to detect model switch commands
  const switchPatterns = [
    /(?:switch|change|use|set)\s+(?:to|model\s+to|the\s+model\s+to)?\s*(\w+[\w\s.-]*)/i,
    /(?:model|ai|assistant)\s+(?:to|=|:)\s*(\w+[\w\s.-]*)/i,
  ];

  // Pattern to detect model info request
  const infoPatterns = [
    /(?:what|which|current|show|tell\s+me)\s+(?:is\s+the\s+)?model/i,
    /model\s+(?:info|status|name)/i,
  ];

  // Check for info request (handled separately in processMessage)
  for (const pattern of infoPatterns) {
    if (pattern.test(normalized)) {
      return { isModelSwitch: false }; // Let the AI handle info requests
    }
  }

  // Check for switch commands
  for (const pattern of switchPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const modelInput = match[1].trim();
      const model = parseModelName(modelInput);

      if (model) {
        return {
          isModelSwitch: true,
          modelKey: Object.keys(AVAILABLE_MODELS).find(
            (k) => AVAILABLE_MODELS[k as ModelKey].id === model.id
          ) as ModelKey,
          modelId: model.id,
          modelName: model.name,
          provider: model.provider,
        };
      }
    }
  }

  return { isModelSwitch: false };
}

/**
 * Get model info by ID
 * Delegates to centralized config
 */
export function getModelById(
  modelId: string
): { id: string; name: string; provider: string } | null {
  return configGetModelById(modelId);
}

/**
 * Get model info for a context from preferences map
 */
export function getModelForContext(
  contextKey: string,
  modelPreferences: Map<string, string>,
  defaultModelId: string,
  defaultModelName: string
): { id: string; name: string; provider: string } {
  const modelId = modelPreferences.get(contextKey) || defaultModelId;

  // Find the model info
  const model = getModelById(modelId);
  if (model) {
    return model;
  }

  return {
    id: modelId,
    name: defaultModelName,
    provider: 'unknown',
  };
}

/**
 * Build model switch confirmation message
 */
export function buildModelSwitchConfirmation(
  modelName: string,
  provider: string,
  supportsVision: boolean,
  visionModelName?: string
): string {
  const visionNote = supportsVision
    ? ''
    : `\n⚠️ _${modelName} doesn't support images. When you send images, I'll temporarily use the vision model (${visionModelName || VISION_MODEL_NAME}), then switch back._`;

  return (
    `✅ *Model switched to ${modelName}*\n\n` +
    `_Provider: ${provider}_\n` +
    `_All future messages will use this model._${visionNote}\n\n` +
    `To switch models, say:\n` +
    `• "switch to grok" _(Grok Code - fast, free)_\n` +
    `• "switch to gpt" _(GPT 5.2 - 👁️ vision)_\n` +
    `• "switch to opus" _(Claude Opus 4.5 - 👁️ vision)_\n` +
    `• "switch to sonnet" _(Claude Sonnet 4.5 - 👁️ vision)_`
  );
}

/**
 * Build available models info message
 */
export function buildAvailableModelsInfo(defaultModelId: string): string {
  const lines = ['*Available AI Models:*\n'];

  for (const [key, model] of Object.entries(AVAILABLE_MODELS)) {
    const isDefault = model.id === defaultModelId;
    const defaultMark = isDefault ? ' _(default)_' : '';
    const visionMark = model.supportsVision ? '👁️' : '';
    lines.push(`• *${model.name}*${defaultMark} ${visionMark}`);
    lines.push(`  _Provider: ${model.provider} | Use: "switch to ${key}"_`);
  }

  lines.push('\n_👁️ = Supports image analysis_');

  return lines.join('\n');
}

/**
 * Extract provider from model ID (e.g., 'anthropic/claude-sonnet-4' -> 'anthropic')
 * Delegates to centralized config
 */
export function getProviderFromModelId(modelId: string): string {
  return configGetProviderFromModelId(modelId);
}

/**
 * Get vision model name from ID
 * Delegates to centralized config
 */
export function getVisionModelName(modelId: string): string {
  return configGetVisionModelName(modelId);
}

// ============================================
// SESSION COMMANDS
// ============================================

/**
 * Session command detection result
 */
export interface SessionCommandResult {
  isCommand: boolean;
  commandType?: 'reset' | 'compact' | 'help';
}

/**
 * Detect if a message is a session command
 *
 * Supported commands:
 * - /reset, /clear - Clear session and start fresh
 * - /compact, /summarize - Compress conversation history (preserves context)
 * - /help - Show available commands
 */
export function detectSessionCommand(text: string): SessionCommandResult {
  const normalized = text.toLowerCase().trim();

  // Reset command - clear session completely
  if (normalized === '/reset' || normalized === '/clear') {
    return { isCommand: true, commandType: 'reset' };
  }

  // Compact command - summarize and compress context
  if (normalized === '/compact' || normalized === '/summarize') {
    return { isCommand: true, commandType: 'compact' };
  }

  // Help command - show available commands
  if (normalized === '/help') {
    return { isCommand: true, commandType: 'help' };
  }

  return { isCommand: false };
}

/**
 * Build help text for session commands (WhatsApp format)
 */
export function buildWhatsAppHelpText(): string {
  return `*Available Commands:*
• /reset - Clear session and start fresh
• /compact - Compress conversation history (preserves context)
• /help - Show this help message

*Model Switching:*
• "switch to grok" - Use Grok (default, free)
• "switch to gpt" - Use GPT 5.2
• "switch to sonnet" - Use Claude Sonnet 4.5
• "switch to opus" - Use Claude Opus 4.5`;
}

/**
 * Build help text for session commands (Slack format)
 */
export function buildSlackHelpText(): string {
  return `*Available Commands:*
• \`/reset\` - Clear session and start fresh
• \`/compact\` - Compress conversation history (preserves context)
• \`/help\` - Show this help message

*Model Switching:*
• "switch to grok" - Use Grok (free)
• "switch to gpt" - Use GPT 5.2
• "switch to sonnet" - Use Claude Sonnet 4.5 (default)
• "switch to opus" - Use Claude Opus 4.5`;
}

// ============================================
// RE-EXPORTS
// ============================================

// ============================================
// LOGGING HELPERS
// ============================================

export { logger as processorLogger };
