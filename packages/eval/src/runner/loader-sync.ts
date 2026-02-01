/**
 * Synchronous Eval Case Loader
 *
 * Loads eval case files synchronously for use with Vitest test generation.
 */

import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import { globSync } from 'glob';
import { EvalCase, EvalType } from '../types.js';

/**
 * Options for loading eval cases
 */
export interface SyncLoaderOptions {
  /** Base directory to search for evals */
  baseDir?: string;

  /** Filter by eval type */
  type?: EvalType;

  /** Filter by agent */
  agent?: string;
}

/**
 * Directories to skip when scanning
 */
const SKIP_DIRS = ['schemas', 'config', 'fixtures', 'node_modules'];

/**
 * Load all eval cases synchronously
 */
export function loadEvalCasesSync(options: SyncLoaderOptions = {}): EvalCase[] {
  const baseDir = options.baseDir || path.join(process.cwd(), 'evals');
  const cases: EvalCase[] = [];

  // Check if directory exists
  if (!fs.existsSync(baseDir)) {
    console.warn(`Evals directory not found: ${baseDir}`);
    return cases;
  }

  // Find all YAML files
  const pattern = '**/*.yaml';
  const files = globSync(pattern, {
    cwd: baseDir,
    ignore: SKIP_DIRS.map((dir) => `${dir}/**`),
    absolute: true,
  });

  // Load each file
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const evalCase = yaml.load(content) as EvalCase;

      // Validate required fields
      if (!evalCase.name || !evalCase.type || !evalCase.input) {
        continue;
      }

      // Apply filters
      if (options.type && evalCase.type !== options.type) {
        continue;
      }

      if (options.agent && evalCase.agent !== options.agent) {
        continue;
      }

      // Skip disabled evals
      if (evalCase.enabled === false) {
        continue;
      }

      // Add source file path for debugging
      evalCase.sourceFile = file;

      cases.push(evalCase);
    } catch {
      // Skip files that can't be parsed
      continue;
    }
  }

  return cases;
}
