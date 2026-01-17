/**
 * Custom Test Assertions
 */

import { expect } from 'vitest';

/**
 * Assert that an async function throws an error with a specific message
 */
export async function expectAsyncError(
  fn: () => Promise<unknown>,
  messageContains: string
): Promise<void> {
  let error: Error | null = null;
  try {
    await fn();
  } catch (e) {
    error = e as Error;
  }
  expect(error).not.toBeNull();
  expect(error?.message).toContain(messageContains);
}

/**
 * Assert that an object has specific keys
 */
export function expectHasKeys(obj: Record<string, unknown>, keys: string[]): void {
  for (const key of keys) {
    expect(obj).toHaveProperty(key);
  }
}

/**
 * Assert that an array contains objects with specific properties
 */
export function expectArrayContainsObjectWith<T>(array: T[], partialObject: Partial<T>): void {
  const found = array.find((item) => {
    for (const [key, value] of Object.entries(partialObject)) {
      if ((item as Record<string, unknown>)[key] !== value) {
        return false;
      }
    }
    return true;
  });
  expect(found).toBeDefined();
}
