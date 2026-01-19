/**
 * Integration Manifest Loader
 *
 * Dynamically loads INTEGRATION.yaml manifests from the catalog directory.
 * Provides a unified way to discover and load integration configurations.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { createServiceLogger } from '@orient/core';
import type { IntegrationManifest } from '../types/integration.js';
import { validateManifest } from '../types/integration.js';

const logger = createServiceLogger('integration-loader');

// Cache for loaded manifests
let manifestCache: Map<string, IntegrationManifest> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

/**
 * Get the catalog directory path
 */
function getCatalogDir(): string {
  return path.resolve(import.meta.dirname, '.');
}

/**
 * Load a single INTEGRATION.yaml manifest from a directory
 */
async function loadManifestFromDir(integrationDir: string): Promise<IntegrationManifest | null> {
  const manifestPath = path.join(integrationDir, 'INTEGRATION.yaml');

  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = yaml.load(content) as IntegrationManifest;

    // Validate the manifest
    const errors = validateManifest(manifest);
    if (errors.length > 0) {
      logger.warn('Invalid integration manifest', {
        path: manifestPath,
        errors,
      });
      return null;
    }

    return manifest;
  } catch (error) {
    logger.error('Failed to load integration manifest', {
      path: manifestPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Load all INTEGRATION.yaml manifests from the catalog directory.
 * Results are cached for performance.
 */
export async function loadIntegrationManifests(): Promise<IntegrationManifest[]> {
  const now = Date.now();

  // Return cached results if still valid
  if (manifestCache && now - cacheTimestamp < CACHE_TTL_MS) {
    return Array.from(manifestCache.values());
  }

  const op = logger.startOperation('loadIntegrationManifests');
  const catalogDir = getCatalogDir();
  const manifests: IntegrationManifest[] = [];

  try {
    // Read all directories in the catalog
    const entries = fs.readdirSync(catalogDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const integrationDir = path.join(catalogDir, entry.name);
        const manifest = await loadManifestFromDir(integrationDir);

        if (manifest) {
          manifests.push(manifest);
        }
      }
    }

    // Update cache
    manifestCache = new Map(manifests.map((m) => [m.name, m]));
    cacheTimestamp = now;

    op.success('Loaded integration manifests', {
      count: manifests.length,
      integrations: manifests.map((m) => m.name),
    });

    return manifests;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error));
    return [];
  }
}

/**
 * Load a specific integration manifest by name.
 */
export async function loadIntegrationManifest(name: string): Promise<IntegrationManifest | null> {
  // Check cache first
  if (manifestCache && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return manifestCache.get(name) || null;
  }

  // Load from file
  const catalogDir = getCatalogDir();
  const integrationDir = path.join(catalogDir, name);

  if (!fs.existsSync(integrationDir)) {
    logger.debug('Integration directory not found', { name });
    return null;
  }

  return loadManifestFromDir(integrationDir);
}

/**
 * Clear the manifest cache.
 * Useful when manifests are updated and need to be reloaded.
 */
export function clearManifestCache(): void {
  manifestCache = null;
  cacheTimestamp = 0;
  logger.debug('Manifest cache cleared');
}

/**
 * Get all available integration names from the catalog.
 */
export async function getAvailableIntegrations(): Promise<string[]> {
  const manifests = await loadIntegrationManifests();
  return manifests.map((m) => m.name);
}

/**
 * Check if an integration exists in the catalog.
 */
export async function integrationExists(name: string): Promise<boolean> {
  const manifest = await loadIntegrationManifest(name);
  return manifest !== null;
}
