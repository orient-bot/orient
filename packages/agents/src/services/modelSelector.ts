/**
 * Model Selector Service
 *
 * Intelligently selects the appropriate AI model based on:
 * - Agent tier preference
 * - Required capabilities (vision, long context, etc.)
 * - API key availability
 * - Model health status
 *
 * When no API keys are configured, automatically falls back to free Zen models.
 */

import { createServiceLogger } from '@orient-bot/core';
import {
  ModelTier,
  ModelCapabilities,
  getModelsForTier,
  getDefaultFreeModel,
  getFallbackModels,
  getModelCapabilities,
  isFreeModel,
  FREE_MODEL_FALLBACK_CHAIN,
  AVAILABLE_MODELS,
} from '@orient-bot/core';
import { FreeModelHealthChecker, getFreeModelHealthChecker } from './freeModelHealthChecker.js';

const logger = createServiceLogger('model-selector');

// ============================================
// TYPES
// ============================================

export interface ModelSelectionContext {
  /** The agent's preferred tier */
  agentTier: ModelTier;
  /** Required model capabilities */
  requiredCapabilities?: Partial<ModelCapabilities>;
  /** Whether any paid provider API keys are configured */
  hasApiKeys: boolean;
  /** Preferred provider (optional) */
  preferredProvider?: string;
  /** Specific model ID to use (overrides tier selection) */
  specificModelId?: string;
}

export interface ModelSelectionResult {
  /** Selected model ID */
  modelId: string;
  /** Effective tier used */
  effectiveTier: ModelTier;
  /** Whether this is a free model */
  isFreeModel: boolean;
  /** Reason for selection */
  reason: string;
}

export interface ModelSelectorOptions {
  /** Health checker instance (uses singleton if not provided) */
  healthChecker?: FreeModelHealthChecker;
}

// ============================================
// MODEL SELECTOR SERVICE
// ============================================

export class ModelSelector {
  private healthChecker: FreeModelHealthChecker;

  constructor(options: ModelSelectorOptions = {}) {
    this.healthChecker = options.healthChecker ?? getFreeModelHealthChecker();
  }

  /**
   * Select the best model for the given context
   */
  async selectModel(context: ModelSelectionContext): Promise<ModelSelectionResult> {
    const op = logger.startOperation('selectModel', {
      agentTier: context.agentTier,
      hasApiKeys: context.hasApiKeys,
      hasCapabilityReqs: !!context.requiredCapabilities,
    });

    try {
      // If specific model requested and available, use it
      if (context.specificModelId) {
        const result = await this.trySpecificModel(context.specificModelId, context);
        if (result) {
          op.success('Selected specific model', { modelId: result.modelId });
          return result;
        }
        // Fall through to tier selection if specific model not available
      }

      // Determine effective tier
      const effectiveTier = this.getEffectiveTier(context);

      // Select model based on tier
      const result = await this.selectForTier(effectiveTier, context);

      op.success('Model selected', {
        modelId: result.modelId,
        effectiveTier: result.effectiveTier,
        isFreeModel: result.isFreeModel,
      });

      return result;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));

      // Emergency fallback
      const fallbackModel = getDefaultFreeModel();
      return {
        modelId: fallbackModel,
        effectiveTier: 'free',
        isFreeModel: true,
        reason: 'Emergency fallback due to selection error',
      };
    }
  }

  /**
   * Determine the effective tier based on context
   */
  private getEffectiveTier(context: ModelSelectionContext): ModelTier {
    // If no API keys and agent wants paid tier, downgrade to free
    if (!context.hasApiKeys && context.agentTier !== 'free') {
      logger.debug('Downgrading to free tier due to missing API keys', {
        requestedTier: context.agentTier,
      });
      return 'free';
    }

    return context.agentTier;
  }

  /**
   * Try to use a specific model if available
   */
  private async trySpecificModel(
    modelId: string,
    context: ModelSelectionContext
  ): Promise<ModelSelectionResult | null> {
    // For free models, check health
    if (isFreeModel(modelId)) {
      if (this.healthChecker.isModelAvailable(modelId)) {
        return {
          modelId,
          effectiveTier: 'free',
          isFreeModel: true,
          reason: 'Specific free model requested and available',
        };
      }
      return null; // Model not available
    }

    // For paid models, check if we have API keys
    if (!context.hasApiKeys) {
      logger.debug('Specific paid model requested but no API keys available', { modelId });
      return null;
    }

    // Check capability requirements
    if (context.requiredCapabilities) {
      const modelCaps = getModelCapabilities(modelId);
      if (modelCaps && !this.meetsCapabilities(modelCaps, context.requiredCapabilities)) {
        return null;
      }
    }

    return {
      modelId,
      effectiveTier: this.inferTierFromModel(modelId),
      isFreeModel: false,
      reason: 'Specific paid model requested',
    };
  }

  /**
   * Select model for a specific tier
   */
  private async selectForTier(
    tier: ModelTier,
    context: ModelSelectionContext
  ): Promise<ModelSelectionResult> {
    if (tier === 'free') {
      return this.selectFreeModel(context);
    }

    return this.selectPaidModel(tier, context);
  }

  /**
   * Select the best available free model
   */
  private async selectFreeModel(context: ModelSelectionContext): Promise<ModelSelectionResult> {
    // Get available models from health checker
    const availableModels = await this.healthChecker.getAvailableModels();

    // Filter by capabilities if required
    const candidates = context.requiredCapabilities
      ? this.filterByCapabilities(availableModels, context.requiredCapabilities)
      : availableModels;

    if (candidates.length > 0) {
      return {
        modelId: candidates[0],
        effectiveTier: 'free',
        isFreeModel: true,
        reason: `Best available free model (${candidates.length} candidates)`,
      };
    }

    // No healthy models available, use fallback chain
    const fallbackModel = FREE_MODEL_FALLBACK_CHAIN[0];
    logger.warn('No healthy free models, using first fallback', { modelId: fallbackModel });

    return {
      modelId: fallbackModel,
      effectiveTier: 'free',
      isFreeModel: true,
      reason: 'Fallback to first model in chain (no healthy models)',
    };
  }

  /**
   * Select a paid model for the given tier
   */
  private selectPaidModel(tier: ModelTier, context: ModelSelectionContext): ModelSelectionResult {
    const models = getModelsForTier(tier);

    // Filter by provider preference
    let candidates = context.preferredProvider
      ? models.filter((m) => m.provider === context.preferredProvider)
      : models;

    // If no matches for preferred provider, use all models in tier
    if (candidates.length === 0) {
      candidates = models;
    }

    // Filter by capabilities if required
    if (context.requiredCapabilities) {
      candidates = candidates.filter((m) =>
        this.meetsCapabilities(m.capabilities, context.requiredCapabilities!)
      );
    }

    if (candidates.length > 0) {
      // Sort by cost (cheapest first for same tier)
      candidates.sort((a, b) => (a.costPerMillionTokens ?? 0) - (b.costPerMillionTokens ?? 0));

      return {
        modelId: candidates[0].id,
        effectiveTier: tier,
        isFreeModel: false,
        reason: `Best match for ${tier} tier`,
      };
    }

    // No matches in this tier, try next tier up
    const nextTier = this.getNextTierUp(tier);
    if (nextTier) {
      logger.debug('No candidates in tier, trying next tier up', {
        currentTier: tier,
        nextTier,
      });
      return this.selectPaidModel(nextTier, context);
    }

    // Ultimate fallback to default model
    const defaultModel = Object.values(AVAILABLE_MODELS).find((m) => m.tier === 'cheap')?.id;
    if (defaultModel) {
      return {
        modelId: defaultModel,
        effectiveTier: 'cheap',
        isFreeModel: false,
        reason: 'Fallback to default cheap model',
      };
    }

    // Should never reach here, but just in case
    throw new Error('No suitable model found');
  }

  /**
   * Check if model capabilities meet requirements
   */
  private meetsCapabilities(
    modelCaps: ModelCapabilities,
    required: Partial<ModelCapabilities>
  ): boolean {
    if (required.vision && !modelCaps.vision) return false;
    if (required.longContext && !modelCaps.longContext) return false;
    if (required.toolCalling && !modelCaps.toolCalling) return false;
    if (required.coding && !modelCaps.coding) return false;
    return true;
  }

  /**
   * Filter model IDs by capability requirements
   */
  private filterByCapabilities(modelIds: string[], required: Partial<ModelCapabilities>): string[] {
    return modelIds.filter((id) => {
      const caps = getModelCapabilities(id);
      if (!caps) return true; // Unknown model, include it
      return this.meetsCapabilities(caps, required);
    });
  }

  /**
   * Get the next tier up from the current tier
   */
  private getNextTierUp(tier: ModelTier): ModelTier | null {
    const tierOrder: ModelTier[] = ['free', 'cheap', 'balanced', 'quality'];
    const currentIndex = tierOrder.indexOf(tier);
    if (currentIndex < tierOrder.length - 1) {
      return tierOrder[currentIndex + 1];
    }
    return null;
  }

  /**
   * Infer tier from a model ID
   */
  private inferTierFromModel(modelId: string): ModelTier {
    for (const model of Object.values(AVAILABLE_MODELS)) {
      if (model.id === modelId) {
        return model.tier;
      }
    }
    return 'balanced'; // Default assumption
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let modelSelectorInstance: ModelSelector | null = null;

/**
 * Get the singleton ModelSelector instance
 */
export function getModelSelector(options?: ModelSelectorOptions): ModelSelector {
  if (!modelSelectorInstance) {
    modelSelectorInstance = new ModelSelector(options);
  }
  return modelSelectorInstance;
}

/**
 * Reset the singleton instance (mainly for testing)
 */
export function resetModelSelector(): void {
  modelSelectorInstance = null;
}
