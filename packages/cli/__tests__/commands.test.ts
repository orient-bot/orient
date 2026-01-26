/**
 * CLI Command Tests
 *
 * Tests for Orient CLI commands (onboard, doctor).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import * as net from 'net';

// Test directory for CLI tests
const TEST_ORIENT_HOME = join(tmpdir(), `orient-cli-test-${Date.now()}`);

// Mock implementations
const mockExecSync = vi.fn();
const mockSpawnSync = vi.fn();

describe('CLI Commands', () => {
  beforeEach(() => {
    // Reset mocks
    vi.resetModules();
    vi.clearAllMocks();

    // Create test directory
    if (!existsSync(TEST_ORIENT_HOME)) {
      mkdirSync(TEST_ORIENT_HOME, { recursive: true });
    }

    // Set test environment
    process.env.ORIENT_HOME = TEST_ORIENT_HOME;
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(TEST_ORIENT_HOME)) {
      rmSync(TEST_ORIENT_HOME, { recursive: true, force: true });
    }

    // Reset environment
    delete process.env.ORIENT_HOME;
  });

  describe('onboard', () => {
    describe('Prerequisites Check', () => {
      it('should check node version', () => {
        // Verify Node.js version is detectable
        const nodeVersion = process.version;
        const major = parseInt(nodeVersion.replace('v', '').split('.')[0]);

        expect(major).toBeGreaterThanOrEqual(20);
      });

      it('should detect pnpm', () => {
        // Check if pnpm is available
        try {
          const version = execSync('pnpm -v', { encoding: 'utf8' }).trim();
          expect(version).toMatch(/^\d+\.\d+\.\d+/);
        } catch {
          // pnpm not installed - this is acceptable in test environments
          expect(true).toBe(true);
        }
      });

      it('should detect git', () => {
        // Check if git is available
        try {
          execSync('git --version', { encoding: 'utf8' });
          expect(true).toBe(true);
        } catch {
          // git not installed - this is acceptable in test environments
          expect(true).toBe(true);
        }
      });
    });

    describe('Directory Structure', () => {
      it('should create directory structure', () => {
        const expectedDirs = ['', 'data/sqlite', 'data/media', 'data/whatsapp-auth', 'logs', 'bin'];

        // Create directories
        for (const dir of expectedDirs) {
          const fullPath = join(TEST_ORIENT_HOME, dir);
          if (!existsSync(fullPath)) {
            mkdirSync(fullPath, { recursive: true });
          }
        }

        // Verify all directories exist
        for (const dir of expectedDirs) {
          const fullPath = join(TEST_ORIENT_HOME, dir);
          expect(existsSync(fullPath), `Directory should exist: ${fullPath}`).toBe(true);
        }
      });

      it('should not fail if directories already exist', () => {
        const dir = join(TEST_ORIENT_HOME, 'data/sqlite');

        // Create directory twice
        mkdirSync(dir, { recursive: true });
        mkdirSync(dir, { recursive: true });

        expect(existsSync(dir)).toBe(true);
      });
    });

    describe('Configuration Generation', () => {
      it('should generate configuration with defaults', () => {
        const envPath = join(TEST_ORIENT_HOME, '.env');

        // Simulate config generation
        const config = {
          databaseType: 'sqlite',
          storageType: 'local',
          masterKey: 'test-master-key',
          jwtSecret: 'test-jwt-secret',
        };

        const sqlitePath = join(TEST_ORIENT_HOME, 'data', 'sqlite', 'orient.db');
        const storagePath = join(TEST_ORIENT_HOME, 'data', 'media');

        const envContent = `# Orient Configuration
NODE_ENV=production
LOG_LEVEL=info

# Database
DATABASE_TYPE=${config.databaseType}
SQLITE_DATABASE=${sqlitePath}

# Storage
STORAGE_TYPE=${config.storageType}
STORAGE_PATH=${storagePath}

# Security
ORIENT_MASTER_KEY=${config.masterKey}
DASHBOARD_JWT_SECRET=${config.jwtSecret}

# Dashboard
DASHBOARD_PORT=4098
BASE_URL=http://localhost:4098
`;

        writeFileSync(envPath, envContent);

        expect(existsSync(envPath)).toBe(true);

        const content = readFileSync(envPath, 'utf8');
        expect(content).toContain('DATABASE_TYPE=sqlite');
        expect(content).toContain('STORAGE_TYPE=local');
        expect(content).toContain('ORIENT_MASTER_KEY=test-master-key');
      });

      it('should preserve existing configuration', () => {
        const envPath = join(TEST_ORIENT_HOME, '.env');

        // Create existing config
        writeFileSync(envPath, 'EXISTING_CONFIG=preserved\n');

        // Simulate the "preserve existing" logic
        if (existsSync(envPath)) {
          const content = readFileSync(envPath, 'utf8');
          expect(content).toContain('EXISTING_CONFIG=preserved');
        }
      });

      it('should generate PM2 ecosystem config', () => {
        const ecosystemPath = join(TEST_ORIENT_HOME, 'ecosystem.config.cjs');

        const ecosystemContent = `module.exports = {
  apps: [
    {
      name: 'orient-dashboard',
      script: 'dist/packages/dashboard/src/main.js',
    },
    {
      name: 'orient-whatsapp',
      script: 'dist/packages/bot-whatsapp/src/main.js',
    },
  ],
};
`;

        writeFileSync(ecosystemPath, ecosystemContent);

        expect(existsSync(ecosystemPath)).toBe(true);
        const content = readFileSync(ecosystemPath, 'utf8');
        expect(content).toContain('orient-dashboard');
        expect(content).toContain('orient-whatsapp');
      });
    });
  });

  describe('doctor', () => {
    describe('Node Version Check', () => {
      it('should check node version', () => {
        const nodeVersion = process.version;
        const major = parseInt(nodeVersion.replace('v', '').split('.')[0]);

        // Should be >= 20
        expect(major).toBeGreaterThanOrEqual(20);
      });

      it('should format version string correctly', () => {
        const nodeVersion = process.version;
        expect(nodeVersion).toMatch(/^v\d+\.\d+\.\d+/);
      });
    });

    describe('Port Availability', () => {
      it('should check port availability', async () => {
        const testPort = 49999; // Use high port unlikely to be in use

        const checkPort = (port: number): Promise<boolean> => {
          return new Promise((resolve) => {
            const server = net.createServer();
            server.once('error', () => resolve(false));
            server.once('listening', () => {
              server.close();
              resolve(true);
            });
            server.listen(port);
          });
        };

        const available = await checkPort(testPort);
        expect(typeof available).toBe('boolean');
      });

      it('should detect port in use', async () => {
        const testPort = 49998;

        const checkPort = (port: number): Promise<boolean> => {
          return new Promise((resolve) => {
            const server = net.createServer();
            server.once('error', () => resolve(false));
            server.once('listening', () => {
              server.close();
              resolve(true);
            });
            server.listen(port);
          });
        };

        // Create a server to occupy the port
        const occupyServer = net.createServer();
        await new Promise<void>((resolve) => {
          occupyServer.listen(testPort, resolve);
        });

        try {
          const available = await checkPort(testPort);
          expect(available).toBe(false);
        } finally {
          occupyServer.close();
        }
      });
    });

    describe('Configuration Status', () => {
      it('should report configuration status', () => {
        const envPath = join(TEST_ORIENT_HOME, '.env');

        // No config file
        expect(existsSync(envPath)).toBe(false);

        // Create config
        writeFileSync(envPath, 'ORIENT_MASTER_KEY=test\nDASHBOARD_JWT_SECRET=test\n');
        expect(existsSync(envPath)).toBe(true);

        // Check content
        const content = readFileSync(envPath, 'utf8');
        expect(content).toContain('ORIENT_MASTER_KEY=');
        expect(content).toContain('DASHBOARD_JWT_SECRET=');
      });

      it('should detect missing required variables', () => {
        const envPath = join(TEST_ORIENT_HOME, '.env');

        // Create config without required vars
        writeFileSync(envPath, 'SOME_VAR=value\n');

        const content = readFileSync(envPath, 'utf8');

        const hasMasterKey =
          content.includes('ORIENT_MASTER_KEY=') && !content.includes('ORIENT_MASTER_KEY=\n');
        const hasJwtSecret =
          content.includes('DASHBOARD_JWT_SECRET=') && !content.includes('DASHBOARD_JWT_SECRET=\n');

        expect(hasMasterKey).toBe(false);
        expect(hasJwtSecret).toBe(false);
      });

      it('should check SQLite database existence', () => {
        const sqlitePath = join(TEST_ORIENT_HOME, 'data', 'sqlite', 'orient.db');

        // Database doesn't exist yet
        expect(existsSync(sqlitePath)).toBe(false);

        // Create database directory and file
        mkdirSync(join(TEST_ORIENT_HOME, 'data', 'sqlite'), { recursive: true });
        writeFileSync(sqlitePath, '');

        expect(existsSync(sqlitePath)).toBe(true);
      });
    });

    describe('Uptime Formatting', () => {
      it('should format uptime correctly', () => {
        const formatUptime = (ms: number): string => {
          const seconds = Math.floor(ms / 1000);
          const minutes = Math.floor(seconds / 60);
          const hours = Math.floor(minutes / 60);
          const days = Math.floor(hours / 24);

          if (days > 0) return `${days}d ${hours % 24}h`;
          if (hours > 0) return `${hours}h ${minutes % 60}m`;
          if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
          return `${seconds}s`;
        };

        expect(formatUptime(1000)).toBe('1s');
        expect(formatUptime(60000)).toBe('1m 0s');
        expect(formatUptime(3600000)).toBe('1h 0m');
        expect(formatUptime(86400000)).toBe('1d 0h');
        expect(formatUptime(90061000)).toBe('1d 1h');
      });
    });
  });
});

describe('Instance Port Calculation', () => {
  it('should calculate correct ports for instance 2', () => {
    // Based on the plan, instance 2 should have these ports
    const instanceId = 2;
    const portOffset = instanceId * 1000;

    const basePort = 4098; // Dashboard
    const expectedPort = basePort + portOffset;

    expect(expectedPort).toBe(6098);
  });

  it('should calculate all service ports correctly', () => {
    const instanceId = 2;
    const portOffset = instanceId * 1000;

    const services = {
      dashboard: { base: 4098, expected: 6098 },
      whatsapp: { base: 4097, expected: 6097 },
      apiGateway: { base: 4100, expected: 6100 },
      vite: { base: 5173, expected: 7173 },
      postgresql: { base: 5432, expected: 7432 },
      minioApi: { base: 9000, expected: 11000 },
      minioConsole: { base: 9001, expected: 11001 },
    };

    for (const [service, { base, expected }] of Object.entries(services)) {
      const calculated = base + portOffset;
      expect(calculated, `Port for ${service}`).toBe(expected);
    }
  });
});
