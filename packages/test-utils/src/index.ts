/**
 * @orient/test-utils
 *
 * Shared test utilities for the Orient monorepo.
 *
 * This package provides:
 * - Mock objects for testing (logger, config, database)
 * - Factory functions for test data (JIRA issues, messages)
 * - Custom assertion helpers
 * - Database test utilities
 *
 * @example
 * ```typescript
 * import { createMockLogger, createJiraIssue } from '@orient/test-utils';
 *
 * describe('MyService', () => {
 *   it('should log on success', () => {
 *     const logger = createMockLogger();
 *     const issue = createJiraIssue({ key: 'TEST-1' });
 *     // ... test
 *     expect(logger.info).toHaveBeenCalled();
 *   });
 * });
 * ```
 */

export * from './mocks/index.js';
export * from './factories/index.js';
export * from './helpers/index.js';
