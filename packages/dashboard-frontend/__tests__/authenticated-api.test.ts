/**
 * Tests to enforce authenticated API usage in dashboard-frontend
 *
 * These tests scan the codebase to ensure all API calls use the authenticated
 * apiRequest helper from api.ts, preventing raw fetch() calls that bypass
 * JWT authentication.
 *
 * Background: The dashboard uses JWT-based authentication. The token is stored
 * in localStorage and sent via the Authorization: Bearer header. Raw fetch()
 * calls with credentials: 'include' only send cookies, NOT the JWT header,
 * causing 401 Unauthorized errors.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Get all TypeScript/TSX files in src directory (excluding test files)
function getSourceFiles(dir: string, files: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip __tests__ directories and node_modules
      if (entry.name !== '__tests__' && entry.name !== 'node_modules') {
        getSourceFiles(fullPath, files);
      }
    } else if (entry.isFile()) {
      // Include .ts and .tsx files, exclude test files
      if (
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !entry.name.includes('.test.') &&
        !entry.name.includes('.spec.')
      ) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

describe('Authenticated API Enforcement', () => {
  const srcDir = path.join(__dirname, '../src');
  const sourceFiles = getSourceFiles(srcDir);

  // Patterns that indicate raw fetch to API endpoints (should be avoided)
  // These patterns catch common ways developers might bypass the authenticated API
  const rawFetchPatterns = [
    // fetch('/api/...')
    /fetch\s*\(\s*['"`]\/api\//g,
    // fetch(`/api/...`)
    /fetch\s*\(\s*`\/api\//g,
    // fetch(url) where url contains /api - harder to catch statically
    // credentials: 'include' with /api in the same context
  ];

  // Files that are allowed to use raw fetch (api.ts itself needs to use fetch)
  const allowedFiles = ['api.ts'];

  describe('No raw fetch() calls to /api endpoints', () => {
    it('should not have any source files using raw fetch for API calls', () => {
      const violations: { file: string; line: number; content: string }[] = [];

      for (const file of sourceFiles) {
        const relativePath = path.relative(srcDir, file);
        const fileName = path.basename(file);

        // Skip allowed files (api.ts is allowed to use fetch)
        if (allowedFiles.includes(fileName)) {
          continue;
        }

        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          for (const pattern of rawFetchPatterns) {
            // Reset regex lastIndex for global patterns
            pattern.lastIndex = 0;
            if (pattern.test(line)) {
              violations.push({
                file: relativePath,
                line: i + 1,
                content: line.trim(),
              });
            }
          }
        }
      }

      if (violations.length > 0) {
        const message = violations
          .map((v) => `  ${v.file}:${v.line}\n    ${v.content}`)
          .join('\n\n');

        expect.fail(
          `Found ${violations.length} raw fetch() call(s) to /api endpoints.\n` +
            `These should use authenticated API functions from api.ts instead.\n\n` +
            `Violations:\n${message}\n\n` +
            `Fix: Import and use the appropriate function from '../api' or '../../api'.\n` +
            `Example: import { getFeatureFlags } from '../api';\n` +
            `         const data = await getFeatureFlags();`
        );
      }
    });
  });

  describe('API functions use apiRequest helper', () => {
    it('api.ts should define apiRequest function', () => {
      const apiFile = path.join(srcDir, 'api.ts');
      const content = fs.readFileSync(apiFile, 'utf-8');

      // Check that apiRequest is defined
      expect(content).toMatch(/async function apiRequest/);
    });

    it('api.ts should add Authorization header in apiRequest', () => {
      const apiFile = path.join(srcDir, 'api.ts');
      const content = fs.readFileSync(apiFile, 'utf-8');

      // Check that apiRequest adds the Authorization header
      expect(content).toMatch(/Authorization.*Bearer/);
    });

    it('api.ts should handle 401 responses', () => {
      const apiFile = path.join(srcDir, 'api.ts');
      const content = fs.readFileSync(apiFile, 'utf-8');

      // Check that 401 is handled (clears token and redirects)
      expect(content).toMatch(/status\s*===?\s*401/);
    });
  });

  describe('Feature flags use authenticated API', () => {
    it('useFeatureFlags hook should import from api.ts', () => {
      const hookFile = path.join(srcDir, 'hooks/useFeatureFlags.ts');
      const content = fs.readFileSync(hookFile, 'utf-8');

      // Should import getFeatureFlags from api
      expect(content).toMatch(/import\s*{[^}]*getFeatureFlags[^}]*}\s*from\s*['"]\.\.\/api['"]/);
    });

    it('useFeatureFlags hook should NOT use raw fetch', () => {
      const hookFile = path.join(srcDir, 'hooks/useFeatureFlags.ts');
      const content = fs.readFileSync(hookFile, 'utf-8');

      // Should not have raw fetch calls
      expect(content).not.toMatch(/fetch\s*\(\s*['"`]\/api/);
    });

    it('FeatureFlagsPage should import from api.ts', () => {
      const pageFile = path.join(srcDir, 'components/Settings/FeatureFlagsPage.tsx');
      const content = fs.readFileSync(pageFile, 'utf-8');

      // Should import setFeatureFlagOverride from api
      expect(content).toMatch(
        /import\s*{[^}]*setFeatureFlagOverride[^}]*}\s*from\s*['"]\.\.\/\.\.\/api['"]/
      );
    });

    it('FeatureFlagsPage should NOT use raw fetch', () => {
      const pageFile = path.join(srcDir, 'components/Settings/FeatureFlagsPage.tsx');
      const content = fs.readFileSync(pageFile, 'utf-8');

      // Should not have raw fetch calls
      expect(content).not.toMatch(/fetch\s*\(\s*['"`]\/api/);
    });
  });

  describe('Source file coverage', () => {
    it('should find source files to scan', () => {
      // Sanity check that we're actually scanning files
      expect(sourceFiles.length).toBeGreaterThan(10);
    });

    it('should include key files in scan', () => {
      const fileNames = sourceFiles.map((f) => path.basename(f));

      expect(fileNames).toContain('useFeatureFlags.ts');
      expect(fileNames).toContain('FeatureFlagsPage.tsx');
      expect(fileNames).toContain('api.ts');
    });
  });

  describe('Groups API functions', () => {
    it('api.ts should export getGroup function', () => {
      const apiFile = path.join(srcDir, 'api.ts');
      const content = fs.readFileSync(apiFile, 'utf-8');

      // Check that getGroup is exported
      expect(content).toMatch(/export async function getGroup/);
    });

    it('getGroup should use apiRequest helper', () => {
      const apiFile = path.join(srcDir, 'api.ts');
      const content = fs.readFileSync(apiFile, 'utf-8');

      // Find the getGroup function and verify it uses apiRequest
      const getGroupMatch = content.match(
        /export async function getGroup[\s\S]*?return result\.data;[\s\S]*?catch/
      );
      expect(getGroupMatch).toBeTruthy();
      expect(getGroupMatch?.[0]).toMatch(/apiRequest/);
    });

    it('getGroup should encode groupId in URL', () => {
      const apiFile = path.join(srcDir, 'api.ts');
      const content = fs.readFileSync(apiFile, 'utf-8');

      // Check that getGroup encodes the groupId
      expect(content).toMatch(/\/groups\/\$\{encodeURIComponent\(groupId\)\}/);
    });

    it('getGroup should return null on error', () => {
      const apiFile = path.join(srcDir, 'api.ts');
      const content = fs.readFileSync(apiFile, 'utf-8');

      // Find the getGroup function and verify error handling
      const getGroupMatch = content.match(
        /export async function getGroup[\s\S]*?catch[\s\S]*?return null/
      );
      expect(getGroupMatch).toBeTruthy();
    });
  });
});
