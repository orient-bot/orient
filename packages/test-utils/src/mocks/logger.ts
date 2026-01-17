/**
 * Mock Logger for testing
 *
 * Provides a no-op logger that tracks calls for assertions.
 */

import { vi } from 'vitest';

export interface MockLoggerCalls {
  info: unknown[][];
  warn: unknown[][];
  error: unknown[][];
  debug: unknown[][];
}

export interface MockLogger {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  getCalls: () => MockLoggerCalls;
  clearCalls: () => void;
}

/**
 * Create a mock logger for testing
 */
export function createMockLogger(): MockLogger {
  const calls: MockLoggerCalls = {
    info: [],
    warn: [],
    error: [],
    debug: [],
  };

  const mockInfo = vi.fn((...args: unknown[]) => {
    calls.info.push(args);
  });
  const mockWarn = vi.fn((...args: unknown[]) => {
    calls.warn.push(args);
  });
  const mockError = vi.fn((...args: unknown[]) => {
    calls.error.push(args);
  });
  const mockDebug = vi.fn((...args: unknown[]) => {
    calls.debug.push(args);
  });

  return {
    info: mockInfo,
    warn: mockWarn,
    error: mockError,
    debug: mockDebug,
    getCalls: () => ({ ...calls }),
    clearCalls: () => {
      calls.info = [];
      calls.warn = [];
      calls.error = [];
      calls.debug = [];
    },
  };
}

export interface MockServiceLogger extends MockLogger {
  startOperation: ReturnType<typeof vi.fn>;
}

/**
 * Create a mock service logger with startOperation support
 */
export function createMockServiceLogger(): MockServiceLogger {
  const mockLogger = createMockLogger();

  return {
    ...mockLogger,
    startOperation: vi.fn((_operationName: string) => ({
      success: vi.fn(),
      failure: vi.fn(),
    })),
  };
}
