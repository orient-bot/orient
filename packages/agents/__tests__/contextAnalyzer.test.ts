import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractKeywords,
  detectFrustration,
  detectTopicShiftByKeywords,
  ContextAnalyzer,
  resetContextAnalyzer,
} from '../src/services/contextAnalyzer.js';

describe('extractKeywords', () => {
  it('removes stopwords', () => {
    const keywords = extractKeywords('I want to create a new database');
    expect(keywords).toContain('create');
    expect(keywords).toContain('database');
    expect(keywords).not.toContain('want');
    expect(keywords).not.toContain('the');
  });

  it('handles empty input', () => {
    expect(extractKeywords('')).toEqual([]);
  });

  it('deduplicates keywords', () => {
    const keywords = extractKeywords('test test test');
    expect(keywords).toEqual(['test']);
  });

  it('filters short tokens', () => {
    const keywords = extractKeywords('a an is are the database');
    expect(keywords).toEqual(['database']);
  });

  it('lowercases keywords', () => {
    const keywords = extractKeywords('Database SCHEMA Migration');
    expect(keywords).toContain('database');
    expect(keywords).toContain('schema');
    expect(keywords).toContain('migration');
  });
});

describe('detectFrustration', () => {
  it('detects "forget that"', () => {
    expect(detectFrustration('forget that, let me try again')).toBe(true);
  });

  it('detects "forget everything"', () => {
    expect(detectFrustration('forget everything we discussed')).toBe(true);
  });

  it('detects "start over"', () => {
    expect(detectFrustration('let us start over')).toBe(true);
  });

  it('detects "start fresh"', () => {
    expect(detectFrustration("let's start fresh")).toBe(true);
  });

  it('detects "you are confused"', () => {
    expect(detectFrustration("you're confused about what I meant")).toBe(true);
  });

  it('detects "you are wrong"', () => {
    expect(detectFrustration('you are wrong about that')).toBe(true);
  });

  it('detects "no, I said"', () => {
    expect(detectFrustration('no, I said something else')).toBe(true);
  });

  it('detects "clear the context"', () => {
    expect(detectFrustration('clear the context please')).toBe(true);
  });

  it('detects "reset everything"', () => {
    expect(detectFrustration('reset everything')).toBe(true);
  });

  it('detects "what are you talking about"', () => {
    expect(detectFrustration('what are you talking about?')).toBe(true);
  });

  it('detects "that\'s not what I asked"', () => {
    expect(detectFrustration("that's not what I asked")).toBe(true);
  });

  it('returns false for normal messages', () => {
    expect(detectFrustration('Can you help me with the database?')).toBe(false);
  });

  it('returns false for technical discussion', () => {
    expect(detectFrustration('The migration script should update the schema')).toBe(false);
  });
});

describe('detectTopicShiftByKeywords', () => {
  it('detects shift when no overlap', () => {
    const current = ['database', 'schema', 'migration'];
    const recent = ['weather', 'forecast', 'temperature'];
    expect(detectTopicShiftByKeywords(current, recent)).toBe(true);
  });

  it('returns false with significant overlap', () => {
    const current = ['database', 'schema', 'index'];
    const recent = ['database', 'table', 'schema'];
    expect(detectTopicShiftByKeywords(current, recent)).toBe(false);
  });

  it('returns false for empty recent keywords', () => {
    expect(detectTopicShiftByKeywords(['test'], [])).toBe(false);
  });

  it('returns false for empty current keywords', () => {
    expect(detectTopicShiftByKeywords([], ['test'])).toBe(false);
  });

  it('uses configurable threshold', () => {
    const current = ['database', 'query'];
    const recent = ['database', 'schema', 'migration', 'index'];
    // 1 overlap out of 2 current = 0.5 ratio
    expect(detectTopicShiftByKeywords(current, recent, 0.3)).toBe(false); // 0.5 > 0.3
    expect(detectTopicShiftByKeywords(current, recent, 0.6)).toBe(true); // 0.5 < 0.6
  });
});

describe('ContextAnalyzer', () => {
  let analyzer: ContextAnalyzer;

  beforeEach(() => {
    resetContextAnalyzer();
    analyzer = new ContextAnalyzer();
  });

  it('suggests compact on frustration', async () => {
    const result = await analyzer.analyze('forget that, start fresh', {});
    expect(result.suggestion.type).toBe('suggest_compact');
    expect(result.detectedFrustration).toBe(true);
    expect(result.detectedTopicShift).toBe(false);
  });

  it('returns no suggestion for normal continuation', async () => {
    const result = await analyzer.analyze('What about the database indexes?', {
      currentState: { recentKeywords: ['database', 'table', 'query'] },
    });
    expect(result.suggestion.type).toBe('none');
    expect(result.detectedFrustration).toBe(false);
  });

  it('suggests clear on topic shift with enough history', async () => {
    const result = await analyzer.analyze('What is the weather like today?', {
      currentState: {
        recentKeywords: ['database', 'schema', 'migration', 'index', 'query'],
      },
    });
    expect(result.suggestion.type).toBe('suggest_clear');
    expect(result.detectedTopicShift).toBe(true);
  });

  it('does not suggest clear on topic shift without enough history', async () => {
    const result = await analyzer.analyze('What is the weather like today?', {
      currentState: {
        recentKeywords: ['database', 'schema'], // Only 2 keywords, need 5+
      },
    });
    expect(result.suggestion.type).toBe('none');
  });

  it('extracts keywords from the message', async () => {
    const result = await analyzer.analyze('Create a new database migration script', {});
    expect(result.extractedKeywords).toContain('create');
    expect(result.extractedKeywords).toContain('database');
    expect(result.extractedKeywords).toContain('migration');
    expect(result.extractedKeywords).toContain('script');
  });

  it('prioritizes frustration over topic shift', async () => {
    // Message that could trigger both
    const result = await analyzer.analyze("forget that, let's talk about weather", {
      currentState: {
        recentKeywords: ['database', 'schema', 'migration', 'index', 'query'],
      },
    });
    // Frustration is checked first and takes precedence
    expect(result.suggestion.type).toBe('suggest_compact');
    expect(result.detectedFrustration).toBe(true);
  });

  describe('with LLM classifier', () => {
    it('uses LLM to confirm topic shift', async () => {
      const mockClassifier = async () => 'topic_shift' as const;
      analyzer.setLLMClassifier(mockClassifier);

      const result = await analyzer.analyze('What is the weather forecast?', {
        currentState: {
          recentKeywords: ['database', 'schema'], // Not enough for keyword-only
        },
      });

      // With LLM confirming, should suggest clear
      expect(result.suggestion.type).toBe('suggest_clear');
    });

    it('does not suggest clear if LLM says continuation', async () => {
      const mockClassifier = async () => 'continuation' as const;
      analyzer.setLLMClassifier(mockClassifier);

      const result = await analyzer.analyze('What about performance optimization?', {
        currentState: {
          recentKeywords: ['database', 'query', 'slow'],
        },
      });

      expect(result.suggestion.type).toBe('none');
    });

    it('falls back to keyword-only if LLM fails', async () => {
      const mockClassifier = async () => {
        throw new Error('LLM unavailable');
      };
      analyzer.setLLMClassifier(mockClassifier);

      const result = await analyzer.analyze('What is the weather like?', {
        currentState: {
          recentKeywords: ['database', 'schema', 'migration', 'index', 'query'],
        },
      });

      // Should still detect topic shift via keywords
      expect(result.suggestion.type).toBe('suggest_clear');
    });
  });
});
