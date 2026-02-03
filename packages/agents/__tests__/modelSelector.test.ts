import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ModelSelector,
  resetModelSelector,
  getModelSelector,
  type ModelSelectionContext,
} from '../src/services/modelSelector.js';
import {
  FreeModelHealthChecker,
  resetFreeModelHealthChecker,
} from '../src/services/freeModelHealthChecker.js';

// Mock the health checker
vi.mock('../src/services/freeModelHealthChecker.js', async () => {
  const actual = await vi.importActual('../src/services/freeModelHealthChecker.js');
  return {
    ...actual,
    getFreeModelHealthChecker: vi.fn(() => mockHealthChecker),
  };
});

const mockHealthChecker = {
  isModelAvailable: vi.fn(),
  getAvailableModels: vi.fn(),
  getFirstAvailableModel: vi.fn(),
};

describe('ModelSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetModelSelector();
    resetFreeModelHealthChecker();
  });

  afterEach(() => {
    resetModelSelector();
  });

  describe('selectModel', () => {
    it('should return free model when no API keys are configured', async () => {
      // Setup: no API keys, health checker has available models
      mockHealthChecker.getAvailableModels.mockResolvedValue([
        'opencode/gemini-2.5-flash-preview-05-20',
        'opencode/kimi-k2-0711-free',
      ]);
      mockHealthChecker.isModelAvailable.mockReturnValue(true);

      const selector = new ModelSelector({
        healthChecker: mockHealthChecker as unknown as FreeModelHealthChecker,
      });
      const context: ModelSelectionContext = {
        agentTier: 'cheap',
        hasApiKeys: false,
      };

      const result = await selector.selectModel(context);

      expect(result.isFreeModel).toBe(true);
      expect(result.effectiveTier).toBe('free');
      expect(result.modelId).toBe('opencode/gemini-2.5-flash-preview-05-20');
    });

    it('should return paid model when API keys are configured', async () => {
      const selector = new ModelSelector({
        healthChecker: mockHealthChecker as unknown as FreeModelHealthChecker,
      });
      const context: ModelSelectionContext = {
        agentTier: 'cheap',
        hasApiKeys: true,
      };

      const result = await selector.selectModel(context);

      expect(result.isFreeModel).toBe(false);
      expect(result.effectiveTier).toBe('cheap');
      // Should select a cheap tier model (could be gpt-4o-mini or haiku)
      expect(['anthropic/claude-haiku-4-5-20251001', 'openai/gpt-4o-mini']).toContain(
        result.modelId
      );
    });

    it('should downgrade to free tier when no API keys and tier is not free', async () => {
      mockHealthChecker.getAvailableModels.mockResolvedValue([
        'opencode/gemini-2.5-flash-preview-05-20',
      ]);

      const selector = new ModelSelector({
        healthChecker: mockHealthChecker as unknown as FreeModelHealthChecker,
      });
      const context: ModelSelectionContext = {
        agentTier: 'quality', // User wants quality tier
        hasApiKeys: false, // But no API keys
      };

      const result = await selector.selectModel(context);

      // Should downgrade to free
      expect(result.effectiveTier).toBe('free');
      expect(result.isFreeModel).toBe(true);
    });

    it('should use specific model when requested and available', async () => {
      mockHealthChecker.isModelAvailable.mockReturnValue(true);

      const selector = new ModelSelector({
        healthChecker: mockHealthChecker as unknown as FreeModelHealthChecker,
      });
      const context: ModelSelectionContext = {
        agentTier: 'cheap',
        hasApiKeys: false,
        specificModelId: 'opencode/kimi-k2-0711-free',
      };

      const result = await selector.selectModel(context);

      expect(result.modelId).toBe('opencode/kimi-k2-0711-free');
      expect(result.isFreeModel).toBe(true);
    });

    it('should filter by capabilities when required', async () => {
      mockHealthChecker.getAvailableModels.mockResolvedValue([
        'opencode/gemini-2.5-flash-preview-05-20', // Has vision
        'opencode/kimi-k2-0711-free', // No vision
      ]);

      const selector = new ModelSelector({
        healthChecker: mockHealthChecker as unknown as FreeModelHealthChecker,
      });
      const context: ModelSelectionContext = {
        agentTier: 'free',
        hasApiKeys: false,
        requiredCapabilities: { vision: true },
      };

      const result = await selector.selectModel(context);

      // Should prefer vision-capable model
      expect(result.modelId).toBe('opencode/gemini-2.5-flash-preview-05-20');
    });

    it('should fall back gracefully when model selection fails', async () => {
      mockHealthChecker.getAvailableModels.mockRejectedValue(new Error('Network error'));

      const selector = new ModelSelector({
        healthChecker: mockHealthChecker as unknown as FreeModelHealthChecker,
      });
      const context: ModelSelectionContext = {
        agentTier: 'cheap',
        hasApiKeys: false,
      };

      const result = await selector.selectModel(context);

      // Should return fallback free model
      expect(result.isFreeModel).toBe(true);
      expect(result.reason).toContain('fallback');
    });
  });

  describe('singleton', () => {
    it('should return the same instance', () => {
      const instance1 = getModelSelector();
      const instance2 = getModelSelector();

      expect(instance1).toBe(instance2);
    });

    it('should return new instance after reset', () => {
      const instance1 = getModelSelector();
      resetModelSelector();
      const instance2 = getModelSelector();

      expect(instance1).not.toBe(instance2);
    });
  });
});
