/**
 * Utility Functions Module
 *
 * Shared utility functions used across all packages.
 */

import net from 'net';
import path from 'path';
import { homedir } from 'os';
import { createDedicatedServiceLogger } from '../logger/index.js';

const logger = createDedicatedServiceLogger('port-checker');

/**
 * Check if a port is available (not in use)
 */
export function isPortAvailable(port: number, host: string = '0.0.0.0'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        // Other errors - assume port is available
        resolve(true);
      }
    });

    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port, host);
  });
}

/**
 * Find an available port starting from the given port
 */
export async function findAvailablePort(startPort: number, maxAttempts = 10): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found in range ${startPort}-${startPort + maxAttempts - 1}`);
}

/**
 * Wait for a port to become available
 *
 * @param port - Port number to check
 * @param options - Configuration options
 * @returns true if port became available, false if timeout
 */
export async function waitForPort(
  port: number,
  options: {
    maxWaitMs?: number; // Maximum time to wait (default: 10000ms)
    checkIntervalMs?: number; // How often to check (default: 500ms)
    host?: string; // Host to check (default: 0.0.0.0)
  } = {}
): Promise<boolean> {
  const { maxWaitMs = 10000, checkIntervalMs = 500, host = '0.0.0.0' } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const available = await isPortAvailable(port, host);

    if (available) {
      return true;
    }

    logger.debug(`Port ${port} still in use, waiting...`, {
      elapsed: Date.now() - startTime,
      maxWait: maxWaitMs,
    });

    // Wait before next check
    await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
  }

  return false;
}

/**
 * Wait for multiple ports to become available
 *
 * @param ports - Array of port numbers to check
 * @param options - Configuration options
 * @returns Object mapping port to availability status
 */
export async function waitForPorts(
  ports: number[],
  options: {
    maxWaitMs?: number;
    checkIntervalMs?: number;
    host?: string;
  } = {}
): Promise<Record<number, boolean>> {
  const { maxWaitMs = 10000, checkIntervalMs = 500, host = '0.0.0.0' } = options;

  const startTime = Date.now();
  const results: Record<number, boolean> = {};

  // Initialize all as unavailable
  for (const port of ports) {
    results[port] = false;
  }

  while (Date.now() - startTime < maxWaitMs) {
    const pendingPorts = ports.filter((p) => !results[p]);

    if (pendingPorts.length === 0) {
      // All ports available
      return results;
    }

    // Check all pending ports in parallel
    const checks = await Promise.all(
      pendingPorts.map(async (port) => ({
        port,
        available: await isPortAvailable(port, host),
      }))
    );

    // Update results
    for (const { port, available } of checks) {
      if (available) {
        results[port] = true;
        logger.info(`Port ${port} is now available`, {
          elapsed: Date.now() - startTime,
        });
      }
    }

    // If all available, return early
    if (Object.values(results).every((v) => v)) {
      return results;
    }

    // Log progress
    const stillBlocked = ports.filter((p) => !results[p]);
    logger.debug(`Waiting for ports to become available`, {
      blocked: stillBlocked,
      elapsed: Date.now() - startTime,
      maxWait: maxWaitMs,
    });

    // Wait before next check
    await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
  }

  // Log which ports are still blocked
  const blockedPorts = ports.filter((p) => !results[p]);
  if (blockedPorts.length > 0) {
    logger.warn(`Timeout waiting for ports`, {
      blockedPorts,
      maxWaitMs,
    });
  }

  return results;
}

/**
 * Ensure ports are available before starting servers.
 * This handles the common case of nodemon restarts where
 * the previous process hasn't fully released ports yet.
 *
 * @param ports - Array of ports that need to be available
 * @throws Error if ports are still in use after timeout
 */
export async function ensurePortsAvailable(ports: number[]): Promise<void> {
  const results = await waitForPorts(ports, {
    maxWaitMs: 5000, // 5 second timeout
    checkIntervalMs: 200, // Check every 200ms
  });

  const blockedPorts = ports.filter((p) => !results[p]);

  if (blockedPorts.length > 0) {
    const msg =
      `Ports still in use after timeout: ${blockedPorts.join(', ')}. ` +
      `Try running: lsof -ti :${blockedPorts.join(' :')} | xargs kill -9`;
    throw new Error(msg);
  }

  logger.info('All required ports are available', { ports });
}

/**
 * Check if a port is in use
 */
export async function isPortInUse(port: number): Promise<boolean> {
  return !(await isPortAvailable(port));
}

// ============================================
// ORIENT_HOME PATHS
// ============================================

export function getOrientHome(): string {
  return process.env.ORIENT_HOME || path.join(homedir(), '.orient');
}

export function getUserSkillsPath(): string {
  return path.join(getOrientHome(), 'skills');
}

export function getUserAppsPath(): string {
  return path.join(getOrientHome(), 'apps');
}

export function getBuiltinSkillsPath(projectRoot?: string): string {
  const root = projectRoot || path.join(getOrientHome(), 'orient');
  return path.join(root, '.claude', 'skills');
}

export function getBuiltinAppsPath(projectRoot?: string): string {
  const root = projectRoot || path.join(getOrientHome(), 'orient');
  return path.join(root, 'apps');
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(deepClone) as T;
  }

  const cloned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    cloned[key] = deepClone(value);
  }
  return cloned as T;
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelayMs = 1000,
  maxDelayMs = 30000
): Promise<T> {
  let lastError: Error | undefined;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        await sleep(delay);
        delay = Math.min(delay * 2, maxDelayMs);
      }
    }
  }

  throw lastError;
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => fn(...args), delayMs);
  };
}

/**
 * Throttle a function
 */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  limitMs: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limitMs);
    }
  };
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

/**
 * Truncate a string to a maximum length
 */
export function truncate(str: string, maxLength: number, suffix = '...'): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Check if a value is a plain object
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Get environment variable with fallback
 */
export function getEnv(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback;
}

/**
 * Get required environment variable (throws if missing)
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
}

/**
 * Check if running in test
 */
export function isTest(): boolean {
  return process.env.NODE_ENV === 'test';
}
