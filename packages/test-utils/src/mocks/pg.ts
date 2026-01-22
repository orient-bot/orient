/**
 * PostgreSQL Mock for Testing
 */

import { vi, type Mock } from 'vitest';

export interface MockQueryResult<T = any> {
  rows: T[];
  rowCount: number;
  command?: string;
  oid?: number;
  fields?: any[];
}

export interface MockPoolClient {
  query: Mock<(sql: string, params?: any[]) => Promise<MockQueryResult>>;
  release: Mock;
}

export interface MockPgPool {
  query: Mock<(sql: string, params?: any[]) => Promise<MockQueryResult>>;
  connect: Mock<() => Promise<MockPoolClient>>;
  end: Mock;
  on: Mock;
  removeListener: Mock;
}

/**
 * Create a mock PostgreSQL Pool
 */
export function createMockPgPool(defaultRows: any[] = []): MockPgPool {
  const mockClient: MockPoolClient = {
    query: vi.fn().mockResolvedValue({ rows: defaultRows, rowCount: defaultRows.length }),
    release: vi.fn(),
  };

  const pool: MockPgPool = {
    query: vi.fn().mockResolvedValue({ rows: defaultRows, rowCount: defaultRows.length }),
    connect: vi.fn().mockResolvedValue(mockClient),
    end: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    removeListener: vi.fn(),
  };

  return pool;
}

/**
 * Create a mock PostgreSQL client
 */
export function createMockPgClient(defaultRows: any[] = []): MockPoolClient {
  return {
    query: vi.fn().mockResolvedValue({ rows: defaultRows, rowCount: defaultRows.length }),
    release: vi.fn(),
  };
}

/**
 * Helper to set up query responses for specific SQL patterns
 */
export function setupQueryMock(
  pool: MockPgPool,
  sqlPattern: string | RegExp,
  response: MockQueryResult | Error
): void {
  pool.query.mockImplementation((sql: string) => {
    const matches =
      typeof sqlPattern === 'string' ? sql.includes(sqlPattern) : sqlPattern.test(sql);

    if (matches) {
      if (response instanceof Error) {
        return Promise.reject(response);
      }
      return Promise.resolve(response);
    }

    // Default response
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}
