# Intelligent Context Control Implementation Plan

**Goal:** Add intelligent detection of topic shifts and user frustration to proactively suggest context management commands (`/clear`, `/compact`) without user initiation.

**Architecture:** Lightweight context analyzer service that runs before each message. Uses keyword-based heuristics (fast) with optional LLM confirmation for topic shifts (accurate). Leverages existing `contextService` for state storage. Appends inline suggestions to responses.

**Key decisions:**

- Hybrid detection: regex for frustration (zero latency), keyword+LLM for topic shifts
- Suggest action, don't auto-execute (user stays in control)
- Topic shift → suggest `/clear` (fresh start), Frustration → suggest `/compact` (preserve summary)
- Platforms: WhatsApp + Slack

---

## Tasks

### Task 1: Extend PersistentContext Schema

**Independent:** Yes
**Estimated scope:** Small (1 file)

**Files:**

- Modify: `packages/agents/src/services/contextService.ts` (lines 62-77)

**Steps:**

1. Add new fields to `PersistentContext.currentState`:

   ```typescript
   currentState?: {
     activeProject?: string;
     activeTask?: string;
     lastTopic?: string;
     workingDirectory?: string;
     openItems?: string[];
     // NEW FIELDS:
     recentKeywords?: string[];    // Keywords from last 3-5 messages
     topicStartedAt?: string;      // ISO timestamp when current topic started
     messagesSinceClear?: number;  // Count of messages since last clear/compact
     [key: string]: unknown;
   };
   ```

2. No database migration needed - JSON schema is flexible

**Verification:** `pnpm build packages/agents`
**Acceptance criteria:**

- [ ] TypeScript compiles without errors
- [ ] New fields are optional (backward compatible)

---

### Task 2: Create ContextAnalyzer Service

**Independent:** Yes
**Estimated scope:** Medium (1 new file, ~150 lines)

**Files:**

- Create: `packages/agents/src/services/contextAnalyzer.ts`

**Steps:**

1. Create the service with these components:

```typescript
// packages/agents/src/services/contextAnalyzer.ts

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
```

2. Run: `pnpm build packages/agents` → Expect: PASS

**Verification:** `pnpm build packages/agents`
**Acceptance criteria:**

- [ ] Service compiles without errors
- [ ] Frustration patterns detect common phrases
- [ ] Keyword extraction filters stopwords
- [ ] Topic shift uses configurable threshold

---

### Task 3: Add Unit Tests for ContextAnalyzer

**Independent:** No (depends on Task 2)
**Estimated scope:** Small (1 file, ~100 lines)

**Files:**

- Create: `packages/agents/src/services/__tests__/contextAnalyzer.test.ts`

**Steps:**

1. Create test file:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import {
     extractKeywords,
     detectFrustration,
     detectTopicShiftByKeywords,
     ContextAnalyzer,
   } from '../contextAnalyzer.js';

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
   });

   describe('detectFrustration', () => {
     it('detects "forget that"', () => {
       expect(detectFrustration('forget that, let me try again')).toBe(true);
     });

     it('detects "start over"', () => {
       expect(detectFrustration('let us start over')).toBe(true);
     });

     it('detects "you are confused"', () => {
       expect(detectFrustration("you're confused about what I meant")).toBe(true);
     });

     it('returns false for normal messages', () => {
       expect(detectFrustration('Can you help me with the database?')).toBe(false);
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
   });

   describe('ContextAnalyzer', () => {
     it('suggests compact on frustration', async () => {
       const analyzer = new ContextAnalyzer();
       const result = await analyzer.analyze('forget that, start fresh', {});
       expect(result.suggestion.type).toBe('suggest_compact');
       expect(result.detectedFrustration).toBe(true);
     });

     it('returns no suggestion for normal continuation', async () => {
       const analyzer = new ContextAnalyzer();
       const result = await analyzer.analyze('What about the database indexes?', {
         currentState: { recentKeywords: ['database', 'table', 'query'] },
       });
       expect(result.suggestion.type).toBe('none');
     });
   });
   ```

2. Run: `pnpm test packages/agents --grep contextAnalyzer`

**Verification:** `pnpm test packages/agents --grep contextAnalyzer`
**Acceptance criteria:**

- [ ] All tests pass
- [ ] Tests cover frustration detection
- [ ] Tests cover keyword extraction
- [ ] Tests cover topic shift detection

---

### Task 4: Export ContextAnalyzer from Package

**Independent:** No (depends on Task 2)
**Estimated scope:** Small (1 file)

**Files:**

- Modify: `packages/agents/src/index.ts`

**Steps:**

1. Add export:
   ```typescript
   // Add with other service exports
   export {
     ContextAnalyzer,
     getContextAnalyzer,
     extractKeywords,
     detectFrustration,
     detectTopicShiftByKeywords,
     type ContextSuggestion,
     type AnalysisResult,
   } from './services/contextAnalyzer.js';
   ```

**Verification:** `pnpm build packages/agents`
**Acceptance criteria:**

- [ ] Package exports compile
- [ ] Types are accessible from package

---

### Task 5: Integrate Analyzer into OpenCodeHandlerBase

**Independent:** No (depends on Tasks 1, 2, 4)
**Estimated scope:** Medium (1 file modification)

**Files:**

- Modify: `packages/agents/src/services/openCodeHandlerBase.ts`

**Steps:**

1. Read the file first to understand current structure
2. Import the analyzer:

   ```typescript
   import { getContextAnalyzer, type AnalysisResult } from './contextAnalyzer.js';
   import { getContextService } from './contextService.js';
   ```

3. In the message handling flow (before sending to OpenCode):
   - Get current context from contextService
   - Run analyzer.analyze(message, context)
   - Store analysis result for later

4. After receiving response from OpenCode:
   - If analysis.suggestion.type !== 'none', append hint to response
   - Update context.currentState.recentKeywords with new keywords
   - Increment messagesSinceClear

5. Suggestion formatting:

   ```typescript
   function formatSuggestion(
     suggestion: ContextSuggestion,
     platform: 'whatsapp' | 'slack'
   ): string {
     if (suggestion.type === 'none') return '';

     const emoji = platform === 'slack' ? ':information_source:' : 'ℹ️';
     const command = suggestion.type === 'suggest_clear' ? '/clear' : '/compact';

     return `\n\n${emoji} ${suggestion.reason}`;
   }
   ```

**Verification:**

- `pnpm build packages/agents`
- Manual test: Send messages to WhatsApp/Slack bot and verify suggestions appear

**Acceptance criteria:**

- [ ] Analyzer runs on each message
- [ ] Suggestions appended to responses when triggered
- [ ] Recent keywords updated in context
- [ ] No impact on normal message flow

---

### Task 6: Add LLM Classifier Integration (Optional Enhancement)

**Independent:** No (depends on Task 5)
**Estimated scope:** Small (1 file modification)

**Files:**

- Modify: `packages/agents/src/services/openCodeHandlerBase.ts`

**Steps:**

1. Create a lightweight LLM classifier using the existing OpenCode client:
   ```typescript
   async function classifyWithLLM(
     client: OpenCodeClient,
     message: string,
     contextSummary: string
   ): Promise<'topic_shift' | 'frustration' | 'continuation'> {
     const prompt = `You are a conversation classifier. Given the current message and recent context, classify the message.
   ```

Recent context: ${contextSummary}
Current message: ${message}

Respond with exactly one word:

- "topic_shift" if this is about a completely different subject
- "frustration" if the user seems confused or frustrated with the conversation
- "continuation" if this continues the current topic

Classification:`;

     const result = await client.sendMessage(sessionId, prompt, {
       model: 'anthropic/claude-haiku-4-5-20251001', // Fast, cheap model
     });

     const response = result.parts[0]?.text?.toLowerCase().trim() || 'continuation';
     if (response.includes('topic_shift')) return 'topic_shift';
     if (response.includes('frustration')) return 'frustration';
     return 'continuation';

}

````

2. Set the classifier on the analyzer during initialization:
```typescript
const analyzer = getContextAnalyzer();
analyzer.setLLMClassifier((msg, ctx) => classifyWithLLM(client, msg, ctx));
````

**Verification:** Manual test with distinct topic changes

**Acceptance criteria:**

- [ ] LLM classifier only called when keyword heuristic triggers
- [ ] Uses fast/cheap model (Haiku)
- [ ] Gracefully falls back if LLM call fails

---

## Dependency Graph

```
Task 1 (schema)     ───────────┐
                               │
Task 2 (analyzer) ─────────────┼───► Task 4 (export) ───► Task 5 (integration) ───► Task 6 (LLM)
                               │
Task 3 (tests) ◄───────────────┘
```

**Parallelizable:** Tasks 1, 2 (no dependencies on each other)
**Sequential:** Task 3 (after 2), Task 4 (after 2), Task 5 (after 1,2,4), Task 6 (after 5)

---

## Verification Summary

| Task | Verification Command                               | Expected Output                      |
| ---- | -------------------------------------------------- | ------------------------------------ |
| 1    | `pnpm build packages/agents`                       | Exit code 0                          |
| 2    | `pnpm build packages/agents`                       | Exit code 0                          |
| 3    | `pnpm test packages/agents --grep contextAnalyzer` | All tests pass                       |
| 4    | `pnpm build packages/agents`                       | Exit code 0                          |
| 5    | `pnpm build packages/agents` + manual test         | Build passes, suggestions appear     |
| 6    | Manual test                                        | LLM confirms topic shifts accurately |

---

## Future Enhancements (Out of Scope)

- Dashboard visualization of context suggestions over time
- User-configurable sensitivity thresholds
- Learning from user responses to suggestions (did they accept/ignore?)
- Auto-clear after long time gaps (configurable)
