/**
 * Secrets E2E Tests
 *
 * Tests the secrets management functionality end-to-end.
 * Covers API operations, encryption, and UI interactions.
 *
 * These tests automatically handle authentication by creating a test user
 * on fresh installations or logging in with existing credentials.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestAuthHelper } from '../helpers/auth';

const FEATURE_TESTS_ENABLED = process.env.RUN_FEATURE_TESTS === 'true';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:4098';

const describeOrSkip = FEATURE_TESTS_ENABLED ? describe : describe.skip;

describeOrSkip('Secrets E2E Tests', () => {
  let auth: TestAuthHelper;
  const testSecretKey = `e2e-test-secret-${Date.now()}`;
  const testSecretValue = 'e2e-test-value-12345';

  beforeAll(async () => {
    // Initialize authentication (creates user on fresh install or logs in)
    auth = new TestAuthHelper(DASHBOARD_URL);
    await auth.init();
    console.log(`[Secrets E2E] Authenticated as: ${auth.getUsername()}`);
  });

  describe('Secrets API - CRUD Operations', () => {
    it('should list secrets (may be empty initially)', async () => {
      const response = await auth.request('/api/secrets');
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('secrets');
      expect(Array.isArray(data.secrets)).toBe(true);
    });

    it('should create a new secret', async () => {
      const response = await auth.request(`/api/secrets/${testSecretKey}`, {
        method: 'PUT',
        body: JSON.stringify({
          value: testSecretValue,
          description: 'E2E test secret - safe to delete',
          category: 'e2e-test',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should retrieve the created secret (masked)', async () => {
      const response = await auth.request(`/api/secrets/${testSecretKey}`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.key).toBe(testSecretKey);
      // Value should be masked by default
      expect(data.value).toBe('********');
      expect(data.revealed).toBe(false);
    });

    it('should retrieve the secret with revealed value', async () => {
      const response = await auth.request(`/api/secrets/${testSecretKey}?reveal=true`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.key).toBe(testSecretKey);
      expect(data.value).toBe(testSecretValue);
      expect(data.revealed).toBe(true);
    });

    it('should update the secret', async () => {
      const updatedValue = 'updated-e2e-test-value';
      const response = await auth.request(`/api/secrets/${testSecretKey}`, {
        method: 'PUT',
        body: JSON.stringify({
          value: updatedValue,
          description: 'E2E test secret - UPDATED',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify the update
      const verifyResponse = await auth.request(`/api/secrets/${testSecretKey}?reveal=true`);
      const verifyData = await verifyResponse.json();
      expect(verifyData.value).toBe(updatedValue);
    });

    it('should list secrets and include the test secret', async () => {
      const response = await auth.request('/api/secrets');
      expect(response.status).toBe(200);

      const data = await response.json();
      const testSecret = data.secrets.find((s: any) => s.key === testSecretKey);
      expect(testSecret).toBeDefined();
      expect(testSecret.category).toBe('e2e-test');
    });

    it('should delete the secret', async () => {
      const response = await auth.request(`/api/secrets/${testSecretKey}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify deletion
      const verifyResponse = await auth.request(`/api/secrets/${testSecretKey}`);
      expect(verifyResponse.status).toBe(404);
    });
  });

  describe('Secrets Security', () => {
    it('should not expose secret values in list response', async () => {
      // Create a temporary secret
      const tempKey = `temp-secret-${Date.now()}`;
      await auth.request(`/api/secrets/${tempKey}`, {
        method: 'PUT',
        body: JSON.stringify({ value: 'sensitive-data-123' }),
      });

      // List secrets
      const listResponse = await auth.request('/api/secrets');
      const data = await listResponse.json();

      // Find our secret
      const secret = data.secrets.find((s: any) => s.key === tempKey);
      expect(secret).toBeDefined();

      // Value should NOT be present in list response
      expect(secret.value).toBeUndefined();

      // Cleanup
      await auth.request(`/api/secrets/${tempKey}`, { method: 'DELETE' });
    });

    it('should require authentication for secrets access', async () => {
      // Make request without auth token
      const response = await fetch(`${DASHBOARD_URL}/api/secrets`, {
        headers: { 'Content-Type': 'application/json' },
      });

      expect(response.status).toBe(401);
    });

    it('should reject invalid auth tokens', async () => {
      const response = await fetch(`${DASHBOARD_URL}/api/secrets`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid-token-12345',
        },
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Secrets Edge Cases', () => {
    it('should handle special characters in secret values', async () => {
      const specialKey = `special-char-${Date.now()}`;
      const specialValue = 'value with "quotes" and \'apostrophes\' and\nnewlines';

      await auth.request(`/api/secrets/${specialKey}`, {
        method: 'PUT',
        body: JSON.stringify({ value: specialValue }),
      });

      const response = await auth.request(`/api/secrets/${specialKey}?reveal=true`);
      const data = await response.json();
      expect(data.value).toBe(specialValue);

      // Cleanup
      await auth.request(`/api/secrets/${specialKey}`, { method: 'DELETE' });
    });

    it('should handle long secret values', async () => {
      const longKey = `long-value-${Date.now()}`;
      const longValue = 'x'.repeat(10000); // 10KB value

      await auth.request(`/api/secrets/${longKey}`, {
        method: 'PUT',
        body: JSON.stringify({ value: longValue }),
      });

      const response = await auth.request(`/api/secrets/${longKey}?reveal=true`);
      const data = await response.json();
      expect(data.value).toBe(longValue);

      // Cleanup
      await auth.request(`/api/secrets/${longKey}`, { method: 'DELETE' });
    });

    it('should return 404 for non-existent secrets', async () => {
      const response = await auth.request('/api/secrets/does-not-exist-12345');
      expect(response.status).toBe(404);
    });

    it('should require value when creating/updating secrets', async () => {
      const response = await auth.request('/api/secrets/test-key', {
        method: 'PUT',
        body: JSON.stringify({ description: 'No value provided' }),
      });

      expect(response.status).toBe(400);
    });
  });
});

// Export test scenarios for browser automation
export const secretsTestScenarios = {
  listSecrets: {
    description: 'View secrets list in dashboard',
    steps: [
      'Login to dashboard',
      'Navigate to Settings > Secrets',
      'Verify secrets table loads',
      'Check that secret values are masked',
    ],
    expectedOutcome: 'Secrets list displays with masked values',
  },

  createSecret: {
    description: 'Create a new secret via UI',
    steps: [
      'Navigate to Settings > Secrets',
      'Click "Add Secret" button',
      'Fill in secret name and value',
      'Select category (optional)',
      'Click Save',
      'Verify secret appears in list',
    ],
    expectedOutcome: 'New secret is created and shown in list',
  },

  editSecret: {
    description: 'Edit an existing secret',
    steps: [
      'Navigate to Settings > Secrets',
      'Click edit on existing secret',
      'Modify the value',
      'Click Save',
      'Verify changes are saved',
    ],
    expectedOutcome: 'Secret is updated successfully',
  },

  deleteSecret: {
    description: 'Delete a secret',
    steps: [
      'Navigate to Settings > Secrets',
      'Click delete on existing secret',
      'Confirm deletion in dialog',
      'Verify secret is removed from list',
    ],
    expectedOutcome: 'Secret is deleted and removed from list',
  },

  searchSecrets: {
    description: 'Search/filter secrets',
    steps: [
      'Navigate to Settings > Secrets',
      'Enter search term in filter',
      'Verify list is filtered',
      'Clear filter and verify full list returns',
    ],
    expectedOutcome: 'Secrets can be filtered by name/category',
  },
};
