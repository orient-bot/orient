/**
 * Integration Tests for Context Analyzer
 *
 * These tests verify the full context analysis flow including:
 * - Context service integration
 * - Keyword accumulation over multiple messages
 * - Topic shift detection with realistic conversation flows
 * - Frustration detection edge cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ContextAnalyzer,
  extractKeywords,
  detectFrustration,
  detectTopicShiftByKeywords,
  getContextAnalyzer,
  resetContextAnalyzer,
} from '../src/services/contextAnalyzer.js';
import type { PersistentContext } from '../src/services/contextService.js';

// Mock @orient/core logger
vi.mock('@orient/core', () => ({
  createServiceLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startOperation: () => ({ success: vi.fn(), failure: vi.fn() }),
  }),
}));

describe('Context Analyzer Integration', () => {
  let analyzer: ContextAnalyzer;

  beforeEach(() => {
    resetContextAnalyzer();
    analyzer = new ContextAnalyzer();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Realistic Conversation Flows', () => {
    it('should not suggest clear for first message (no history)', async () => {
      const result = await analyzer.analyze('Help me set up a database', {});

      expect(result.suggestion.type).toBe('none');
      expect(result.extractedKeywords).toContain('help');
      expect(result.extractedKeywords).toContain('database');
    });

    it('should accumulate keywords and detect topic continuation', async () => {
      // Simulate conversation context built up over messages
      const context: PersistentContext = {
        currentState: {
          recentKeywords: ['database', 'schema', 'migration', 'postgres', 'table'],
        },
      };

      // Follow-up about same topic
      const result = await analyzer.analyze(
        'What indexes should I add to the users table?',
        context
      );

      expect(result.suggestion.type).toBe('none');
      expect(result.detectedTopicShift).toBe(false);
    });

    it('should detect topic shift when user asks about completely different subject', async () => {
      const context: PersistentContext = {
        currentState: {
          recentKeywords: ['database', 'schema', 'migration', 'postgres', 'table'],
        },
      };

      // Completely different topic
      const result = await analyzer.analyze('Can you help me write a poem about flowers?', context);

      expect(result.suggestion.type).toBe('suggest_clear');
      expect(result.detectedTopicShift).toBe(true);
    });

    it('should handle gradual topic drift without false positives', async () => {
      // Start: database
      const context1: PersistentContext = {
        currentState: {
          recentKeywords: ['database', 'schema'],
        },
      };

      // Slight shift: database performance
      const result1 = await analyzer.analyze(
        'The database queries are slow, any optimization tips?',
        context1
      );
      expect(result1.suggestion.type).toBe('none'); // Still related

      // More shift: general performance
      const context2: PersistentContext = {
        currentState: {
          recentKeywords: ['database', 'queries', 'slow', 'optimization'],
        },
      };

      const result2 = await analyzer.analyze(
        'How can I profile the application performance?',
        context2
      );
      expect(result2.suggestion.type).toBe('none'); // Still somewhat related
    });
  });

  describe('Frustration Detection Edge Cases', () => {
    it('should detect frustration with various phrasings', async () => {
      const frustrationPhrases = [
        'forget that, I want something else',
        "let's start over from the beginning",
        "you're not listening to what I said",
        'no, that is not what I meant at all',
        'clear your memory and try again',
        'reset the conversation please',
        'what are you talking about? that makes no sense',
        "that's not what I asked for",
      ];

      for (const phrase of frustrationPhrases) {
        const result = await analyzer.analyze(phrase, {});
        expect(result.detectedFrustration).toBe(true);
        expect(result.suggestion.type).toBe('suggest_compact');
      }
    });

    it('should not trigger on similar but non-frustration phrases', async () => {
      const nonFrustrationPhrases = [
        'Can you help me forget my password?', // forget in different context
        "Let's start the server", // start in different context
        'The database is wrong', // wrong in different context
        'Please clear the cache', // clear in different context
      ];

      for (const phrase of nonFrustrationPhrases) {
        const result = await analyzer.analyze(phrase, {});
        expect(result.detectedFrustration).toBe(false);
      }
    });

    it('should prioritize frustration over topic shift', async () => {
      const context: PersistentContext = {
        currentState: {
          recentKeywords: ['database', 'schema', 'migration', 'postgres', 'table'],
        },
      };

      // Both frustration AND topic shift
      const result = await analyzer.analyze(
        "forget that database stuff, let's talk about cooking",
        context
      );

      // Frustration takes precedence
      expect(result.suggestion.type).toBe('suggest_compact');
      expect(result.detectedFrustration).toBe(true);
    });
  });

  describe('Keyword Extraction Quality', () => {
    it('should extract meaningful technical keywords', () => {
      const text = 'I need to create a new migration for the users table with an index on email';
      const keywords = extractKeywords(text);

      expect(keywords).toContain('migration');
      expect(keywords).toContain('users');
      expect(keywords).toContain('table');
      expect(keywords).toContain('index');
      expect(keywords).toContain('email');

      // Should not contain stopwords
      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('for');
      expect(keywords).not.toContain('with');
      expect(keywords).not.toContain('need');
    });

    it('should handle code snippets in messages', () => {
      const text = 'The function getUserById is returning null for valid IDs';
      const keywords = extractKeywords(text);

      expect(keywords).toContain('function');
      expect(keywords).toContain('getuserbyid');
      expect(keywords).toContain('returning');
      expect(keywords).toContain('null');
      expect(keywords).toContain('valid');
      expect(keywords).toContain('ids');
    });

    it('should handle mixed case and special characters', () => {
      const text = 'ERROR: PostgreSQL connection failed at 192.168.1.1:5432';
      const keywords = extractKeywords(text);

      expect(keywords).toContain('error');
      expect(keywords).toContain('postgresql');
      expect(keywords).toContain('connection');
      expect(keywords).toContain('failed');
      expect(keywords).toContain('192'); // IP parts become separate tokens
    });
  });

  describe('Topic Shift Threshold Sensitivity', () => {
    it('should be configurable for sensitivity', () => {
      const currentKeywords = ['react', 'component'];
      const recentKeywords = ['react', 'hooks', 'state', 'props'];

      // Default threshold (0.2) - 50% overlap should NOT trigger shift
      const defaultResult = detectTopicShiftByKeywords(currentKeywords, recentKeywords);
      expect(defaultResult).toBe(false);

      // High threshold (0.8) - same should trigger shift
      const sensitiveResult = detectTopicShiftByKeywords(currentKeywords, recentKeywords, 0.8);
      expect(sensitiveResult).toBe(true);

      // Low threshold (0.1) - same should NOT trigger shift
      const relaxedResult = detectTopicShiftByKeywords(currentKeywords, recentKeywords, 0.1);
      expect(relaxedResult).toBe(false);
    });

    it('should handle edge case of single keyword overlap', () => {
      const current = ['database'];
      const recent = ['database', 'schema', 'migration', 'table', 'index'];

      // 100% of current keywords overlap
      const result = detectTopicShiftByKeywords(current, recent);
      expect(result).toBe(false);
    });

    it('should handle zero overlap correctly', () => {
      const current = ['weather', 'forecast', 'temperature'];
      const recent = ['database', 'schema', 'migration'];

      const result = detectTopicShiftByKeywords(current, recent);
      expect(result).toBe(true);
    });
  });

  describe('LLM Classifier Integration', () => {
    it('should use LLM classifier when available and keyword heuristic triggers', async () => {
      const mockClassifier = vi.fn().mockResolvedValue('topic_shift');
      analyzer.setLLMClassifier(mockClassifier);

      const context: PersistentContext = {
        currentState: {
          recentKeywords: ['database', 'schema'],
        },
      };

      // Message with no keyword overlap (triggers heuristic)
      const result = await analyzer.analyze('What is the weather forecast?', context);

      expect(mockClassifier).toHaveBeenCalled();
      expect(result.suggestion.type).toBe('suggest_clear');
    });

    it('should skip LLM classifier if keyword heuristic does not trigger', async () => {
      const mockClassifier = vi.fn().mockResolvedValue('topic_shift');
      analyzer.setLLMClassifier(mockClassifier);

      const context: PersistentContext = {
        currentState: {
          recentKeywords: ['database', 'schema', 'table'],
        },
      };

      // Message with keyword overlap (heuristic does NOT trigger)
      const result = await analyzer.analyze('Add an index to the database table', context);

      expect(mockClassifier).not.toHaveBeenCalled();
      expect(result.suggestion.type).toBe('none');
    });

    it('should respect LLM classifier saying continuation', async () => {
      const mockClassifier = vi.fn().mockResolvedValue('continuation');
      analyzer.setLLMClassifier(mockClassifier);

      const context: PersistentContext = {
        currentState: {
          recentKeywords: ['database', 'schema'],
        },
      };

      // No keyword overlap, but LLM says it's a continuation
      const result = await analyzer.analyze('What about performance tuning?', context);

      expect(mockClassifier).toHaveBeenCalled();
      expect(result.suggestion.type).toBe('none');
    });

    it('should fall back to keyword-only when LLM fails', async () => {
      const mockClassifier = vi.fn().mockRejectedValue(new Error('LLM unavailable'));
      analyzer.setLLMClassifier(mockClassifier);

      const context: PersistentContext = {
        currentState: {
          recentKeywords: ['database', 'schema', 'migration', 'table', 'index'],
        },
      };

      // No keyword overlap + LLM fails + enough history = should still suggest clear
      const result = await analyzer.analyze('Tell me about cooking recipes', context);

      expect(mockClassifier).toHaveBeenCalled();
      expect(result.suggestion.type).toBe('suggest_clear');
    });
  });

  describe('Singleton Behavior', () => {
    it('should return same instance from getContextAnalyzer', () => {
      const instance1 = getContextAnalyzer();
      const instance2 = getContextAnalyzer();

      expect(instance1).toBe(instance2);
    });

    it('should reset singleton with resetContextAnalyzer', () => {
      const instance1 = getContextAnalyzer();
      resetContextAnalyzer();
      const instance2 = getContextAnalyzer();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Message Counter Scenarios', () => {
    it('should not suggest clear with insufficient history', async () => {
      // Only 2 keywords in history - not enough confidence
      const context: PersistentContext = {
        currentState: {
          recentKeywords: ['database', 'schema'],
          messagesSinceClear: 2,
        },
      };

      const result = await analyzer.analyze('What about the weather today?', context);

      // Without LLM and with insufficient history, should not suggest
      expect(result.suggestion.type).toBe('none');
    });

    it('should suggest clear with sufficient history', async () => {
      // 5+ keywords in history - enough confidence
      const context: PersistentContext = {
        currentState: {
          recentKeywords: ['database', 'schema', 'migration', 'postgres', 'table'],
          messagesSinceClear: 5,
        },
      };

      const result = await analyzer.analyze('What about the weather today?', context);

      expect(result.suggestion.type).toBe('suggest_clear');
    });
  });
});
