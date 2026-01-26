# Test Patterns

This document provides code templates for writing tests in the Orient monorepo.

## Monorepo Testing Overview

```
packages/
├── core/           → Unit tests with vitest
├── database/       → Schema + integration tests
├── mcp-tools/      → Tool registry tests
├── test-utils/     → Shared mocks and factories (import in tests)
├── bot-whatsapp/   → Handler tests
├── bot-slack/      → Handler tests
└── api-gateway/    → Service tests

tests/
├── contracts/      → Package API stability tests
├── e2e/           → End-to-end system tests
└── integration/   → Cross-package integration tests
```

## Using @orientbot/test-utils

Always use the shared test utilities package:

```typescript
import {
  createMockLogger,
  createMockConfig,
  createJiraIssue,
  createWhatsAppMessage,
  expectAsyncError,
  skipIfNoDatabase,
} from '@orientbot/test-utils';
```

## Package Unit Test Template

Use this template for testing package-level logic:

```typescript
/**
 * Unit Tests for [ServiceName]
 *
 * @package @orientbot/[package-name]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockLogger, createMockConfig } from '@orientbot/test-utils';

// Import module under test
import { ServiceName } from '../serviceName.js';

describe('ServiceName', () => {
  let service: ServiceName;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = createMockLogger();
    service = new ServiceName(mockLogger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('methodName', () => {
    it('should do something when condition is met', async () => {
      // Arrange
      const input = { key: 'value' };

      // Act
      const result = await service.methodName(input);

      // Assert
      expect(result).toBeDefined();
      expect(result.property).toBe('expected');
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should throw error when input is invalid', async () => {
      await expect(service.methodName(null)).rejects.toThrow('Expected error message');
    });
  });
});
```

## Contract Test Template

Use this to verify package API stability:

```typescript
/**
 * Contract Tests for @orientbot/[package-name]
 *
 * These tests verify that the public API remains stable.
 * If any of these tests fail, it indicates a breaking change.
 */

import { describe, it, expect } from 'vitest';

describe('@orientbot/[package-name] Public API Contract', () => {
  describe('Exported Functions', () => {
    it('should export functionName', async () => {
      const { functionName } = await import('@orientbot/[package-name]');
      expect(typeof functionName).toBe('function');
    });
  });

  describe('Exported Classes', () => {
    it('should export ClassName', async () => {
      const { ClassName } = await import('@orientbot/[package-name]');
      expect(ClassName).toBeDefined();
      expect(typeof ClassName).toBe('function');
    });
  });

  describe('Functionality', () => {
    it('should maintain expected behavior', async () => {
      const { functionName } = await import('@orientbot/[package-name]');
      const result = functionName('input');
      expect(result).toMatchObject({ expectedKey: expect.any(String) });
    });
  });
});
```

## MCP Tool Test Template

Use this for testing MCP tool handlers:

```typescript
/**
 * Tests for [ToolName] MCP Tool
 *
 * @package @orientbot/mcp-tools
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockLogger, createJiraIssue } from '@orientbot/test-utils';

// Mock external dependencies
vi.mock('jira.js', () => ({
  Version3Client: vi.fn().mockImplementation(() => ({
    issueSearch: {
      searchForIssuesUsingJql: vi.fn(),
    },
  })),
}));

import { ToolName } from '../tools/tool-name.js';

describe('ToolName', () => {
  let tool: ToolName;
  let mockJiraClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJiraClient = {
      issueSearch: {
        searchForIssuesUsingJql: vi.fn(),
      },
    };
    tool = new ToolName();
  });

  describe('execute', () => {
    it('should return formatted issues', async () => {
      const mockIssue = createJiraIssue({ key: 'TEST-1' });
      mockJiraClient.issueSearch.searchForIssuesUsingJql.mockResolvedValue({
        issues: [mockIssue],
        total: 1,
      });

      const result = await tool.execute({ limit: 10 }, mockJiraClient);

      expect(result.content).toContain('TEST-1');
    });

    it('should handle empty results', async () => {
      mockJiraClient.issueSearch.searchForIssuesUsingJql.mockResolvedValue({
        issues: [],
        total: 0,
      });

      const result = await tool.execute({ limit: 10 }, mockJiraClient);

      expect(result.content).toContain('No issues found');
    });
  });
});
```

## E2E Test Template

Use this for end-to-end system tests:

```typescript
/**
 * E2E Tests for [Feature]
 *
 * These tests run against real external services.
 * Requires environment variables to be set.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { skipIfNoDatabase, getTestDatabaseUrl } from '@orientbot/test-utils';

const skipTests = skipIfNoDatabase();

describe.skipIf(skipTests)('[Feature] E2E', () => {
  beforeAll(async () => {
    // Setup: connect to services, seed data
  });

  afterAll(async () => {
    // Cleanup: remove test data, disconnect
  });

  it('should complete full flow', async () => {
    // 1. Setup initial state
    // 2. Trigger action
    // 3. Verify final state
  });
});

// Always include some unit tests that don't require external services
describe('[Feature] Unit', () => {
  it('should validate input format', () => {
    const validInput = '...';
    expect(validateInput(validInput)).toBe(true);
  });
});
```

## Database Test Template

Use this for database operations:

```typescript
/**
 * Database Tests for [Entity]
 *
 * @package @orientbot/database
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { skipIfNoDatabase, createMockDatabase } from '@orientbot/test-utils';

const SKIP_DB_TESTS = skipIfNoDatabase();

// Unit tests with mock database
describe('[Entity] Database Operations (Mock)', () => {
  it('should build correct query', () => {
    const db = createMockDatabase();

    db.select.mockReturnThis();
    db.from.mockReturnThis();
    db.where.mockReturnThis();
    db.execute.mockResolvedValue([{ id: '1' }]);

    // Test query building
    expect(db.select).toHaveBeenCalled();
  });
});

// Integration tests with real database
describe.skipIf(SKIP_DB_TESTS)('[Entity] Database Operations (Real)', () => {
  beforeAll(async () => {
    // Connect to test database
  });

  afterAll(async () => {
    // Clean up and disconnect
  });

  it('should insert and retrieve records', async () => {
    // Real database test
  });
});
```

## Mock Factory Patterns

### Creating Test Data

```typescript
import { createJiraIssue, createWhatsAppMessage, createSlackMessage } from '@orientbot/test-utils';

// Create with defaults
const issue = createJiraIssue();

// Override specific fields
const customIssue = createJiraIssue({
  key: 'CUSTOM-1',
  summary: 'Custom summary',
  status: 'In Progress',
});

// Create multiple
const issues = [
  createJiraIssue({ key: 'TEST-1' }),
  createJiraIssue({ key: 'TEST-2' }),
  createJiraIssue({ key: 'TEST-3' }),
];
```

### Creating Mock Services

```typescript
import { vi } from 'vitest';
import { createMockLogger, createMockServiceLogger } from '@orientbot/test-utils';

// Basic logger mock
const logger = createMockLogger();
logger.info('message');
expect(logger.info).toHaveBeenCalledWith('message');

// Service logger with startOperation
const serviceLogger = createMockServiceLogger();
const op = serviceLogger.startOperation('fetchIssues');
op.success({ count: 5 });
expect(serviceLogger.startOperation).toHaveBeenCalledWith('fetchIssues');
```

## Testing Async Operations

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('AsyncService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should trigger callback after delay', async () => {
    const callback = vi.fn();

    // Start async operation
    service.delayedOperation(callback);

    // Verify not called yet
    expect(callback).not.toHaveBeenCalled();

    // Advance time
    await vi.advanceTimersByTimeAsync(5000);

    // Verify callback was called
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
```

## Custom Assertions

```typescript
import {
  expectAsyncError,
  expectHasKeys,
  expectArrayContainsObjectWith,
} from '@orientbot/test-utils';

// Assert async error
await expectAsyncError(() => service.failingMethod(), 'Expected error message');

// Assert object has keys
expectHasKeys(result, ['id', 'name', 'created']);

// Assert array contains object
expectArrayContainsObjectWith(users, { email: 'test@example.com' });
```

## Running Tests

```bash
# All tests
npm run test:ci

# Package tests
pnpm --filter @orientbot/core test
pnpm --filter @orientbot/database test
pnpm --filter @orientbot/mcp-tools test

# Contract tests
npx vitest run tests/contracts/

# E2E tests
npx vitest run tests/e2e/

# With coverage
npm run test:coverage

# Watch mode
npx vitest
```
