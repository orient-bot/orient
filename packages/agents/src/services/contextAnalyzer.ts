/**
 * Context Analyzer Service
 *
 * Provides intelligent detection of topic shifts and user frustration
 * to proactively suggest context management commands (/clear, /compact).
 *
 * Architecture:
 * - Hybrid detection: regex for frustration (zero latency), keyword+LLM for topic shifts
 * - Suggest action, don't auto-execute (user stays in control)
 * - Topic shift → suggest /clear (fresh start)
 * - Frustration → suggest /compact (preserve summary)
 */

import { createServiceLogger } from '@orient-bot/core';
import type { PersistentContext } from './contextService.js';

const logger = createServiceLogger('context-analyzer');

// ============================================
// TYPES
// ============================================

export type ContextSuggestion =
  | { type: 'none' }
  | { type: 'suggest_clear'; reason: string }
  | { type: 'suggest_compact'; reason: string };

export interface AnalysisResult {
  suggestion: ContextSuggestion;
  extractedKeywords: string[];
  detectedFrustration: boolean;
  detectedTopicShift: boolean;
}

// ============================================
// FRUSTRATION PATTERNS
// ============================================

const FRUSTRATION_PATTERNS: RegExp[] = [
  /\bforget\s+(that|it|everything|all)\b/i,
  /\bstart\s+(over|fresh|again|new)\b/i,
  /\byou('re|\s+are)\s+(confused|wrong|not\s+listening|lost)\b/i,
  /\bno[,.]?\s*(I\s+said|I\s+meant|not\s+that|wrong)\b/i,
  /\bclear\s+(your|the)\s+(memory|context|history)\b/i,
  /\breset\s+(everything|this|the\s+conversation)\b/i,
  /\bwhat\s+are\s+you\s+talking\s+about\b/i,
  /\bthat('s|\s+is)\s+not\s+what\s+I\s+(asked|meant|said)\b/i,
];

// ============================================
// STOPWORDS
// ============================================

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'can',
  'this',
  'that',
  'these',
  'those',
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
  'me',
  'him',
  'her',
  'us',
  'them',
  'my',
  'your',
  'his',
  'its',
  'our',
  'their',
  'what',
  'which',
  'who',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'also',
  'now',
  'here',
  'there',
  'then',
  'about',
  'into',
  'over',
  'after',
  'before',
  'between',
  'under',
  'again',
  'further',
  'once',
  'please',
  'thanks',
  'thank',
  'hey',
  'hi',
  'hello',
  'ok',
  'okay',
  'want',
  'need',
  'like',
  'get',
  'got',
  'new',
  'let',
  'know',
  'think',
  'make',
  'see',
  'use',
]);

// ============================================
// KEYWORD EXTRACTION
// ============================================

export function extractKeywords(text: string): string[] {
  // Tokenize: split on non-alphanumeric, lowercase
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));

  // Deduplicate
  return [...new Set(tokens)];
}

// ============================================
// FRUSTRATION DETECTION
// ============================================

export function detectFrustration(text: string): boolean {
  return FRUSTRATION_PATTERNS.some((pattern) => pattern.test(text));
}

// ============================================
// TOPIC SHIFT DETECTION (KEYWORD-BASED)
// ============================================

export function detectTopicShiftByKeywords(
  currentKeywords: string[],
  recentKeywords: string[],
  threshold: number = 0.2
): boolean {
  if (recentKeywords.length === 0 || currentKeywords.length === 0) {
    return false;
  }

  const recentSet = new Set(recentKeywords);
  const overlap = currentKeywords.filter((k) => recentSet.has(k)).length;
  const overlapRatio = overlap / Math.max(currentKeywords.length, 1);

  logger.debug('Topic shift keyword analysis', {
    currentKeywords: currentKeywords.slice(0, 10),
    recentKeywords: recentKeywords.slice(0, 10),
    overlap,
    overlapRatio,
    threshold,
  });

  return overlapRatio < threshold;
}

// ============================================
// MAIN ANALYZER
// ============================================

export class ContextAnalyzer {
  private llmClassifier?: (
    message: string,
    context: string
  ) => Promise<'topic_shift' | 'frustration' | 'continuation'>;

  /**
   * Set an optional LLM classifier for more accurate topic shift detection
   */
  setLLMClassifier(
    classifier: (
      message: string,
      context: string
    ) => Promise<'topic_shift' | 'frustration' | 'continuation'>
  ): void {
    this.llmClassifier = classifier;
  }

  /**
   * Analyze a message for context management suggestions
   */
  async analyze(message: string, context: PersistentContext): Promise<AnalysisResult> {
    const extractedKeywords = extractKeywords(message);
    const recentKeywords = context.currentState?.recentKeywords || [];

    // 1. Check for frustration signals (fast, regex-based)
    const detectedFrustration = detectFrustration(message);
    if (detectedFrustration) {
      logger.info('Frustration detected', { messagePreview: message.slice(0, 50) });
      return {
        suggestion: {
          type: 'suggest_compact',
          reason: 'I sense some confusion. Would you like me to compress the context?',
        },
        extractedKeywords,
        detectedFrustration: true,
        detectedTopicShift: false,
      };
    }

    // 2. Check for topic shift (keyword heuristic)
    const keywordShift = detectTopicShiftByKeywords(extractedKeywords, recentKeywords);

    if (keywordShift) {
      // If LLM classifier is available, confirm the shift
      if (this.llmClassifier && recentKeywords.length > 0) {
        try {
          const contextSummary = `Recent topics: ${recentKeywords.slice(0, 10).join(', ')}`;
          const classification = await this.llmClassifier(message, contextSummary);

          if (classification === 'topic_shift') {
            return {
              suggestion: {
                type: 'suggest_clear',
                reason: 'This looks like a new topic. Reply /clear to start fresh.',
              },
              extractedKeywords,
              detectedFrustration: false,
              detectedTopicShift: true,
            };
          }
        } catch (error) {
          logger.warn('LLM classification failed, using keyword-only detection', { error });
          // Fall back to keyword-only detection when LLM fails
          if (recentKeywords.length >= 5) {
            return {
              suggestion: {
                type: 'suggest_clear',
                reason: 'This seems like a new topic. Reply /clear to start fresh.',
              },
              extractedKeywords,
              detectedFrustration: false,
              detectedTopicShift: true,
            };
          }
        }
      } else if (recentKeywords.length >= 5) {
        // No LLM, but we have enough history to be confident
        return {
          suggestion: {
            type: 'suggest_clear',
            reason: 'This seems like a new topic. Reply /clear to start fresh.',
          },
          extractedKeywords,
          detectedFrustration: false,
          detectedTopicShift: true,
        };
      }
    }

    // 3. No suggestion needed
    return {
      suggestion: { type: 'none' },
      extractedKeywords,
      detectedFrustration: false,
      detectedTopicShift: false,
    };
  }
}

// ============================================
// SINGLETON
// ============================================

let analyzerInstance: ContextAnalyzer | null = null;

export function getContextAnalyzer(): ContextAnalyzer {
  if (!analyzerInstance) {
    analyzerInstance = new ContextAnalyzer();
  }
  return analyzerInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetContextAnalyzer(): void {
  analyzerInstance = null;
}
