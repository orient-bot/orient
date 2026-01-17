/**
 * Apps Service - Discovers and manages Mini-Apps from apps/
 *
 * Apps are AI-generated React applications that can be shared with users.
 * Each app is a directory containing an APP.yaml manifest and React source code.
 *
 * This service mirrors the SkillsService pattern for consistency.
 *
 * Exported via @orient/apps package.
 */

import fs from 'fs';
import path from 'path';
import { createServiceLogger } from '@orient/core';
import { App, AppManifest, AppSummary, AppStatus, validateAppManifest } from '../types.js';

const logger = createServiceLogger('apps-service');

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
  private appsPath: string;
  private appsCache: Map<string, App> = new Map();
  private initialized: boolean = false;

  constructor(projectRoot?: string) {
    // Default to the project root's apps directory
    const root = projectRoot || process.cwd();
    this.appsPath = path.join(root, 'apps');

    logger.info('Apps service created', { appsPath: this.appsPath });
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
      if (!fs.existsSync(this.appsPath)) {
        logger.warn('Apps directory not found', { path: this.appsPath });
        this.initialized = true;
        op.success('No apps directory found');
        return;
      }

      const entries = fs.readdirSync(this.appsPath, { withFileTypes: true });

      for (const entry of entries) {
        // Skip non-directories and special directories
        if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) {
          continue;
        }

        const appDir = path.join(this.appsPath, entry.name);
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
          const isBuilt =
            fs.existsSync(distPath) && fs.existsSync(path.join(distPath, 'index.html'));

          const app: App = {
            manifest,
            path: appDir,
            srcPath,
            distPath,
            isBuilt,
            status: isBuilt ? 'published' : 'draft',
          };

          this.appsCache.set(manifest.name, app);
          logger.debug('Loaded app', { name: manifest.name, isBuilt });
        } catch (error) {
          logger.warn('Failed to load app', {
            dir: entry.name,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      this.initialized = true;
      op.success('Apps initialized', { count: this.appsCache.size });
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
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
    }));
  }

  /**
   * Get a specific app by name
   * @param appName - The name of the app to retrieve
   * @returns The app or null if not found
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
   * Clears cache and re-initializes
   */
  async reload(): Promise<{ previous: number; current: number }> {
    const op = logger.startOperation('reloadApps');
    const previousCount = this.appsCache.size;

    try {
      // Clear cache and reset initialized flag
      this.appsCache.clear();
      this.initialized = false;

      // Re-initialize
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
   * Get apps by status
   */
  getAppsByStatus(status: AppStatus): App[] {
    return Array.from(this.appsCache.values()).filter((app) => app.status === status);
  }

  /**
   * Get apps that have a specific permission
   */
  getAppsWithPermission(category: string, access: 'read' | 'write'): App[] {
    return Array.from(this.appsCache.values()).filter((app) => {
      const permission =
        app.manifest.permissions[category as keyof typeof app.manifest.permissions];
      if (!permission || typeof permission !== 'object' || Array.isArray(permission)) return false;
      const perm = permission as { read: boolean; write: boolean };
      return access === 'read' ? perm.read : perm.write;
    });
  }

  /**
   * Get apps that have a specific capability enabled
   */
  getAppsWithCapability(capability: 'scheduler' | 'webhooks'): App[] {
    return Array.from(this.appsCache.values()).filter((app) => {
      const cap = app.manifest.capabilities[capability];
      return cap?.enabled === true;
    });
  }

  /**
   * Get the apps directory path
   */
  getAppsPath(): string {
    return this.appsPath;
  }

  /**
   * Validate manifest content before creating a PR
   * @param content - The raw APP.yaml content
   * @returns Validation result with any errors
   */
  validateManifestContent(content: string): { valid: boolean; errors?: string[] } {
    try {
      const parsed = parseYaml(content);
      return validateAppManifest(parsed);
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`],
      };
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
