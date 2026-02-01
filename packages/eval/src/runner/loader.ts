/**
 * Eval Case Loader
 *
 * Loads and parses YAML eval case files.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import yaml from 'js-yaml';
import { glob } from 'glob';
import { createServiceLogger } from '@orient-bot/core';
import { EvalCase, EvalType } from '../types.js';

const logger = createServiceLogger('eval-loader');

/**
 * Options for loading eval cases
 */
export interface LoaderOptions {
  /** Base directory to search for evals */
  baseDir?: string;

  /** Filter by eval type */
  type?: EvalType;

  /** Filter by agent */
  agent?: string;

  /** Filter by name pattern (glob) */
  pattern?: string;

  /** Include disabled evals */
  includeDisabled?: boolean;
}

/**
 * Result of loading eval cases
 */
export interface LoadResult {
  /** Successfully loaded cases */
  cases: EvalCase[];

  /** Files that failed to load */
  errors: Array<{
    file: string;
    error: string;
  }>;

  /** Total files scanned */
  totalFiles: number;
}

/**
 * Default base directory for evals
 */
const DEFAULT_EVALS_DIR = 'evals';

/**
 * Directories to skip when scanning
 */
const SKIP_DIRS = ['schemas', 'config', 'fixtures', 'node_modules'];

/**
 * Load all eval cases from the evals directory
 */
export async function loadEvalCases(options: LoaderOptions = {}): Promise<LoadResult> {
  const baseDir = options.baseDir || path.join(process.cwd(), DEFAULT_EVALS_DIR);
  const result: LoadResult = {
    cases: [],
    errors: [],
    totalFiles: 0,
  };

  // Find all YAML files
  const pattern = options.pattern || '**/*.yaml';
  const files = await glob(pattern, {
    cwd: baseDir,
    ignore: SKIP_DIRS.map((dir) => `${dir}/**`),
    absolute: true,
  });

  result.totalFiles = files.length;
  logger.debug(`Found ${files.length} eval files`, { baseDir });

  // Load each file
  for (const file of files) {
    try {
      const evalCase = await loadSingleEvalCase(file);

      // Apply filters
      if (options.type && evalCase.type !== options.type) {
        continue;
      }
      if (options.agent && evalCase.agent !== options.agent) {
        continue;
      }

      result.cases.push(evalCase);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push({ file, error: errorMessage });
      logger.warn(`Failed to load eval case`, { file, error: errorMessage });
    }
  }

  logger.info(`Loaded ${result.cases.length} eval cases`, {
    total: result.totalFiles,
    loaded: result.cases.length,
    errors: result.errors.length,
  });

  return result;
}

/**
 * Load a single eval case from a file
 */
export async function loadSingleEvalCase(filePath: string): Promise<EvalCase> {
  const content = await fs.readFile(filePath, 'utf-8');
  const parsed = yaml.load(content) as EvalCase;

  // Validate required fields
  validateEvalCase(parsed, filePath);

  // Add source file path
  parsed.sourceFile = filePath;

  return parsed;
}

/**
 * Validate an eval case has required fields
 */
function validateEvalCase(evalCase: unknown, filePath: string): asserts evalCase is EvalCase {
  if (!evalCase || typeof evalCase !== 'object') {
    throw new Error('Eval case must be an object');
  }

  const obj = evalCase as Record<string, unknown>;

  if (!obj.name || typeof obj.name !== 'string') {
    throw new Error('Eval case must have a "name" field');
  }

  if (!obj.type || typeof obj.type !== 'string') {
    throw new Error('Eval case must have a "type" field');
  }

  const validTypes: EvalType[] = [
    'tool_selection',
    'response_quality',
    'skill_invocation',
    'multi_step_workflow',
  ];
  if (!validTypes.includes(obj.type as EvalType)) {
    throw new Error(`Invalid eval type: ${obj.type}. Must be one of: ${validTypes.join(', ')}`);
  }

  if (!obj.agent || typeof obj.agent !== 'string') {
    throw new Error('Eval case must have an "agent" field');
  }

  if (!obj.input || typeof obj.input !== 'object') {
    throw new Error('Eval case must have an "input" field');
  }

  const input = obj.input as Record<string, unknown>;
  if (!input.prompt || typeof input.prompt !== 'string') {
    throw new Error('Eval case input must have a "prompt" field');
  }

  if (!obj.expect || typeof obj.expect !== 'object') {
    throw new Error('Eval case must have an "expect" field');
  }

  logger.debug(`Validated eval case: ${obj.name}`, { file: filePath });
}

/**
 * Load model matrix configuration
 */
export async function loadModelConfig(configPath?: string): Promise<Record<string, string[]>> {
  const defaultConfig = {
    default: ['anthropic/claude-sonnet-4-20250514'],
    full_matrix: [
      'anthropic/claude-sonnet-4-20250514',
      'anthropic/claude-opus-4-20250514',
      'anthropic/claude-haiku-3-5-20241022',
    ],
    fast: ['anthropic/claude-haiku-3-5-20241022'],
  };

  if (!configPath) {
    const defaultPath = path.join(process.cwd(), 'evals', 'config', 'models.yaml');
    try {
      await fs.access(defaultPath);
      configPath = defaultPath;
    } catch {
      return defaultConfig;
    }
  }

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const parsed = yaml.load(content) as { models: Record<string, string[]> };
    return parsed.models || defaultConfig;
  } catch (error) {
    logger.warn('Failed to load model config, using defaults', { error });
    return defaultConfig;
  }
}

/**
 * Group eval cases by type
 */
export function groupByType(cases: EvalCase[]): Record<EvalType, EvalCase[]> {
  const grouped: Record<EvalType, EvalCase[]> = {
    tool_selection: [],
    response_quality: [],
    skill_invocation: [],
    multi_step_workflow: [],
  };

  for (const evalCase of cases) {
    grouped[evalCase.type].push(evalCase);
  }

  return grouped;
}

/**
 * Group eval cases by agent
 */
export function groupByAgent(cases: EvalCase[]): Record<string, EvalCase[]> {
  const grouped: Record<string, EvalCase[]> = {};

  for (const evalCase of cases) {
    if (!grouped[evalCase.agent]) {
      grouped[evalCase.agent] = [];
    }
    grouped[evalCase.agent].push(evalCase);
  }

  return grouped;
}

/**
 * Get summary statistics for loaded cases
 */
export function getCaseSummary(cases: EvalCase[]): {
  total: number;
  byType: Record<string, number>;
  byAgent: Record<string, number>;
} {
  const byType: Record<string, number> = {};
  const byAgent: Record<string, number> = {};

  for (const evalCase of cases) {
    byType[evalCase.type] = (byType[evalCase.type] || 0) + 1;
    byAgent[evalCase.agent] = (byAgent[evalCase.agent] || 0) + 1;
  }

  return {
    total: cases.length,
    byType,
    byAgent,
  };
}
