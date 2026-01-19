/**
 * Tests for Integration Manifest Loader
 *
 * These tests verify the manifest loader behavior. Since the loader
 * uses file system operations, we test the actual implementation with
 * real YAML files in the catalog directory.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadIntegrationManifests,
  loadIntegrationManifest,
  clearManifestCache,
} from '../src/catalog/loader.js';

describe('Integration Manifest Loader', () => {
  beforeEach(() => {
    clearManifestCache();
  });

  describe('loadIntegrationManifests', () => {
    it('should load manifests from catalog directory', async () => {
      const manifests = await loadIntegrationManifests();

      // Should load at least some manifests (Google, GitHub, JIRA, Linear exist)
      expect(manifests.length).toBeGreaterThan(0);
    });

    it('should return manifests with required fields', async () => {
      const manifests = await loadIntegrationManifests();

      for (const manifest of manifests) {
        expect(manifest).toHaveProperty('name');
        expect(manifest).toHaveProperty('title');
        expect(manifest).toHaveProperty('description');
        expect(manifest).toHaveProperty('version');
        expect(manifest).toHaveProperty('status');
        expect(manifest).toHaveProperty('tools');
        expect(Array.isArray(manifest.tools)).toBe(true);
      }
    });

    it('should include Google integration manifest', async () => {
      const manifests = await loadIntegrationManifests();
      const google = manifests.find((m) => m.name === 'google');

      expect(google).toBeDefined();
      expect(google?.title).toBe('Google Workspace');
      expect(google?.oauth?.type).toBe('oauth2-pkce');
    });

    it('should include GitHub integration manifest', async () => {
      const manifests = await loadIntegrationManifests();
      const github = manifests.find((m) => m.name === 'github');

      expect(github).toBeDefined();
      expect(github?.title).toBe('GitHub');
    });

    it('should include JIRA integration manifest with authMethods', async () => {
      const manifests = await loadIntegrationManifests();
      const jira = manifests.find((m) => m.name === 'jira');

      expect(jira).toBeDefined();
      expect(jira?.authMethods).toBeDefined();
      expect(jira?.authMethods?.length).toBeGreaterThan(1);
    });

    it('should include Linear integration manifest', async () => {
      const manifests = await loadIntegrationManifests();
      const linear = manifests.find((m) => m.name === 'linear');

      expect(linear).toBeDefined();
      expect(linear?.title).toBe('Linear');
    });

    it('should cache results on subsequent calls', async () => {
      // First call
      const manifests1 = await loadIntegrationManifests();
      // Second call (should use cache)
      const manifests2 = await loadIntegrationManifests();

      // Should return same data
      expect(manifests1.length).toBe(manifests2.length);
      expect(manifests1[0]?.name).toBe(manifests2[0]?.name);
    });
  });

  describe('loadIntegrationManifest', () => {
    it('should load a specific manifest by name', async () => {
      const manifest = await loadIntegrationManifest('google');

      expect(manifest).not.toBeNull();
      expect(manifest?.name).toBe('google');
      expect(manifest?.title).toBe('Google Workspace');
    });

    it('should return null for non-existent integration', async () => {
      const manifest = await loadIntegrationManifest('nonexistent-integration');

      expect(manifest).toBeNull();
    });

    it('should return GitHub manifest', async () => {
      const manifest = await loadIntegrationManifest('github');

      expect(manifest).not.toBeNull();
      expect(manifest?.name).toBe('github');
    });

    it('should return JIRA manifest with dual auth', async () => {
      const manifest = await loadIntegrationManifest('jira');

      expect(manifest).not.toBeNull();
      expect(manifest?.name).toBe('jira');
      expect(manifest?.authMethods).toBeDefined();

      const apiTokenMethod = manifest?.authMethods?.find((m) => m.type === 'api_token');
      expect(apiTokenMethod).toBeDefined();
      expect(apiTokenMethod?.requiredFields).toContain('JIRA_HOST');

      const oauthMethod = manifest?.authMethods?.find((m) => m.type === 'oauth2');
      expect(oauthMethod).toBeDefined();
      expect(oauthMethod?.requiredFields).toContain('JIRA_OAUTH_CLIENT_ID');
    });
  });

  describe('clearManifestCache', () => {
    it('should clear the cache without error', () => {
      expect(() => clearManifestCache()).not.toThrow();
    });

    it('should force reload after cache clear', async () => {
      // Load manifests
      const manifests1 = await loadIntegrationManifests();

      // Clear cache
      clearManifestCache();

      // Load again (should reload)
      const manifests2 = await loadIntegrationManifests();

      // Should still have same data (just reloaded)
      expect(manifests2.length).toBe(manifests1.length);
    });
  });

  describe('manifest validation', () => {
    it('should have valid requiredSecrets for each manifest', async () => {
      const manifests = await loadIntegrationManifests();

      for (const manifest of manifests) {
        expect(manifest.requiredSecrets).toBeDefined();
        expect(Array.isArray(manifest.requiredSecrets)).toBe(true);

        for (const secret of manifest.requiredSecrets) {
          expect(secret).toHaveProperty('name');
          expect(secret).toHaveProperty('description');
        }
      }
    });

    it('should have valid tools for each manifest', async () => {
      const manifests = await loadIntegrationManifests();

      for (const manifest of manifests) {
        expect(manifest.tools).toBeDefined();
        expect(Array.isArray(manifest.tools)).toBe(true);

        for (const tool of manifest.tools) {
          expect(tool).toHaveProperty('name');
          expect(tool).toHaveProperty('description');
        }
      }
    });
  });
});
