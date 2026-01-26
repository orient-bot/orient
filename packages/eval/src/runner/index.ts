/**
 * Eval Runner
 *
 * Main orchestrator for running agent evaluations.
 */

import { createServiceLogger } from '@orientbot/core';
import { EvalServer, startEvalServer } from '../http-wrapper/server.js';
import { AgentInvokeRequest } from '../http-wrapper/types.js';
import { LLMJudge } from '../judge/index.js';
import { loadEvalCases, loadModelConfig, getCaseSummary, LoaderOptions } from './loader.js';
import { evaluateExpectations, summarizeAssertions } from './assertions.js';
import {
  EvalCase,
  EvalConfig,
  EvalResult,
  EvalSummary,
  RunOptions,
  RunMetadata,
  ExecutionTrace,
  JudgeScore,
} from '../types.js';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';

const logger = createServiceLogger('eval-runner');

/**
 * Eval Runner
 *
 * Orchestrates loading eval cases, executing them, and collecting results.
 */
export class EvalRunner {
  private config: EvalConfig;
  private server: EvalServer | null = null;
  private judge: LLMJudge | null = null;
  private results: EvalResult[] = [];

  constructor(config: EvalConfig) {
    this.config = config;
  }

  /**
   * Run all eval cases matching the options
   */
  async runAll(options: RunOptions = {}): Promise<EvalSummary> {
    const runId = uuidv4();
    const startTime = Date.now();

    logger.info('Starting eval run', { runId, options });

    try {
      // Start the eval server
      await this.startServer();

      // Initialize LLM judge if needed
      if (this.config.judgeConfig) {
        this.judge = new LLMJudge(this.config.judgeConfig);
      }

      // Load eval cases
      const loaderOptions: LoaderOptions = {
        type: options.type,
        agent: options.agent,
        pattern: options.pattern,
      };
      const loadResult = await loadEvalCases(loaderOptions);

      if (loadResult.errors.length > 0) {
        logger.warn(`Failed to load ${loadResult.errors.length} eval files`);
      }

      const evalCases = loadResult.cases;
      logger.info(`Loaded ${evalCases.length} eval cases`);

      // Load model configuration
      const modelConfig = await loadModelConfig();
      const models = options.models || modelConfig.default;

      // Execute each eval for each model
      this.results = [];
      for (const model of models) {
        logger.info(`Running evals with model: ${model}`);

        for (const evalCase of evalCases) {
          const result = await this.executeEval(evalCase, model);
          this.results.push(result);

          // Log progress
          const status = result.passed ? 'PASS' : 'FAIL';
          logger.info(`[${status}] ${evalCase.name} (${model})`, {
            passed: result.passed,
            assertions: summarizeAssertions(result.assertions),
          });
        }
      }

      // Generate summary
      const summary = this.generateSummary(runId, startTime, models, evalCases);

      logger.info('Eval run completed', {
        runId,
        total: summary.summary.total,
        passed: summary.summary.passed,
        failed: summary.summary.failed,
        passRate: summary.summary.passRate,
      });

      return summary;
    } finally {
      await this.stopServer();
    }
  }

  /**
   * Execute a single eval case
   */
  async executeEval(evalCase: EvalCase, model: string): Promise<EvalResult> {
    const startTime = Date.now();

    try {
      // Build invoke request
      const request: AgentInvokeRequest = {
        agentId: evalCase.agent,
        prompt: evalCase.input.prompt,
        context: evalCase.context,
        model,
        mocks: evalCase.mocks,
      };

      // Invoke agent
      const trace = await this.invokeAgent(request);

      // Evaluate assertions
      const assertions = evaluateExpectations(evalCase.expect, trace);

      // Run LLM-as-judge if configured
      let judgeScore: JudgeScore | undefined;
      if (evalCase.scoring?.llm_judge?.enabled && this.judge) {
        judgeScore = await this.judge.evaluate(
          evalCase.scoring.llm_judge,
          evalCase.input.prompt,
          trace.responseText,
          trace.toolCalls
        );
      }

      // Determine overall pass/fail
      const assertionsPassed = assertions.every((a) => a.passed);
      const judgePassed =
        !judgeScore || judgeScore.overall >= (evalCase.scoring?.llm_judge?.threshold || 0);
      const passed = assertionsPassed && judgePassed;

      return {
        evalName: evalCase.name,
        sourceFile: evalCase.sourceFile,
        model,
        agent: evalCase.agent,
        type: evalCase.type,
        status: passed ? 'passed' : 'failed',
        passed,
        assertions,
        judgeScore,
        executionTrace: trace,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Eval execution failed: ${evalCase.name}`, { error: errorMessage });

      return {
        evalName: evalCase.name,
        sourceFile: evalCase.sourceFile,
        model,
        agent: evalCase.agent,
        type: evalCase.type,
        status: 'error',
        passed: false,
        assertions: [],
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Invoke an agent through the HTTP wrapper
   */
  private async invokeAgent(request: AgentInvokeRequest): Promise<ExecutionTrace> {
    if (!this.server) {
      throw new Error('Eval server not running');
    }

    const port = this.server.getPort();
    if (!port) {
      throw new Error('Eval server port not available');
    }

    const response = await fetch(`http://localhost:${port}/api/eval/agent/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Agent invoke failed: ${error}`);
    }

    const result = (await response.json()) as { trace: ExecutionTrace };
    return result.trace;
  }

  /**
   * Start the eval server
   */
  private async startServer(): Promise<void> {
    if (this.server) return;

    this.server = await startEvalServer(this.config.serverConfig);
    logger.info('Eval server started', { port: this.server.getPort() });
  }

  /**
   * Stop the eval server
   */
  private async stopServer(): Promise<void> {
    if (this.server) {
      await this.server.stop();
      this.server = null;
    }
  }

  /**
   * Generate summary from results
   */
  private generateSummary(
    runId: string,
    startTime: number,
    models: string[],
    evalCases: EvalCase[]
  ): EvalSummary {
    const metadata: RunMetadata = {
      runId,
      timestamp: new Date().toISOString(),
      runner: 'cli',
      durationMs: Date.now() - startTime,
    };

    // Try to get git info
    try {
      metadata.gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim().slice(0, 7);
      metadata.gitBranch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
    } catch {
      // Git info not available
    }

    // Calculate summaries
    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;
    const total = this.results.length;

    // By model
    const byModel: Record<
      string,
      { total: number; passed: number; failed: number; passRate: number }
    > = {};
    for (const model of models) {
      const modelResults = this.results.filter((r) => r.model === model);
      const modelPassed = modelResults.filter((r) => r.passed).length;
      byModel[model] = {
        total: modelResults.length,
        passed: modelPassed,
        failed: modelResults.length - modelPassed,
        passRate: modelResults.length > 0 ? modelPassed / modelResults.length : 0,
      };
    }

    // By type
    const byType: Record<
      string,
      { total: number; passed: number; failed: number; passRate: number }
    > = {};
    const types = [...new Set(evalCases.map((c) => c.type))];
    for (const type of types) {
      const typeResults = this.results.filter((r) => r.type === type);
      const typePassed = typeResults.filter((r) => r.passed).length;
      byType[type] = {
        total: typeResults.length,
        passed: typePassed,
        failed: typeResults.length - typePassed,
        passRate: typeResults.length > 0 ? typePassed / typeResults.length : 0,
      };
    }

    // By agent
    const byAgent: Record<
      string,
      { total: number; passed: number; failed: number; passRate: number }
    > = {};
    const agents = [...new Set(evalCases.map((c) => c.agent))];
    for (const agent of agents) {
      const agentResults = this.results.filter((r) => r.agent === agent);
      const agentPassed = agentResults.filter((r) => r.passed).length;
      byAgent[agent] = {
        total: agentResults.length,
        passed: agentPassed,
        failed: agentResults.length - agentPassed,
        passRate: agentResults.length > 0 ? agentPassed / agentResults.length : 0,
      };
    }

    return {
      metadata,
      config: {
        models,
        evalTypes: types,
        agents,
      },
      summary: {
        total,
        passed,
        failed,
        skipped: 0,
        passRate: total > 0 ? passed / total : 0,
        byModel,
        byType,
        byAgent,
      },
      results: this.results,
    };
  }

  /**
   * Get the current results
   */
  getResults(): EvalResult[] {
    return this.results;
  }
}

/**
 * Create an eval runner with default configuration
 */
export function createEvalRunner(config?: Partial<EvalConfig>): EvalRunner {
  const fullConfig: EvalConfig = {
    serverConfig: {
      port: 0,
      debug: false,
      ...config?.serverConfig,
    },
    judgeConfig: config?.judgeConfig,
  };

  return new EvalRunner(fullConfig);
}

// Re-export types and utilities
export { loadEvalCases, loadModelConfig, getCaseSummary } from './loader.js';
export { evaluateExpectations, summarizeAssertions } from './assertions.js';
