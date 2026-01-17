#!/usr/bin/env node
/**
 * Eval CLI
 *
 * Command-line interface for running agent evaluations.
 */

// Load environment variables FIRST, before any other imports
import 'dotenv/config';

import { program } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createEvalRunner, loadModelConfig } from './runner/index.js';
import { EvalSummary, EvalType } from './types.js';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/**
 * Format a pass rate as a colored percentage
 */
function formatPassRate(rate: number): string {
  const percent = (rate * 100).toFixed(1) + '%';
  if (rate >= 0.9) return colors.green + percent + colors.reset;
  if (rate >= 0.7) return colors.yellow + percent + colors.reset;
  return colors.red + percent + colors.reset;
}

/**
 * Print a summary table
 */
function printSummary(summary: EvalSummary): void {
  console.log('\n' + colors.bright + '=== Eval Results ===' + colors.reset);
  console.log(`Run ID: ${summary.metadata.runId}`);
  console.log(`Duration: ${(summary.metadata.durationMs / 1000).toFixed(2)}s`);

  if (summary.metadata.gitCommit) {
    console.log(`Git: ${summary.metadata.gitBranch || 'unknown'}@${summary.metadata.gitCommit}`);
  }

  console.log('\n' + colors.bright + 'Overall:' + colors.reset);
  console.log(`  Total: ${summary.summary.total}`);
  console.log(`  Passed: ${colors.green}${summary.summary.passed}${colors.reset}`);
  console.log(`  Failed: ${colors.red}${summary.summary.failed}${colors.reset}`);
  console.log(`  Pass Rate: ${formatPassRate(summary.summary.passRate)}`);

  // By model
  if (Object.keys(summary.summary.byModel).length > 1) {
    console.log('\n' + colors.bright + 'By Model:' + colors.reset);
    for (const [model, stats] of Object.entries(summary.summary.byModel)) {
      const shortModel = model.split('/').pop() || model;
      console.log(
        `  ${shortModel}: ${stats.passed}/${stats.total} ${formatPassRate(stats.passRate)}`
      );
    }
  }

  // By type
  console.log('\n' + colors.bright + 'By Type:' + colors.reset);
  for (const [type, stats] of Object.entries(summary.summary.byType)) {
    console.log(`  ${type}: ${stats.passed}/${stats.total} ${formatPassRate(stats.passRate)}`);
  }

  // By agent
  console.log('\n' + colors.bright + 'By Agent:' + colors.reset);
  for (const [agent, stats] of Object.entries(summary.summary.byAgent)) {
    console.log(`  ${agent}: ${stats.passed}/${stats.total} ${formatPassRate(stats.passRate)}`);
  }

  // Failed tests
  const failed = summary.results.filter((r) => !r.passed);
  if (failed.length > 0) {
    console.log('\n' + colors.bright + colors.red + 'Failed Tests:' + colors.reset);
    for (const result of failed) {
      console.log(`  ${colors.red}✗${colors.reset} ${result.evalName} (${result.model})`);
      if (result.error) {
        console.log(`    ${colors.gray}Error: ${result.error}${colors.reset}`);
      } else {
        const failedAssertions = result.assertions.filter((a) => !a.passed);
        for (const assertion of failedAssertions.slice(0, 3)) {
          console.log(
            `    ${colors.gray}${assertion.type}: ${assertion.message || 'failed'}${colors.reset}`
          );
        }
        if (failedAssertions.length > 3) {
          console.log(
            `    ${colors.gray}...and ${failedAssertions.length - 3} more${colors.reset}`
          );
        }
      }
    }
  }

  console.log('');
}

/**
 * Save results to a JSON file
 */
async function saveResults(summary: EvalSummary, outputDir: string): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });

  const filename = `eval-${summary.metadata.timestamp.replace(/[:.]/g, '-')}.json`;
  const filepath = path.join(outputDir, filename);

  await fs.writeFile(filepath, JSON.stringify(summary, null, 2));

  // Update latest symlink
  const latestPath = path.join(outputDir, 'eval-latest.json');
  try {
    await fs.unlink(latestPath);
  } catch {
    // Ignore if doesn't exist
  }
  await fs.writeFile(latestPath, JSON.stringify(summary, null, 2));

  return filepath;
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  program
    .name('eval')
    .description('Run agent evaluations')
    .version('1.0.0')
    .option('--matrix <name>', 'Model matrix to use (default, full_matrix, fast)', 'default')
    .option('--model <model>', 'Specific model to test (overrides matrix)')
    .option(
      '--type <type>',
      'Filter by eval type (tool_selection, response_quality, skill_invocation, multi_step_workflow)'
    )
    .option('--agent <agent>', 'Filter by agent ID')
    .option('--pattern <pattern>', 'Filter by eval name pattern')
    .option('--output <path>', 'Output directory for results', 'eval-results')
    .option('--ci', 'CI mode - exit with code 1 if any evals fail')
    .option('--verbose', 'Verbose output')
    .option('--no-judge', 'Disable LLM-as-judge scoring')
    .parse();

  const options = program.opts();

  console.log(colors.cyan + 'Starting eval run...' + colors.reset);

  // Load model configuration
  const modelConfig = await loadModelConfig();
  let models: string[];

  if (options.model) {
    models = [options.model];
  } else {
    models = modelConfig[options.matrix] || modelConfig.default;
  }

  console.log(`Models: ${models.join(', ')}`);

  if (options.type) {
    console.log(`Type filter: ${options.type}`);
  }
  if (options.agent) {
    console.log(`Agent filter: ${options.agent}`);
  }

  // Create and run the eval runner
  const runner = createEvalRunner({
    serverConfig: {
      port: 0,
      debug: options.verbose,
    },
    judgeConfig: options.judge === false ? undefined : { model: 'claude-sonnet-4-20250514' },
  });

  try {
    const summary = await runner.runAll({
      models,
      type: options.type as EvalType | undefined,
      agent: options.agent,
      pattern: options.pattern,
    });

    // Print summary
    printSummary(summary);

    // Save results
    const outputPath = await saveResults(summary, options.output);
    console.log(`Results saved to: ${colors.cyan}${outputPath}${colors.reset}`);

    // CI mode: exit with error if failures
    if (options.ci && summary.summary.failed > 0) {
      console.log(colors.red + '\nCI mode: Exiting with error due to failed tests' + colors.reset);
      process.exit(1);
    }
  } catch (error) {
    console.error(colors.red + 'Eval run failed:' + colors.reset, error);
    process.exit(1);
  }
}

// Run main
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
