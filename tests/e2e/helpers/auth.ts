/**
 * E2E Test Authentication Helper
 *
 * Handles creating test users and getting authentication tokens
 * for E2E tests. Supports both fresh installs (setup flow) and
 * existing installations (login flow).
 */

// Default test credentials
export const TEST_USER = {
  username: 'e2e-test-admin',
  password: 'E2eTestPassword123!',
};

export interface AuthResult {
  token: string;
  username: string;
  isNewUser: boolean;
}

/**
 * Get an authenticated token for E2E tests.
 *
 * This function handles both scenarios:
 * 1. Fresh install (no users) - Creates the first admin user via setup
 * 2. Existing install - Logs in with test credentials
 *
 * @param baseUrl - The dashboard base URL (e.g., http://localhost:4098)
 * @param credentials - Optional custom credentials (defaults to TEST_USER)
 */
export async function getTestAuthToken(
  baseUrl: string,
  credentials: { username: string; password: string } = TEST_USER
): Promise<AuthResult> {
  // First, check if setup is required (no users exist)
  const setupCheckResponse = await fetch(`${baseUrl}/api/auth/setup-required`);

  if (!setupCheckResponse.ok) {
    throw new Error(`Failed to check setup status: ${setupCheckResponse.status}`);
  }

  const { setupRequired } = await setupCheckResponse.json();

  if (setupRequired) {
    // No users exist - create the first admin user via setup
    console.log('[E2E Auth] No users exist, creating test admin via setup...');

    const setupResponse = await fetch(`${baseUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: credentials.username,
        password: credentials.password,
      }),
    });

    if (!setupResponse.ok) {
      const error = await setupResponse.text();
      throw new Error(`Setup failed: ${setupResponse.status} - ${error}`);
    }

    const setupResult = await setupResponse.json();
    console.log(`[E2E Auth] Created test admin user: ${credentials.username}`);

    return {
      token: setupResult.token,
      username: setupResult.username || credentials.username,
      isNewUser: true,
    };
  }

  // Users exist - try to login with test credentials
  console.log('[E2E Auth] Users exist, attempting login...');

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: credentials.username,
      password: credentials.password,
    }),
  });

  if (loginResponse.ok) {
    const loginResult = await loginResponse.json();
    console.log(`[E2E Auth] Logged in as: ${credentials.username}`);

    return {
      token: loginResult.token,
      username: loginResult.username,
      isNewUser: false,
    };
  }

  // Login failed - might need to create a new test user
  // This only works if registration is enabled or we have admin access
  if (loginResponse.status === 401) {
    console.log('[E2E Auth] Login failed, test user may not exist');
    console.log('[E2E Auth] Note: Test user must be created manually or via initial setup');

    // Try to provide helpful error message
    throw new Error(
      `Cannot authenticate for E2E tests. ` +
        `Either run tests on a fresh install (no users), ` +
        `or ensure the test user "${credentials.username}" exists.`
    );
  }

  const errorText = await loginResponse.text();
  throw new Error(`Login failed: ${loginResponse.status} - ${errorText}`);
}

/**
 * Create an authenticated fetch function for making API requests.
 *
 * @param baseUrl - The dashboard base URL
 * @param token - JWT token from getTestAuthToken
 */
export function createAuthenticatedFetch(baseUrl: string, token: string) {
  return async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string>),
    };

    return fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
    });
  };
}

/**
 * Test auth helper class for managing test authentication.
 */
export class TestAuthHelper {
  private baseUrl: string;
  private token: string | null = null;
  private username: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Initialize authentication (creates user or logs in)
   */
  async init(credentials = TEST_USER): Promise<void> {
    const result = await getTestAuthToken(this.baseUrl, credentials);
    this.token = result.token;
    this.username = result.username;
  }

  /**
   * Get the current auth token
   */
  getToken(): string {
    if (!this.token) {
      throw new Error('Not authenticated. Call init() first.');
    }
    return this.token;
  }

  /**
   * Get the current username
   */
  getUsername(): string {
    if (!this.username) {
      throw new Error('Not authenticated. Call init() first.');
    }
    return this.username;
  }

  /**
   * Make an authenticated API request
   */
  async request(path: string, options: RequestInit = {}): Promise<Response> {
    const token = this.getToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string>),
    };

    return fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });
  }

  /**
   * Make an authenticated GET request and return JSON
   */
  async get<T = any>(path: string): Promise<T> {
    const response = await this.request(path);
    if (!response.ok) {
      throw new Error(`GET ${path} failed: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Make an authenticated POST request and return JSON
   */
  async post<T = any>(path: string, body: any): Promise<T> {
    const response = await this.request(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`POST ${path} failed: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Make an authenticated PUT request and return JSON
   */
  async put<T = any>(path: string, body: any): Promise<T> {
    const response = await this.request(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`PUT ${path} failed: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Make an authenticated DELETE request
   */
  async delete(path: string): Promise<void> {
    const response = await this.request(path, {
      method: 'DELETE',
    });
    if (!response.ok && response.status !== 204) {
      throw new Error(`DELETE ${path} failed: ${response.status}`);
    }
  }
}

/**
 * Singleton auth helper for tests that share authentication state
 */
let globalAuthHelper: TestAuthHelper | null = null;

export async function getGlobalAuthHelper(baseUrl: string): Promise<TestAuthHelper> {
  if (!globalAuthHelper || (globalAuthHelper as any).baseUrl !== baseUrl) {
    globalAuthHelper = new TestAuthHelper(baseUrl);
    await globalAuthHelper.init();
  }
  return globalAuthHelper;
}

/**
 * Reset the global auth helper (useful between test suites)
 */
export function resetGlobalAuthHelper(): void {
  globalAuthHelper = null;
}
