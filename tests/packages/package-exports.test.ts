/**
 * Package Exports Validation Tests
 *
 * These tests ensure all workspace packages have proper exports configuration
 * to prevent module resolution issues with tsx, Node.js ESM, and bundlers.
 *
 * Background: tsx (and some Node.js configurations) require explicit "default"
 * export conditions in package.json exports field for proper resolution through
 * symlinks (used by pnpm workspaces).
 *
 * @see https://nodejs.org/api/packages.html#conditional-exports
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, resolve } from 'path';

const PACKAGES_DIR = resolve(__dirname, '../../packages');
const ROOT_DIR = resolve(__dirname, '../..');

interface PackageJson {
  name: string;
  type?: string;
  main?: string;
  types?: string;
  exports?: Record<
    string,
    | {
        types?: string;
        import?: string;
        require?: string;
        default?: string;
      }
    | string
  >;
}

// Get all package directories
function getPackageDirectories(): string[] {
  return readdirSync(PACKAGES_DIR).filter((name) => {
    const pkgPath = join(PACKAGES_DIR, name, 'package.json');
    return existsSync(pkgPath) && statSync(join(PACKAGES_DIR, name)).isDirectory();
  });
}

// Read and parse package.json
function readPackageJson(packageDir: string): PackageJson {
  const pkgPath = join(PACKAGES_DIR, packageDir, 'package.json');
  const content = readFileSync(pkgPath, 'utf-8');
  return JSON.parse(content);
}

describe('Workspace Package Exports', () => {
  let packages: string[];

  beforeAll(() => {
    packages = getPackageDirectories();
    console.log(`Found ${packages.length} packages to validate:`, packages);
  });

  it('should find workspace packages', () => {
    expect(packages.length).toBeGreaterThan(0);
  });

  describe('ESM Package Configuration', () => {
    it.each(getPackageDirectories())('%s should have type: module for ESM', (packageDir) => {
      const pkg = readPackageJson(packageDir);

      // All our packages should be ESM
      expect(pkg.type).toBe('module');
    });
  });

  describe('Package Exports Field', () => {
    it.each(getPackageDirectories())(
      '%s should have exports field with default condition',
      (packageDir) => {
        const pkg = readPackageJson(packageDir);

        if (!pkg.exports) {
          // Some packages might not have exports yet, just warn
          console.warn(`⚠️  ${pkg.name} does not have an exports field`);
          return;
        }

        // Check each export path
        for (const [exportPath, exportConfig] of Object.entries(pkg.exports)) {
          // Skip string exports (simple re-exports)
          if (typeof exportConfig === 'string') {
            continue;
          }

          // If it has 'import', it should also have 'default' for tsx compatibility
          if (exportConfig.import && !exportConfig.default) {
            throw new Error(
              `${pkg.name}: Export "${exportPath}" has "import" but missing "default" condition.\n` +
                `This can cause module resolution failures with tsx and pnpm workspaces.\n` +
                `Add: "default": "${exportConfig.import}" to the exports configuration.`
            );
          }
        }
      }
    );

    it.each(getPackageDirectories())('%s exports should point to valid paths', (packageDir) => {
      const pkg = readPackageJson(packageDir);
      const pkgDir = join(PACKAGES_DIR, packageDir);

      if (!pkg.exports) return;

      // Just verify export paths are well-formed
      // Actual file existence is checked by build tests
      for (const [exportPath, exportConfig] of Object.entries(pkg.exports)) {
        if (typeof exportConfig === 'string') {
          // String exports should start with ./
          expect(exportConfig.startsWith('./')).toBe(true);
        } else {
          // Object exports should have import field starting with ./
          if (exportConfig.import) {
            expect(exportConfig.import.startsWith('./')).toBe(true);
          }
        }
      }
    });
  });

  describe('Main/Types Fields', () => {
    // Exclude frontend apps that are not libraries
    const libraryPackages = getPackageDirectories().filter(
      (dir) => !['dashboard-frontend'].includes(dir)
    );

    it.each(libraryPackages)('%s should have main and types fields', (packageDir) => {
      const pkg = readPackageJson(packageDir);

      // Should have main entry point
      expect(pkg.main).toBeDefined();
      expect(pkg.main).toContain('dist');

      // Should have types for TypeScript
      expect(pkg.types).toBeDefined();
      expect(pkg.types).toContain('.d.ts');
    });
  });
});

describe('Cross-Package Dependencies', () => {
  // Packages that other packages commonly depend on
  const criticalPackages = ['database', 'core', 'database-services'];

  it.each(criticalPackages)(
    '@orientbot/%s should have complete exports configuration',
    (pkgName) => {
      const pkgDir = join(PACKAGES_DIR, pkgName);

      if (!existsSync(pkgDir)) {
        console.warn(`⚠️  Package ${pkgName} not found, skipping`);
        return;
      }

      const pkg = readPackageJson(pkgName);

      // Must have exports field
      expect(pkg.exports).toBeDefined();

      // Root export must exist
      expect(pkg.exports!['.']).toBeDefined();

      // Root export must have all conditions
      const rootExport = pkg.exports!['.'];
      if (typeof rootExport !== 'string') {
        expect(rootExport.types).toBeDefined();
        expect(rootExport.import).toBeDefined();
        expect(rootExport.default).toBeDefined();

        // Default should match import
        expect(rootExport.default).toBe(rootExport.import);
      }
    }
  );

  it('database package exports should match its public API', () => {
    const pkg = readPackageJson('database');

    // Database package should export at least these
    const expectedExports = ['.', './schema', './client'];

    for (const exp of expectedExports) {
      expect(pkg.exports![exp]).toBeDefined();
    }
  });
});

describe('Build Artifacts', () => {
  // Skip these tests if not in a built state
  const checkBuildArtifacts = existsSync(join(PACKAGES_DIR, 'database', 'dist'));

  it.skipIf(!checkBuildArtifacts)('database package dist should exist', () => {
    const distPath = join(PACKAGES_DIR, 'database', 'dist');
    expect(existsSync(distPath)).toBe(true);
    expect(existsSync(join(distPath, 'index.js'))).toBe(true);
    expect(existsSync(join(distPath, 'index.d.ts'))).toBe(true);
  });

  it.skipIf(!checkBuildArtifacts)('database-services package dist should exist', () => {
    const distPath = join(PACKAGES_DIR, 'database-services', 'dist');
    expect(existsSync(distPath)).toBe(true);
    expect(existsSync(join(distPath, 'index.js'))).toBe(true);
  });
});

describe('Import Resolution Simulation', () => {
  it('should be able to resolve @orientbot/database from @orientbot/database-services', async () => {
    // Simulate the resolution path that tsx uses
    const dbServicesDir = join(PACKAGES_DIR, 'database-services');
    const dbServicesNodeModules = join(dbServicesDir, 'node_modules', '@orient', 'database');

    if (!existsSync(dbServicesNodeModules)) {
      console.warn('⚠️  Symlinks not set up, skipping resolution test');
      return;
    }

    // Read the linked package.json
    const linkedPkgPath = join(dbServicesNodeModules, 'package.json');
    expect(existsSync(linkedPkgPath)).toBe(true);

    const linkedPkg = JSON.parse(readFileSync(linkedPkgPath, 'utf-8'));

    // Verify it has proper exports
    expect(linkedPkg.exports).toBeDefined();
    expect(linkedPkg.exports['.']).toBeDefined();

    const rootExport = linkedPkg.exports['.'];
    if (typeof rootExport !== 'string') {
      expect(rootExport.default).toBeDefined();
    }
  });
});
