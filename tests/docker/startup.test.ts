/**
 * Docker Startup Tests
 *
 * Verifies that containers start correctly and can be stopped gracefully.
 * These tests require pre-built images (run build tests first).
 *
 * Note: These tests require Docker to be running.
 * Skip with: SKIP_DOCKER_TESTS=1 npm run test:docker
 */

import { describe, it, expect } from 'vitest';
import { execSync, spawn } from 'child_process';

// Skip tests if Docker is not available or SKIP_DOCKER_TESTS is set
const shouldSkip = () => {
  if (process.env.SKIP_DOCKER_TESTS === '1') {
    return true;
  }
  try {
    execSync('docker --version', { stdio: 'ignore' });
    execSync('docker info', { stdio: 'ignore' });
    return false;
  } catch {
    return true;
  }
};

/**
 * Run a container and check if it starts successfully
 */
async function testContainerStartup(
  imageName: string,
  containerName: string,
  options: {
    env?: Record<string, string>;
    timeout?: number;
    checkProcess?: boolean;
  } = {}
): Promise<{ started: boolean; logs: string }> {
  const { env = {}, timeout = 10000, checkProcess = true } = options;

  // Build environment args
  const envArgs = Object.entries(env)
    .map(([key, value]) => `-e ${key}=${value}`)
    .join(' ');

  try {
    // Remove any existing container with the same name
    try {
      execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
    } catch {
      // Container doesn't exist, that's fine
    }

    // Start the container in detached mode
    execSync(`docker run -d --name ${containerName} ${envArgs} ${imageName}`, { stdio: 'pipe' });

    // Wait a bit for startup
    await new Promise((resolve) => setTimeout(resolve, Math.min(timeout, 3000)));

    // Check if container is still running
    let isRunning = false;
    if (checkProcess) {
      try {
        const status = execSync(`docker inspect -f '{{.State.Running}}' ${containerName}`, {
          encoding: 'utf-8',
        }).trim();
        isRunning = status === 'true';
      } catch {
        isRunning = false;
      }
    } else {
      // For short-lived processes, just check it started
      isRunning = true;
    }

    // Get logs
    let logs = '';
    try {
      logs = execSync(`docker logs ${containerName}`, { encoding: 'utf-8' });
    } catch {
      logs = '';
    }

    // Cleanup
    try {
      execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
    } catch {
      // Ignore cleanup errors
    }

    return { started: isRunning, logs };
  } catch (error) {
    // Cleanup on error
    try {
      execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
    } catch {
      // Ignore cleanup errors
    }

    return { started: false, logs: String(error) };
  }
}

describe.skipIf(shouldSkip())('Docker Startup Tests', () => {
  describe('Container Startup Verification', () => {
    // These tests require the images to be built first
    // They're skipped by default since building takes time

    it.skip('should verify api-gateway container starts', async () => {
      const result = await testContainerStartup(
        'orienter-api-gateway-test:latest',
        'test-api-gateway',
        {
          env: {
            API_GATEWAY_PORT: '4100',
            NODE_ENV: 'test',
          },
          timeout: 10000,
        }
      );

      expect(result.started).toBe(true);
      expect(result.logs).toContain('API Gateway');
    }, 30000);

    it.skip('should verify dashboard container starts', async () => {
      const result = await testContainerStartup(
        'orienter-dashboard-test:latest',
        'test-dashboard',
        {
          env: {
            DASHBOARD_PORT: '4098',
            NODE_ENV: 'test',
          },
          timeout: 10000,
        }
      );

      expect(result.started).toBe(true);
      expect(result.logs).toContain('Dashboard');
    }, 30000);
  });

  describe('Configuration', () => {
    it('should have Docker available', () => {
      const version = execSync('docker --version', { encoding: 'utf-8' });
      expect(version).toContain('Docker');
    });

    it('should be able to list images', () => {
      const output = execSync('docker images --format "{{.Repository}}"', { encoding: 'utf-8' });
      // Just verify the command works
      expect(typeof output).toBe('string');
    });
  });
});
