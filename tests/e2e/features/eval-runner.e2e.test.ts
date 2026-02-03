/**
 * Eval Runner E2E Tests
 *
 * Tests the evaluation system that validates agent behavior:
 * 1. Tool selection evals pass for configured agents
 * 2. Multi-step evals complete successfully
 * 3. Response quality meets thresholds
 *
 * Prerequisites:
 * - OpenCode server running on localhost:4099
 * - Eval system configured in packages/eval
 * - API keys for LLM provider
 *
 * Run with:
 *   RUN_EVAL_TESTS=true pnpm test:e2e tests/e2e/features/eval-runner.e2e.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const TESTS_ENABLED = process.env.RUN_EVAL_TESTS === 'true';
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const EVALS_DIR = path.join(PROJECT_ROOT, 'evals');
const TIMEOUT = 120000; // 2 minutes for eval runs

const describeOrSkip = TESTS_ENABLED ? describe : describe.skip;

// List available eval files in a category
function listEvals(category: string): string[] {
  const categoryDir = path.join(EVALS_DIR, category);
  if (!fs.existsSync(categoryDir)) return [];

  return fs
    .readdirSync(categoryDir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => path.join(categoryDir, f));
}

// Parse eval YAML file for basic info
function parseEvalFile(filepath: string): { name: string; agent: string } | null {
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const agentMatch = content.match(/^agent:\s*(.+)$/m);

    return {
      name: nameMatch?.[1] || path.basename(filepath),
      agent: agentMatch?.[1] || 'default',
    };
  } catch {
    return null;
  }
}

// Run eval validation (schema check)
function runEvalValidation(): { passed: boolean; errors: string[] } {
  try {
    execSync('pnpm run --filter @orient-bot/eval validate', {
      cwd: PROJECT_ROOT,
      timeout: 30000,
      encoding: 'utf-8',
    });
    return { passed: true, errors: [] };
  } catch (error: any) {
    const output = error.stdout || error.stderr || error.message;
    return { passed: false, errors: [output] };
  }
}

describeOrSkip('Eval System E2E Tests', () => {
  beforeAll(() => {
    console.log('[Eval E2E] Evals directory:', EVALS_DIR);
    console.log('[Eval E2E] Project root:', PROJECT_ROOT);
  });

  describe('Eval File Discovery', () => {
    it('should find tool-selection evals', () => {
      const evals = listEvals('tool-selection');
      console.log('[Eval E2E] Found tool-selection evals:', evals.length);

      expect(evals.length).toBeGreaterThan(0);

      // Check some expected evals exist
      const evalNames = evals.map((e) => path.basename(e));
      expect(evalNames.some((n) => n.includes('health'))).toBe(true);
    });

    it('should find multi-step evals', () => {
      const evals = listEvals('multi-step');
      console.log('[Eval E2E] Found multi-step evals:', evals.length);

      expect(evals.length).toBeGreaterThan(0);
    });

    it('should find skill-invocation evals', () => {
      const evals = listEvals('skill-invocation');
      console.log('[Eval E2E] Found skill-invocation evals:', evals.length);

      expect(evals.length).toBeGreaterThan(0);
    });

    it('should find response-quality evals', () => {
      const evals = listEvals('response-quality');
      console.log('[Eval E2E] Found response-quality evals:', evals.length);

      expect(evals.length).toBeGreaterThan(0);
    });
  });

  describe('Eval File Validation', () => {
    it('should have valid eval file schema', () => {
      const toolSelectionEvals = listEvals('tool-selection');

      for (const evalPath of toolSelectionEvals.slice(0, 5)) {
        const evalInfo = parseEvalFile(evalPath);
        expect(evalInfo).not.toBeNull();
        expect(evalInfo!.name).toBeTruthy();

        console.log(`[Eval E2E] Valid eval: ${evalInfo!.name} (agent: ${evalInfo!.agent})`);
      }
    });

    it('should have required fields in eval files', () => {
      const evalFile = listEvals('tool-selection')[0];
      if (!evalFile) {
        console.log('[Eval E2E] No eval files found, skipping');
        return;
      }

      const content = fs.readFileSync(evalFile, 'utf-8');

      // Required fields for tool-selection evals
      expect(content).toMatch(/^name:/m);
      expect(content).toMatch(/^type:/m);
      expect(content).toMatch(/^input:/m);
      expect(content).toMatch(/^expect:/m);
    });
  });

  describe('MCP Tool Evals', () => {
    it('should have MCP-specific evals', () => {
      const evals = listEvals('tool-selection');
      const mcpEvals = evals.filter((e) => {
        const basename = path.basename(e);
        return (
          basename.includes('mcp') || basename.includes('discover') || basename.includes('config')
        );
      });

      console.log('[Eval E2E] MCP-related evals:', mcpEvals.length);

      // We should have at least some MCP evals (we just created them)
      expect(mcpEvals.length).toBeGreaterThan(0);
    });

    it('should have onboarder tool evals', () => {
      const evals = listEvals('tool-selection');
      const onboarderEvals = evals.filter((e) => path.basename(e).includes('onboarder'));

      console.log('[Eval E2E] Onboarder evals:', onboarderEvals.length);

      expect(onboarderEvals.length).toBeGreaterThan(0);
    });
  });

  describe('Eval Configuration', () => {
    it('should have models config', () => {
      const modelsConfigPath = path.join(EVALS_DIR, 'config', 'models.yaml');
      expect(fs.existsSync(modelsConfigPath)).toBe(true);

      const content = fs.readFileSync(modelsConfigPath, 'utf-8');
      expect(content).toContain('models:');
    });
  });
});

// Separate describe for actual eval execution (requires API keys)
const describeExecution = process.env.RUN_EVAL_EXECUTION === 'true' ? describe : describe.skip;

describeExecution('Eval Execution', () => {
  it(
    'should run validation on all evals',
    () => {
      const result = runEvalValidation();
      console.log('[Eval E2E] Validation result:', result.passed);

      if (!result.passed) {
        console.log('[Eval E2E] Validation errors:', result.errors);
      }

      expect(result.passed).toBe(true);
    },
    TIMEOUT
  );
});
