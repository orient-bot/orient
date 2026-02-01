# Testing Guide - v0.1.0

Complete testing procedures for v0.1.0 release verification and fresh installs.

---

## Quick Start: Fresh Install Testing

Test Orient from a clean clone to validate the complete setup and test suite.

### Clone and Setup

```bash
cd ~/code/tombensim
git clone https://github.com/orient-bot/orient.git orient-fresh-test
cd orient-fresh-test
git checkout v0.1.0  # Use release tag
```

### Environment Setup

```bash
# Run doctor with auto-fix
./run.sh doctor --fix
```

This will:

- Validate Node.js >= 20.0.0, pnpm >= 9.0.0, Docker
- Create `.env` from `.env.example`
- Create `.mcp.config.local.json` from template
- Run `pnpm install` automatically

### Copy Real Credentials (Optional)

```bash
# Copy from your main repo if testing live integrations
cp ~/code/tombensim/orient/.env ./. env
```

### Build Packages

```bash
pnpm build:packages
```

Builds all 16 workspace packages. Required before running tests.

---

## Test Suite

Orient v0.1.0 includes **7 test categories** with a baseline of **~438 tests**.

### Test Categories

| Category    | Command                                        | Expected Tests | Expected Files |
| ----------- | ---------------------------------------------- | -------------- | -------------- |
| Unit        | `pnpm test:unit`                               | ~246           | ~24 files      |
| Integration | `INTEGRATION_TESTS=true pnpm test:integration` | ~43            | ~1 file        |
| E2E         | `E2E_TESTS=true pnpm test:e2e`                 | ~34            | ~5 files       |
| Contract    | `pnpm vitest run tests/contracts/`             | ~62            | ~7 files       |
| Config      | `pnpm vitest run tests/config/`                | ~22            | ~4 files       |
| Services    | `pnpm vitest run tests/services/`              | ~22            | ~6-7 files     |
| Docker      | `pnpm test:docker:build` (optional, slow)      | ~9             | ~3 files       |

**Total: ~438 tests**

### Run All Tests (Quick Reference)

```bash
# Start dev environment (needed for some tests)
./run.sh dev start --no-whatsapp --no-slack

# Wait for services to start
sleep 60

# Run all test categories
pnpm test:unit
INTEGRATION_TESTS=true pnpm test:integration
E2E_TESTS=true pnpm test:e2e
pnpm vitest run tests/contracts/
pnpm vitest run tests/config/
pnpm vitest run tests/services/

# Optional: Docker tests (slow, ~5 min timeout each)
# pnpm test:docker:build

# Cleanup
./run.sh dev stop
```

---

## Interpreting Results

### Timeouts vs Failures

**IMPORTANT**: Timeout errors are different from test failures.

- **Timeout errors** (120s, 90s): Usually due to OpenCode server response times under load
  - These are **acceptable** in fresh install testing
  - Common in E2E tests (up to 4 timeouts expected)

- **True failures**: Show assertion errors with specific file/line references
  - Example: `AssertionError: expected 200 to equal 404`
  - These indicate actual bugs or breaking changes

### Expected Skips

Some tests are skipped by default:

- Slack live tests without tokens
- Dashboard export contract tests (no dashboard-specific tests)
- Docker tests unless explicitly requested

### Acceptable Results for v0.1.0

✅ **Pass Criteria**:

- Test counts within ±10% of baseline (~438 total)
- No critical assertion failures
- Up to 4 timeout errors in E2E tests
- All services start and health checks pass

❌ **Fail Criteria**:

- Assertion errors in any category
- Test count significantly different (>10% variance)
- Services fail to start
- Build failures

---

## Development Environment

### Start Services

```bash
# Without bots (for basic testing)
./run.sh dev start --no-whatsapp --no-slack

# With Slack only
./run.sh dev start --no-whatsapp

# With WhatsApp only
./run.sh dev start --no-slack

# All services
./run.sh dev start
```

### Health Verification

```bash
# API health
curl -s http://localhost:4098/health | jq .
# Expected: {"status":"ok","timestamp":"..."}

# Dashboard accessibility
curl -s -o /dev/null -w "%{http_code}" http://localhost:80/
# Expected: 200

# WhatsApp API (if started)
curl -s http://localhost:4097/health | jq .
# Expected: {"status":"ok","connected":true,"state":"open"}

# Database connectivity
psql postgresql://aibot:aibot123@localhost:5439/whatsapp_bot -c "SELECT NOW();"
# Expected: current timestamp
```

### Stop Services

```bash
./run.sh dev stop
```

---

## Slack Bot Live Testing

Test real Slack integration with credentials.

### Prerequisites

- Valid `SLACK_BOT_TOKEN` in `.env`
- Valid `SLACK_USER_TOKEN` in `.env`

### Export Credentials

The test runner doesn't automatically read `.env`. Export credentials explicitly:

```bash
export SLACK_BOT_TOKEN=$(grep SLACK_BOT_TOKEN .env | cut -d= -f2)
export SLACK_USER_TOKEN=$(grep SLACK_USER_TOKEN .env | cut -d= -f2)

E2E_TESTS=true RUN_SLACK_LIVE_TESTS=true \
  SLACK_BOT_TOKEN="$SLACK_BOT_TOKEN" \
  SLACK_USER_TOKEN="$SLACK_USER_TOKEN" \
  pnpm vitest run tests/e2e/slack-live.e2e.test.ts
```

**Expected**: ~9 tests passing

**Note**: `source .env` often fails due to comments or special characters in .env files.

---

## WhatsApp Bot Testing

### Start Dev Mode

```bash
./run.sh dev start --no-slack
```

### Scan QR Code

1. Open http://localhost:80/qr/
2. Open WhatsApp on phone > Settings > Linked Devices > Link a Device
3. Scan the QR code

### Verify Connection

```bash
curl -s http://localhost:4097/health | jq .
# Expected: {"status":"ok","connected":true,"state":"open"}
```

### Troubleshooting Session Conflicts

**Symptom**: Phone shows "logging in" but never completes, or immediately logs out.

**Cause**: Session conflict with another instance using the same WhatsApp account.

**Solution**:

1. Check logs for "loggedOut" reason:
   ```bash
   grep -E "(loggedOut|logged out)" logs/instance-0/whatsapp-dev.log
   ```
2. If logged out, a new QR code is automatically generated
3. Wait for "QR Code received" message in logs
4. Scan the fresh QR code

**Log Locations**:

- Main log: `logs/instance-0/whatsapp-dev.log`
- Connection debug: `logs/whatsapp-debug-*.log`

---

## Test Coverage by Package

| Package                        | Tests | Critical Paths                    |
| ------------------------------ | ----- | --------------------------------- |
| `@orient-bot/core`              | 26    | Crypto, config                    |
| `@orient-bot/database-services` | 120+  | Feature flags, secrets, scheduler |
| `@orient-bot/dashboard`         | 50+   | Routes, agents, integrations      |
| `@orient-bot/bot-whatsapp`      | 30+   | Messaging, QR, connection         |
| `@orient-bot/bot-slack`         | 25+   | Messaging, pending actions        |
| `@orient-bot/integrations`      | 20+   | OAuth flows, JIRA, Linear         |

### Key Test Files

#### Security & Encryption

- `packages/core/__tests__/crypto.test.ts` - AES-256-GCM encryption
- `packages/database-services/__tests__/secretsService.test.ts` - Secrets management

#### Database Services

- `packages/database-services/__tests__/featureFlagsService.test.ts` - Feature flag cascade logic
- `packages/database-services/__tests__/schedulerDatabase.test.ts` - Scheduled tasks
- `packages/database-services/__tests__/messageDatabase.test.ts` - Message storage

#### Dashboard & API

- `packages/dashboard/__tests__/featureFlags.routes.test.ts` - Feature flags API
- `packages/dashboard/__tests__/agents.routes.test.ts` - Agent management
- `packages/dashboard/__tests__/integrations.routes.test.ts` - Integration endpoints

#### Bot Tests

- `packages/bot-whatsapp/__tests__/messaging.test.ts` - WhatsApp messaging
- `packages/bot-whatsapp/__tests__/qr-api-endpoints.test.ts` - QR code API
- `packages/bot-slack/__tests__/messaging.test.ts` - Slack messaging
- `packages/bot-slack/__tests__/pendingActions.test.ts` - Approval buttons

---

## Cleanup

```bash
cd ~/code/tombensim/orient-fresh-test
./run.sh dev stop
cd ..
rm -rf orient-fresh-test
```

---

## Known Issues (v0.1.0)

- **E2E Timeouts**: Up to 4 timeout errors in E2E tests are expected due to OpenCode server load
- **Docker Tests**: Slow (~5 min timeout each), skip by default

---

## Rollback Procedure

If critical issues are found:

```bash
# Revert to previous version
git checkout main
docker compose down
docker compose up -d --build

# Rollback database (if needed)
pnpm db:rollback
```

---

## Related Resources

For more detailed testing procedures and patterns, see:

- `.claude/skills/fresh-install-testing/SKILL.md` - Complete fresh install testing guide
- `.claude/skills/testing-strategy/SKILL.md` - Test patterns and templates
- `CHANGELOG.md` - Full release notes for v0.1.0
