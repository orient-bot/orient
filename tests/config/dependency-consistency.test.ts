/**
 * Dependency Consistency Tests
 *
 * These tests ensure that critical dependencies are consistently versioned
 * across all packages in the monorepo. This prevents issues like the Baileys
 * version mismatch bug where bot-whatsapp was using deprecated v6.x while
 * the root used v7.x RC, causing WhatsApp to disconnect after 60 seconds.
 *
 * @see https://github.com/WhiskeySockets/Baileys/issues/2110
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

interface PackageJson {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface DependencyInfo {
  packageName: string;
  packagePath: string;
  version: string;
  dependencyType: 'dependencies' | 'devDependencies' | 'peerDependencies';
}

/**
 * Critical dependencies that must have consistent versions across all packages.
 * Add dependencies here that have caused version mismatch bugs.
 */
const CRITICAL_DEPENDENCIES = [
  'baileys', // WhatsApp API - version mismatch caused device_removed errors
  '@slack/bolt', // Slack API - protocol sensitive
  '@slack/web-api', // Slack API - protocol sensitive
  'drizzle-orm', // Database ORM - schema compatibility
  'zod', // Schema validation - type compatibility
];

/**
 * Dependencies that should use exact versions (not ranges) to prevent
 * accidental upgrades in different packages.
 */
const EXACT_VERSION_REQUIRED = [
  'baileys', // WhatsApp protocol is very sensitive to version changes
];

/**
 * Known deprecated versions that should never be used.
 */
const DEPRECATED_VERSIONS: Record<string, string[]> = {
  baileys: [
    '^6.7.0', // Resolves to deprecated 6.17.16
    '^6.17.0', // Deprecated
    '6.17.16', // Deprecated with "wrong version" warning
  ],
};

function findPackageJsonFiles(rootDir: string): string[] {
  const packageFiles: string[] = [];

  // Root package.json
  const rootPackage = path.join(rootDir, 'package.json');
  if (fs.existsSync(rootPackage)) {
    packageFiles.push(rootPackage);
  }

  // Packages directory
  const packagesDir = path.join(rootDir, 'packages');
  if (fs.existsSync(packagesDir)) {
    const packages = fs.readdirSync(packagesDir);
    for (const pkg of packages) {
      const pkgPath = path.join(packagesDir, pkg, 'package.json');
      if (fs.existsSync(pkgPath)) {
        packageFiles.push(pkgPath);
      }
    }
  }

  return packageFiles;
}

function getDependencyVersions(packageFiles: string[], dependencyName: string): DependencyInfo[] {
  const versions: DependencyInfo[] = [];

  for (const pkgPath of packageFiles) {
    const content = fs.readFileSync(pkgPath, 'utf-8');
    const pkg: PackageJson = JSON.parse(content);

    const dependencyTypes: Array<'dependencies' | 'devDependencies' | 'peerDependencies'> = [
      'dependencies',
      'devDependencies',
      'peerDependencies',
    ];

    for (const depType of dependencyTypes) {
      const deps = pkg[depType];
      if (deps && deps[dependencyName]) {
        versions.push({
          packageName: pkg.name,
          packagePath: pkgPath,
          version: deps[dependencyName],
          dependencyType: depType,
        });
      }
    }
  }

  return versions;
}

function isExactVersion(version: string): boolean {
  // Exact versions don't start with ^, ~, >, <, or contain ||
  return (
    !version.startsWith('^') &&
    !version.startsWith('~') &&
    !version.startsWith('>') &&
    !version.startsWith('<') &&
    !version.includes('||')
  );
}

describe('Dependency Consistency', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const packageFiles = findPackageJsonFiles(rootDir);

  describe('Package Discovery', () => {
    it('should find package.json files in monorepo', () => {
      expect(packageFiles.length).toBeGreaterThan(1);
      expect(packageFiles.some((p) => p.endsWith('package.json'))).toBe(true);
    });
  });

  describe('Critical Dependencies Version Consistency', () => {
    for (const dep of CRITICAL_DEPENDENCIES) {
      it(`should have consistent version for '${dep}' across all packages`, () => {
        const versions = getDependencyVersions(packageFiles, dep);

        if (versions.length === 0) {
          // Dependency not used, skip
          return;
        }

        if (versions.length === 1) {
          // Only one package uses it, no consistency check needed
          return;
        }

        // Get unique versions (excluding peer dependencies which may intentionally differ)
        const regularDeps = versions.filter((v) => v.dependencyType !== 'peerDependencies');
        const uniqueVersions = [...new Set(regularDeps.map((v) => v.version))];

        if (uniqueVersions.length > 1) {
          const versionDetails = regularDeps
            .map((v) => `  - ${v.packageName}: ${v.version} (${v.dependencyType})`)
            .join('\n');

          expect.fail(
            `Dependency '${dep}' has inconsistent versions across packages:\n${versionDetails}\n\n` +
              `All packages should use the same version to prevent runtime issues.\n` +
              `The Baileys v6.x vs v7.x mismatch caused WhatsApp to disconnect after 60 seconds.`
          );
        }
      });
    }
  });

  describe('Exact Version Requirements', () => {
    for (const dep of EXACT_VERSION_REQUIRED) {
      it(`should use exact version (not range) for '${dep}'`, () => {
        const versions = getDependencyVersions(packageFiles, dep);

        for (const v of versions) {
          if (!isExactVersion(v.version)) {
            expect.fail(
              `Package '${v.packageName}' uses version range '${v.version}' for '${dep}'.\n` +
                `This dependency should use an exact version to prevent accidental upgrades.\n` +
                `Change from '${v.version}' to an exact version like '7.0.0-rc.9'.\n\n` +
                `Version ranges can resolve to different versions in different packages,\n` +
                `causing protocol mismatches and hard-to-debug issues.`
            );
          }
        }
      });
    }
  });

  describe('Deprecated Versions', () => {
    for (const [dep, deprecatedVersions] of Object.entries(DEPRECATED_VERSIONS)) {
      it(`should not use deprecated versions of '${dep}'`, () => {
        const versions = getDependencyVersions(packageFiles, dep);

        for (const v of versions) {
          if (deprecatedVersions.includes(v.version)) {
            expect.fail(
              `Package '${v.packageName}' uses deprecated version '${v.version}' of '${dep}'.\n` +
                `Deprecated versions may have known bugs or protocol issues.\n` +
                `Please update to a supported version.`
            );
          }
        }
      });
    }
  });

  describe('Baileys Specific Checks', () => {
    it('should use Baileys v7.x (RC or stable) for WhatsApp protocol compatibility', () => {
      const versions = getDependencyVersions(packageFiles, 'baileys');

      for (const v of versions) {
        // Skip if not using baileys
        if (!v.version) continue;

        // Check that we're using v7.x
        const isV7 =
          v.version.startsWith('7.') ||
          v.version.includes('7.0.0-rc') ||
          v.version.startsWith('^7.');

        const isDeprecatedV6 = v.version.startsWith('6.') || v.version.startsWith('^6.');

        if (isDeprecatedV6) {
          expect.fail(
            `Package '${v.packageName}' uses Baileys v6.x ('${v.version}') which is deprecated.\n` +
              `Baileys v6.x has protocol issues that cause WhatsApp to disconnect after ~60 seconds\n` +
              `with 'device_removed' error (code 401).\n\n` +
              `Please update to v7.x: npm install baileys@7.0.0-rc.9\n` +
              `Or check https://github.com/WhiskeySockets/Baileys for the latest stable version.`
          );
        }

        if (!isV7 && !isDeprecatedV6) {
          // Unknown version format, just warn
          console.warn(
            `Unknown Baileys version format: '${v.version}' in ${v.packageName}. ` +
              `Please verify this is a supported version.`
          );
        }
      }
    });

    it('should have baileys in bot-whatsapp package', () => {
      const versions = getDependencyVersions(packageFiles, 'baileys');
      const botWhatsapp = versions.find(
        (v) => v.packageName === '@orient/bot-whatsapp' || v.packagePath.includes('bot-whatsapp')
      );

      expect(botWhatsapp).toBeDefined();
      expect(botWhatsapp?.version).toBeDefined();
    });
  });
});

describe('Monorepo Health', () => {
  const rootDir = path.resolve(__dirname, '../..');

  it('should have pnpm-workspace.yaml', () => {
    const workspacePath = path.join(rootDir, 'pnpm-workspace.yaml');
    expect(fs.existsSync(workspacePath)).toBe(true);
  });

  it('should have consistent node engine requirements', () => {
    const packageFiles = findPackageJsonFiles(rootDir);
    const engines: Array<{ name: string; node: string }> = [];

    for (const pkgPath of packageFiles) {
      const content = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);

      if (pkg.engines?.node) {
        engines.push({ name: pkg.name, node: pkg.engines.node });
      }
    }

    // All engine requirements should be compatible
    const nodeVersions = [...new Set(engines.map((e) => e.node))];

    // We allow different but compatible versions (e.g., >=18 and >=20)
    // but not conflicting ones
    for (const v1 of nodeVersions) {
      for (const v2 of nodeVersions) {
        // Very basic compatibility check - both should allow Node 20+
        const v1AllowsNode20 = !v1.includes('<20') && !v1.includes('=18') && !v1.includes('=19');
        const v2AllowsNode20 = !v2.includes('<20') && !v2.includes('=18') && !v2.includes('=19');

        if (v1AllowsNode20 !== v2AllowsNode20) {
          console.warn(
            `Potentially incompatible Node.js requirements found:\n` +
              engines.map((e) => `  - ${e.name}: ${e.node}`).join('\n')
          );
        }
      }
    }
  });
});
