/**
 * AI Model Configuration
 *
 * Centralized configuration for all AI models used across the application.
 * This includes model definitions, defaults per platform, and helper utilities.
 *
 * Model Selection Strategy:
 * - WhatsApp default: GPT-4o Mini (fast and reliable)
 * - Slack default: GPT-4o Mini (fast and reliable)
 * - Vision model: Claude Sonnet 4 (automatically used when images are sent)
 *
 * Users can switch models via chat commands like "switch to gpt" or "use sonnet"
 *
 * Environment Variables:
 * - SLACK_DEFAULT_MODEL: Override default Slack model (e.g., "anthropic/claude-sonnet-4")
 * - WHATSAPP_DEFAULT_MODEL: Override default WhatsApp model
 */

import { getEnvWithSecrets } from './loader.js';

// ============================================
// MODEL TIER & CAPABILITY TYPES
// ============================================

/**
 * Model pricing/quality tiers for intelligent selection
 * - free: No API key required (Zen free models)
 * - cheap: Low cost, good for simple tasks (Haiku, GPT-4o Mini)
 * - balanced: Good cost/quality balance (Sonnet, GPT-4o)
 * - quality: Best quality, higher cost (Opus, GPT-5)
 */
export type ModelTier = 'free' | 'cheap' | 'balanced' | 'quality';

/**
 * Model capabilities for intelligent routing
 */
export interface ModelCapabilities {
  vision: boolean;
  longContext: boolean; // >100K tokens
  toolCalling: boolean;
  coding: boolean;
}

/**
 * Extended model definition with tier and capabilities
 */
export interface ModelDefinitionExt {
  id: string;
  name: string;
  provider: string;
  aliases?: readonly string[];
  supportsVision?: boolean;
  tier: ModelTier;
  capabilities: ModelCapabilities;
  costPerMillionTokens?: number; // for cost optimization
}

// ============================================
// FREE ZEN MODELS
// ============================================

/**
 * Free models available via OpenCode Zen
 * These require no API key and are perfect for onboarding
 */
export const FREE_MODELS: Record<string, ModelDefinitionExt> = {
  'glm-4-flash-free': {
    id: 'opencode/glm-4-flash-free',
    name: 'GLM 4 Flash (Free)',
    provider: 'opencode',
    tier: 'free',
    capabilities: { vision: false, longContext: false, toolCalling: true, coding: true },
    costPerMillionTokens: 0,
  },
  'glm-4.1v-flash-thinking-free': {
    id: 'opencode/glm-4.1v-flash-thinking-free',
    name: 'GLM 4.1V Flash Thinking (Free)',
    provider: 'opencode',
    tier: 'free',
    capabilities: { vision: true, longContext: false, toolCalling: true, coding: true },
    costPerMillionTokens: 0,
  },
  'kimi-k2-0711-free': {
    id: 'opencode/kimi-k2-0711-free',
    name: 'Kimi K2 (Free)',
    provider: 'opencode',
    tier: 'free',
    capabilities: { vision: false, longContext: true, toolCalling: true, coding: true },
    costPerMillionTokens: 0,
  },
  'gemini-2.5-flash-preview-05-20': {
    id: 'opencode/gemini-2.5-flash-preview-05-20',
    name: 'Gemini 2.5 Flash Preview (Free)',
    provider: 'opencode',
    tier: 'free',
    capabilities: { vision: true, longContext: true, toolCalling: true, coding: true },
    costPerMillionTokens: 0,
  },
  'mistral-small-2503': {
    id: 'opencode/mistral-small-2503',
    name: 'Mistral Small (Free)',
    provider: 'opencode',
    tier: 'free',
    capabilities: { vision: false, longContext: false, toolCalling: true, coding: true },
    costPerMillionTokens: 0,
  },
};

/**
 * Default free model to use when no API keys are configured
 */
export const DEFAULT_FREE_MODEL = 'opencode/gemini-2.5-flash-preview-05-20';

/**
 * Fallback chain for free models (in order of preference)
 */
export const FREE_MODEL_FALLBACK_CHAIN = [
  'opencode/gemini-2.5-flash-preview-05-20',
  'opencode/kimi-k2-0711-free',
  'opencode/glm-4.1v-flash-thinking-free',
  'opencode/glm-4-flash-free',
  'opencode/mistral-small-2503',
];

// ============================================
// MODEL DEFINITIONS
// ============================================

/**
 * Available AI models that can be selected
 * These are the primary models supported by OpenCode
 */
export const AVAILABLE_MODELS = {
  // GPT-4o Mini - Fast and reliable default
  'gpt-mini': {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    aliases: ['gpt-mini', 'gpt4o-mini', '4o-mini', 'mini'],
    supportsVision: true,
    tier: 'cheap' as ModelTier,
    capabilities: { vision: true, longContext: false, toolCalling: true, coding: true },
    costPerMillionTokens: 0.15,
  },
  // OpenAI models
  gpt: {
    id: 'gpt-5.2',
    name: 'GPT 5.2',
    provider: 'openai',
    aliases: ['gpt', 'gpt5', 'gpt-5', 'gpt5.2', 'openai'],
    supportsVision: true, // GPT-5.2 has vision capabilities
    tier: 'quality' as ModelTier,
    capabilities: { vision: true, longContext: true, toolCalling: true, coding: true },
    costPerMillionTokens: 15,
  },
  // Anthropic models
  haiku: {
    id: 'anthropic/claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    aliases: ['haiku', 'claude-haiku', 'haiku-4.5'],
    supportsVision: true,
    tier: 'cheap' as ModelTier,
    capabilities: { vision: true, longContext: false, toolCalling: true, coding: true },
    costPerMillionTokens: 0.8,
  },
  opus: {
    id: 'claude-opus-4.5',
    name: 'Claude Opus 4.5',
    provider: 'anthropic',
    aliases: ['opus', 'claude-opus', 'opus-4.5', 'opus4.5', 'anthropic-opus'],
    supportsVision: true, // Claude Opus has vision
    tier: 'quality' as ModelTier,
    capabilities: { vision: true, longContext: true, toolCalling: true, coding: true },
    costPerMillionTokens: 75,
  },
  sonnet: {
    id: 'claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    aliases: [
      'sonnet',
      'claude-sonnet',
      'sonnet-4.5',
      'sonnet4.5',
      'anthropic-sonnet',
      'claude',
      'anthropic',
    ],
    supportsVision: true, // Claude Sonnet is the default vision model
    tier: 'balanced' as ModelTier,
    capabilities: { vision: true, longContext: true, toolCalling: true, coding: true },
    costPerMillionTokens: 15,
  },
} as const;

export type ModelKey = keyof typeof AVAILABLE_MODELS;
export type ModelDefinition = (typeof AVAILABLE_MODELS)[ModelKey];

// ============================================
// PLATFORM DEFAULTS
// ============================================

/** Default model for WhatsApp - can be overridden via WHATSAPP_DEFAULT_MODEL env var */
export const WHATSAPP_DEFAULT_MODEL =
  getEnvWithSecrets('WHATSAPP_DEFAULT_MODEL') || 'anthropic/claude-haiku-4-5-20251001';
export const WHATSAPP_DEFAULT_MODEL_NAME = 'Claude Haiku 4.5';

/** Default model for Slack - can be overridden via SLACK_DEFAULT_MODEL env var */
export const SLACK_DEFAULT_MODEL =
  getEnvWithSecrets('SLACK_DEFAULT_MODEL') || 'anthropic/claude-haiku-4-5-20251001';
export const SLACK_DEFAULT_MODEL_NAME = 'Claude Haiku 4.5';

/** Default agent for all bot integrations */
export const DEFAULT_AGENT = 'ori';

// ============================================
// VISION MODEL CONFIGURATION
// ============================================

/** Vision-capable model for image processing */
export const VISION_MODEL_ID = 'anthropic/claude-sonnet-4-20250514';
export const VISION_MODEL_NAME = 'Claude Sonnet 4';
export const VISION_MODEL_PROVIDER = 'anthropic';

/**
 * Map of vision model IDs to display names
 */
export const VISION_MODEL_NAMES: Record<string, string> = {
  'anthropic/claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'anthropic/claude-opus-4.5': 'Claude Opus 4.5',
  'openai/gpt-4o': 'GPT-4o',
  'gpt-4o': 'GPT-4o',
  'gpt-5.2': 'GPT 5.2',
};

// ============================================
// PROVIDER DEFAULTS
// ============================================

export type ProviderId = 'openai' | 'anthropic' | 'google';
export type ProviderDefaults = {
  transcription: ProviderId;
  vision: ProviderId;
  imageGeneration: ProviderId;
};

const DEFAULT_PROVIDER_DEFAULTS: ProviderDefaults = {
  transcription: 'openai',
  vision: 'anthropic',
  imageGeneration: 'openai',
};

const VISION_MODEL_BY_PROVIDER: Record<ProviderId, string> = {
  anthropic: VISION_MODEL_ID,
  openai: AVAILABLE_MODELS.gpt.id,
  google: VISION_MODEL_ID,
};

export function getProviderDefaults(): ProviderDefaults {
  const raw = getEnvWithSecrets('AI_PROVIDER_DEFAULTS');
  if (!raw) return DEFAULT_PROVIDER_DEFAULTS;
  try {
    const parsed = JSON.parse(raw) as Partial<ProviderDefaults>;
    return {
      transcription: parsed.transcription || DEFAULT_PROVIDER_DEFAULTS.transcription,
      vision: parsed.vision || DEFAULT_PROVIDER_DEFAULTS.vision,
      imageGeneration: parsed.imageGeneration || DEFAULT_PROVIDER_DEFAULTS.imageGeneration,
    };
  } catch {
    return DEFAULT_PROVIDER_DEFAULTS;
  }
}

export function getDefaultVisionModelId(): string {
  const defaults = getProviderDefaults();
  return VISION_MODEL_BY_PROVIDER[defaults.vision] || VISION_MODEL_ID;
}

// ============================================
// MODEL NAME MAPPINGS
// ============================================

/**
 * Common model name mappings for human-readable display
 */
export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  // Grok models (xAI)
  'grok-code': 'Grok Code',
  'grok-code-fast-1': 'Grok Code Fast 1',
  'grok-3': 'Grok 3',
  'grok-3-fast': 'Grok 3 Fast',
  'grok-3-mini': 'Grok 3 Mini',
  'grok-3-mini-fast': 'Grok 3 Mini Fast',
  // Claude models (Anthropic)
  'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
  'claude-3-5-sonnet-latest': 'Claude 3.5 Sonnet',
  'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
  'claude-3-5-haiku-latest': 'Claude 3.5 Haiku',
  'claude-3-opus-20240229': 'Claude 3 Opus',
  'claude-3-sonnet-20240229': 'Claude 3 Sonnet',
  'claude-3-haiku-20240307': 'Claude 3 Haiku',
  'claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'claude-sonnet-4.5': 'Claude Sonnet 4.5',
  'claude-opus-4-20250514': 'Claude Opus 4',
  'claude-opus-4.5': 'Claude Opus 4.5',
  // OpenAI models
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'gpt-4': 'GPT-4',
  'gpt-3.5-turbo': 'GPT-3.5 Turbo',
  'gpt-5.2': 'GPT 5.2',
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Parse a model name/alias and return the model configuration
 */
export function parseModelName(input: string): ModelDefinition | null {
  const normalized = input.toLowerCase().trim();

  for (const [key, model] of Object.entries(AVAILABLE_MODELS)) {
    if (key === normalized || model.id.toLowerCase() === normalized) {
      return model;
    }
    if (model.aliases.some((alias) => alias.toLowerCase() === normalized)) {
      return model;
    }
  }

  return null;
}

/**
 * Get model info by ID
 */
export function getModelById(
  modelId: string
): { id: string; name: string; provider: string } | null {
  for (const model of Object.values(AVAILABLE_MODELS)) {
    if (model.id === modelId) {
      return { id: model.id, name: model.name, provider: model.provider };
    }
  }
  return null;
}

/**
 * Get vision model name from ID
 */
export function getVisionModelName(modelId: string): string {
  return VISION_MODEL_NAMES[modelId] || modelId;
}

/**
 * Extract provider from model ID (e.g., 'anthropic/claude-sonnet-4' -> 'anthropic')
 */
export function getProviderFromModelId(modelId: string): string {
  if (modelId.includes('/')) {
    return modelId.split('/')[0];
  }
  // Infer provider from model name prefix
  if (modelId.startsWith('claude') || modelId.startsWith('anthropic')) return 'anthropic';
  if (modelId.startsWith('gpt') || modelId.startsWith('openai')) return 'openai';
  if (modelId.startsWith('grok') || modelId.startsWith('xai')) return 'opencode';
  return 'unknown';
}

/**
 * Format model name for human-readable display
 */
export function formatModelName(modelId: string): string {
  // Handle model IDs that might include provider prefix
  let normalizedModelId = modelId;
  if (modelId.includes('/')) {
    const parts = modelId.split('/');
    normalizedModelId = parts[parts.length - 1];
  }

  // Check for exact match in mappings
  if (MODEL_DISPLAY_NAMES[normalizedModelId]) {
    return MODEL_DISPLAY_NAMES[normalizedModelId];
  }

  // Try to format based on common patterns
  if (normalizedModelId.startsWith('claude-')) {
    const parts = normalizedModelId.replace('claude-', '').split('-');
    const version = parts.slice(0, 2).join('.').replace(/\.+$/, '');
    const variant = parts[2] ? parts[2].charAt(0).toUpperCase() + parts[2].slice(1) : '';
    return `Claude ${version} ${variant}`.trim();
  }

  if (normalizedModelId.startsWith('gpt-')) {
    return normalizedModelId.toUpperCase().replace('-', ' ');
  }

  if (normalizedModelId.startsWith('grok-')) {
    const parts = normalizedModelId.replace('grok-', '').split('-');
    const formatted = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    return `Grok ${formatted}`;
  }

  // Fallback
  return normalizedModelId;
}

/**
 * Check if a model supports vision
 */
export function modelSupportsVision(modelId: string): boolean {
  for (const model of Object.values(AVAILABLE_MODELS)) {
    if (model.id === modelId) {
      return model.supportsVision;
    }
  }
  // Check free models
  for (const model of Object.values(FREE_MODELS)) {
    if (model.id === modelId) {
      return model.capabilities.vision;
    }
  }
  // Check for known vision models
  return modelId.includes('gpt-4') || modelId.includes('claude') || modelId.includes('vision');
}

// ============================================
// TIER-BASED MODEL SELECTION HELPERS
// ============================================

/**
 * Get all models for a specific tier
 */
export function getModelsForTier(tier: ModelTier): ModelDefinitionExt[] {
  const models: ModelDefinitionExt[] = [];

  // Add free models if tier is 'free'
  if (tier === 'free') {
    models.push(...Object.values(FREE_MODELS));
  }

  // Add paid models matching the tier
  for (const model of Object.values(AVAILABLE_MODELS)) {
    if (model.tier === tier) {
      models.push(model as unknown as ModelDefinitionExt);
    }
  }

  return models;
}

/**
 * Get the default free model ID
 */
export function getDefaultFreeModel(): string {
  return DEFAULT_FREE_MODEL;
}

/**
 * Get fallback models for a given model ID
 * Returns a chain of alternative models to try if the primary fails
 */
export function getFallbackModels(modelId: string): string[] {
  // Check if it's a free model
  if (modelId.startsWith('opencode/')) {
    const currentIndex = FREE_MODEL_FALLBACK_CHAIN.indexOf(modelId);
    if (currentIndex !== -1) {
      return FREE_MODEL_FALLBACK_CHAIN.slice(currentIndex + 1);
    }
    return FREE_MODEL_FALLBACK_CHAIN;
  }

  // For paid models, return tier-appropriate fallbacks
  const model = Object.values(AVAILABLE_MODELS).find((m) => m.id === modelId);
  if (!model) return [];

  const sameTierModels = getModelsForTier(model.tier)
    .filter((m) => m.id !== modelId)
    .map((m) => m.id);

  return sameTierModels;
}

/**
 * Get all available model IDs (both paid and free)
 */
export function getAllModelIds(): string[] {
  const paidModels = Object.values(AVAILABLE_MODELS).map((m) => m.id);
  const freeModels = Object.values(FREE_MODELS).map((m) => m.id);
  return [...paidModels, ...freeModels];
}

/**
 * Check if a model ID is a free model
 */
export function isFreeModel(modelId: string): boolean {
  return (
    modelId.startsWith('opencode/') || Object.values(FREE_MODELS).some((m) => m.id === modelId)
  );
}

/**
 * Get model tier by model ID
 */
export function getModelTier(modelId: string): ModelTier | null {
  // Check paid models
  for (const model of Object.values(AVAILABLE_MODELS)) {
    if (model.id === modelId) {
      return model.tier;
    }
  }
  // Check free models
  for (const model of Object.values(FREE_MODELS)) {
    if (model.id === modelId) {
      return model.tier;
    }
  }
  return null;
}

/**
 * Get model capabilities by model ID
 */
export function getModelCapabilities(modelId: string): ModelCapabilities | null {
  // Check paid models
  for (const model of Object.values(AVAILABLE_MODELS)) {
    if (model.id === modelId) {
      return model.capabilities;
    }
  }
  // Check free models
  for (const model of Object.values(FREE_MODELS)) {
    if (model.id === modelId) {
      return model.capabilities;
    }
  }
  return null;
}
