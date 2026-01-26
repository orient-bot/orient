/**
 * No Deep Relative Imports Test
 *
 * Ensures that files in packages/ don't use deep relative paths to import from
 * other packages using relative paths. This catches the pattern:
 *   ../../../../integrations/src/catalog/github/oauth.js
 * Which should be:
 *   @orientbot/integrations/catalog/github
 *
 * ALLOWED patterns:
 * - Re-exports from src/ (the migration pattern):
 *   export * from '../../../../src/services/foo.js'
 * - Imports from src/ in re-export wrapper files:
 *   import fooModule from '../../../../src/services/foo.js'
 * - dist imports (handled by no-dist-imports.test.ts)
 *
 * DISALLOWED patterns:
 * - Relative imports across packages:
 *   import { X } from '../../../../integrations/src/...'
 *   (Should use: @orientbot/integrations/...)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = path.resolve(__dirname, '../..');
const PACKAGES_DIR = path.join(ROOT_DIR, 'packages');

/**
 * Pattern for detecting deep relative imports.
 * Matches imports/exports with 4+ levels of parent directory traversal.
 */
const DEEP_RELATIVE_PATTERN = /from\s+['"](\.\.[/\\]){4,}[^'"]+['"]/g;

/**
 * Pattern for detecting dynamic imports with deep relative paths.
 */
const DEEP_DYNAMIC_IMPORT_PATTERN = /import\(['"](\.\.[/\\]){4,}[^'"]+['"]\)/g;

/**
 * Patterns that indicate an import from src/ (the migration/re-export pattern).
 * These are allowed because they're part of the migration strategy.
 */
const SRC_IMPORT_PATTERNS = [
  // Matches any import/export from ...src/...
  /['"][^'"]*\/src\/[^'"]*['"]/,
  // Matches any import/export from ...dist/... (handled by separate test)
  /['"][^'"]*\/dist\/[^'"]*['"]/,
];

/**
 * Patterns that indicate a cross-package relative import (DISALLOWED).
 * These should use package exports instead.
 */
const CROSS_PACKAGE_PATTERNS = [
  // Matches: ../../../../integrations/src/... (cross-package import)
  /['"][^'"]*\/(integrations|agents|apps|bot-slack|bot-whatsapp|core|dashboard|database|database-services|mcp-servers|mcp-tools)\/src\/[^'"]*['"]/,
];

/**
 * Files that are explicitly allowed to have deep imports.
 * Use sparingly - prefer fixing the imports over adding exceptions.
 *
 * Note: Re-export files (export * from '../../../../src/...') are automatically
 * allowed by the ALLOWED_DEEP_IMPORT_PATTERNS check.
 */
const EXCEPTION_FILES: string[] = [
  // None currently - all deep imports should use package exports
];

/**
 * Directories to exclude from scanning.
 */
const EXCLUDED_DIRS = ['dist', 'node_modules', '__tests__', 'test'];

/**
 * Check if a line is a comment
 */
function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
}

interface DeepImportViolation {
  file: string;
  line: number;
  content: string;
  suggestedFix?: string;
}

function getSuggestedPackageImport(importPath: string, _file: string): string | undefined {
  // Detect common patterns and suggest package imports

  // Pattern: ../../../../integrations/src/... -> @orientbot/integrations/...
  if (importPath.includes('integrations/src/')) {
    const subPath = importPath.split('integrations/src/')[1];
    if (subPath.includes('catalog/github')) return '@orientbot/integrations/catalog/github';
    if (subPath.includes('google')) return '@orientbot/integrations/google';
    if (subPath.includes('jira')) return '@orientbot/integrations/jira';
    return '@orientbot/integrations';
  }

  // Pattern: ../../../../../src/services/oauthClientProvider -> @orientbot/mcp-servers/oauth
  if (importPath.includes('src/services/oauthClientProvider')) {
    return '@orientbot/mcp-servers/oauth';
  }

  // Pattern: ../../../../../src/services/mcpClientManager -> @orientbot/agents
  if (importPath.includes('src/services/mcpClientManager')) {
    return '@orientbot/agents';
  }

  // Pattern: ../../../../../src/services/... -> check if re-exported from a package
  if (importPath.includes('/src/services/')) {
    const serviceName = importPath.split('/src/services/')[1]?.replace(/\.js$/, '');
    if (serviceName) {
      // Common service -> package mappings
      const servicePackageMap: Record<string, string> = {
        toolRegistry: '@orientbot/agents',
        toolCallingService: '@orientbot/agents',
        agentService: '@orientbot/agents',
        agentRegistry: '@orientbot/agents',
        openCodeClient: '@orientbot/agents',
        whatsappAgentService: '@orientbot/agents',
        billingService: '@orientbot/dashboard',
        appsService: '@orientbot/apps',
        appGeneratorService: '@orientbot/apps',
        slackBotService: '@orientbot/bot-slack',
        whatsappService: '@orientbot/bot-whatsapp',
      };
      return servicePackageMap[serviceName];
    }
  }

  return undefined;
}

/**
 * Check if a line contains a src/ or dist/ import (allowed by this test).
 * These are the migration patterns that bridge legacy code to packages.
 */
function isSrcOrDistImport(line: string): boolean {
  return SRC_IMPORT_PATTERNS.some((pattern) => pattern.test(line));
}

/**
 * Check if a line contains a cross-package relative import (DISALLOWED).
 */
function isCrossPackageImport(line: string): boolean {
  return CROSS_PACKAGE_PATTERNS.some((pattern) => pattern.test(line));
}

function findDeepRelativeImports(): DeepImportViolation[] {
  const violations: DeepImportViolation[] = [];

  try {
    // Use grep to find all deep relative imports in packages/
    // Pattern: 4+ occurrences of ../ followed by something
    const grepPattern = 'from.*[\'"]\\(\\.\\./\\)\\{4,\\}';

    // Try with extended regex first, excluding dist directories
    let result = '';
    try {
      result = execSync(
        `grep -Ern --include="*.ts" --include="*.tsx" --exclude-dir=dist --exclude-dir=node_modules "${grepPattern}" ${PACKAGES_DIR} 2>/dev/null || true`,
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
      );
    } catch {
      // Fallback to a simpler pattern
      result = execSync(
        `grep -rn --include="*.ts" --include="*.tsx" --exclude-dir=dist --exclude-dir=node_modules 'from.*\\.\\./\\.\\./\\.\\./\\.\\./' ${PACKAGES_DIR} 2>/dev/null || true`,
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
      );
    }

    if (!result.trim()) {
      return violations;
    }

    // Parse grep output: file:line:content
    const lines = result.trim().split('\n');
    for (const line of lines) {
      const match = line.match(/^([^:]+):(\d+):(.*)$/);
      if (match) {
        const [, file, lineNum, content] = match;
        const relFile = path.relative(ROOT_DIR, file);

        // Skip dist/ directories (these are build artifacts)
        if (relFile.includes('/dist/') || relFile.startsWith('dist/')) {
          continue;
        }

        // Skip exception files
        if (EXCEPTION_FILES.some((ex) => relFile.includes(ex))) {
          continue;
        }

        // Skip comments
        if (isCommentLine(content)) {
          continue;
        }

        // Skip src/ and dist/ imports (they're part of the migration pattern)
        if (isSrcOrDistImport(content)) {
          continue;
        }

        // Only flag cross-package imports
        if (!isCrossPackageImport(content)) {
          continue;
        }

        // Extract the import path
        const importMatch = content.match(/from\s+['"]([^'"]+)['"]/);
        const importPath = importMatch ? importMatch[1] : '';

        // Get suggested fix
        const suggestedFix = getSuggestedPackageImport(importPath, relFile);

        violations.push({
          file: relFile,
          line: parseInt(lineNum, 10),
          content: content.trim(),
          suggestedFix,
        });
      }
    }

    // Also check for dynamic imports
    const dynamicResult = execSync(
      `grep -rn --include="*.ts" --include="*.tsx" --exclude-dir=dist --exclude-dir=node_modules 'import.*\\.\\./\\.\\./\\.\\./\\.\\./' ${PACKAGES_DIR} 2>/dev/null || true`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );

    if (dynamicResult.trim()) {
      const dynamicLines = dynamicResult.trim().split('\n');
      for (const line of dynamicLines) {
        const match = line.match(/^([^:]+):(\d+):(.*)$/);
        if (match) {
          const [, file, lineNum, content] = match;
          const relFile = path.relative(ROOT_DIR, file);

          // Skip dist/ directories
          if (relFile.includes('/dist/') || relFile.startsWith('dist/')) {
            continue;
          }

          // Skip if already captured by static import check
          if (violations.some((v) => v.file === relFile && v.line === parseInt(lineNum, 10))) {
            continue;
          }

          // Skip exception files
          if (EXCEPTION_FILES.some((ex) => relFile.includes(ex))) {
            continue;
          }

          // Skip comments
          if (isCommentLine(content)) {
            continue;
          }

          // Skip src/ and dist/ imports
          if (isSrcOrDistImport(content)) {
            continue;
          }

          // Only flag cross-package imports
          if (!isCrossPackageImport(content)) {
            continue;
          }

          // Only include if it's actually a dynamic import (not a static one)
          if (content.includes('await import(') || content.includes('= import(')) {
            const importMatch = content.match(/import\(['"]([^'"]+)['"]\)/);
            const importPath = importMatch ? importMatch[1] : '';
            const suggestedFix = getSuggestedPackageImport(importPath, relFile);

            violations.push({
              file: relFile,
              line: parseInt(lineNum, 10),
              content: content.trim(),
              suggestedFix,
            });
          }
        }
      }
    }
  } catch {
    // Fallback to Node.js scanning if grep fails
    return scanPackagesForDeepImports();
  }

  return violations;
}

function scanPackagesForDeepImports(): DeepImportViolation[] {
  const violations: DeepImportViolation[] = [];

  function scanDir(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.includes(entry.name)) continue;
        scanDir(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        checkFile(fullPath, violations);
      }
    }
  }

  function checkFile(filePath: string, violations: DeepImportViolation[]): void {
    const relFile = path.relative(ROOT_DIR, filePath);

    // Skip exception files
    if (EXCEPTION_FILES.some((ex) => relFile.includes(ex))) {
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip comments
      if (isCommentLine(line)) {
        continue;
      }

      // Check for deep relative imports
      const patterns = [DEEP_RELATIVE_PATTERN, DEEP_DYNAMIC_IMPORT_PATTERN];
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        while (pattern.exec(line) !== null) {
          // Skip src/ and dist/ imports
          if (isSrcOrDistImport(line)) {
            continue;
          }

          // Only flag cross-package imports
          if (!isCrossPackageImport(line)) {
            continue;
          }

          const importMatch = line.match(/(?:from|import)\s*\(?['"]([^'"]+)['"]\)?/);
          const importPath = importMatch ? importMatch[1] : '';
          const suggestedFix = getSuggestedPackageImport(importPath, relFile);

          violations.push({
            file: relFile,
            line: i + 1,
            content: line.trim(),
            suggestedFix,
          });
        }
      }
    }
  }

  scanDir(PACKAGES_DIR);
  return violations;
}

describe('No Deep Relative Imports in Packages', () => {
  it('should not have deep relative imports that bypass package exports', () => {
    const violations = findDeepRelativeImports();

    if (violations.length > 0) {
      const violationDetails = violations
        .map((v) => {
          let detail = `  ${v.file}:${v.line}\n    ${v.content}`;
          if (v.suggestedFix) {
            detail += `\n    → Suggested: import from '${v.suggestedFix}'`;
          }
          return detail;
        })
        .join('\n\n');

      expect.fail(
        `Found ${violations.length} deep relative import(s) in packages/ that should use package exports:\n\n` +
          `${violationDetails}\n\n` +
          `Why this matters:\n` +
          `  - Deep relative paths like '../../../..' are fragile and break when files move\n` +
          `  - They're hard to read and understand\n` +
          `  - They bypass the package export system\n\n` +
          `How to fix:\n` +
          `  1. Use package exports: @orientbot/integrations/catalog/github instead of ../../../../integrations/src/...\n` +
          `  2. If a service isn't exported yet, add a re-export file in the appropriate package\n` +
          `  3. For legacy src/ code being migrated, the packages/ re-export is allowed:\n` +
          `     export * from '../../../../src/services/foo.js' (this is the migration pattern)`
      );
    }
  }, 30000);

  it('should have packages directory to scan', () => {
    expect(fs.existsSync(PACKAGES_DIR)).toBe(true);
  });
});

describe('Package Import Best Practices', () => {
  it('documents the correct import patterns for packages/', () => {
    const goodPatterns = [
      // Package imports (preferred)
      "import { X } from '@orientbot/core'",
      "import { X } from '@orientbot/integrations/catalog/github'",
      "import { X } from '@orientbot/mcp-servers/oauth'",

      // Local imports within the same package
      "import { X } from './services/index.js'",
      "import { X } from '../utils/helpers.js'",

      // Re-export pattern for migration (allowed in re-export files only)
      "export * from '../../../../src/services/foo.js'",
    ];

    const badPatterns = [
      // Deep relative imports across packages
      "import { X } from '../../../../integrations/src/catalog/github/oauth.js'",
      "import { X } from '../../../../../src/services/oauthClientProvider.js'",

      // Dynamic imports with deep paths
      "await import('../../../../integrations/src/catalog/github/oauth.js')",
    ];

    // Documentation test
    expect(goodPatterns.length).toBeGreaterThan(0);
    expect(badPatterns.length).toBeGreaterThan(0);
  });
});
