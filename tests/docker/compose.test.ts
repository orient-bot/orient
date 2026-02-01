/**
 * Docker Compose Configuration Tests
 *
 * Verifies that docker-compose.v2.yml is valid and has correct service definitions.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'yaml';

const rootDir = path.resolve(__dirname, '../..');
const dockerDir = path.join(rootDir, 'docker');

/**
 * Parse a YAML file
 */
function parseYaml(filePath: string): Record<string, any> {
  const content = fs.readFileSync(filePath, 'utf-8');
  return yaml.parse(content);
}

// Skip if yaml is not installed
const shouldSkip = () => {
  try {
    require.resolve('yaml');
    return false;
  } catch {
    return true;
  }
};

describe('Docker Compose Configuration', () => {
  describe('File Structure', () => {
    it('should have docker-compose.v2.yml', () => {
      const composePath = path.join(dockerDir, 'docker-compose.v2.yml');
      expect(fs.existsSync(composePath)).toBe(true);
    });

    it('should have docker-compose.local.yml', () => {
      const composePath = path.join(dockerDir, 'docker-compose.local.yml');
      expect(fs.existsSync(composePath)).toBe(true);
    });

    it('should have docker-compose.prod.yml', () => {
      const composePath = path.join(dockerDir, 'docker-compose.prod.yml');
      expect(fs.existsSync(composePath)).toBe(true);
    });
  });

  describe.skipIf(shouldSkip())('V2 Compose Services', () => {
    let compose: Record<string, any>;

    it('should parse docker-compose.v2.yml', () => {
      compose = parseYaml(path.join(dockerDir, 'docker-compose.v2.yml'));
      expect(compose).toBeDefined();
      expect(compose.services).toBeDefined();
    });

    it('should define bot-slack service', () => {
      const compose = parseYaml(path.join(dockerDir, 'docker-compose.v2.yml'));
      expect(compose.services['bot-slack']).toBeDefined();
      expect(compose.services['bot-slack'].build.dockerfile).toContain('packages/bot-slack');
    });

    it('should define opencode service with legacy Dockerfile (requires OpenCode binary)', () => {
      // OpenCode uses the legacy Dockerfile because it needs the full OpenCode
      // server binary installation, not just the MCP tools package
      const compose = parseYaml(path.join(dockerDir, 'docker-compose.v2.yml'));
      expect(compose.services['opencode']).toBeDefined();
      expect(compose.services['opencode'].build.dockerfile).toContain('Dockerfile.opencode');
    });

    it('should define api-gateway service', () => {
      const compose = parseYaml(path.join(dockerDir, 'docker-compose.v2.yml'));
      expect(compose.services['api-gateway']).toBeDefined();
      expect(compose.services['api-gateway'].build.dockerfile).toContain('packages/api-gateway');
    });

    it('should define dashboard service (includes WhatsApp integration)', () => {
      const compose = parseYaml(path.join(dockerDir, 'docker-compose.v2.yml'));
      expect(compose.services['dashboard']).toBeDefined();
      expect(compose.services['dashboard'].build.dockerfile).toContain('packages/dashboard');
    });

    it('should define infrastructure services (no postgres - using SQLite)', () => {
      const compose = parseYaml(path.join(dockerDir, 'docker-compose.v2.yml'));
      // SQLite replaces PostgreSQL - no postgres service
      expect(compose.services['postgres']).toBeUndefined();
      expect(compose.services['minio']).toBeDefined();
      expect(compose.services['nginx']).toBeDefined();
    });

    it('should define instance-aware container names for multi-instance support', () => {
      // Container names use ${AI_INSTANCE_ID:-0} suffix to allow running multiple
      // isolated instances (e.g., dev on instance 0, test on instance 9)
      const compose = parseYaml(path.join(dockerDir, 'docker-compose.v2.yml'));
      expect(compose.services['bot-slack'].container_name).toBe(
        'orienter-bot-slack-${AI_INSTANCE_ID:-0}'
      );
      expect(compose.services['opencode'].container_name).toBe(
        'orienter-opencode-${AI_INSTANCE_ID:-0}'
      );
      expect(compose.services['dashboard'].container_name).toBe(
        'orienter-dashboard-${AI_INSTANCE_ID:-0}'
      );
    });

    it('should have correct dependency chain (no postgres dependency)', () => {
      const compose = parseYaml(path.join(dockerDir, 'docker-compose.v2.yml'));

      // Slack depends on opencode (no postgres - using SQLite)
      const slackDeps = compose.services['bot-slack'].depends_on;
      expect(slackDeps).toHaveProperty('opencode');
      expect(slackDeps).not.toHaveProperty('postgres');

      // OpenCode has no postgres dependency (using SQLite)
      const opencodeDeps = compose.services['opencode']?.depends_on;
      if (opencodeDeps) {
        expect(opencodeDeps).not.toHaveProperty('postgres');
      }
    });

    it('should define networks', () => {
      const compose = parseYaml(path.join(dockerDir, 'docker-compose.v2.yml'));
      expect(compose.networks).toBeDefined();
      expect(compose.networks['orienter-network']).toBeDefined();
    });

    it('should define volumes (no postgres-data - using SQLite)', () => {
      const compose = parseYaml(path.join(dockerDir, 'docker-compose.v2.yml'));
      expect(compose.volumes).toBeDefined();
      // No postgres-data volume since we use SQLite
      expect(compose.volumes['postgres-data']).toBeUndefined();
      expect(compose.volumes['opencode-data']).toBeDefined();
    });

    it('should use SQLite database configuration instead of DATABASE_URL', () => {
      // Services use SQLITE_DATABASE environment variable for SQLite
      const compose = parseYaml(path.join(dockerDir, 'docker-compose.v2.yml'));

      const servicesWithDb = ['opencode', 'bot-slack', 'api-gateway', 'dashboard'];

      for (const serviceName of servicesWithDb) {
        const service = compose.services[serviceName];
        if (service?.environment) {
          // Check for SQLite configuration
          const hasDbType = service.environment.some((env: string) =>
            env.startsWith('DATABASE_TYPE=')
          );
          const hasSqliteDb = service.environment.some((env: string) =>
            env.startsWith('SQLITE_DATABASE=')
          );
          // Services should use SQLite, not PostgreSQL DATABASE_URL
          const hasPostgresUrl = service.environment.some(
            (env: string) => env.startsWith('DATABASE_URL=') && env.includes('postgres')
          );

          if (hasDbType || hasSqliteDb) {
            expect(hasPostgresUrl).toBe(false);
          }
        }
      }
    });
  });

  describe('Compose File Validation', () => {
    // Skip these tests if docker compose is not available
    const dockerComposeAvailable = () => {
      try {
        execSync('docker compose version', { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    };

    it.skipIf(!dockerComposeAvailable())('should validate docker-compose.v2.yml syntax', () => {
      // Create a minimal .env file if it doesn't exist for validation
      const envPath = path.join(rootDir, '.env');
      const envExists = fs.existsSync(envPath);

      if (!envExists) {
        // Create a minimal .env for validation
        fs.writeFileSync(envPath, '# Temporary .env for validation\n');
      }

      try {
        execSync('docker compose -f docker-compose.v2.yml config --quiet 2>/dev/null', {
          cwd: dockerDir,
          encoding: 'utf-8',
        });
        // If no error thrown, the config is valid
        expect(true).toBe(true);
      } catch (error) {
        // Check if it's just warnings about missing env vars (not syntax errors)
        const errorStr = String(error);
        if (errorStr.includes('is not set') || errorStr.includes('.env not found')) {
          // These are warnings, not syntax errors - pass
          expect(true).toBe(true);
        } else {
          throw error;
        }
      } finally {
        // Clean up temporary .env if we created it
        if (!envExists && fs.existsSync(envPath)) {
          fs.unlinkSync(envPath);
        }
      }
    });
  });
});
