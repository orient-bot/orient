# Testing Strategy

Comprehensive guide for running and interpreting tests in the Orient monorepo. Covers test categories, environment setup, troubleshooting failures, and live testing procedures.

## Triggers

- "run tests"
- "write tests"
- "test failing"
- "debug tests"
- "which tests to run"
- "test coverage"

## Test Categories Overview

| Category    | Files | Command                                        | When to Run                        |
| ----------- | ----- | ---------------------------------------------- | ---------------------------------- |
| Unit        | ~27   | `pnpm test:unit`                               | After code changes, before commits |
| Integration | ~1    | `INTEGRATION_TESTS=true pnpm test:integration` | After service changes              |
| E2E         | ~5    | `E2E_TESTS=true pnpm test:e2e`                 | Before releases, after API changes |
| Contract    | ~6    | `pnpm vitest run tests/contracts/`             | After package exports change       |
| Config      | ~4    | `pnpm vitest run tests/config/`                | After dependency or import changes |
| Services    | ~6    | `pnpm vitest run tests/services/`              | After service layer changes        |
| Docker      | ~3    | `pnpm test:docker:build`                       | Before deployments (slow)          |

### When to Run Each Category

**Unit Tests**: Run frequently during development

```bash
pnpm test:unit
```

**Integration Tests**: Run after changing service interactions

```bash
INTEGRATION_TESTS=true pnpm test:integration
```

**E2E Tests**: Run before releases or after significant changes

```bash
E2E_TESTS=true pnpm test:e2e
```

Requires: Running PostgreSQL database and dev mode infrastructure

**Contract Tests**: Run after modifying package exports

```bash
pnpm vitest run tests/contracts/
```

**Config Tests**: Run after changing dependencies or imports

```bash
pnpm vitest run tests/config/
```

**Services Tests**: Run after changing bot services or handlers

```bash
pnpm vitest run tests/services/
```

## Vitest Mocking Patterns

### Module Mocking with Hoisting Rules

Vitest hoists `vi.mock()` calls to the top of the file before imports. This requires careful setup to avoid initialization order issues.

**CRITICAL RULE**: Variables used in `vi.mock()` factory functions must be declared at module level BEFORE being used in the mock.

#### Pattern 1: Module-Level Mock Objects (Recommended)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ✅ CORRECT: Declare mock objects at module level
const mockQuery = vi.fn();
const mockPool = {
  query: mockQuery,
  connect: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
};

// ✅ Mock using the module-level objects
vi.mock('pg', () => ({
  default: {
    Pool: class MockPool {
      query = mockQuery;
      connect = mockPool.connect;
      end = mockPool.end;
      on = mockPool.on;
      removeListener = mockPool.removeListener;
    },
  },
}));

// Now import the module being tested
import { SecretsService } from '../src/secretsService.js';

describe('SecretsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('should query database', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ key: 'test', value: 'data' }],
      rowCount: 1,
    });

    const service = new SecretsService();
    const result = await service.getSecret('test');

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('SELECT'), ['test']);
  });
});
```

#### Pattern 2: MockPool Class Pattern

For complex database mocking, use a class-based mock:

```typescript
// ✅ Module-level mock setup
const mockQuery = vi.fn();
const mockPool = {
  query: mockQuery,
  connect: vi.fn(),
  end: vi.fn(),
};

class MockPool {
  query = mockQuery;
  connect = mockPool.connect;
  end = mockPool.end;
  on = vi.fn();
  removeListener = vi.fn();
}

vi.mock('pg', () => ({
  default: { Pool: MockPool },
}));
```

#### Common Pitfalls and Solutions

**❌ WRONG: Using variables before declaration**

```typescript
// ❌ This will fail with "Cannot access before initialization"
vi.mock('@orient/core', () => ({
  encryptSecret: mockEncryptSecret, // ❌ Used before declaration
  decryptSecret: mockDecryptSecret,
}));

const mockEncryptSecret = vi.fn(); // ❌ Declared too late
const mockDecryptSecret = vi.fn();
```

**✅ CORRECT: Declare first, then mock**

```typescript
// ✅ Declare at module level
const mockEncryptSecret = vi.fn();
const mockDecryptSecret = vi.fn();

// ✅ Then use in mock
vi.mock('@orient/core', () => ({
  encryptSecret: mockEncryptSecret,
  decryptSecret: mockDecryptSecret,
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
  }),
}));
```

**❌ WRONG: Factory function returning arrow function**

```typescript
// ❌ This causes "is not a constructor" errors
vi.mock('pg', () => ({
  default: {
    Pool: () => ({ query: vi.fn() }), // ❌ Arrow function, not constructor
  },
}));
```

**✅ CORRECT: Use class or constructor function**

```typescript
// ✅ Use a proper class
vi.mock('pg', () => ({
  default: {
    Pool: class MockPool {
      query = vi.fn();
      connect = vi.fn();
    },
  },
}));
```

### Database Mocking (PostgreSQL)

#### Basic pg.Pool Mock

```typescript
import { vi } from 'vitest';

const mockQuery = vi.fn();
const mockPool = {
  query: mockQuery,
  connect: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
};

vi.mock('pg', () => ({
  default: {
    Pool: class MockPool {
      query = mockQuery;
      connect = mockPool.connect;
      end = mockPool.end;
      on = mockPool.on;
      removeListener = mockPool.removeListener;
    },
  },
}));

// In tests
beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

it('should query database', async () => {
  mockQuery.mockResolvedValueOnce({
    rows: [{ id: 1, name: 'test' }],
    rowCount: 1,
  });

  // Test code that uses pg.Pool
});
```

#### Testing Multiple Query Responses

```typescript
it('should handle multiple queries', async () => {
  // First query: INSERT
  mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

  // Second query: SELECT
  mockQuery.mockResolvedValueOnce({
    rows: [{ id: 1, created_at: '2024-01-01' }],
    rowCount: 1,
  });

  // Third query: audit log INSERT
  mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

  await service.setSecret('key', 'value', { changedBy: 'admin' });

  expect(mockQuery).toHaveBeenCalledTimes(3);
  expect(mockQuery).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('INSERT INTO secrets'),
    expect.any(Array)
  );
});
```

#### Testing Database Errors

```typescript
it('should handle connection failures', async () => {
  mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

  await expect(service.getSecret('test')).rejects.toThrow('Connection refused');
});
```

### External Service Mocking (fetch, APIs)

#### Basic fetch Mock

```typescript
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
});

it('should fetch user info', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        login: 'testuser',
        id: 12345,
        email: 'test@example.com',
      }),
  });

  const result = await service.getUserInfo('token');

  expect(mockFetch).toHaveBeenCalledWith(
    'https://api.github.com/user',
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer token',
      }),
    })
  );
  expect(result.login).toBe('testuser');
});
```

#### Testing OAuth Token Exchange

```typescript
it('should exchange code for tokens', async () => {
  // Mock token endpoint response
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        access_token: 'gho_abc123',
        token_type: 'bearer',
        scope: 'repo,user',
      }),
  });

  // Mock user info endpoint response
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        login: 'testuser',
        id: 12345,
      }),
  });

  const result = await service.handleCallback('code', 'state');

  expect(result.success).toBe(true);
  expect(mockFetch).toHaveBeenCalledTimes(2);
});
```

#### Testing API Failures

```typescript
it('should handle API errors', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 401,
    text: () => Promise.resolve('Unauthorized'),
  });

  await expect(service.fetchData()).rejects.toThrow('Unauthorized');
});
```

### File System Mocking

```typescript
import fs from 'fs';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// In tests
import { readFileSync, writeFileSync } from 'fs';

it('should save tokens to file', () => {
  const mockWriteFileSync = vi.mocked(writeFileSync);

  service.saveTokens({ access_token: 'token' });

  expect(mockWriteFileSync).toHaveBeenCalledWith(
    expect.stringContaining('tokens.json'),
    expect.stringContaining('"access_token":"token"'),
    'utf-8'
  );
});
```

### Testing Services with Encrypted Data Storage

#### Pattern: Mock Both Database and Crypto

```typescript
// Module-level mocks
const mockQuery = vi.fn();
const mockEncryptSecret = vi.fn();
const mockDecryptSecret = vi.fn();

vi.mock('pg', () => ({
  default: {
    Pool: class MockPool {
      query = mockQuery;
    },
  },
}));

vi.mock('@orient/core', () => ({
  encryptSecret: mockEncryptSecret,
  decryptSecret: mockDecryptSecret,
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

import { SecretsService } from '../src/secretsService.js';
import { encryptSecret, decryptSecret } from '@orient/core';

describe('SecretsService with encryption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    vi.mocked(encryptSecret).mockReturnValue({
      encrypted: 'enc-data',
      iv: 'test-iv',
      authTag: 'test-tag',
    });

    vi.mocked(decryptSecret).mockReturnValue('decrypted-value');
  });

  it('should encrypt before storing', async () => {
    await service.setSecret('key', 'plaintext');

    // Verify encryption was called
    expect(encryptSecret).toHaveBeenCalledWith('plaintext');

    // Verify encrypted data was stored
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO secrets'),
      expect.arrayContaining(['key', 'enc-data', 'test-iv', 'test-tag'])
    );
  });

  it('should decrypt after retrieval', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          encrypted_value: 'stored-enc',
          iv: 'stored-iv',
          auth_tag: 'stored-tag',
        },
      ],
      rowCount: 1,
    });

    const result = await service.getSecret('key');

    // Verify decryption was called with database values
    expect(decryptSecret).toHaveBeenCalledWith('stored-enc', 'stored-iv', 'stored-tag');
    expect(result).toBe('decrypted-value');
  });

  it('should not expose plaintext in database', async () => {
    await service.setSecret('password', 'super-secret-123');

    // Verify plaintext never appears in query params
    expect(mockQuery).toHaveBeenCalled();
    const queryArgs = mockQuery.mock.calls[0][1];
    expect(queryArgs).not.toContain('super-secret-123');
  });
});
```

### Test-Utils Package: Reusable Mocks

The `@orient/test-utils` package provides shared mocking utilities:

```typescript
import { createMockPgPool, setupQueryMock } from '@orient/test-utils/mocks';

describe('Database tests', () => {
  const pool = createMockPgPool();

  it('should query with custom responses', async () => {
    setupQueryMock(pool, 'SELECT', {
      rows: [{ id: 1, name: 'test' }],
      rowCount: 1,
    });

    // Use the pool in your tests
  });
});
```

### Best Practices

1. **Always use module-level mock declarations** to avoid hoisting issues
2. **Reset mocks in beforeEach** to ensure test isolation
3. **Use mockResolvedValueOnce** for sequential query responses
4. **Test both success and error paths** for external services
5. **Verify security properties** (e.g., plaintext never stored)
6. **Use vi.mocked()** for better TypeScript inference
7. **Mock only what you need** - don't over-mock internal implementation details

### Common Mock Patterns Reference

```typescript
// Database query mock
mockQuery.mockResolvedValueOnce({ rows: [data], rowCount: 1 });

// API fetch mock
mockFetch.mockResolvedValueOnce({
  ok: true,
  json: () => Promise.resolve(data),
});

// Error simulation
mockQuery.mockRejectedValueOnce(new Error('Connection failed'));

// Multiple return values
mockFn.mockReturnValueOnce('first').mockReturnValueOnce('second').mockReturnValueOnce('third');

// Clear all mock state
vi.clearAllMocks();

// Reset implementation
mockQuery.mockReset();

// Assert call order
expect(mockQuery).toHaveBeenNthCalledWith(1, 'SELECT ...', ['param1']);
expect(mockQuery).toHaveBeenNthCalledWith(2, 'INSERT ...', ['param2']);
```

## Environment Variable Passing to Test Runners

### The .env Sourcing Problem

**Problem**: `source .env` often fails due to special characters in values:

```bash
# This FAILS with errors like "command not found"
source .env
pnpm test:e2e

# Error example:
# .env:23: command not found: custom
```

**Cause**: Comments (`#`) and special characters (`*`) in .env files confuse the shell.

### Solution: Export Variables Explicitly

For tests requiring credentials (Slack live tests, etc.):

```bash
# Extract and export specific variables
export SLACK_BOT_TOKEN=$(grep SLACK_BOT_TOKEN .env | cut -d= -f2)
export SLACK_USER_TOKEN=$(grep SLACK_USER_TOKEN .env | cut -d= -f2)

# Then run tests with the variables
E2E_TESTS=true RUN_SLACK_LIVE_TESTS=true \
  SLACK_BOT_TOKEN="$SLACK_BOT_TOKEN" \
  SLACK_USER_TOKEN="$SLACK_USER_TOKEN" \
  pnpm vitest run tests/e2e/slack-live.e2e.test.ts
```

### Environment Variables Reference

| Variable                    | Purpose                  | Required For      |
| --------------------------- | ------------------------ | ----------------- |
| `E2E_TESTS=true`            | Enable E2E test suite    | E2E tests         |
| `INTEGRATION_TESTS=true`    | Enable integration tests | Integration tests |
| `RUN_SLACK_LIVE_TESTS=true` | Enable live Slack tests  | Slack live E2E    |
| `SLACK_BOT_TOKEN`           | Bot authentication       | Slack live E2E    |
| `SLACK_USER_TOKEN`          | User impersonation       | Slack live E2E    |
| `RUN_SLOW_TESTS=true`       | Enable slow tests        | Slow E2E tests    |

## Interpreting Test Results

### Timeout Failures vs Functional Failures

**Timeout Failures** (usually acceptable):

```
Error: Test timed out in 120000ms.
Error: Request timed out after 90 seconds
```

Timeouts indicate OpenCode server load, not functional issues:

- Common during E2E tests with concurrent OpenCode requests
- Usually pass on retry or with fewer concurrent tests
- Check if dev mode is running and responsive

**Functional Failures** (need investigation):

```
AssertionError: expected 'read_only' to equal 'read_write'
Error: Cannot find module '@orient/core'
TypeError: Cannot read property 'x' of undefined
```

Functional failures indicate actual bugs:

- Assertion mismatches show logic errors
- Module errors show import/build issues
- Type errors show missing dependencies

### Skipped Tests vs Actual Failures

**Skipped tests** are normal and expected:

```
Tests: 34 passed | 39 skipped (77)
```

Common skip reasons:

- Missing credentials (e.g., `SLACK_BOT_TOKEN` not set)
- Feature flags disabled (e.g., `RUN_SLOW_TESTS=false`)
- Platform-specific tests on wrong OS
- Tests marked with `.skip()` or `skipIf()`

**To enable skipped tests**, check the test file for skip conditions:

```typescript
describe.skipIf(!process.env.SLACK_BOT_TOKEN)('Slack Live Tests', () => {
  // These tests require SLACK_BOT_TOKEN
});
```

## E2E Test Requirements

### Database Requirements

E2E tests require a running PostgreSQL database:

```bash
# Start infrastructure
./run.sh dev start --no-whatsapp --no-slack

# Or just Docker infrastructure
docker compose -f docker/docker-compose.infra.yml up -d postgres
```

### OpenCode Server Load

E2E tests make concurrent requests to OpenCode, which can cause timeouts:

**Symptoms**:

- Multiple tests timing out at 90-120 seconds
- Tests pass individually but fail in suite
- Slow response times in logs

**Solutions**:

1. Run E2E tests with dev mode fully started
2. Run slow tests separately: `RUN_SLOW_TESTS=true pnpm test:e2e`
3. Increase test timeouts in test files
4. Run tests sequentially: `--no-threads`

### Database State Between Test Runs

E2E tests may leave state in the database:

**Clean slate approach**:

```bash
# Reset database before tests
./run.sh dev stop
./run.sh dev start --no-whatsapp --no-slack
```

**Isolated worktree approach** (recommended for schema changes):

```bash
.claude/skills/claude-worktree-manager/scripts/worktree.sh create test-feature --isolated
```

## Health Endpoint Verification

### API Health Check

```bash
curl -s http://localhost:4098/health | jq .
# Expected: {"status":"ok","timestamp":"..."}
```

### Dashboard Accessibility

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:80/
# Expected: 200
```

### WhatsApp Bot Health

```bash
curl -s http://localhost:4097/health | jq .
# Expected: {"status":"ok","connected":true,"state":"open"}
```

### OpenCode Server

```bash
curl -s http://localhost:4099/health | jq .
# Expected: {"status":"healthy",...}
```

## Troubleshooting

### WhatsApp Session Conflicts

**Symptom**: Phone shows "logging in" but never completes, or immediately logs out.

**Cause**: Another instance is using the same WhatsApp account.

**Solution**:

1. Check logs for `loggedOut` reason:
   ```bash
   grep -E "(loggedOut|logged out)" logs/instance-0/whatsapp-dev.log
   ```
2. If logged out, wait for new QR code in logs
3. Scan the fresh QR code at http://localhost:80/qr/

**Session Reset Procedure**:

```bash
# Stop dev mode
./run.sh dev stop

# Clear WhatsApp session data
rm -rf .dev-data/instance-0/whatsapp/

# Restart and pair again
./run.sh dev start --no-slack
# Scan QR at http://localhost:80/qr/
```

### Common Test Failures

#### "Cannot find module" Errors

```bash
# Build packages first
pnpm build:packages

# Then run tests
pnpm test:unit
```

#### Database Connection Errors

```bash
# Ensure PostgreSQL is running
docker compose -f docker/docker-compose.infra.yml up -d postgres

# Wait for it to be ready
./run.sh dev status
```

#### Timeout Errors in E2E

```bash
# Check if OpenCode is responding
curl -s http://localhost:4099/health

# Restart OpenCode if needed
./run.sh dev restart
```

#### Missing Environment Variables

```bash
# Check which vars are expected
grep -r "process.env\." tests/e2e/

# Export required variables (see "Environment Variable Passing" section)
```

## Running Tests in Fresh/Worktree Contexts

### Fresh Clone Testing

See `fresh-install-testing` skill for complete procedures.

### Worktree Testing

```bash
# Create worktree with isolated database
.claude/skills/claude-worktree-manager/scripts/worktree.sh create test-feature --isolated

# Navigate to worktree
cd /path/to/worktree

# Wait for pnpm install
tail -f .pnpm-install.log

# Run tests
pnpm test:unit
```

### Isolated Database for Testing

When using `--isolated` flag, the worktree gets its own database:

- Seeded with test data (agents, permissions, prompts)
- No interference with main dev database
- Safe for schema change testing

## Quick Reference: Full Test Suite

```bash
# Ensure dev mode is running
./run.sh dev start --no-whatsapp --no-slack

# Run all test categories
pnpm test:unit                                    # ~313 tests (+67 security tests)
INTEGRATION_TESTS=true pnpm test:integration      # ~43 tests
E2E_TESTS=true pnpm test:e2e                      # ~34 tests (some may timeout)
pnpm vitest run tests/contracts/                  # ~62 tests
pnpm vitest run tests/config/                     # ~22 tests
pnpm vitest run tests/services/                   # ~22 tests

# Live Slack testing (requires credentials)
export SLACK_BOT_TOKEN=$(grep SLACK_BOT_TOKEN .env | cut -d= -f2)
export SLACK_USER_TOKEN=$(grep SLACK_USER_TOKEN .env | cut -d= -f2)
E2E_TESTS=true RUN_SLACK_LIVE_TESTS=true \
  SLACK_BOT_TOKEN="$SLACK_BOT_TOKEN" \
  SLACK_USER_TOKEN="$SLACK_USER_TOKEN" \
  pnpm vitest run tests/e2e/slack-live.e2e.test.ts

# Verify health endpoints
curl -s http://localhost:4098/health | jq .
curl -s http://localhost:4097/health | jq .
```

## Expected Baseline Results (v0.1.0 + Security Tests)

| Category    | Tests Passed | Skipped | Notes                         |
| ----------- | ------------ | ------- | ----------------------------- |
| Unit        | ~313         | ~34     | +67 security/crypto tests     |
| Integration | ~43          | 0       |                               |
| E2E         | ~34          | ~39     | 4 timeout failures acceptable |
| Contract    | ~62          | ~12     | Dashboard exports skipped     |
| Config      | ~22          | 0       |                               |
| Services    | ~22          | ~2      |                               |
| Slack Live  | ~9           | 0       | Requires credential export    |
| **Total**   | **~505**     | **~87** |                               |

### New Test Coverage (Critical Security Paths)

| Test File                                                     | Tests  | Coverage Area                         |
| ------------------------------------------------------------- | ------ | ------------------------------------- |
| `packages/core/__tests__/crypto.test.ts`                      | 26     | Encryption, master key, IV validation |
| `packages/database-services/__tests__/secretsService.test.ts` | 22     | Secret storage with encryption        |
| `packages/integrations/__tests__/github-oauth.test.ts`        | 19     | OAuth flow, token exchange            |
| **Security Tests Total**                                      | **67** | **Critical security components**      |

E2E timeout failures are expected due to OpenCode server load:

- `should compact session with context preserved` - 120s timeout
- `should handle /summarize as alias for /compact` - 120s timeout
- `should maintain separate sessions per thread` - 120s timeout
- `should discover config tools in system category` - 90s timeout
