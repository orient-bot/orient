/**
 * Version Check Service
 *
 * Periodically checks for new Orient versions from a remote endpoint.
 * Features:
 * - Polls remote endpoint for latest version info
 * - Compares versions using semver
 * - Caches results to reduce API calls
 * - Graceful error handling (no crashes on network failure)
 */

import { createServiceLogger } from '@orientbot/core';
import * as fs from 'fs';
import * as path from 'path';

const logger = createServiceLogger('version-check-service');

// ============================================
// Types
// ============================================

export interface RemoteVersionInfo {
  version: string;
  releaseDate?: string;
  changelogUrl?: string;
  updateInstructions?: string;
}

export interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  changelogUrl: string;
  updateInstructions: string | null;
  lastChecked: Date;
  error?: string;
}

// ============================================
// Configuration
// ============================================

const DEFAULT_CHANGELOG_URL = 'https://github.com/orient-bot/orient/releases';
const DEFAULT_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour minimum between fetches

// Cache for version data
let versionCache: { data: VersionCheckResult; expiresAt: number } | null = null;

// ============================================
// Helper Functions
// ============================================

/**
 * Read current version from package.json
 */
function getCurrentVersion(): string {
  try {
    // Navigate from packages/dashboard to root package.json
    const possiblePaths = [
      path.resolve(__dirname, '../../../../package.json'), // From dist
      path.resolve(__dirname, '../../../../../package.json'), // From src
      path.resolve(process.cwd(), 'package.json'), // From cwd
    ];

    for (const pkgPath of possiblePaths) {
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === 'orient' && pkg.version) {
          return pkg.version;
        }
      }
    }

    logger.warn('Could not find root package.json, using fallback version');
    return '0.0.0';
  } catch (error) {
    logger.error('Failed to read package.json', { error });
    return '0.0.0';
  }
}

/**
 * Compare two semver versions
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
function compareSemver(a: string, b: string): number {
  const parseVersion = (v: string) => {
    const [main, prerelease] = v.split('-');
    const parts = main.split('.').map((n) => parseInt(n, 10) || 0);
    return { parts, prerelease };
  };

  const va = parseVersion(a);
  const vb = parseVersion(b);

  // Compare main version parts
  for (let i = 0; i < Math.max(va.parts.length, vb.parts.length); i++) {
    const partA = va.parts[i] || 0;
    const partB = vb.parts[i] || 0;
    if (partA < partB) return -1;
    if (partA > partB) return 1;
  }

  // If main versions are equal, check prerelease
  // A version without prerelease is greater than one with prerelease
  if (!va.prerelease && vb.prerelease) return 1;
  if (va.prerelease && !vb.prerelease) return -1;

  return 0;
}

/**
 * Fetch version info from remote endpoint
 */
async function fetchRemoteVersion(endpointUrl: string): Promise<RemoteVersionInfo | null> {
  const op = logger.startOperation('fetch-remote-version');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(endpointUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Orient-Version-Check',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as RemoteVersionInfo;

    if (!data.version || typeof data.version !== 'string') {
      throw new Error('Invalid version response: missing version field');
    }

    op.success('Remote version fetched', { version: data.version });
    return data;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Don't log aborted requests as errors (expected on timeout)
    if (errorMsg.includes('aborted')) {
      op.failure('Request timed out');
    } else {
      op.failure(errorMsg);
    }

    return null;
  }
}

// ============================================
// Version Check Service
// ============================================

export class VersionCheckService {
  private endpointUrl: string | null = null;
  private checkIntervalMs: number = DEFAULT_CHECK_INTERVAL_MS;
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor() {
    // Load config from environment
    this.endpointUrl = process.env.VERSION_CHECK_ENDPOINT || null;
    const intervalHours = parseInt(process.env.VERSION_CHECK_INTERVAL_HOURS || '6', 10);
    this.checkIntervalMs = intervalHours * 60 * 60 * 1000;
  }

  /**
   * Check if version checking is enabled (endpoint configured)
   */
  isEnabled(): boolean {
    return !!this.endpointUrl;
  }

  /**
   * Get the current running version
   */
  getCurrentVersion(): string {
    return getCurrentVersion();
  }

  /**
   * Check for version updates
   * Uses cache if available and not expired
   */
  async checkVersion(forceRefresh = false): Promise<VersionCheckResult> {
    const currentVersion = getCurrentVersion();

    // Return cached result if available and not forcing refresh
    if (!forceRefresh && versionCache && versionCache.expiresAt > Date.now()) {
      logger.debug('Returning cached version check result');
      return versionCache.data;
    }

    // If no endpoint configured, return current version info only
    if (!this.endpointUrl) {
      return {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        changelogUrl: DEFAULT_CHANGELOG_URL,
        updateInstructions: null,
        lastChecked: new Date(),
        error: 'Version check endpoint not configured',
      };
    }

    // Fetch remote version
    const remoteInfo = await fetchRemoteVersion(this.endpointUrl);

    if (!remoteInfo) {
      // Return cached data if available, otherwise return error state
      if (versionCache) {
        logger.debug('Using stale cache due to fetch failure');
        return {
          ...versionCache.data,
          error: 'Failed to check for updates (using cached data)',
        };
      }

      return {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        changelogUrl: DEFAULT_CHANGELOG_URL,
        updateInstructions: null,
        lastChecked: new Date(),
        error: 'Failed to check for updates',
      };
    }

    // Compare versions
    const updateAvailable = compareSemver(currentVersion, remoteInfo.version) < 0;

    const result: VersionCheckResult = {
      currentVersion,
      latestVersion: remoteInfo.version,
      updateAvailable,
      changelogUrl: remoteInfo.changelogUrl || DEFAULT_CHANGELOG_URL,
      updateInstructions: remoteInfo.updateInstructions || null,
      lastChecked: new Date(),
    };

    // Cache the result
    versionCache = {
      data: result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    if (updateAvailable) {
      logger.info('New version available', {
        currentVersion,
        latestVersion: remoteInfo.version,
      });
    }

    return result;
  }

  /**
   * Start periodic version checking
   */
  startPolling(): void {
    if (this.isPolling) {
      logger.debug('Polling already started');
      return;
    }

    if (!this.isEnabled()) {
      logger.info('Version check polling not started: endpoint not configured');
      return;
    }

    this.isPolling = true;

    // Do initial check
    this.checkVersion().catch((error) => {
      logger.warn('Initial version check failed', { error });
    });

    // Set up periodic checking
    this.pollTimer = setInterval(() => {
      this.checkVersion().catch((error) => {
        logger.warn('Periodic version check failed', { error });
      });
    }, this.checkIntervalMs);

    logger.info('Version check polling started', {
      intervalHours: this.checkIntervalMs / (60 * 60 * 1000),
      endpoint: this.endpointUrl,
    });
  }

  /**
   * Stop periodic version checking
   */
  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isPolling = false;
    logger.info('Version check polling stopped');
  }

  /**
   * Clear the version cache
   */
  clearCache(): void {
    versionCache = null;
    logger.debug('Version cache cleared');
  }

  /**
   * Get polling status
   */
  getStatus(): {
    enabled: boolean;
    polling: boolean;
    endpoint: string | null;
    intervalHours: number;
    currentVersion: string;
  } {
    return {
      enabled: this.isEnabled(),
      polling: this.isPolling,
      endpoint: this.endpointUrl,
      intervalHours: this.checkIntervalMs / (60 * 60 * 1000),
      currentVersion: getCurrentVersion(),
    };
  }
}

// ============================================
// Singleton Instance
// ============================================

let versionCheckService: VersionCheckService | null = null;

export function getVersionCheckService(): VersionCheckService {
  if (!versionCheckService) {
    versionCheckService = new VersionCheckService();
  }
  return versionCheckService;
}

export function createVersionCheckService(): VersionCheckService {
  return new VersionCheckService();
}
