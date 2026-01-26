#!/usr/bin/env npx tsx
/**
 * E2E Test Orchestrator
 *
 * Runs comprehensive E2E tests across all Orient modes:
 * - Installer mode (PM2)
 * - Dev mode (tsx hot-reload)
 * - Test mode (Docker)
 *
 * Usage:
 *   npx tsx tests/e2e/run-e2e-tests.ts [options]
 *
 * Options:
 *   --mode=installer|dev|test  Run tests for specific mode (default: current)
 *   --all-modes                Run tests for all modes sequentially
 *   --features=all|secrets|scheduler|webhooks|slack
 *   --browser                  Enable browser automation tests
 *   --verbose                  Show detailed output
 *   --cleanup                  Clean up test data after running
 */

import { spawn, execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// Configuration
const MODES = {
  installer: {
    name: 'Installer (PM2)',
    dashboardUrl: 'http://localhost:4098',
    startCommand: 'orient start',
    stopCommand: 'orient stop',
    checkCommand: 'pm2 jlist | grep orient',
  },
  dev: {
    name: 'Development',
    dashboardUrl: 'http://localhost:4098',
    startCommand: './run.sh dev',
    stopCommand: './run.sh stop',
    checkCommand: 'curl -s http://localhost:4098/health',
  },
  test: {
    name: 'Test (Docker)',
    dashboardUrl: 'http://localhost:13098',
    startCommand: './run.sh test',
    stopCommand: './run.sh test stop',
    checkCommand: 'curl -s http://localhost:13098/health',
  },
};

const FEATURES = ['secrets', 'scheduler', 'webhooks', 'slack'];

interface TestResult {
  mode: string;
  feature: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  errors: string[];
}

// Parse command line arguments
function parseArgs(): {
  modes: string[];
  features: string[];
  browser: boolean;
  verbose: boolean;
  cleanup: boolean;
} {
  const args = process.argv.slice(2);
  const result = {
    modes: [] as string[],
    features: [] as string[],
    browser: false,
    verbose: false,
    cleanup: false,
  };

  for (const arg of args) {
    if (arg === '--all-modes') {
      result.modes = Object.keys(MODES);
    } else if (arg.startsWith('--mode=')) {
      result.modes = [arg.split('=')[1]];
    } else if (arg.startsWith('--features=')) {
      const value = arg.split('=')[1];
      result.features = value === 'all' ? FEATURES : value.split(',');
    } else if (arg === '--browser') {
      result.browser = true;
    } else if (arg === '--verbose') {
      result.verbose = true;
    } else if (arg === '--cleanup') {
      result.cleanup = true;
    }
  }

  // Defaults
  if (result.modes.length === 0) {
    result.modes = ['installer']; // Default mode
  }
  if (result.features.length === 0) {
    result.features = FEATURES; // All features
  }

  return result;
}

// Check if a service is running
async function isServiceRunning(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

// Wait for service to be ready
async function waitForService(url: string, timeout = 60000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await isServiceRunning(url)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

// Run vitest for specific test files
async function runTests(
  testPattern: string,
  env: Record<string, string>
): Promise<{ passed: number; failed: number; skipped: number; errors: string[] }> {
  return new Promise((resolve) => {
    const errors: string[] = [];
    let output = '';

    const proc = spawn(
      'npx',
      ['vitest', 'run', '--reporter=json', '--reporter=verbose', testPattern],
      {
        env: { ...process.env, ...env },
        cwd: process.cwd(),
        shell: true,
      }
    );

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      if (text.includes('Error') || text.includes('FAIL')) {
        errors.push(text);
      }
    });

    proc.on('close', (code) => {
      // Parse JSON output if available
      try {
        const jsonMatch = output.match(/\{[\s\S]*"numPassedTests"[\s\S]*\}/);
        if (jsonMatch) {
          const results = JSON.parse(jsonMatch[0]);
          resolve({
            passed: results.numPassedTests || 0,
            failed: results.numFailedTests || 0,
            skipped: results.numPendingTests || 0,
            errors,
          });
          return;
        }
      } catch {
        // Fall back to regex parsing
      }

      // Fallback parsing
      const passedMatch = output.match(/(\d+) passed/);
      const failedMatch = output.match(/(\d+) failed/);
      const skippedMatch = output.match(/(\d+) skipped/);

      resolve({
        passed: passedMatch ? parseInt(passedMatch[1]) : 0,
        failed: failedMatch ? parseInt(failedMatch[1]) : code !== 0 ? 1 : 0,
        skipped: skippedMatch ? parseInt(skippedMatch[1]) : 0,
        errors,
      });
    });
  });
}

// Run API health checks
async function runHealthChecks(
  baseUrl: string
): Promise<{ endpoint: string; status: string; ok: boolean }[]> {
  const endpoints = ['/health', '/api/status', '/api/setup/status', '/api/feature-flags'];

  const results = [];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        signal: AbortSignal.timeout(5000),
      });
      results.push({
        endpoint,
        status: `${response.status} ${response.statusText}`,
        ok: response.ok || response.status === 401, // 401 is acceptable for protected endpoints
      });
    } catch (e) {
      results.push({
        endpoint,
        status: `Error: ${e}`,
        ok: false,
      });
    }
  }
  return results;
}

// Main test runner
async function main() {
  const args = parseArgs();
  const results: TestResult[] = [];
  const startTime = Date.now();

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Orient E2E Test Suite                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Modes: ${args.modes.join(', ')}`);
  console.log(`Features: ${args.features.join(', ')}`);
  console.log(`Browser tests: ${args.browser ? 'enabled' : 'disabled'}`);
  console.log('');

  for (const mode of args.modes) {
    const modeConfig = MODES[mode as keyof typeof MODES];
    if (!modeConfig) {
      console.error(`Unknown mode: ${mode}`);
      continue;
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`Testing: ${modeConfig.name}`);
    console.log(`${'═'.repeat(60)}\n`);

    // Check if service is running
    const isRunning = await isServiceRunning(modeConfig.dashboardUrl);
    if (!isRunning) {
      console.log(`⚠ Service not running at ${modeConfig.dashboardUrl}`);
      console.log(`  Start with: ${modeConfig.startCommand}`);
      console.log('  Skipping tests for this mode.\n');
      continue;
    }

    console.log(`✓ Service running at ${modeConfig.dashboardUrl}\n`);

    // Run health checks
    console.log('Running health checks...');
    const healthChecks = await runHealthChecks(modeConfig.dashboardUrl);
    for (const check of healthChecks) {
      const icon = check.ok ? '✓' : '✗';
      console.log(`  ${icon} ${check.endpoint}: ${check.status}`);
    }
    console.log('');

    // Run feature tests
    for (const feature of args.features) {
      const testFile = `tests/e2e/features/${feature}.e2e.test.ts`;
      if (!existsSync(testFile)) {
        console.log(`⚠ Test file not found: ${testFile}`);
        continue;
      }

      console.log(`Testing ${feature}...`);
      const featureStart = Date.now();

      const testResult = await runTests(testFile, {
        RUN_FEATURE_TESTS: 'true',
        DASHBOARD_URL: modeConfig.dashboardUrl,
        ORIENT_MODE: mode,
        ...(feature === 'slack' && { RUN_SLACK_TESTS: 'true' }),
      });

      const duration = Date.now() - featureStart;
      results.push({
        mode,
        feature,
        ...testResult,
        duration,
      });

      const icon = testResult.failed > 0 ? '✗' : testResult.passed > 0 ? '✓' : '○';
      console.log(
        `  ${icon} ${feature}: ${testResult.passed} passed, ${testResult.failed} failed, ${testResult.skipped} skipped (${duration}ms)`
      );

      if (testResult.errors.length > 0 && args.verbose) {
        for (const error of testResult.errors) {
          console.log(`    Error: ${error}`);
        }
      }
    }

    // Run browser tests if enabled
    if (args.browser) {
      console.log('\nRunning browser tests...');
      const browserResult = await runTests('tests/e2e/browser/*.e2e.test.ts', {
        RUN_BROWSER_TESTS: 'true',
        DASHBOARD_URL: modeConfig.dashboardUrl,
        ORIENT_MODE: mode,
      });

      results.push({
        mode,
        feature: 'browser',
        ...browserResult,
        duration: 0,
      });

      const icon = browserResult.failed > 0 ? '✗' : browserResult.passed > 0 ? '✓' : '○';
      console.log(
        `  ${icon} browser: ${browserResult.passed} passed, ${browserResult.failed} failed, ${browserResult.skipped} skipped`
      );
    }
  }

  // Summary
  const totalDuration = Date.now() - startTime;
  const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);

  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Total: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped`);
  console.log(`Duration: ${(totalDuration / 1000).toFixed(1)}s`);

  if (totalFailed > 0) {
    console.log('\nFailed tests:');
    for (const result of results.filter((r) => r.failed > 0)) {
      console.log(`  - ${result.mode}/${result.feature}: ${result.failed} failed`);
      for (const error of result.errors.slice(0, 3)) {
        console.log(`    ${error.slice(0, 100)}`);
      }
    }
  }

  // Save results
  const resultsDir = join(process.cwd(), 'test-results');
  if (!existsSync(resultsDir)) {
    mkdirSync(resultsDir, { recursive: true });
  }

  const resultsFile = join(resultsDir, `e2e-results-${Date.now()}.json`);
  writeFileSync(
    resultsFile,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        duration: totalDuration,
        modes: args.modes,
        features: args.features,
        results,
        summary: { passed: totalPassed, failed: totalFailed, skipped: totalSkipped },
      },
      null,
      2
    )
  );
  console.log(`\nResults saved to: ${resultsFile}`);

  // Exit with error if any tests failed
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('E2E test suite failed:', error);
  process.exit(1);
});
