/**
 * Eval Test Setup
 *
 * Setup file for eval tests run via Vitest.
 */

import { vi, afterEach } from 'vitest';

// Set test environment
process.env.NODE_ENV = 'test';

// Suppress console output during tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'info').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'debug').mockImplementation(() => {});

// Keep error output for debugging
// vi.spyOn(console, 'error').mockImplementation(() => {});

// Auto-reset mocks after each test
afterEach(() => {
  vi.clearAllMocks();
});
