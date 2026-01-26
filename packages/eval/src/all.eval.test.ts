/**
 * All Evals Test Suite
 *
 * Runs all eval cases as Vitest tests.
 *
 * Requirements:
 * 1. ANTHROPIC_API_KEY must be set
 * 2. Development server must be running (`./run.sh dev start`)
 *    - OpenCode server at localhost:4099
 *
 * Usage: ANTHROPIC_API_KEY=xxx npm run test:eval
 */

import * as path from 'path';
import { describe, it } from 'vitest';
import { createEvalTestSuites } from './vitest-adapter.js';

const evalsEnabled = Boolean(process.env.ANTHROPIC_API_KEY || process.env.EVALS_ENABLED === 'true');

// Find project root (2 levels up from packages/eval)
const projectRoot = path.resolve(__dirname, '../../..');
const evalsDir = path.join(projectRoot, 'evals');

if (!evalsEnabled) {
  describe.skip('Agent Evaluations', () => {
    it('skips evals without API credentials', () => {
      // Skipped unless ANTHROPIC_API_KEY or EVALS_ENABLED=true is set.
    });
  });
} else {
  // Create test suites from all YAML eval files
  createEvalTestSuites({
    // Use OpenAI model (configured in OpenCode) - Anthropic requires separate API key setup
    model: process.env.OPENCODE_MODEL || 'openai/gpt-4o-mini',
    // Disable LLM-as-judge for faster tests (enable in full runs)
    enableJudge: false,
    // Point to the root evals directory
    baseDir: evalsDir,
  });
}
