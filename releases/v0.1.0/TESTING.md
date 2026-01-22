# Testing Procedures - v0.1.0

Complete testing procedures for fresh installs and release verification.

---

## Automated Tests

### Run Full Test Suite

```bash
# Run all tests (recommended)
pnpm test:ci

# Run with turborepo (parallel, cached)
pnpm turbo test

# Run specific package tests
pnpm --filter @orient/database test
pnpm --filter @orient/dashboard test
pnpm --filter @orient/database-services test
```

### Test Coverage by Package

| Package                     | Tests | Coverage | Critical Paths                    |
| --------------------------- | ----- | -------- | --------------------------------- |
| `@orient/core`              | 26    | 100%     | Crypto, config                    |
| `@orient/database-services` | 120+  | 62%      | Feature flags, secrets, scheduler |
| `@orient/dashboard`         | 50+   | -        | Routes, agents, integrations      |
| `@orient/bot-whatsapp`      | 30+   | -        | Messaging, QR, connection         |
| `@orient/bot-slack`         | 25+   | -        | Messaging, pending actions        |
| `@orient/integrations`      | 20+   | 44%      | OAuth flows, JIRA, Linear         |

### Test Files by Category

#### Security & Encryption (PR #52)

- `packages/core/__tests__/crypto.test.ts` - AES-256-GCM encryption (100% coverage)
- `packages/database-services/__tests__/secretsService.test.ts` - Secrets management (96%)

#### Database Services

- `packages/database-services/__tests__/featureFlagsService.test.ts` - Feature flag cascade logic
- `packages/database-services/__tests__/schedulerDatabase.test.ts` - Scheduled tasks (87%)
- `packages/database-services/__tests__/messageDatabase.test.ts` - Message storage
- `packages/database-services/__tests__/chatPermissionService.test.ts` - Permissions
- `packages/database-services/__tests__/versionPreferencesService.test.ts` - Version prefs

#### Dashboard & API

- `packages/dashboard/__tests__/featureFlags.routes.test.ts` - Feature flags API
- `packages/dashboard/__tests__/agents.routes.test.ts` - Agent management
- `packages/dashboard/__tests__/integrations.routes.test.ts` - Integration endpoints
- `packages/dashboard/__tests__/mcp.routes.test.ts` - MCP server routes
- `packages/dashboard-frontend/__tests__/routes.test.ts` - Frontend routing
- `packages/dashboard-frontend/__tests__/useVersionCheck.test.ts` - Version hooks

#### Bot Tests

- `packages/bot-whatsapp/__tests__/messaging.test.ts` - WhatsApp messaging
- `packages/bot-whatsapp/__tests__/qr-api-endpoints.test.ts` - QR code API
- `packages/bot-whatsapp/__tests__/qr-regeneration.test.ts` - QR regeneration
- `packages/bot-whatsapp/__tests__/e2e-message-flow.test.ts` - E2E message flow
- `packages/bot-slack/__tests__/messaging.test.ts` - Slack messaging
- `packages/bot-slack/__tests__/pendingActions.test.ts` - Approval buttons

#### Integrations & OAuth

- `packages/integrations/__tests__/jira-oauth.test.ts` - JIRA OAuth flow
- `packages/integrations/__tests__/linear-oauth.test.ts` - Linear OAuth flow
- `packages/integrations/__tests__/loader.test.ts` - Integration loader

#### Infrastructure

- `packages/database/__tests__/migration-numbering.test.ts` - Prevents duplicate migrations
- `packages/database/__tests__/schema.test.ts` - Schema validation

---

## Feature Flags Testing

The feature flags system uses hierarchical cascade logic where disabling a parent flag automatically disables all children.

### Automated Tests

```bash
# Run feature flags service tests
pnpm --filter @orient/database-services test -- featureFlagsService

# Run feature flags routes tests
pnpm --filter @orient/dashboard test -- featureFlags.routes
```

### Test Coverage

| Test File                     | Tests | Coverage                      |
| ----------------------------- | ----- | ----------------------------- |
| `featureFlagsService.test.ts` | 12    | Cascade logic, user overrides |
| `featureFlags.routes.test.ts` | 8     | API endpoints                 |

### Manual Testing Matrix

| Scenario           | Steps                              | Expected Result                     |
| ------------------ | ---------------------------------- | ----------------------------------- |
| Parent cascade     | Disable `mini_apps` parent         | All `mini_apps.*` children disabled |
| User override      | Enable `mini_apps.create` for user | User sees feature enabled           |
| Override + cascade | Disable parent with child override | Child still disabled (cascade wins) |
| Deep hierarchy     | Disable `a.b` in `a.b.c` chain     | `a.b.c` disabled, `a` unaffected    |

### API Endpoints

```bash
# Get all flags with effective values for user
curl http://localhost:4098/api/feature-flags?userId=1

# Get effective flags (flat object)
curl http://localhost:4098/api/feature-flags/effective?userId=1

# Set user override
curl -X POST http://localhost:4098/api/feature-flags/mini_apps/override \
  -H "Content-Type: application/json" \
  -d '{"userId": 1, "enabled": false}'

# Remove user override
curl -X DELETE http://localhost:4098/api/feature-flags/mini_apps/override?userId=1
```

---

## Manual Testing Environments

### 1. Fresh Dev Install

Test a clean development environment setup.

#### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker and Docker Compose
- Git

#### Setup Steps

```bash
# Clone fresh
git clone <repo-url> orient-test
cd orient-test
git checkout dev

# Install dependencies
pnpm install

# Setup environment
cp .env.example .env
# Edit .env with required values

# Start development
./run.sh dev
```

#### Verification Checklist

- [ ] `pnpm install` completes without errors
- [ ] `./run.sh dev` starts all services
- [ ] Dashboard accessible at http://localhost:3000
- [ ] API health check passes: `curl http://localhost:4098/health`
- [ ] Database migrations run successfully
- [ ] No console errors in browser DevTools

---

### 2. Docker Fresh Install

Test containerized deployment with clean volumes.

#### Setup Steps

```bash
# Remove existing volumes
docker compose down -v

# Build fresh images
docker compose build --no-cache

# Start services
docker compose up -d

# Check logs
docker compose logs -f
```

#### Health Checks

```bash
# API health
curl http://localhost:4098/health

# Dashboard
curl http://localhost:3000

# WhatsApp bot (if configured)
curl http://localhost:4099/health
```

#### Verification Checklist

- [ ] All containers start successfully
- [ ] Database initializes with migrations
- [ ] Services communicate correctly
- [ ] Logs show no critical errors
- [ ] Health endpoints return 200 OK

---

### 3. Staging Deployment

Verify GitHub Actions deployment workflow.

#### Trigger Deployment

1. Push to `staging` branch or trigger manual workflow
2. Monitor GitHub Actions for workflow status

#### Verification Checklist

- [ ] Workflow completes without failures
- [ ] Database migrations run in correct order
- [ ] Nginx configuration applies correctly
- [ ] All services healthy after deployment
- [ ] SSL certificates valid (if applicable)

---

## Platform-Specific Tests

### WhatsApp Bot Tests

| #   | Test Case              | Steps                              | Expected Result                           |
| --- | ---------------------- | ---------------------------------- | ----------------------------------------- |
| 1   | Fresh Pairing          | Start bot with no existing session | Pairing code displayed, QR code available |
| 2   | Health Endpoint Timing | Call `/health` during startup      | Returns 503 until ready, then 200         |
| 3   | Pairing Code Display   | Initiate fresh pairing             | 8-digit code shown in logs and dashboard  |
| 4   | Factory Reset          | Delete session, restart bot        | Bot prompts for new pairing               |

#### Test Commands

```bash
# Health check during startup
watch -n 1 'curl -s http://localhost:4099/health | jq .'

# View pairing logs
docker compose logs whatsapp-bot | grep -i pairing
```

---

### Slack Bot Tests

#### Automated Tests

```bash
# Run all Slack bot tests
pnpm --filter @orient/bot-slack test

# Specific test files
pnpm --filter @orient/bot-slack test -- messaging.test.ts
pnpm --filter @orient/bot-slack test -- pendingActions.test.ts
```

| Test File                | Tests | Coverage                                 |
| ------------------------ | ----- | ---------------------------------------- |
| `messaging.test.ts`      | 12    | Message posting, threads, DMs, reactions |
| `pendingActions.test.ts` | 8     | Approve/reject buttons, timeout handling |
| `main.test.ts`           | 5     | Bot initialization, event handlers       |

#### Manual E2E Testing Matrix

| #   | Test Case           | Steps                             | Expected Result                                  |
| --- | ------------------- | --------------------------------- | ------------------------------------------------ |
| 1   | Onboarding DM       | Add bot to new workspace          | User receives welcome DM with setup instructions |
| 2   | Dashboard Banner    | New workspace without onboarding  | Banner prompts to complete setup                 |
| 3   | Interactive Buttons | Click action button in message    | Button callback fires, action executes           |
| 4   | Session Persistence | Send multi-step command           | Context maintained across messages               |
| 5   | Approval Flow       | Trigger action requiring approval | Button appears, approve works, action executes   |
| 6   | Rejection Flow      | Click reject on approval button   | Action cancelled, user notified                  |
| 7   | Timeout Handling    | Let approval expire               | Action cancelled after timeout                   |

#### Test Commands

````bash
# View onboarding events
docker compose logs slack-bot | grep -i onboarding

# Check session storage
curl http://localhost:4098/api/slack/sessions

# Test approval system
curl http://localhost:4098/api/slack/pending-actions

---

### Dashboard Tests

| #   | Test Case               | Steps                                     | Expected Result                                  |
| --- | ----------------------- | ----------------------------------------- | ------------------------------------------------ |
| 1   | Version Notification    | Load dashboard after upgrade              | Banner shows new version available               |
| 2   | Dismiss Version         | Click dismiss on version banner           | Banner hidden, preference saved                  |
| 3   | Remind Later            | Click "Remind me later"                   | Banner hidden temporarily                        |
| 4   | Operations Tab          | Navigate to Operations                    | Tools and operations consolidated in single view |
| 5   | Storage Tab             | Navigate to Storage                       | Key-value storage data displayed                 |
| 6   | Credentials Modal       | Click "Manage Credentials" on integration | Modal opens with credential fields               |
| 7   | Active Integrations API | Call `/api/integrations/active`           | Returns list of configured integrations          |

#### Test Commands

```bash
# Test active integrations API
curl http://localhost:4098/api/integrations/active | jq .

# Clear version preferences (for re-testing)
curl -X DELETE http://localhost:4098/api/user/version-preferences
````

---

### Mini-Apps Tests

| #   | Test Case                  | Steps                                         | Expected Result                           |
| --- | -------------------------- | --------------------------------------------- | ----------------------------------------- |
| 1   | Share Link Generation      | Create mini-app, click Share                  | Shareable URL generated and copied        |
| 2   | Link Button                | View app card                                 | Link button visible, opens app in new tab |
| 3   | Missing Integrations Badge | Create app requiring unconfigured integration | Badge shows count of missing integrations |

#### Test Commands

```bash
# List mini-apps
curl http://localhost:4098/api/mini-apps | jq .

# Check share link format
# Should be: https://<host>/apps/<app-id>
```

---

## Regression Testing

### Critical Paths to Verify

1. **Authentication Flow**
   - Login succeeds
   - Token refresh works
   - No 401 reload loops

2. **Dashboard Navigation**
   - All sidebar items accessible
   - Router works at root path
   - No blank pages on refresh

3. **Bot Connectivity**
   - WhatsApp connects and stays connected
   - Slack events received and processed
   - Messages delivered without timeout

4. **Database Operations**
   - Migrations apply cleanly
   - CRUD operations work
   - No connection pool exhaustion

---

## Test Completion Sign-off

| Area                 | Tester | Date | Pass/Fail | Notes |
| -------------------- | ------ | ---- | --------- | ----- |
| Automated Tests      |        |      |           |       |
| Fresh Dev Install    |        |      |           |       |
| Docker Fresh Install |        |      |           |       |
| Staging Deployment   |        |      |           |       |
| WhatsApp Tests       |        |      |           |       |
| Slack Tests          |        |      |           |       |
| Dashboard Tests      |        |      |           |       |
| Mini-Apps Tests      |        |      |           |       |
| Regression Tests     |        |      |           |       |

---

## Test Automation Opportunities

### Currently Automated

| Area              | Coverage | Status                 |
| ----------------- | -------- | ---------------------- |
| Unit tests        | 60%+     | CI enforced            |
| Database services | 62%      | PR #52                 |
| Crypto/Secrets    | 96-100%  | PR #52                 |
| API routes        | Good     | Most endpoints covered |
| Frontend routing  | Good     | Route state tests      |

### Recommended Automation Additions

| Priority   | Area                  | Test Type        | Effort |
| ---------- | --------------------- | ---------------- | ------ |
| **High**   | Slack E2E             | Integration      | Medium |
| **High**   | WhatsApp connection   | E2E              | High   |
| **High**   | Feature flags cascade | Integration      | Low    |
| **Medium** | OAuth flows complete  | E2E              | Medium |
| **Medium** | Mini-app creation     | Integration      | Medium |
| **Low**    | Dashboard UI          | E2E (Playwright) | High   |

### CI Pipeline Tests

Tests run automatically on PR:

```yaml
# .github/workflows/ci.yml
- pnpm test:ci # All unit + integration tests
- pnpm build # Build validation
- pnpm typecheck # TypeScript validation
- pnpm lint # ESLint checks
```

### Adding New Automated Tests

1. **For new features**: Add unit tests in `packages/<pkg>/__tests__/`
2. **For bug fixes**: Add regression test covering the fix
3. **For API changes**: Add route tests in `packages/dashboard/__tests__/`
4. **For security**: Add to `packages/core/__tests__/` or `database-services`

Reference the `/testing-strategy` skill for test patterns and templates.

---

## Known Issues

Document any known issues discovered during testing:

1. _None documented yet_

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

- **Testing Strategy Skill**: `/testing-strategy` - Comprehensive test patterns and templates
- **Fresh Install Skill**: `/fresh-install-cleanup` - Clean install verification
- **Deploy to Production**: `/deploy-to-production` - Production deployment checklist
