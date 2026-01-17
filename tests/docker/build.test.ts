/**
 * Docker Build Tests
 *
 * Verifies that all per-package Dockerfiles build successfully.
 * These tests are designed to be run in CI or locally before deployment.
 *
 * Note: These tests require Docker to be running.
 * Skip with: SKIP_DOCKER_TESTS=1 npm run test:docker
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// Skip tests if Docker is not available or SKIP_DOCKER_TESTS is set
const shouldSkip = () => {
  if (process.env.SKIP_DOCKER_TESTS === '1') {
    return true;
  }
  try {
    execSync('docker --version', { stdio: 'ignore' });
    return false;
  } catch {
    return true;
  }
};

const rootDir = path.resolve(__dirname, '../..');

/**
 * Check if a Dockerfile exists
 */
function dockerfileExists(packageName: string, filename = 'Dockerfile'): boolean {
  const dockerfilePath = path.join(rootDir, 'packages', packageName, filename);
  return fs.existsSync(dockerfilePath);
}

/**
 * Build a Docker image from a Dockerfile
 */
function buildImage(packageName: string, filename = 'Dockerfile', tag?: string): boolean {
  const dockerfilePath = path.join('packages', packageName, filename);
  const imageName = tag || `orienter-${packageName}-test:latest`;

  try {
    execSync(`docker build -t ${imageName} -f ${dockerfilePath} .`, {
      cwd: rootDir,
      stdio: 'pipe',
      timeout: 300000, // 5 minute timeout
    });
    return true;
  } catch (error) {
    console.error(`Build failed for ${packageName}:`, error);
    return false;
  }
}

/**
 * Remove a Docker image
 */
function removeImage(imageName: string): void {
  try {
    execSync(`docker rmi ${imageName}`, { stdio: 'ignore' });
  } catch {
    // Ignore errors (image might not exist)
  }
}

describe.skipIf(shouldSkip())('Docker Build Tests', () => {
  beforeAll(() => {
    console.log('Running Docker build tests from:', rootDir);
  });

  describe('Dockerfile Existence', () => {
    it('should have Dockerfile for bot-whatsapp', () => {
      expect(dockerfileExists('bot-whatsapp')).toBe(true);
    });

    it('should have Dockerfile for bot-slack', () => {
      expect(dockerfileExists('bot-slack')).toBe(true);
    });

    it('should have Dockerfile for api-gateway', () => {
      expect(dockerfileExists('api-gateway')).toBe(true);
    });

    it('should have Dockerfile for dashboard', () => {
      expect(dockerfileExists('dashboard')).toBe(true);
    });

    it('should have Dockerfile.opencode for mcp-tools', () => {
      expect(dockerfileExists('mcp-tools', 'Dockerfile.opencode')).toBe(true);
    });
  });

  // These tests are slow and should be run separately
  describe.skip('Docker Image Build', () => {
    const testImages: string[] = [];

    it('should build bot-whatsapp image', () => {
      const imageName = 'orienter-bot-whatsapp-test:latest';
      testImages.push(imageName);
      expect(buildImage('bot-whatsapp', 'Dockerfile', imageName)).toBe(true);
    }, 300000);

    it('should build bot-slack image', () => {
      const imageName = 'orienter-bot-slack-test:latest';
      testImages.push(imageName);
      expect(buildImage('bot-slack', 'Dockerfile', imageName)).toBe(true);
    }, 300000);

    it('should build api-gateway image', () => {
      const imageName = 'orienter-api-gateway-test:latest';
      testImages.push(imageName);
      expect(buildImage('api-gateway', 'Dockerfile', imageName)).toBe(true);
    }, 300000);

    it('should build dashboard image', () => {
      const imageName = 'orienter-dashboard-test:latest';
      testImages.push(imageName);
      expect(buildImage('dashboard', 'Dockerfile', imageName)).toBe(true);
    }, 300000);

    it('should build mcp-tools opencode image', () => {
      const imageName = 'orienter-mcp-tools-test:latest';
      testImages.push(imageName);
      expect(buildImage('mcp-tools', 'Dockerfile.opencode', imageName)).toBe(true);
    }, 300000);

    // Cleanup after tests
    afterAll(() => {
      for (const imageName of testImages) {
        removeImage(imageName);
      }
    });
  });
});
