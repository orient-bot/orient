---
name: testing-strategy
description: Guide for running and writing tests in the Orient monorepo. Use when asked to "run tests", "write tests", "add test coverage", "debug failing tests", "check which tests to run", or when making code changes that require testing. Covers test categories (unit, integration, E2E), monorepo test execution, mock usage, and test patterns for services, handlers, tools, and database operations.
---

# Testing Strategy

## Quick Reference - Monorepo Test Commands

### Run All Tests

```bash
# Run all tests (root + packages)
pnpm test

# Run with turborepo (parallel, cached)
pnpm turbo test
```

### Package-Specific Tests

```bash
# Core package
pnpm --filter @orient/core test

# Database package
pnpm --filter @orient/database test
pnpm --filter @orient/database test:e2e  # E2E tests

# MCP Tools package
pnpm --filter @orient/mcp-tools test
```

### Root-Level Tests (during migration)

```bash
# Run all unit + integration tests
npm test

# Run only unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run E2E tests (requires PostgreSQL)
npm run test:e2e

# CI mode (excludes E2E)
npm run test:ci

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

### Specific Test Files

```bash
# Single test file
npm test -- src/services/__tests__/jiraService.test.ts

# Package test file
pnpm --filter @orient/core test -- __tests__/config.test.ts

# Pattern matching
npm test -- --testNamePattern="chatPermission"
```

## Test Categories

### Unit Tests (\*.test.ts)

- **Location**: `packages/*/\__tests__/*.test.ts` and `src/**/\__tests__/*.test.ts`
- **Purpose**: Test isolated service/handler logic with mocked dependencies
- **Dependencies**: None - all external services mocked
- **When to write**: For business logic, utility functions, service methods

### Integration Tests (\*.integration.test.ts)

- **Location**: `src/services/__tests__/*.integration.test.ts`, `tests/integration/`
- **Purpose**: Test handler flows with multiple mocked components working together
- **Dependencies**: None - uses mock factories for external APIs
- **When to write**: For MCP tool handlers, multi-service workflows, skill editing flows

### E2E Tests (\*.e2e.test.ts)

- **Location**: `src/db/__tests__/*.e2e.test.ts`, `tests/e2e/`
- **Purpose**: Test real database operations with PostgreSQL, or real OpenCode server interactions
- **Dependencies**: Requires running PostgreSQL (`DATABASE_URL` env var) OR OpenCode server
- **When to write**: For database schema changes, complex queries, OpenCode session management
- **Note**: Skipped automatically in CI if required services are not running

### Contract Tests (\*.contract.test.ts)

- **Location**: `tests/contracts/`
- **Purpose**: Verify package public APIs remain stable
- **When to write**: When changing package exports

### Docker Tests (tests/docker/)

- **Location**: `tests/docker/`
- **Purpose**: Verify Dockerfiles build and containers start correctly
- **Dependencies**: Docker runtime
- **When to write**: When modifying Dockerfiles, compose files, or container entry points
- **Skip with**: `SKIP_DOCKER_TESTS=1`

```bash
# Run all Docker tests
pnpm test:docker:files

# Run build validation only
pnpm test:docker:build

# Skip slow build tests (just check Dockerfile existence)
SKIP_DOCKER_TESTS=1 pnpm test:docker:files
```

**Docker Test Categories:**

| Test File         | Purpose                                                 |
| ----------------- | ------------------------------------------------------- |
| `build.test.ts`   | Verify Dockerfile existence and optionally build images |
| `startup.test.ts` | Verify containers start and run correctly               |
| `compose.test.ts` | Validate docker-compose.v2.yml structure and syntax     |

## Package Test Structure

```
orienter/
├── packages/
│   ├── core/
│   │   ├── __tests__/
│   │   │   ├── config.test.ts
│   │   │   └── utils.test.ts
│   │   └── vitest.config.ts
│   ├── database/
│   │   ├── __tests__/
│   │   │   ├── schema.test.ts
│   │   │   └── client.e2e.test.ts
│   │   └── vitest.config.ts
│   └── mcp-tools/
│       ├── __tests__/
│       │   └── registry.test.ts
│       └── vitest.config.ts
├── tests/
│   ├── docker/                 # Docker build and startup tests
│   │   ├── build.test.ts       # Dockerfile validation
│   │   ├── startup.test.ts     # Container startup tests
│   │   └── compose.test.ts     # Compose file validation
│   ├── e2e/                    # System-level E2E tests
│   ├── integration/            # Cross-package integration
│   └── contracts/              # Package API stability
├── src/                        # Legacy tests (during migration)
│   └── */__tests__/*.test.ts
└── vitest.workspace.ts         # Workspace orchestration
```

## Decision Tree - Which Tests to Run

| Modified Package/File                           | Tests to Run               | Command                                                 |
| ----------------------------------------------- | -------------------------- | ------------------------------------------------------- |
| `packages/core/src/**`                          | Core unit tests            | `pnpm --filter @orient/core test`                       |
| `packages/database/src/**`                      | Database tests             | `pnpm --filter @orient/database test`                   |
| `packages/database/src/schema/**`               | Database E2E               | `pnpm --filter @orient/database test:e2e`               |
| `packages/mcp-tools/src/**`                     | MCP Tools tests            | `pnpm --filter @orient/mcp-tools test`                  |
| `packages/dashboard-frontend/src/routes.ts`     | Frontend routing tests     | `pnpm --filter dashboard-frontend test -- routes`       |
| `packages/dashboard-frontend/src/components/**` | Frontend component tests   | `pnpm --filter dashboard-frontend test`                 |
| `packages/dashboard-frontend/src/App.tsx`       | Frontend integration tests | `pnpm --filter dashboard-frontend test`                 |
| `src/services/*.ts`                             | Service unit tests         | `npm test -- src/services/__tests__/<name>.test.ts`     |
| `src/services/openCode*.ts`                     | OpenCode E2E               | `npx vitest run tests/e2e/opencode-session.e2e.test.ts` |
| `src/tools/*.ts`                                | Tool tests                 | `npm run test:tools`                                    |
| `src/db/*.ts`                                   | E2E database tests         | `npm run test:e2e`                                      |
| `packages/*/Dockerfile`                         | Docker tests               | `pnpm test:docker:files`                                |
| `docker/docker-compose*.yml`                    | Docker compose tests       | `pnpm test:docker:files`                                |
| `packages/*/src/main.ts`                        | Entry point + Docker tests | Package test + `pnpm test:docker:files`                 |
| Multiple files                                  | All tests                  | `npm run test:ci`                                       |

## Writing New Tests

### Package Unit Test Template

```typescript
/**
 * Unit Tests for [ModuleName]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @orient/core if needed
vi.mock('@orient/core', () => ({
  createServiceLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startOperation: () => ({ success: vi.fn(), failure: vi.fn() }),
  }),
  loadConfig: () => ({
    /* mock config */
  }),
}));

describe('ModuleName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('methodName', () => {
    it('should do something when condition is met', async () => {
      // Arrange
      const input = { key: 'value' };

      // Act
      const result = await doSomething(input);

      // Assert
      expect(result).toBeDefined();
    });
  });
});
```

### Frontend Routing Tests (React/Vitest)

Test routing utilities (`getRouteState`, `getRoutePath`) for React applications:

```typescript
/**
 * Tests for Frontend URL Routing
 * Location: packages/dashboard-frontend/__tests__/routes.test.ts
 */

import { describe, it, expect } from 'vitest';
import { getRouteState, getRoutePath, ROUTES } from '../src/routes';

describe('Frontend URL Routing', () => {
  // Test route constants exist
  describe('ROUTES constants', () => {
    it('should have all expected route paths', () => {
      expect(ROUTES.SETTINGS).toBe('/settings');
      expect(ROUTES.SETTINGS_APPEARANCE).toBe('/settings/appearance');
    });
  });

  // Test getRouteState - derives state from URL pathname
  describe('getRouteState', () => {
    it('should match route path and return correct view state', () => {
      const state = getRouteState('/settings/appearance');
      expect(state.globalView).toBe('settings');
      expect(state.settingsView).toBe('appearance');
    });

    it('should return default state for unknown paths', () => {
      const state = getRouteState('/unknown');
      expect(state.globalView).toBeNull();
      expect(state.activeService).toBe('whatsapp'); // default
    });
  });

  // Test getRoutePath - generates URL from view state
  describe('getRoutePath', () => {
    it('should return correct path for view', () => {
      expect(getRoutePath('settings', 'whatsapp', 'appearance')).toBe('/settings/appearance');
    });
  });

  // Test round-trip consistency
  describe('route consistency', () => {
    it('should have matching getRouteState and getRoutePath', () => {
      const path = getRoutePath('settings', 'whatsapp', 'appearance');
      const state = getRouteState(path);
      expect(state.globalView).toBe('settings');
      expect(state.settingsView).toBe('appearance');
    });
  });
});
```

**Key patterns for routing tests:**

1. **Route constants** - Verify all route paths are defined correctly
2. **getRouteState** - Test URL → state derivation for each route pattern
3. **getRoutePath** - Test state → URL generation
4. **Round-trip consistency** - Ensure `getRouteState(getRoutePath(...))` returns expected state
5. **Default handling** - Test fallback behavior for unknown routes

**Run frontend tests:**

```bash
pnpm --filter dashboard-frontend test
pnpm --filter dashboard-frontend test -- __tests__/routes.test.ts
```

### Cross-Package Integration Test Template

```typescript
/**
 * Integration Tests for [Feature]
 * Tests interaction between @orient/core and @orient/database
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadConfig } from '@orient/core';
import { getDatabase, closeDatabase } from '@orient/database';

describe('Feature Integration', () => {
  beforeAll(async () => {
    // Setup shared resources
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('should work across packages', async () => {
    const config = loadConfig();
    const db = getDatabase();

    // Test cross-package interaction
  });
});
```

## Mock Usage

### Standard Mocks

```typescript
// Mock @orient/core logger
vi.mock('@orient/core', () => ({
  createServiceLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startOperation: () => ({
      success: vi.fn(),
      failure: vi.fn(),
    }),
  }),
}));

// Mock legacy paths (for src/ files)
vi.mock('../../utils/logger', () => import('../../__mocks__/logger'));
vi.mock('../../config', () => import('../../__mocks__/config'));
```

For detailed mock usage, see [references/mock-catalog.md](references/mock-catalog.md).
For test patterns, see [references/test-patterns.md](references/test-patterns.md).
For file-test mapping, see [references/file-test-mapping.md](references/file-test-mapping.md).

## Coverage Requirements

Coverage thresholds (enforced in CI):

- Statements: 60%
- Branches: 50%
- Functions: 60%
- Lines: 60%

View coverage report:

```bash
npm run test:coverage
pnpm --filter @orient/core test:coverage
```

## Debugging Failed Tests

### Common Issues

1. **Mock not resetting between tests**

   ```typescript
   afterEach(() => {
     vi.clearAllMocks();
   });
   ```

2. **Package import issues**
   - Ensure packages are built: `pnpm build`
   - Check workspace dependencies in package.json

3. **Async timing issues**

   ```typescript
   beforeEach(() => {
     vi.useFakeTimers();
   });
   afterEach(() => {
     vi.useRealTimers();
   });
   await vi.advanceTimersByTimeAsync(5000);
   ```

4. **E2E test skipped unexpectedly**
   - Ensure `DATABASE_URL` or `TEST_DATABASE_URL` is set
   - Check PostgreSQL is running: `docker compose -f docker/docker-compose.infra.yml up -d`

## OpenCode E2E Tests

### Prerequisites

OpenCode E2E tests require the development environment running. **IMPORTANT**: Use `./run.sh dev` to start the dev environment - this configures OpenCode on the correct port with proper model settings.

```bash
# Start the dev environment (includes OpenCode on port 4099)
./run.sh dev

# In another terminal, run the OpenCode E2E tests
npx vitest run tests/e2e/opencode-session.e2e.test.ts
npx vitest run tests/e2e/session-commands.e2e.test.ts
```

### Key Configuration

| Setting       | Value                 | Notes                                     |
| ------------- | --------------------- | ----------------------------------------- |
| OpenCode Port | `4099`                | Dev environment uses port 4099 (not 4096) |
| Default Model | `opencode/grok-code`  | Uses OpenCode Zen proxy (FREE tier)       |
| Config File   | `opencode.local.json` | Contains model and MCP server settings    |

### Available Test Files

- `tests/e2e/opencode-session.e2e.test.ts` - Tests session creation, deletion, message sending, token tracking, summarization, context preservation
- `tests/e2e/session-commands.e2e.test.ts` - Tests /reset, /compact, /help commands for WhatsApp and Slack handlers

### Writing OpenCode E2E Tests

```typescript
/**
 * OpenCode E2E Test Template
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { createOpenCodeClient } from '../../src/services/openCodeClient.js';

// Default to port 4099 (dev environment) - see ./run.sh dev
const OPENCODE_URL = process.env.OPENCODE_URL || 'http://localhost:4099';

// Synchronous availability check at module load time
// This ensures describe.skipIf works correctly
function isOpenCodeAvailableSync(): boolean {
  try {
    const result = execSync(`curl -s --connect-timeout 2 ${OPENCODE_URL}/global/health`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    const health = JSON.parse(result);
    return health.healthy === true;
  } catch {
    return false;
  }
}

const openCodeAvailable = isOpenCodeAvailableSync();

describe('My OpenCode E2E Tests', () => {
  let client;

  beforeAll(async () => {
    if (openCodeAvailable) {
      client = createOpenCodeClient(OPENCODE_URL);
    }
  });

  // Tests are skipped if OpenCode is not running
  describe.skipIf(!openCodeAvailable)('Feature Tests', () => {
    it('should work with OpenCode', async () => {
      const session = await client.createSession('Test');
      expect(session.id).toBeDefined();
    });
  });
});
```

### Common Issues

1. **Tests skipped even though OpenCode is running**
   - Verify OpenCode is on port 4099 (dev port): `curl http://localhost:4099/global/health`
   - The standalone `opencode serve` uses port 4096 by default, but tests expect 4099

2. **Model not found errors** (ProviderModelNotFoundError)
   - Ensure using `opencode/grok-code` model format (not `grok-code` or `xai/grok-code`)
   - This routes through OpenCode Zen proxy which provides free access

3. **Malformed JSON errors on summarize**
   - The summarize endpoint requires model info in the body: `{ providerID, modelID }`

4. **Streaming response parse errors**
   - Check model configuration - some models return streaming responses
   - The `opencode/grok-code` model returns proper JSON responses

## Turborepo Caching

Test results are cached by turborepo. To force re-run:

```bash
pnpm turbo test --force
```
