/**
 * Database Test Helpers
 */

import { vi, type Mock } from 'vitest';

export interface MockDatabaseClient {
  select: Mock;
  insert: Mock;
  update: Mock;
  delete: Mock;
  from: Mock;
  where: Mock;
  values: Mock;
  set: Mock;
  orderBy: Mock;
  limit: Mock;
  execute: Mock;
}

/**
 * Create a mock database client
 */
export function createMockDatabase(): MockDatabaseClient {
  const mock: MockDatabaseClient = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    values: vi.fn(),
    set: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    execute: vi.fn().mockResolvedValue([]),
  };

  // Chain methods return the mock
  mock.select.mockReturnValue(mock);
  mock.insert.mockReturnValue(mock);
  mock.update.mockReturnValue(mock);
  mock.delete.mockReturnValue(mock);
  mock.from.mockReturnValue(mock);
  mock.where.mockReturnValue(mock);
  mock.values.mockReturnValue(mock);
  mock.set.mockReturnValue(mock);
  mock.orderBy.mockReturnValue(mock);
  mock.limit.mockReturnValue(mock);

  return mock;
}

/**
 * Setup for database tests that need actual DB connection
 */
export function skipIfNoDatabase(): boolean {
  return !process.env.DATABASE_URL && !process.env.TEST_DATABASE_URL;
}

/**
 * Get test database URL
 */
export function getTestDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';
}
