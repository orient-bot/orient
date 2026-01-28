/**
 * Vitest Adapter for Evals
 *
 * Generates Vitest test suites from YAML eval files.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EvalRunner, createEvalRunner } from './runner/index.js';
import { loadEvalCasesSync } from './runner/loader-sync.js';
import { EvalCase, EvalResult } from './types.js';
import { summarizeAssertions } from './runner/assertions.js';

/**
 * Options for creating eval test suites
 */
export interface EvalTestOptions {
  /** Base directory for evals */
  baseDir?: string;

  /** Filter by eval type */
  type?: string;

  /** Filter by agent */
  agent?: string;

  /** Model to use */
  model?: string;

  /** Whether to use LLM-as-judge */
  enableJudge?: boolean;
}

/**
 * Create Vitest test suites from eval files
 *
 * Usage:
 * ```ts
 * // src/eval/all.eval.test.ts
 * import { createEvalTestSuites } from './vitest-adapter.js';
 * createEvalTestSuites();
 * ```
 */
export function createEvalTestSuites(options: EvalTestOptions = {}): void {
  // Load eval cases synchronously during test collection
  const evalCases = loadEvalCasesSync({
    baseDir: options.baseDir,
    type: options.type as never,
    agent: options.agent,
  });

  if (evalCases.length === 0) {
    describe('Agent Evaluations', () => {
      it('no eval cases found', () => {
        console.warn('No eval cases found in', options.baseDir || 'default evals directory');
      });
    });
    return;
  }

  describe('Agent Evaluations', () => {
    let runner: EvalRunner;

    beforeAll(async () => {
      // Create and start runner
      runner = createEvalRunner({
        serverConfig: { port: 0 },
        judgeConfig: options.enableJudge
          ? { model: options.model || 'openai/gpt-4o-mini' }
          : undefined,
      });
      await runner.start();
    });

    afterAll(async () => {
      // Stop the runner
      if (runner) {
        await runner.stop();
      }
    });

    // Group by type
    const types = [...new Set(evalCases.map((c) => c.type))];

    for (const type of types) {
      describe(`[${type}]`, () => {
        const typeCases = evalCases.filter((c) => c.type === type);

        for (const evalCase of typeCases) {
          it(evalCase.description || evalCase.name, async () => {
            const result = await runner.executeEval(
              evalCase,
              options.model || 'openai/gpt-4o-mini'
            );

            // Check all assertions passed
            const summary = summarizeAssertions(result.assertions);
            expect(summary.failed).toBe(0);

            // Check LLM-as-judge score if applicable
            if (result.judgeScore && evalCase.scoring?.llm_judge?.threshold) {
              expect(result.judgeScore.overall).toBeGreaterThanOrEqual(
                evalCase.scoring.llm_judge.threshold
              );
            }

            // Overall pass
            expect(result.passed).toBe(true);
          });
        }
      });
    }
  });
}

/**
 * Run a single eval case as a test
 */
export async function runEvalAsTest(
  evalCase: EvalCase,
  model: string = 'openai/gpt-4o-mini'
): Promise<EvalResult> {
  const runner = createEvalRunner({
    serverConfig: { port: 0 },
    judgeConfig: evalCase.scoring?.llm_judge?.enabled ? { model } : undefined,
  });

  return runner.executeEval(evalCase, model);
}

/**
 * Assert that an eval result passed
 */
export function assertEvalPassed(result: EvalResult): void {
  const summary = summarizeAssertions(result.assertions);

  if (!result.passed) {
    const failedAssertions = result.assertions
      .filter((a) => !a.passed)
      .map((a) => `  - ${a.type}: ${a.message || JSON.stringify(a.expected)}`)
      .join('\n');

    throw new Error(
      `Eval "${result.evalName}" failed:\n` +
        `  Assertions: ${summary.passed}/${summary.total} passed\n` +
        `  Failed:\n${failedAssertions}` +
        (result.error ? `\n  Error: ${result.error}` : '')
    );
  }
}

/**
 * Create a test for a specific eval case
 */
export function testEvalCase(evalCase: EvalCase, model?: string) {
  return async () => {
    const result = await runEvalAsTest(evalCase, model);
    assertEvalPassed(result);
  };
}
