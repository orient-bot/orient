#!/usr/bin/env node
/**
 * Eval Report Generator
 *
 * Generates comprehensive model comparison reports from eval results.
 * Compares accuracy, cost, latency, and value across all models.
 *
 * Usage:
 *   npx tsx src/report.ts                          # Use latest results
 *   npx tsx src/report.ts --input eval-results/     # Specify results dir
 *   npx tsx src/report.ts --run                     # Run evals first, then report
 *   npx tsx src/report.ts --run --matrix accuracy_matrix  # Run full matrix
 */

import 'dotenv/config';

import { program } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createEvalRunner, loadModelConfig } from './runner/index.js';
import { EvalSummary, EvalResult, EvalType } from './types.js';

// ============================================================================
// Model Pricing (per 1M tokens, USD) - January 2026
// ============================================================================

interface ModelPricing {
  input: number; // USD per 1M input tokens
  output: number; // USD per 1M output tokens
  label: string; // Display name
  provider: string;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic
  'anthropic/claude-sonnet-4-20250514': {
    input: 3.0,
    output: 15.0,
    label: 'Claude Sonnet 4',
    provider: 'Anthropic',
  },
  'anthropic/claude-haiku-4-5-20251001': {
    input: 0.8,
    output: 4.0,
    label: 'Claude Haiku 4.5',
    provider: 'Anthropic',
  },
  // OpenAI Direct
  'openai/gpt-4o': {
    input: 2.5,
    output: 10.0,
    label: 'GPT-4o',
    provider: 'OpenAI',
  },
  'openai/gpt-4o-mini': {
    input: 0.15,
    output: 0.6,
    label: 'GPT-4o Mini',
    provider: 'OpenAI',
  },
  // OpenAI via Zen
  'openai/gpt-5.2-codex': {
    input: 5.0,
    output: 20.0,
    label: 'GPT-5.2 Codex',
    provider: 'OpenAI',
  },
  'openai/gpt-5.1-codex': {
    input: 5.0,
    output: 20.0,
    label: 'GPT-5.1 Codex',
    provider: 'OpenAI',
  },
};

// ============================================================================
// Report Data Structures
// ============================================================================

interface ModelReport {
  model: string;
  label: string;
  provider: string;
  // Accuracy
  total: number;
  passed: number;
  failed: number;
  errors: number;
  passRate: number;
  // By category
  byType: Record<string, { total: number; passed: number; passRate: number }>;
  // Cost
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUSD: number;
  avgCostPerEval: number;
  // Latency
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  // Value score (accuracy / cost)
  valueScore: number;
  // Individual results for drill-down
  results: EvalResult[];
}

// ============================================================================
// ANSI Colors
// ============================================================================

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
};

// ============================================================================
// Analysis Functions
// ============================================================================

function analyzeModel(model: string, results: EvalResult[]): ModelReport {
  const pricing = MODEL_PRICING[model] || {
    input: 0,
    output: 0,
    label: model.split('/').pop() || model,
    provider: 'Unknown',
  };

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const errors = results.filter((r) => r.status === 'error').length;

  // Token usage
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const r of results) {
    if (r.executionTrace) {
      totalInputTokens += r.executionTrace.tokens.input;
      totalOutputTokens += r.executionTrace.tokens.output;
    }
  }

  // Cost calculation
  const inputCost = (totalInputTokens / 1_000_000) * pricing.input;
  const outputCost = (totalOutputTokens / 1_000_000) * pricing.output;
  const totalCostUSD = inputCost + outputCost;

  // Latency
  const latencies = results.map((r) => r.durationMs).sort((a, b) => a - b);
  const avgLatencyMs =
    latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const p50LatencyMs = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
  const p95LatencyMs = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;

  // By type
  const byType: Record<string, { total: number; passed: number; passRate: number }> = {};
  const types = [...new Set(results.map((r) => r.type))];
  for (const type of types) {
    const typeResults = results.filter((r) => r.type === type);
    const typePassed = typeResults.filter((r) => r.passed).length;
    byType[type] = {
      total: typeResults.length,
      passed: typePassed,
      passRate: typeResults.length > 0 ? typePassed / typeResults.length : 0,
    };
  }

  // Value score: passRate per dollar (higher = better value)
  const passRate = results.length > 0 ? passed / results.length : 0;
  const valueScore = totalCostUSD > 0 ? passRate / totalCostUSD : passRate > 0 ? Infinity : 0;

  return {
    model,
    label: pricing.label,
    provider: pricing.provider,
    total: results.length,
    passed,
    failed,
    errors,
    passRate,
    byType,
    totalInputTokens,
    totalOutputTokens,
    totalCostUSD,
    avgCostPerEval: results.length > 0 ? totalCostUSD / results.length : 0,
    avgLatencyMs,
    p50LatencyMs,
    p95LatencyMs,
    valueScore,
    results,
  };
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

// ============================================================================
// CLI Report Formatting
// ============================================================================

function colorPassRate(rate: number): string {
  const pct = (rate * 100).toFixed(1) + '%';
  if (rate >= 0.9) return c.green + pct + c.reset;
  if (rate >= 0.7) return c.yellow + pct + c.reset;
  return c.red + pct + c.reset;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${(usd * 100).toFixed(2)}c`;
  return `$${usd.toFixed(4)}`;
}

function padRight(str: string, len: number): string {
  // Strip ANSI for length calculation
  // eslint-disable-next-line no-control-regex
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = Math.max(0, len - stripped.length);
  return str + ' '.repeat(pad);
}

function padLeft(str: string, len: number): string {
  // eslint-disable-next-line no-control-regex
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = Math.max(0, len - stripped.length);
  return ' '.repeat(pad) + str;
}

function printCLIReport(reports: ModelReport[], summary: EvalSummary): void {
  const divider = '─'.repeat(90);
  const doubleDivider = '═'.repeat(90);

  console.log('\n' + c.bold + c.cyan + doubleDivider + c.reset);
  console.log(c.bold + c.cyan + '  ORIENT EVAL REPORT - Model Comparison' + c.reset);
  console.log(c.bold + c.cyan + doubleDivider + c.reset);

  // Metadata
  console.log(c.dim + `  Run: ${summary.metadata.runId}` + c.reset);
  console.log(c.dim + `  Date: ${summary.metadata.timestamp}` + c.reset);
  if (summary.metadata.gitBranch) {
    console.log(
      c.dim + `  Git: ${summary.metadata.gitBranch}@${summary.metadata.gitCommit}` + c.reset
    );
  }
  console.log(c.dim + `  Duration: ${(summary.metadata.durationMs / 1000).toFixed(1)}s` + c.reset);
  console.log(c.dim + `  Evals per model: ${reports[0]?.total || 0}` + c.reset);

  // ── 1. ACCURACY OVERVIEW ──
  console.log('\n' + c.bold + '  1. ACCURACY OVERVIEW' + c.reset);
  console.log('  ' + divider);

  // Header
  console.log(
    '  ' +
      padRight(c.bold + 'Model' + c.reset, 28) +
      padRight(c.bold + 'Provider' + c.reset, 18) +
      padLeft(c.bold + 'Pass' + c.reset, 8) +
      padLeft(c.bold + 'Fail' + c.reset, 8) +
      padLeft(c.bold + 'Rate' + c.reset, 12) +
      padLeft(c.bold + 'Rank' + c.reset, 8)
  );
  console.log('  ' + divider);

  // Sort by pass rate descending
  const byAccuracy = [...reports].sort((a, b) => b.passRate - a.passRate);
  for (let i = 0; i < byAccuracy.length; i++) {
    const r = byAccuracy[i];
    const rank = i === 0 ? c.green + '#1' + c.reset : `#${i + 1}`;
    console.log(
      '  ' +
        padRight(r.label, 20) +
        padRight(c.dim + r.provider + c.reset, 18) +
        padLeft(c.green + String(r.passed) + c.reset, 8) +
        padLeft(r.failed > 0 ? c.red + String(r.failed) + c.reset : c.dim + '0' + c.reset, 8) +
        padLeft(colorPassRate(r.passRate), 12) +
        padLeft(rank, 8)
    );
  }

  // ── 2. ACCURACY BY CATEGORY ──
  console.log('\n' + c.bold + '  2. ACCURACY BY CATEGORY' + c.reset);
  console.log('  ' + divider);

  const allTypes = [...new Set(reports.flatMap((r) => Object.keys(r.byType)))].sort();

  // Header
  let header = '  ' + padRight(c.bold + 'Model' + c.reset, 22);
  for (const type of allTypes) {
    header += padLeft(c.bold + type.replace('_', ' ') + c.reset, 20);
  }
  console.log(header);
  console.log('  ' + divider);

  for (const r of byAccuracy) {
    let line = '  ' + padRight(r.label, 14);
    for (const type of allTypes) {
      const t = r.byType[type];
      if (t) {
        const cell = `${t.passed}/${t.total} ${(t.passRate * 100).toFixed(0)}%`;
        line += padLeft(
          colorPassRate(t.passRate).replace((t.passRate * 100).toFixed(1) + '%', cell),
          20
        );
      } else {
        line += padLeft(c.dim + '—' + c.reset, 20);
      }
    }
    console.log(line);
  }

  // ── 3. COST ANALYSIS ──
  console.log('\n' + c.bold + '  3. COST ANALYSIS' + c.reset);
  console.log('  ' + divider);

  console.log(
    '  ' +
      padRight(c.bold + 'Model' + c.reset, 22) +
      padLeft(c.bold + 'Input Tok' + c.reset, 14) +
      padLeft(c.bold + 'Output Tok' + c.reset, 14) +
      padLeft(c.bold + 'Total Cost' + c.reset, 14) +
      padLeft(c.bold + 'Avg/Eval' + c.reset, 14) +
      padLeft(c.bold + 'Rank' + c.reset, 8)
  );
  console.log('  ' + divider);

  const byCost = [...reports].sort((a, b) => a.totalCostUSD - b.totalCostUSD);
  for (let i = 0; i < byCost.length; i++) {
    const r = byCost[i];
    const rank = i === 0 ? c.green + '#1' + c.reset : `#${i + 1}`;
    const inputTok =
      r.totalInputTokens > 1000
        ? `${(r.totalInputTokens / 1000).toFixed(1)}K`
        : String(r.totalInputTokens);
    const outputTok =
      r.totalOutputTokens > 1000
        ? `${(r.totalOutputTokens / 1000).toFixed(1)}K`
        : String(r.totalOutputTokens);

    console.log(
      '  ' +
        padRight(r.label, 14) +
        padLeft(inputTok, 14) +
        padLeft(outputTok, 14) +
        padLeft(formatCost(r.totalCostUSD), 14) +
        padLeft(formatCost(r.avgCostPerEval), 14) +
        padLeft(rank, 8)
    );
  }

  // ── 4. LATENCY ANALYSIS ──
  console.log('\n' + c.bold + '  4. LATENCY ANALYSIS' + c.reset);
  console.log('  ' + divider);

  console.log(
    '  ' +
      padRight(c.bold + 'Model' + c.reset, 22) +
      padLeft(c.bold + 'Avg' + c.reset, 14) +
      padLeft(c.bold + 'P50' + c.reset, 14) +
      padLeft(c.bold + 'P95' + c.reset, 14) +
      padLeft(c.bold + 'Rank' + c.reset, 8)
  );
  console.log('  ' + divider);

  const byLatency = [...reports].sort((a, b) => a.avgLatencyMs - b.avgLatencyMs);
  for (let i = 0; i < byLatency.length; i++) {
    const r = byLatency[i];
    const rank = i === 0 ? c.green + '#1' + c.reset : `#${i + 1}`;
    const fmt = (ms: number) => (ms > 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`);

    console.log(
      '  ' +
        padRight(r.label, 14) +
        padLeft(fmt(r.avgLatencyMs), 14) +
        padLeft(fmt(r.p50LatencyMs), 14) +
        padLeft(fmt(r.p95LatencyMs), 14) +
        padLeft(rank, 8)
    );
  }

  // ── 5. VALUE SCORE (Accuracy per Dollar) ──
  console.log('\n' + c.bold + '  5. VALUE SCORE (Accuracy / Cost)' + c.reset);
  console.log('  ' + divider);

  console.log(
    '  ' +
      padRight(c.bold + 'Model' + c.reset, 22) +
      padLeft(c.bold + 'Accuracy' + c.reset, 12) +
      padLeft(c.bold + 'Cost' + c.reset, 14) +
      padLeft(c.bold + 'Value*' + c.reset, 14) +
      padLeft(c.bold + 'Rank' + c.reset, 8)
  );
  console.log('  ' + divider);

  const byValue = [...reports].sort((a, b) => b.valueScore - a.valueScore);
  for (let i = 0; i < byValue.length; i++) {
    const r = byValue[i];
    const rank = i === 0 ? c.green + c.bold + '#1 BEST' + c.reset : `#${i + 1}`;
    const valueStr = r.valueScore === Infinity ? 'FREE' : r.valueScore.toFixed(1);

    console.log(
      '  ' +
        padRight(r.label, 14) +
        padLeft(colorPassRate(r.passRate), 12) +
        padLeft(formatCost(r.totalCostUSD), 14) +
        padLeft(valueStr, 14) +
        padLeft(rank, 8)
    );
  }
  console.log(c.dim + '  * Value = Pass Rate / Total Cost (higher is better)' + c.reset);

  // ── 6. FAILED TESTS BREAKDOWN ──
  const allFailed = reports.flatMap((r) =>
    r.results.filter((res) => !res.passed).map((res) => ({ ...res, modelLabel: r.label }))
  );

  if (allFailed.length > 0) {
    console.log('\n' + c.bold + '  6. FAILED TESTS DETAIL' + c.reset);
    console.log('  ' + divider);

    // Group by eval name to see which evals fail across models
    const failsByEval: Record<string, string[]> = {};
    for (const f of allFailed) {
      if (!failsByEval[f.evalName]) failsByEval[f.evalName] = [];
      failsByEval[f.evalName].push((f as any).modelLabel);
    }

    // Sort by how many models failed (most failures first)
    const sortedFails = Object.entries(failsByEval).sort((a, b) => b[1].length - a[1].length);

    for (const [evalName, models] of sortedFails) {
      const severity =
        models.length === reports.length
          ? c.red + 'ALL'
          : c.yellow + `${models.length}/${reports.length}`;
      console.log(`  ${c.red}✗${c.reset} ${evalName} — failed on ${severity}${c.reset} models`);
      console.log(`    ${c.dim}Models: ${models.join(', ')}${c.reset}`);

      // Show first failure details
      const firstFail = allFailed.find((f) => f.evalName === evalName);
      if (firstFail?.error) {
        console.log(`    ${c.dim}Error: ${firstFail.error}${c.reset}`);
      } else if (firstFail) {
        const failedAssertions = firstFail.assertions.filter((a) => !a.passed);
        for (const a of failedAssertions.slice(0, 2)) {
          console.log(`    ${c.dim}${a.type}: ${a.message || 'failed'}${c.reset}`);
        }
      }
    }
  }

  // ── 7. RECOMMENDATION ──
  console.log('\n' + c.bold + c.cyan + '  RECOMMENDATION' + c.reset);
  console.log('  ' + doubleDivider);

  if (reports.length > 0 && reports.some((r) => r.total > 0)) {
    const bestAccuracy = byAccuracy[0];
    const bestValue = byValue[0];
    const cheapest = byCost[0];

    console.log(
      `  ${c.green}Best Accuracy:${c.reset}  ${bestAccuracy.label} (${(bestAccuracy.passRate * 100).toFixed(1)}%)`
    );
    console.log(
      `  ${c.green}Best Value:${c.reset}     ${bestValue.label} (${(bestValue.passRate * 100).toFixed(1)}% accuracy, ${formatCost(bestValue.totalCostUSD)} cost)`
    );
    console.log(
      `  ${c.green}Cheapest:${c.reset}       ${cheapest.label} (${formatCost(cheapest.totalCostUSD)} total, ${(cheapest.passRate * 100).toFixed(1)}% accuracy)`
    );

    // Optimal recommendation
    // Find models with >= 80% accuracy, then pick cheapest
    const goodEnough = byAccuracy.filter((r) => r.passRate >= 0.8);
    if (goodEnough.length > 0) {
      const optimal = goodEnough.sort((a, b) => a.totalCostUSD - b.totalCostUSD)[0];
      console.log(
        `\n  ${c.bold}${c.cyan}Optimal Pick:${c.reset}   ${c.bold}${optimal.label}${c.reset}`
      );
      console.log(
        `                  ${(optimal.passRate * 100).toFixed(1)}% accuracy at ${formatCost(optimal.totalCostUSD)} — best balance of cost and quality`
      );
    } else {
      console.log(
        `\n  ${c.yellow}No model reached 80% accuracy threshold. Consider improving prompts or eval criteria.${c.reset}`
      );
    }
  } else {
    console.log(
      `  ${c.yellow}No results to analyze. Run evals first with: npx tsx src/report.ts --run${c.reset}`
    );
  }

  console.log('\n' + c.bold + c.cyan + doubleDivider + c.reset + '\n');
}

// ============================================================================
// Markdown Report Generation
// ============================================================================

function generateMarkdownReport(reports: ModelReport[], summary: EvalSummary): string {
  const lines: string[] = [];

  lines.push('# Orient Eval Report - Model Comparison');
  lines.push('');
  lines.push(`> Generated: ${summary.metadata.timestamp}`);
  if (summary.metadata.gitBranch) {
    lines.push(`> Git: \`${summary.metadata.gitBranch}@${summary.metadata.gitCommit}\``);
  }
  lines.push(`> Duration: ${(summary.metadata.durationMs / 1000).toFixed(1)}s`);
  lines.push(`> Evals per model: ${reports[0]?.total || 0}`);
  lines.push('');

  // Accuracy Overview
  lines.push('## 1. Accuracy Overview');
  lines.push('');
  lines.push('| Rank | Model | Provider | Pass | Fail | Errors | Pass Rate |');
  lines.push('|------|-------|----------|------|------|--------|-----------|');

  const byAccuracy = [...reports].sort((a, b) => b.passRate - a.passRate);
  for (let i = 0; i < byAccuracy.length; i++) {
    const r = byAccuracy[i];
    const emoji =
      i === 0
        ? ' :1st_place_medal:'
        : i === 1
          ? ' :2nd_place_medal:'
          : i === 2
            ? ' :3rd_place_medal:'
            : '';
    lines.push(
      `| #${i + 1}${emoji} | **${r.label}** | ${r.provider} | ${r.passed} | ${r.failed} | ${r.errors} | ${(r.passRate * 100).toFixed(1)}% |`
    );
  }
  lines.push('');

  // Accuracy by Category
  lines.push('## 2. Accuracy by Category');
  lines.push('');
  const allTypes = [...new Set(reports.flatMap((r) => Object.keys(r.byType)))].sort();
  let header = '| Model |';
  let sep = '|-------|';
  for (const type of allTypes) {
    header += ` ${type} |`;
    sep += '---------|';
  }
  lines.push(header);
  lines.push(sep);

  for (const r of byAccuracy) {
    let row = `| **${r.label}** |`;
    for (const type of allTypes) {
      const t = r.byType[type];
      if (t) {
        row += ` ${t.passed}/${t.total} (${(t.passRate * 100).toFixed(0)}%) |`;
      } else {
        row += ' — |';
      }
    }
    lines.push(row);
  }
  lines.push('');

  // Cost Analysis
  lines.push('## 3. Cost Analysis');
  lines.push('');
  lines.push('| Rank | Model | Input Tokens | Output Tokens | Total Cost | Avg/Eval |');
  lines.push('|------|-------|-------------|---------------|------------|----------|');

  const byCost = [...reports].sort((a, b) => a.totalCostUSD - b.totalCostUSD);
  for (let i = 0; i < byCost.length; i++) {
    const r = byCost[i];
    const inputTok =
      r.totalInputTokens > 1000
        ? `${(r.totalInputTokens / 1000).toFixed(1)}K`
        : String(r.totalInputTokens);
    const outputTok =
      r.totalOutputTokens > 1000
        ? `${(r.totalOutputTokens / 1000).toFixed(1)}K`
        : String(r.totalOutputTokens);
    lines.push(
      `| #${i + 1} | **${r.label}** | ${inputTok} | ${outputTok} | $${r.totalCostUSD.toFixed(4)} | $${r.avgCostPerEval.toFixed(4)} |`
    );
  }
  lines.push('');

  // Latency
  lines.push('## 4. Latency Analysis');
  lines.push('');
  lines.push('| Rank | Model | Average | P50 | P95 |');
  lines.push('|------|-------|---------|-----|-----|');

  const byLatency = [...reports].sort((a, b) => a.avgLatencyMs - b.avgLatencyMs);
  for (let i = 0; i < byLatency.length; i++) {
    const r = byLatency[i];
    const fmt = (ms: number) => (ms > 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`);
    lines.push(
      `| #${i + 1} | **${r.label}** | ${fmt(r.avgLatencyMs)} | ${fmt(r.p50LatencyMs)} | ${fmt(r.p95LatencyMs)} |`
    );
  }
  lines.push('');

  // Value Score
  lines.push('## 5. Value Score (Accuracy / Cost)');
  lines.push('');
  lines.push('*Higher is better — measures accuracy per dollar spent.*');
  lines.push('');
  lines.push('| Rank | Model | Accuracy | Cost | Value Score |');
  lines.push('|------|-------|----------|------|-------------|');

  const byValue = [...reports].sort((a, b) => b.valueScore - a.valueScore);
  for (let i = 0; i < byValue.length; i++) {
    const r = byValue[i];
    const valueStr = r.valueScore === Infinity ? '∞' : r.valueScore.toFixed(1);
    lines.push(
      `| #${i + 1} | **${r.label}** | ${(r.passRate * 100).toFixed(1)}% | $${r.totalCostUSD.toFixed(4)} | ${valueStr} |`
    );
  }
  lines.push('');

  // Failed Tests
  const allFailed = reports.flatMap((r) =>
    r.results.filter((res) => !res.passed).map((res) => ({ ...res, modelLabel: r.label }))
  );

  if (allFailed.length > 0) {
    lines.push('## 6. Failed Tests');
    lines.push('');
    lines.push('| Eval | Failed On | Error/Reason |');
    lines.push('|------|-----------|--------------|');

    const failsByEval: Record<string, { models: string[]; reason: string }> = {};
    for (const f of allFailed) {
      if (!failsByEval[f.evalName]) {
        const reason =
          f.error ||
          f.assertions
            .filter((a) => !a.passed)
            .map((a) => `${a.type}: ${a.message || 'failed'}`)
            .slice(0, 2)
            .join('; ') ||
          'unknown';
        failsByEval[f.evalName] = { models: [], reason };
      }
      failsByEval[f.evalName].models.push((f as any).modelLabel);
    }

    const sortedFails = Object.entries(failsByEval).sort(
      (a, b) => b[1].models.length - a[1].models.length
    );
    for (const [evalName, { models, reason }] of sortedFails) {
      const severity =
        models.length === reports.length ? '**ALL**' : `${models.length}/${reports.length}`;
      lines.push(`| \`${evalName}\` | ${severity} (${models.join(', ')}) | ${reason} |`);
    }
    lines.push('');
  }

  // Recommendation
  lines.push('## Recommendation');
  lines.push('');

  if (reports.length > 0 && reports.some((r) => r.total > 0)) {
    const bestAccuracy = byAccuracy[0];
    const bestValue = byValue[0];
    const cheapest = byCost[0];

    lines.push(`| Criteria | Model | Details |`);
    lines.push(`|----------|-------|---------|`);
    lines.push(
      `| **Best Accuracy** | ${bestAccuracy.label} | ${(bestAccuracy.passRate * 100).toFixed(1)}% pass rate |`
    );
    lines.push(
      `| **Best Value** | ${bestValue.label} | ${(bestValue.passRate * 100).toFixed(1)}% accuracy, $${bestValue.totalCostUSD.toFixed(4)} cost |`
    );
    lines.push(
      `| **Cheapest** | ${cheapest.label} | $${cheapest.totalCostUSD.toFixed(4)} total, ${(cheapest.passRate * 100).toFixed(1)}% accuracy |`
    );

    const goodEnough = byAccuracy.filter((r) => r.passRate >= 0.8);
    if (goodEnough.length > 0) {
      const optimal = goodEnough.sort((a, b) => a.totalCostUSD - b.totalCostUSD)[0];
      lines.push('');
      lines.push(`### Optimal Pick: **${optimal.label}**`);
      lines.push(
        `${(optimal.passRate * 100).toFixed(1)}% accuracy at $${optimal.totalCostUSD.toFixed(4)} — best balance of cost and quality among models exceeding 80% accuracy.`
      );
    }
  }

  lines.push('');
  lines.push('---');
  lines.push(`*Report generated by Orient Eval Framework*`);

  return lines.join('\n');
}

// ============================================================================
// Main CLI
// ============================================================================

async function loadResults(inputDir: string): Promise<EvalSummary | null> {
  const latestPath = path.join(inputDir, 'eval-latest.json');
  try {
    const data = await fs.readFile(latestPath, 'utf-8');
    return JSON.parse(data) as EvalSummary;
  } catch {
    // Try to find any eval JSON
    try {
      const files = await fs.readdir(inputDir);
      const evalFiles = files
        .filter((f) => f.startsWith('eval-') && f.endsWith('.json'))
        .sort()
        .reverse();
      if (evalFiles.length > 0) {
        const data = await fs.readFile(path.join(inputDir, evalFiles[0]), 'utf-8');
        return JSON.parse(data) as EvalSummary;
      }
    } catch {
      // No results directory
    }
  }
  return null;
}

async function main(): Promise<void> {
  program
    .name('eval-report')
    .description('Generate comprehensive model comparison report from eval results')
    .version('1.0.0')
    .option('--input <dir>', 'Input directory with eval results', 'eval-results')
    .option('--output <file>', 'Output markdown report path', 'eval-results/report.md')
    .option('--run', 'Run evals before generating report')
    .option('--matrix <name>', 'Model matrix (default, accuracy_matrix, fast)', 'accuracy_matrix')
    .option('--model <model>', 'Specific model to test')
    .option('--type <type>', 'Filter by eval type')
    .option('--no-judge', 'Disable LLM-as-judge scoring')
    .option('--verbose', 'Verbose output')
    .parse();

  const options = program.opts();

  let summary: EvalSummary | null = null;

  if (options.run) {
    console.log(c.cyan + 'Running evals...' + c.reset);

    const modelConfig = await loadModelConfig();
    let models: string[];

    if (options.model) {
      models = [options.model];
    } else {
      models = modelConfig[options.matrix] || modelConfig.accuracy_matrix || modelConfig.default;
    }

    console.log(`Models: ${models.join(', ')}`);

    const runner = createEvalRunner({
      serverConfig: {
        port: 0,
        debug: options.verbose,
      },
      judgeConfig: options.judge === false ? undefined : { model: 'claude-sonnet-4-20250514' },
    });

    summary = await runner.runAll({
      models,
      type: options.type as EvalType | undefined,
    });

    // Save results
    const outputDir = options.input;
    await fs.mkdir(outputDir, { recursive: true });
    const filename = `eval-${summary.metadata.timestamp.replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(outputDir, filename);
    await fs.writeFile(filepath, JSON.stringify(summary, null, 2));
    await fs.writeFile(path.join(outputDir, 'eval-latest.json'), JSON.stringify(summary, null, 2));
    console.log(`Results saved to: ${filepath}`);
  } else {
    summary = await loadResults(options.input);
  }

  if (!summary) {
    console.error(c.red + 'No eval results found.' + c.reset);
    console.log('Run with --run flag to execute evals first:');
    console.log('  npx tsx src/report.ts --run');
    console.log('  npx tsx src/report.ts --run --matrix accuracy_matrix');
    process.exit(1);
  }

  // Build model reports
  const models = [...new Set(summary.results.map((r) => r.model))];
  const reports = models.map((model) => {
    const modelResults = summary!.results.filter((r) => r.model === model);
    return analyzeModel(model, modelResults);
  });

  // Print CLI report
  printCLIReport(reports, summary);

  // Generate and save markdown report
  const markdown = generateMarkdownReport(reports, summary);
  const reportPath = options.output;
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, markdown);
  console.log(`Markdown report saved to: ${c.cyan}${reportPath}${c.reset}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
