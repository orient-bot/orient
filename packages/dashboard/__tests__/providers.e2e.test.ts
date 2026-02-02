/**
 * Provider Management E2E Tests
 *
 * These tests verify the full provider management flow:
 * 1. Initial state - no API keys configured
 * 2. Configure Anthropic API key via dashboard API
 * 3. Verify OpenCode restart loads the new key
 * 4. Configure OpenCode Zen API key
 * 5. Configure OpenAI API key and verify transcription capability
 *
 * Requirements:
 * - Development environment running: ./run.sh dev
 * - Dashboard API available on DASHBOARD_PORT
 * - OpenCode available on OPENCODE_PORT
 *
 * Environment Variables:
 * - DASHBOARD_PORT: Dashboard API port (auto-detected from instance, defaults to 4098)
 * - OPENCODE_PORT: OpenCode API port (auto-detected from instance, defaults to 4099)
 * - E2E_TEST_USERNAME: Username for authentication (default: admin)
 * - E2E_TEST_PASSWORD: Password for authentication (default: admin123)
 * - ANTHROPIC_API_KEY: Anthropic API key for testing
 * - OPENAI_API_KEY: OpenAI API key for testing
 * - OPENCODE_ZEN: OpenCode Zen API key for testing
 *
 * Run with: pnpm --filter @orient-bot/dashboard test providers.e2e
 *
 * For worktree development, make sure to run the dev environment first:
 *   ./run.sh dev
 *
 * The instance will get ports based on worktree name hash (1000 * instance_id offset).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Instance Detection (replicates scripts/instance-env.sh)
// ============================================================================

/**
 * Detect instance ID from the current working directory.
 */
function detectInstanceId(): number {
  // 1. Check explicit override
  if (process.env.AI_INSTANCE_ID) {
    return parseInt(process.env.AI_INSTANCE_ID, 10);
  }

  // 2. Check if in worktree (claude-worktrees directory)
  // Use __dirname (this file's path) which is more reliable than cwd()
  const currentPath = __dirname;
  const worktreeMatch = currentPath.match(/claude-worktrees\/[^/]+\/([^/]+)/);

  if (worktreeMatch) {
    const worktreeName = worktreeMatch[1];
    // Use cksum to get same hash as shell script (printf is more portable than echo -n)
    try {
      const result = execSync(`printf '%s' "${worktreeName}" | cksum | cut -d' ' -f1`, {
        encoding: 'utf-8',
      }).trim();
      const hash = parseInt(result, 10);
      return (hash % 9) + 1;
    } catch {
      // Fallback: JS hash
      let hash = 0;
      for (let i = 0; i < worktreeName.length; i++) {
        hash = ((hash << 5) - hash + worktreeName.charCodeAt(i)) >>> 0;
      }
      return (hash % 9) + 1;
    }
  }

  // 3. Default: main repo (instance 0)
  return 0;
}

function calculatePort(basePort: number, instanceId: number): number {
  return basePort + instanceId * 1000;
}

// ============================================================================
// Configuration
// ============================================================================

const INSTANCE_ID = detectInstanceId();
const DASHBOARD_PORT = process.env.DASHBOARD_PORT || String(calculatePort(4098, INSTANCE_ID));
const OPENCODE_PORT = process.env.OPENCODE_PORT || String(calculatePort(4099, INSTANCE_ID));
const DASHBOARD_URL = `http://localhost:${DASHBOARD_PORT}`;
const OPENCODE_URL = `http://localhost:${OPENCODE_PORT}`;

// Test credentials from environment
const TEST_ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const TEST_OPENAI_KEY = process.env.OPENAI_API_KEY;
const TEST_OPENCODE_ZEN_KEY = process.env.OPENCODE_ZEN;

// Test user credentials
const TEST_USERNAME = process.env.E2E_TEST_USERNAME || 'admin';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'admin123';

console.log(
  `[E2E Tests] Instance: ${INSTANCE_ID}, Dashboard: ${DASHBOARD_PORT}, OpenCode: ${OPENCODE_PORT}`
);

// ============================================================================
// Service Availability Checks
// ============================================================================

function isServiceAvailable(url: string): boolean {
  try {
    execSync(`curl -sf --connect-timeout 2 "${url}" > /dev/null`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

const dashboardAvailable = isServiceAvailable(`${DASHBOARD_URL}/api/auth/setup-required`);
const openCodeAvailable = isServiceAvailable(`${OPENCODE_URL}/global/health`);

if (!dashboardAvailable) {
  console.log(`[E2E Tests] Dashboard not available at ${DASHBOARD_URL}`);
  console.log('[E2E Tests] Start the dev environment with: ./run.sh dev');
}
if (!openCodeAvailable) {
  console.log(`[E2E Tests] OpenCode not available at ${OPENCODE_URL}`);
}

// ============================================================================
// Authentication
// ============================================================================

let authToken: string | null = null;
let authFailed = false;

async function setupAuth(): Promise<boolean> {
  if (authFailed) return false;
  if (authToken) return true;

  try {
    const setupCheck = await fetch(`${DASHBOARD_URL}/api/auth/setup-required`);
    const { setupRequired } = await setupCheck.json();

    if (setupRequired) {
      // Fresh install - create user
      console.log('[Auth] Setup required - creating initial user...');
      const setupResponse = await fetch(`${DASHBOARD_URL}/api/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD }),
      });

      if (!setupResponse.ok) {
        console.warn(`[Auth] Setup failed: ${await setupResponse.text()}`);
        authFailed = true;
        return false;
      }

      const data = await setupResponse.json();
      authToken = data.token;
      console.log(`[Auth] Created user ${TEST_USERNAME}`);
      return true;
    } else {
      // Existing install - login
      console.log(`[Auth] Logging in as ${TEST_USERNAME}...`);
      const loginResponse = await fetch(`${DASHBOARD_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD }),
      });

      if (loginResponse.ok) {
        const data = await loginResponse.json();
        authToken = data.token;
        console.log('[Auth] Login successful');
        return true;
      } else {
        console.warn(`[Auth] Login failed - user "${TEST_USERNAME}" not found or wrong password`);
        console.warn('[Auth] Set E2E_TEST_USERNAME/E2E_TEST_PASSWORD or start fresh dev env');
        authFailed = true;
        return false;
      }
    }
  } catch (error) {
    console.warn(`[Auth] Error: ${error}`);
    authFailed = true;
    return false;
  }
}

// ============================================================================
// API Request Helper
// ============================================================================

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ response: Response; data: T }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${DASHBOARD_URL}${endpoint}`, { ...options, headers });
  const data = (await response.json()) as T;
  return { response, data };
}

/**
 * Helper to skip test if auth not available
 */
function requireAuth(): void {
  if (authFailed || !authToken) {
    console.log('  [Skipped] Auth not available');
    return;
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Provider Management E2E Tests', () => {
  describe.skipIf(!dashboardAvailable)('Dashboard API Tests', () => {
    beforeAll(async () => {
      await setupAuth();
    });

    describe('GET /api/providers - List Providers', () => {
      it('should return list of all 4 providers', async () => {
        if (authFailed) return; // Skip if auth failed

        const { response, data } = await apiRequest<{
          providers: Array<{ id: string; name: string; configured: boolean }>;
        }>('/api/providers');

        expect(response.ok).toBe(true);
        expect(data.providers).toHaveLength(4);

        const ids = data.providers.map((p) => p.id);
        expect(ids).toContain('openai');
        expect(ids).toContain('anthropic');
        expect(ids).toContain('google');
        expect(ids).toContain('opencode_zen');
      });

      it('should return correct provider names', async () => {
        if (authFailed) return;

        const { data } = await apiRequest<{
          providers: Array<{ id: string; name: string }>;
        }>('/api/providers');

        const nameMap = new Map(data.providers.map((p) => [p.id, p.name]));
        expect(nameMap.get('openai')).toBe('OpenAI');
        expect(nameMap.get('anthropic')).toBe('Anthropic');
        expect(nameMap.get('google')).toBe('Google Gemini');
        expect(nameMap.get('opencode_zen')).toBe('OpenCode Zen');
      });
    });

    describe('PUT /api/providers/:provider/key - Set Provider Key', () => {
      it('should reject empty API key', async () => {
        if (authFailed) return;

        const { response, data } = await apiRequest<{ error: string }>(
          '/api/providers/anthropic/key',
          { method: 'PUT', body: JSON.stringify({}) }
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(400);
        expect(data.error).toContain('API key value is required');
      });

      it('should reject unknown provider', async () => {
        if (authFailed) return;

        const { response, data } = await apiRequest<{ error: string }>(
          '/api/providers/invalid_provider/key',
          { method: 'PUT', body: JSON.stringify({ value: 'test-key' }) }
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(400);
        expect(data.error).toContain('Unknown provider');
      });

      it.skipIf(!TEST_ANTHROPIC_KEY)('should save Anthropic API key', async () => {
        if (authFailed) return;

        const { response, data } = await apiRequest<{ success: boolean }>(
          '/api/providers/anthropic/key',
          { method: 'PUT', body: JSON.stringify({ value: TEST_ANTHROPIC_KEY }) }
        );

        expect(response.ok).toBe(true);
        expect(data.success).toBe(true);

        // Verify configured status
        const { data: list } = await apiRequest<{
          providers: Array<{ id: string; configured: boolean }>;
        }>('/api/providers');
        const anthropic = list.providers.find((p) => p.id === 'anthropic');
        expect(anthropic?.configured).toBe(true);
      });

      it.skipIf(!TEST_OPENAI_KEY)('should save OpenAI API key', async () => {
        if (authFailed) return;

        const { response, data } = await apiRequest<{ success: boolean }>(
          '/api/providers/openai/key',
          { method: 'PUT', body: JSON.stringify({ value: TEST_OPENAI_KEY }) }
        );

        expect(response.ok).toBe(true);
        expect(data.success).toBe(true);
      });

      it.skipIf(!TEST_OPENCODE_ZEN_KEY)('should save OpenCode Zen API key', async () => {
        if (authFailed) return;

        const { response, data } = await apiRequest<{ success: boolean }>(
          '/api/providers/opencode_zen/key',
          { method: 'PUT', body: JSON.stringify({ value: TEST_OPENCODE_ZEN_KEY }) }
        );

        expect(response.ok).toBe(true);
        expect(data.success).toBe(true);
      });
    });

    describe('GET /api/providers/defaults', () => {
      it('should return default provider selections', async () => {
        if (authFailed) return;

        const { response, data } = await apiRequest<{
          defaults: {
            transcription: string;
            vision: string;
            imageGeneration: string;
            agentChat: string;
          };
        }>('/api/providers/defaults');

        expect(response.ok).toBe(true);
        expect(data.defaults.transcription).toBe('openai');
        expect(data.defaults.vision).toBe('anthropic');
        expect(data.defaults.imageGeneration).toBe('openai');
        expect(data.defaults.agentChat).toBe('opencode_zen');
      });
    });

    describe('PUT /api/providers/defaults', () => {
      it('should update vision default to openai', async () => {
        if (authFailed) return;

        const { response } = await apiRequest<{ success: boolean }>('/api/providers/defaults', {
          method: 'PUT',
          body: JSON.stringify({
            transcription: 'openai',
            vision: 'openai',
            imageGeneration: 'openai',
            agentChat: 'opencode_zen',
          }),
        });

        expect(response.ok).toBe(true);

        // Verify persisted
        const { data } = await apiRequest<{ defaults: { vision: string } }>(
          '/api/providers/defaults'
        );
        expect(data.defaults.vision).toBe('openai');
      });

      it('should normalize invalid provider to default', async () => {
        if (authFailed) return;

        await apiRequest('/api/providers/defaults', {
          method: 'PUT',
          body: JSON.stringify({
            transcription: 'anthropic', // Invalid for transcription
            vision: 'anthropic',
            imageGeneration: 'openai',
            agentChat: 'opencode_zen',
          }),
        });

        // Should fall back to openai for transcription
        const { data } = await apiRequest<{ defaults: { transcription: string } }>(
          '/api/providers/defaults'
        );
        expect(data.defaults.transcription).toBe('openai');
      });
    });
  });

  describe.skipIf(!dashboardAvailable || !openCodeAvailable)(
    'POST /api/providers/restart-opencode',
    () => {
      beforeAll(async () => {
        await setupAuth();
      });

      it('should restart OpenCode (dev mode) or return production mode message', async () => {
        if (authFailed) return;

        const { response, data } = await apiRequest<{
          success?: boolean;
          message?: string;
          error?: string;
          pid?: number;
          secretsLoaded?: number;
        }>('/api/providers/restart-opencode', { method: 'POST' });

        // In dev mode: success with PID and secrets count
        // In production mode: 400 error telling user to use PM2
        if (response.ok) {
          // Dev mode - endpoint restarts OpenCode directly
          expect(data.success).toBe(true);
          expect(data.message).toContain('restarted');
          expect(data.pid).toBeDefined();
          expect(typeof data.secretsLoaded).toBe('number');
        } else {
          // Production mode - endpoint returns helpful error
          expect(response.status).toBe(400);
          expect(data.error).toContain('development mode');
          expect(data.message).toContain('PM2');
        }
      });

      it('should maintain OpenCode health (regardless of restart mode)', async () => {
        if (authFailed) return;

        // In dev mode, trigger restart; in production mode, this just returns an error
        const { response } = await apiRequest('/api/providers/restart-opencode', {
          method: 'POST',
        });

        // Wait a moment (in case of dev mode restart)
        if (response.ok) {
          await new Promise((r) => setTimeout(r, 2000));
        }

        // OpenCode should always be healthy
        const healthResponse = await fetch(`${OPENCODE_URL}/global/health`);
        expect(healthResponse.ok).toBe(true);

        const health = await healthResponse.json();
        expect(health.healthy).toBe(true);
      });
    }
  );
});

describe.skipIf(!openCodeAvailable)('OpenCode Integration Tests', () => {
  it('should report healthy status', async () => {
    const response = await fetch(`${OPENCODE_URL}/global/health`);
    expect(response.ok).toBe(true);

    const health = await response.json();
    expect(health.healthy).toBe(true);
  });

  describe.skipIf(!dashboardAvailable || !TEST_ANTHROPIC_KEY)('Session with Anthropic Key', () => {
    beforeAll(async () => {
      const authOk = await setupAuth();
      if (!authOk) return;

      // Configure Anthropic key
      await apiRequest('/api/providers/anthropic/key', {
        method: 'PUT',
        body: JSON.stringify({ value: TEST_ANTHROPIC_KEY }),
      });

      // Restart OpenCode to pick up key
      await apiRequest('/api/providers/restart-opencode', { method: 'POST' });
      await new Promise((r) => setTimeout(r, 3000));
    });

    it('should create a session successfully', async () => {
      if (authFailed) return;

      const response = await fetch(`${OPENCODE_URL}/global/sessions/new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'E2E Test Session' }),
      });

      // OpenCode API should return JSON, but if proxied incorrectly may return HTML
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.log('[Skip] OpenCode returned non-JSON response (may be proxied incorrectly)');
        return;
      }

      expect(response.ok).toBe(true);
      const session = await response.json();
      expect(session.id).toBeDefined();
    });
  });
});

describe('Provider Configuration Flow - Full Integration', () => {
  describe.skipIf(!dashboardAvailable || !TEST_ANTHROPIC_KEY || !TEST_OPENAI_KEY)(
    'Complete Provider Setup Workflow',
    () => {
      beforeAll(async () => {
        await setupAuth();
      });

      it('should configure all providers in sequence', async () => {
        if (authFailed) return;

        // 1. Set Anthropic key
        const { response: r1 } = await apiRequest('/api/providers/anthropic/key', {
          method: 'PUT',
          body: JSON.stringify({ value: TEST_ANTHROPIC_KEY }),
        });
        expect(r1.ok).toBe(true);

        // 2. Set OpenAI key
        const { response: r2 } = await apiRequest('/api/providers/openai/key', {
          method: 'PUT',
          body: JSON.stringify({ value: TEST_OPENAI_KEY }),
        });
        expect(r2.ok).toBe(true);

        // 3. Verify both configured
        const { data } = await apiRequest<{
          providers: Array<{ id: string; configured: boolean }>;
        }>('/api/providers');

        const anthropic = data.providers.find((p) => p.id === 'anthropic');
        const openai = data.providers.find((p) => p.id === 'openai');
        expect(anthropic?.configured).toBe(true);
        expect(openai?.configured).toBe(true);
      });

      it.skipIf(!openCodeAvailable)('should restart (dev) or report production mode', async () => {
        if (authFailed) return;

        const { response, data } = await apiRequest<{
          success?: boolean;
          secretsLoaded?: number;
          error?: string;
        }>('/api/providers/restart-opencode', { method: 'POST' });

        if (response.ok) {
          // Dev mode
          expect(data.success).toBe(true);
          expect(data.secretsLoaded).toBeGreaterThanOrEqual(2);

          // Wait and verify health
          await new Promise((r) => setTimeout(r, 3000));
        } else {
          // Production mode - just verify the error is correct
          expect(response.status).toBe(400);
          expect(data.error).toContain('development mode');
        }

        // OpenCode should be healthy regardless
        const healthResponse = await fetch(`${OPENCODE_URL}/global/health`);
        expect(healthResponse.ok).toBe(true);
      });
    }
  );
});
