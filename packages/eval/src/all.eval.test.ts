/**
 * All Evals Test Suite
 *
 * Runs all eval cases as Vitest tests.
 * Use: npm run test:eval
 */

import { describe, it } from 'vitest';
import { createEvalTestSuites } from './vitest-adapter.js';

const evalsEnabled = Boolean(process.env.ANTHROPIC_API_KEY || process.env.EVALS_ENABLED === 'true');

if (!evalsEnabled) {
  describe.skip('Agent Evaluations', () => {
    it('skips evals without API credentials', () => {
      // Skipped unless ANTHROPIC_API_KEY or EVALS_ENABLED=true is set.
    });
  });
} else {
  // Create test suites from all YAML eval files
  createEvalTestSuites({
    // Use fast model for CI
    model: 'anthropic/claude-haiku-3-5-20241022',
    // Disable LLM-as-judge for faster tests (enable in full runs)
    enableJudge: false,
  });
}
