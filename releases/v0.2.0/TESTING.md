# Testing Guide - v0.2.0

Complete testing procedures for v0.2.0 release verification and fresh installs.

---

## Quick Start: Fresh Install Testing

Test Orient from a clean clone to validate the complete setup and test suite.

### Mac Installer Method (Recommended)

```bash
# Install Orient
curl -fsSL https://orient.bot/install.sh | bash

# Run diagnostics
orient doctor

# Start services
orient start

# Check status
orient status

# View logs
orient logs
```

### Manual Clone Method

```bash
cd ~/code/tombensim
git clone https://github.com/orient-bot/orient.git orient-fresh-test
cd orient-fresh-test
git checkout v0.2.0  # Use release tag
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
cp ~/code/tombensim/orient/.env ./.env
```

### Build Packages

```bash
pnpm build:packages
```

Builds all workspace packages. Required before running tests.

---

## Test Suite

Orient v0.2.0 includes a baseline of **~350+ tests** across 71 test files.

### Test Categories

| Category    | Command                                        | Expected Tests | Expected Files |
| ----------- | ---------------------------------------------- | -------------- | -------------- |
| Unit        | `pnpm test:unit`                               | ~280           | ~30 files      |
| Integration | `INTEGRATION_TESTS=true pnpm test:integration` | ~50            | ~5 files       |
| E2E         | `E2E_TESTS=true pnpm test:e2e`                 | ~20            | ~3 files       |

**Total: ~350+ tests**

### Run All Tests (Quick Reference)

```bash
# Start dev environment (needed for some tests)
./run.sh dev start

# Wait for services to start
sleep 60

# Run all test categories
pnpm test:unit
INTEGRATION_TESTS=true pnpm test:integration

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
- Docker tests unless explicitly requested

### Acceptable Results for v0.2.0

✅ **Pass Criteria**:

- Test counts within ±10% of baseline (~286 total)
- No critical assertion failures
- All services start and health checks pass
- Single port (4098) responding correctly

❌ **Fail Criteria**:

- Assertion errors in any category
- Test count significantly different (>10% variance)
- Services fail to start
- Build failures
- Health check at port 4098 fails

---

## Development Environment

### Start Services

```bash
# Start all services (single command now)
./run.sh dev start

# Without Slack
./run.sh dev start --no-slack
```

**Note**: v0.2.0 no longer has separate `--no-whatsapp` flag. WhatsApp is integrated into Dashboard.

### Health Verification

```bash
# All services health check (single port)
curl -s http://localhost:4098/health | jq .
# Expected: {"status":"ok","timestamp":"..."}

# Dashboard accessibility
curl -s -o /dev/null -w "%{http_code}" http://localhost:4098/
# Expected: 200

# WhatsApp QR page (served from Dashboard)
curl -s -o /dev/null -w "%{http_code}" http://localhost:4098/qr/
# Expected: 200
```

**Note**: No more `localhost:4097` - all endpoints on port 4098.

### Stop Services

```bash
./run.sh dev stop
```

---

## Mac Installer Testing

Test the one-line installer for macOS.

### Fresh Install Test

```bash
# Remove existing installation (if any)
rm -rf ~/.orient

# Run installer
curl -fsSL https://orient.bot/install.sh | bash

# Verify installation
which orient
# Expected: ~/.orient/bin/orient

# Run diagnostics
orient doctor
# Expected: All checks pass

# Start services
orient start

# Check status
orient status
# Expected: Running

# Test health endpoint
curl -s http://localhost:4098/health | jq .
# Expected: {"status":"ok",...}

# Stop services
orient stop
```

### CLI Command Tests

```bash
orient --help      # Shows help
orient start       # Starts services
orient stop        # Stops services
orient status      # Shows status
orient logs        # Shows logs
orient doctor      # Runs diagnostics
orient config      # Shows/edits config
orient upgrade     # Upgrades to latest
orient uninstall   # Removes Orient (prompts for confirmation)
```

---

## Context Analyzer Testing

Test the intelligent context control system.

### Unit Tests

```bash
pnpm vitest run packages/agents/__tests__/contextAnalyzer.test.ts
```

**Expected**: ~15 tests covering:

- Frustration detection (keywords, tone, patterns)
- Topic shift detection (conversation flow changes)
- Context reset recommendations

### Integration Tests

```bash
INTEGRATION_TESTS=true pnpm vitest run packages/agents/__tests__/contextAnalyzer.integration.test.ts
```

**Expected**: ~20 tests covering multi-turn conversations and LLM-based analysis.

### E2E Tests

```bash
E2E_TESTS=true pnpm vitest run tests/e2e/context-analyzer.e2e.test.ts
```

**Expected**: ~15 tests with real conversation scenarios.

### Eval Cases

Run behavior evaluations:

```bash
# Frustration detection
pnpm vitest run evals/context-control/frustration-detection.yaml
pnpm vitest run evals/context-control/frustration-false-positive.yaml

# Topic shift detection
pnpm vitest run evals/context-control/topic-shift-detection.yaml
pnpm vitest run evals/context-control/topic-shift-false-positive.yaml
```

---

## Slack Interactive Buttons Testing

Test the new Slack approval buttons and session persistence.

### Manual Testing

1. Start the bot: `./run.sh dev start`
2. Send a message to the bot that triggers a permission prompt
3. Verify you see "Approve" and "Reject" buttons (not text commands)
4. Click a button and verify the action completes
5. Restart the bot: `./run.sh dev restart`
6. Send another message and verify the conversation context is preserved

### Unit Tests

```bash
pnpm vitest run packages/bot-slack/__tests__/pendingActions.test.ts
```

---

## Mini-Apps Backend Storage Testing

Test the key-value storage API for mini-apps.

### Manual Testing

1. Open the dashboard at `http://localhost:4098`
2. Navigate to Mini-Apps > Simple Todo
3. Add a todo item
4. Refresh the page - item should persist
5. Open in another browser - data should be shared (backend storage)

### API Testing

```bash
# Start services
./run.sh dev start

# Test storage endpoints
curl -X POST http://localhost:4098/api/mini-apps/storage \
  -H "Content-Type: application/json" \
  -d '{"key": "test-key", "value": {"data": "test"}}'

curl http://localhost:4098/api/mini-apps/storage/test-key
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
./run.sh dev start
```

### Scan QR Code

1. Open http://localhost:4098/qr/
2. Open WhatsApp on phone > Settings > Linked Devices > Link a Device
3. Scan the QR code

### Verify Connection

```bash
curl -s http://localhost:4098/health | jq .
# Expected: {"status":"ok","whatsapp":{"connected":true}}
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

## SQLite Database Verification

v0.2.0 uses SQLite exclusively. Verify database setup:

```bash
# Check database file exists
ls -la data/sqlite/orient.db

# Verify tables (using sqlite3)
sqlite3 data/sqlite/orient.db ".tables"
# Expected: 32 tables listed

# Check schema version
sqlite3 data/sqlite/orient.db "SELECT * FROM drizzle_migrations LIMIT 5;"
```

**Note**: No more `psql` commands - PostgreSQL is removed in v0.2.0.

---

## Test Coverage by Package

| Package                         | Tests | Critical Paths                              |
| ------------------------------- | ----- | ------------------------------------------- |
| `@orient-bot/core`              | 26    | Crypto, config                              |
| `@orient-bot/database-services` | 120+  | Feature flags, secrets, scheduler           |
| `@orient-bot/dashboard`         | 50+   | Routes, agents, integrations                |
| `@orient-bot/bot-whatsapp`      | 30+   | Messaging, QR, connection                   |
| `@orient-bot/bot-slack`         | 25+   | Messaging, pending actions, buttons         |
| `@orient-bot/integrations`      | 20+   | OAuth flows, JIRA, Linear                   |
| `@orient-bot/agents`            | 50+   | Context analyzer, prompts, OpenCode handler |

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

#### Context Analyzer (NEW in v0.2.0)

- `packages/agents/__tests__/contextAnalyzer.test.ts` - Unit tests for frustration/topic detection
- `packages/agents/__tests__/contextAnalyzer.integration.test.ts` - Integration tests with LLM
- `tests/e2e/context-analyzer.e2e.test.ts` - End-to-end conversation scenarios

#### Eval Cases (NEW in v0.2.0)

- `evals/context-control/frustration-detection.yaml` - Frustration detection accuracy
- `evals/context-control/frustration-false-positive.yaml` - False positive prevention
- `evals/context-control/topic-shift-detection.yaml` - Topic shift accuracy
- `evals/context-control/topic-shift-false-positive.yaml` - False positive prevention

---

## Cleanup

```bash
cd ~/code/tombensim/orient-fresh-test
./run.sh dev stop
cd ..
rm -rf orient-fresh-test

# For Mac installer cleanup (use uninstall command)
orient uninstall
# Or manually:
# orient stop && rm -rf ~/.orient
```

---

## OpenCode Security Testing

OpenCode uses different security models depending on the deployment mode.

### Local Install (PM2 / dev-local) — No Password

In local mode, OpenCode binds to `127.0.0.1` (localhost only). No password auth is needed since only local processes can reach it.

**Verify localhost-only binding:**

```bash
# Start local dev
./run.sh dev-local start

# Should work — localhost access
curl -s http://localhost:4099/global/health
# Expected: 200 OK

# Should NOT work — external access (from another machine on the network)
# Replace <ip> with the machine's LAN IP
curl -s http://<lan-ip>:4099/global/health
# Expected: Connection refused
```

**Verify no password prompt:**

```bash
# Open OpenCode directly — should load without credentials
open http://localhost:4099
# Expected: OpenCode UI loads, no Basic Auth prompt
```

**Verify sidebar link works:**

1. Open dashboard at `http://localhost:5173`
2. Click "OpenCode" in sidebar under "Tools"
3. Expected: OpenCode opens in new tab without password prompt

### Remote / Docker (nginx) — Password Protected

In Docker mode, OpenCode binds to `0.0.0.0` behind nginx. Nginx validates JWT cookies via `auth_request` and proxies to OpenCode with the server password.

**Verify auth is enforced:**

```bash
# Direct access without auth should be blocked by nginx
curl -s -o /dev/null -w "%{http_code}" http://localhost/opencode/
# Expected: 302 (redirect to login)

# With valid dashboard session cookie, should work
curl -s -b "session_cookie" http://localhost/opencode/
# Expected: 200 OK
```

**Verify password is set in Docker:**

```bash
# Inside the Docker container
docker exec orienter-opencode env | grep OPENCODE_SERVER_PASSWORD
# Expected: OPENCODE_SERVER_PASSWORD=<64-char hex>
```

---

## Known Issues (v0.2.0)

- **E2E Timeouts**: Up to 4 timeout errors in E2E tests are expected due to OpenCode server load
- **First Run**: SQLite database creation may take a few seconds on first start
- **Context Analyzer**: Requires valid ANTHROPIC_API_KEY for integration tests
- **Slack Buttons**: Require valid Slack app with interactivity enabled

---

## Rollback Procedure

**Note**: v0.2.0 cannot be rolled back to v0.1.x due to database incompatibility.

If critical issues are found:

```bash
# Stop services
orient stop
# or
./run.sh dev stop

# For Mac installer, uninstall
rm -rf ~/.orient

# Fresh install of v0.1.0 if needed (requires PostgreSQL setup)
git checkout v0.1.0
./run.sh doctor --fix
pnpm build:packages
./run.sh dev start
```

---

## Related Resources

For more detailed testing procedures and patterns, see:

- `.claude/skills/fresh-install-testing/SKILL.md` - Complete fresh install testing guide
- `.claude/skills/testing-strategy/SKILL.md` - Test patterns and templates
- `CHANGELOG.md` - Full release notes for v0.2.0
