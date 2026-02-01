/**
 * Apps Service - Discovers and manages Mini-Apps from apps/
 *
 * Apps are AI-generated React applications that can be shared with users.
 * Each app is a directory containing an APP.yaml manifest and React source code.
 */

import fs from 'fs';
import path from 'path';
import { createServiceLogger, getBuiltinAppsPath, getUserAppsPath } from '@orient-bot/core';
import { type AppManifest, type AppStatus, validateAppManifest } from '@orient-bot/apps';

const logger = createServiceLogger('apps-service');

// ============================================
// APP TYPES (local since we can't import from src/)
// ============================================

export interface App {
  manifest: AppManifest;
  path: string;
  srcPath: string;
  distPath: string;
  isBuilt: boolean;
  shareToken?: string;
  status: AppStatus;
  source: 'builtin' | 'user';
  createdAt?: Date;
  updatedAt?: Date;
  publishedAt?: Date;
}

export interface AppSummary {
  name: string;
  title: string;
  description: string;
  version: string;
  status: AppStatus;
  isBuilt: boolean;
  author?: string;
  source: 'builtin' | 'user';
  permissions?: Record<string, { read: boolean; write: boolean }>;
  capabilities?: {
    scheduler?: { enabled: boolean };
    webhooks?: { enabled: boolean };
    storage?: { enabled: boolean };
  };
}

// ============================================
// YAML PARSING (simple implementation)
// ============================================

/**
 * Parse a simple YAML file (for APP.yaml manifests)
 * Supports basic key-value pairs and nested objects
 */
function parseYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');
  const stack: { obj: Record<string, unknown>; indent: number }[] = [{ obj: result, indent: -1 }];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Calculate indentation
    const indent = line.search(/\S/);

    // Pop stack to find parent at correct indent level
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const current = stack[stack.length - 1].obj;

    // Parse key-value
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.substring(0, colonIndex).trim();
    const value = trimmed.substring(colonIndex + 1).trim();

    if (value === '') {
      // Nested object
      current[key] = {};
      stack.push({ obj: current[key] as Record<string, unknown>, indent });
    } else if (value.startsWith('[') && value.endsWith(']')) {
      // Inline array
      const items = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim());
      current[key] = items.filter((s) => s.length > 0);
    } else if (value === 'true') {
      current[key] = true;
    } else if (value === 'false') {
      current[key] = false;
    } else if (!isNaN(Number(value))) {
      current[key] = Number(value);
    } else {
      current[key] = value;
    }
  }

  return result;
}

// ============================================
// APPS SERVICE
// ============================================

export class AppsService {
  private builtinAppsPath: string;
  private userAppsPath: string;
  private appsCache: Map<string, App> = new Map();
  private initialized: boolean = false;

  constructor(projectRoot?: string) {
    this.builtinAppsPath = getBuiltinAppsPath(projectRoot);
    this.userAppsPath = getUserAppsPath();

    if (!projectRoot && !fs.existsSync(this.builtinAppsPath)) {
      const fallbackRoot = this.resolveFallbackRoot();
      this.builtinAppsPath = path.join(fallbackRoot, 'apps');
    }

    logger.info('Apps service created', {
      builtinAppsPath: this.builtinAppsPath,
      userAppsPath: this.userAppsPath,
      exists: fs.existsSync(this.builtinAppsPath),
      cwd: process.cwd(),
    });
  }

  /**
   * Initialize the service by discovering available apps
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const op = logger.startOperation('initializeApps');

    try {
      if (!fs.existsSync(this.userAppsPath)) {
        fs.mkdirSync(this.userAppsPath, { recursive: true });
      }

      this.scanDirectory(this.builtinAppsPath, 'builtin');
      this.scanDirectory(this.userAppsPath, 'user');

      this.initialized = true;
      op.success('Apps initialized', { count: this.appsCache.size });
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Build permissions object from manifest permissions
   */
  private buildPermissionsObject(
    permissions: Record<string, unknown>
  ): Record<string, { read: boolean; write: boolean }> | undefined {
    const result: Record<string, { read: boolean; write: boolean }> = {};
    let hasPermissions = false;

    for (const [key, value] of Object.entries(permissions)) {
      if (key !== 'tools' && value && typeof value === 'object' && !Array.isArray(value)) {
        const perm = value as { read?: boolean; write?: boolean };
        if (perm.read !== undefined || perm.write !== undefined) {
          result[key] = { read: !!perm.read, write: !!perm.write };
          hasPermissions = true;
        }
      }
    }

    return hasPermissions ? result : undefined;
  }

  /**
   * Build capabilities object from manifest capabilities
   */
  private buildCapabilitiesObject(
    capabilities: AppManifest['capabilities']
  ): AppSummary['capabilities'] | undefined {
    if (!capabilities) return undefined;

    const result: NonNullable<AppSummary['capabilities']> = {};

    if (capabilities.scheduler) {
      result.scheduler = { enabled: capabilities.scheduler.enabled };
    }
    if (capabilities.webhooks) {
      result.webhooks = { enabled: capabilities.webhooks.enabled };
    }
    if (capabilities.storage) {
      result.storage = { enabled: capabilities.storage.enabled };
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Get list of all available apps with their summaries
   */
  listApps(): AppSummary[] {
    if (!this.initialized) {
      logger.warn('Apps service not initialized, returning empty list');
      return [];
    }

    return Array.from(this.appsCache.values()).map((app) => ({
      name: app.manifest.name,
      title: app.manifest.title,
      description: app.manifest.description,
      version: app.manifest.version,
      status: app.status,
      isBuilt: app.isBuilt,
      author: app.manifest.author,
      source: app.source,
      permissions: this.buildPermissionsObject(app.manifest.permissions),
      capabilities: this.buildCapabilitiesObject(app.manifest.capabilities),
    }));
  }

  /**
   * Get a specific app by name
   */
  getApp(appName: string): App | null {
    if (!this.initialized) {
      logger.warn('Apps service not initialized');
      return null;
    }

    const app = this.appsCache.get(appName);

    if (!app) {
      // Try case-insensitive match
      for (const [name, a] of this.appsCache.entries()) {
        if (name.toLowerCase() === appName.toLowerCase()) {
          return a;
        }
      }

      logger.debug('App not found', { appName });
      return null;
    }

    return app;
  }

  /**
   * Check if an app exists
   */
  hasApp(appName: string): boolean {
    return this.getApp(appName) !== null;
  }

  /**
   * Get the number of loaded apps
   */
  get appCount(): number {
    return this.appsCache.size;
  }

  /**
   * Force reload all apps from disk
   */
  async reload(): Promise<{ previous: number; current: number }> {
    const op = logger.startOperation('reloadApps');
    const previousCount = this.appsCache.size;

    try {
      this.appsCache.clear();
      this.initialized = false;
      await this.initialize();

      const currentCount = this.appsCache.size;
      op.success('Apps reloaded', { previous: previousCount, current: currentCount });

      return { previous: previousCount, current: currentCount };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Get the apps directory path
   */
  getAppsPath(): string {
    return this.userAppsPath;
  }

  private resolveFallbackRoot(): string {
    // Strategy 1: APPS_PATH env var
    if (process.env.APPS_PATH) {
      return process.env.APPS_PATH.replace(/\/apps$/, '');
    }

    // Strategy 2: Calculate from this file's location (ESM)
    try {
      const thisFilePath = new URL(import.meta.url).pathname;
      return path.resolve(path.dirname(thisFilePath), '../../../../');
    } catch {
      // Strategy 3: Walk up from cwd looking for apps directory
      let root = process.cwd();
      for (let i = 0; i < 5 && !fs.existsSync(path.join(root, 'apps')); i++) {
        const parent = path.dirname(root);
        if (parent === root) break;
        root = parent;
      }
      return root;
    }
  }

  private scanDirectory(dir: string, source: 'builtin' | 'user'): void {
    if (!fs.existsSync(dir)) {
      logger.debug('Apps directory not found', { path: dir, source });
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip non-directories and special directories
      if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) {
        continue;
      }

      const appDir = path.join(dir, entry.name);
      const manifestFile = path.join(appDir, 'APP.yaml');

      if (!fs.existsSync(manifestFile)) {
        logger.debug('No APP.yaml in directory', { dir: entry.name });
        continue;
      }

      try {
        const manifestContent = fs.readFileSync(manifestFile, 'utf-8');
        const parsedManifest = parseYaml(manifestContent);
        const validation = validateAppManifest(parsedManifest);

        if (!validation.valid) {
          logger.warn('Invalid app manifest', {
            dir: entry.name,
            errors: validation.errors,
          });
          continue;
        }

        const manifest = validation.data!;
        const srcPath = path.join(appDir, 'src');
        const distPath = path.join(appDir, manifest.build.output);
        const isBuilt = fs.existsSync(distPath) && fs.existsSync(path.join(distPath, 'index.html'));

        const app: App = {
          manifest,
          path: appDir,
          srcPath,
          distPath,
          isBuilt,
          status: isBuilt ? 'published' : 'draft',
          source,
        };

        this.appsCache.set(manifest.name, app);
        logger.debug('Loaded app', { name: manifest.name, isBuilt, source });
      } catch (error) {
        logger.warn('Failed to load app', {
          dir: entry.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

/**
 * Create and initialize an AppsService instance
 */
export async function createAppsService(projectRoot?: string): Promise<AppsService> {
  const service = new AppsService(projectRoot);
  await service.initialize();
  return service;
}
