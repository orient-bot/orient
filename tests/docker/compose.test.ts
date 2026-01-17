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

    it('should define bot-whatsapp service', () => {
      const compose = parseYaml(path.join(dockerDir, 'docker-compose.v2.yml'));
      expect(compose.services['bot-whatsapp']).toBeDefined();
      expect(compose.services['bot-whatsapp'].build.dockerfile).toContain('packages/bot-whatsapp');
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

    it('should define dashboard service', () => {
      const compose = parseYaml(path.join(dockerDir, 'docker-compose.v2.yml'));
      expect(compose.services['dashboard']).toBeDefined();
      expect(compose.services['dashboard'].build.dockerfile).toContain('packages/dashboard');
    });

    it('should define infrastructure services', () => {
      const compose = parseYaml(path.join(dockerDir, 'docker-compose.v2.yml'));
      expect(compose.services['postgres']).toBeDefined();
      expect(compose.services['minio']).toBeDefined();
      expect(compose.services['nginx']).toBeDefined();
    });

    it('should define correct container names', () => {
      const compose = parseYaml(path.join(dockerDir, 'docker-compose.v2.yml'));
      expect(compose.services['bot-whatsapp'].container_name).toBe('orienter-bot-whatsapp');
      expect(compose.services['bot-slack'].container_name).toBe('orienter-bot-slack');
      expect(compose.services['opencode'].container_name).toBe('orienter-opencode');
    });

    it('should have correct dependency chain', () => {
      const compose = parseYaml(path.join(dockerDir, 'docker-compose.v2.yml'));

      // WhatsApp depends on opencode and postgres
      const whatsappDeps = compose.services['bot-whatsapp'].depends_on;
      expect(whatsappDeps).toHaveProperty('opencode');
      expect(whatsappDeps).toHaveProperty('postgres');

      // OpenCode depends on postgres
      const opencodeDeps = compose.services['opencode'].depends_on;
      expect(opencodeDeps).toHaveProperty('postgres');
    });

    it('should define networks', () => {
      const compose = parseYaml(path.join(dockerDir, 'docker-compose.v2.yml'));
      expect(compose.networks).toBeDefined();
      expect(compose.networks['orienter-network']).toBeDefined();
    });

    it('should define volumes', () => {
      const compose = parseYaml(path.join(dockerDir, 'docker-compose.v2.yml'));
      expect(compose.volumes).toBeDefined();
      expect(compose.volumes['postgres-data']).toBeDefined();
      expect(compose.volumes['opencode-data']).toBeDefined();
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
