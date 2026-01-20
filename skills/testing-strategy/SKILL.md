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
| Unit        | ~24   | `pnpm test:unit`                               | After code changes, before commits |
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
pnpm test:unit                                    # ~246 tests
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

## Expected Baseline Results (v0.1.0)

| Category    | Tests Passed | Skipped | Notes                         |
| ----------- | ------------ | ------- | ----------------------------- |
| Unit        | ~246         | ~34     |                               |
| Integration | ~43          | 0       |                               |
| E2E         | ~34          | ~39     | 4 timeout failures acceptable |
| Contract    | ~62          | ~12     | Dashboard exports skipped     |
| Config      | ~22          | 0       |                               |
| Services    | ~22          | ~2      |                               |
| Slack Live  | ~9           | 0       | Requires credential export    |
| **Total**   | **~438**     | **~87** |                               |

E2E timeout failures are expected due to OpenCode server load:

- `should compact session with context preserved` - 120s timeout
- `should handle /summarize as alias for /compact` - 120s timeout
- `should maintain separate sessions per thread` - 120s timeout
- `should discover config tools in system category` - 90s timeout
