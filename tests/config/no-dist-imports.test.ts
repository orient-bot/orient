/**
 * No Dist Imports Test
 *
 * Ensures that source TypeScript files don't import from dist directories.
 * Importing from dist is problematic because:
 * - dist artifacts may not exist during development or in fresh builds
 * - It creates a dependency on build order
 * - It bypasses TypeScript type checking during development
 *
 * All imports should reference source files or package exports, not build artifacts.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = path.resolve(__dirname, '../..');

/**
 * Directories to scan for TypeScript source files.
 * These are the main source directories that should never import from dist.
 */
const SOURCE_DIRECTORIES = [
  'src',
  'packages/agents/src',
  'packages/api-gateway/src',
  'packages/apps/src',
  'packages/bot-slack/src',
  'packages/bot-whatsapp/src',
  'packages/core/src',
  'packages/dashboard/src',
  'packages/database/src',
  'packages/database-services/src',
  'packages/integrations/src',
  'packages/mcp-servers/src',
  'packages/mcp-tools/src',
  'packages/test-utils/src',
];

/**
 * Patterns that indicate a problematic dist import.
 * These patterns match imports from dist directories in source files.
 */
const DIST_IMPORT_PATTERNS = [
  /from\s+['"][^'"]*\/dist\/[^'"]*['"]/g, // from '...dist/...'
  /from\s+['"]\.\.\/\.\.\/\.\.\/dist\/[^'"]*['"]/g, // from '../../../dist/...'
  /import\s*\([^)]*\/dist\/[^)]*\)/g, // dynamic import('...dist/...')
  /require\s*\([^)]*\/dist\/[^)]*\)/g, // require('...dist/...')
];

interface DistImportViolation {
  file: string;
  line: number;
  content: string;
  match: string;
}

function findDistImportsWithGrep(): DistImportViolation[] {
  const violations: DistImportViolation[] = [];

  try {
    // Use grep to find all dist imports in TypeScript files
    // This is faster than reading all files in Node.js
    const grepPattern = 'from.*[\'"][^\'"]*/dist/';
    const directories = SOURCE_DIRECTORIES.map((d) => path.join(ROOT_DIR, d)).filter((d) =>
      fs.existsSync(d)
    );

    if (directories.length === 0) {
      return violations;
    }

    const result = execSync(
      `grep -rn --include="*.ts" --include="*.tsx" "${grepPattern}" ${directories.join(' ')} 2>/dev/null || true`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );

    if (!result.trim()) {
      return violations;
    }

    // Parse grep output: file:line:content
    const lines = result.trim().split('\n');
    for (const line of lines) {
      const match = line.match(/^([^:]+):(\d+):(.*)$/);
      if (match) {
        const [, file, lineNum, content] = match;

        // Extract the actual import path that contains /dist/
        const importMatch = content.match(/from\s+['"]([^'"]*\/dist\/[^'"]*)['"]/);
        const importPath = importMatch ? importMatch[1] : content.trim();

        violations.push({
          file: path.relative(ROOT_DIR, file),
          line: parseInt(lineNum, 10),
          content: content.trim(),
          match: importPath,
        });
      }
    }
  } catch {
    // If grep fails, fall back to Node.js file scanning
    return findDistImportsWithNodeJs();
  }

  return violations;
}

function findDistImportsWithNodeJs(): DistImportViolation[] {
  const violations: DistImportViolation[] = [];

  for (const dir of SOURCE_DIRECTORIES) {
    const fullPath = path.join(ROOT_DIR, dir);
    if (!fs.existsSync(fullPath)) continue;

    scanDirectory(fullPath, violations);
  }

  return violations;
}

function scanDirectory(dir: string, violations: DistImportViolation[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and __tests__ directories
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      scanDirectory(fullPath, violations);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      checkFileForDistImports(fullPath, violations);
    }
  }
}

function checkFileForDistImports(filePath: string, violations: DistImportViolation[]): void {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const pattern of DIST_IMPORT_PATTERNS) {
      // Reset regex state
      pattern.lastIndex = 0;

      const matches = line.matchAll(pattern);
      for (const match of matches) {
        violations.push({
          file: path.relative(ROOT_DIR, filePath),
          line: i + 1,
          content: line.trim(),
          match: match[0],
        });
      }
    }
  }
}

describe('No Dist Imports', () => {
  it('should not import from dist directories in source files', () => {
    const violations = findDistImportsWithGrep();

    if (violations.length > 0) {
      const violationDetails = violations
        .map((v) => `  ${v.file}:${v.line}\n    ${v.content}`)
        .join('\n\n');

      expect.fail(
        `Found ${violations.length} import(s) from dist directories in source files:\n\n` +
          `${violationDetails}\n\n` +
          `Source files should import from:\n` +
          `  - Other source files (./services/foo.js, ../utils/bar.js)\n` +
          `  - Package exports (@orient-bot/core, @orient-bot/agents)\n` +
          `  - Re-export modules that reference source (../../../../src/services/foo.js)\n\n` +
          `Never import from dist because:\n` +
          `  - dist artifacts may not exist in fresh clones or development\n` +
          `  - It creates a dependency on build order\n` +
          `  - It bypasses TypeScript type checking during development`
      );
    }
  }, 30000);

  it('should have source directories to scan', () => {
    const existingDirs = SOURCE_DIRECTORIES.filter((dir) =>
      fs.existsSync(path.join(ROOT_DIR, dir))
    );

    expect(existingDirs.length).toBeGreaterThan(0);
  });
});

describe('Import Path Best Practices', () => {
  it('should document the correct import patterns', () => {
    // This test documents the expected import patterns for reference
    const goodPatterns = [
      "import { X } from './services/index.js'",
      "import { X } from '../utils/logger.js'",
      "import { X } from '@orient-bot/core'",
      "import { X } from '@orient-bot/agents'",
      "export * from '../../../../src/services/foo.js'", // Re-export from source
    ];

    const badPatterns = [
      "import { X } from '../../../dist/services/foo.js'",
      "import { X } from '../../../../dist/services/bar.js'",
      "const X = require('../dist/utils/helper.js')",
    ];

    // Just verify the patterns exist (documentation test)
    expect(goodPatterns.length).toBeGreaterThan(0);
    expect(badPatterns.length).toBeGreaterThan(0);
  });
});
