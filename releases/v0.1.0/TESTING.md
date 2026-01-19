# Testing Procedures - v0.1.0

Complete testing procedures for fresh installs and release verification.

---

## Automated Tests

### Run Full Test Suite

```bash
pnpm test:ci
```

### Test Files Modified/Added in This Release

1. `packages/slack-bot/src/__tests__/onboarding.test.ts`
2. `packages/slack-bot/src/__tests__/interactive-buttons.test.ts`
3. `packages/slack-bot/src/__tests__/session-persistence.test.ts`
4. `packages/dashboard-frontend/src/__tests__/version-notification.test.ts`
5. `packages/dashboard-frontend/src/__tests__/storage-tab.test.ts`
6. `packages/dashboard-frontend/src/__tests__/credentials-modal.test.ts`
7. `packages/whatsapp-bot/src/__tests__/fresh-install.test.ts`
8. `packages/whatsapp-bot/src/__tests__/health-endpoint.test.ts`
9. `packages/mini-apps/src/__tests__/share-link.test.ts`
10. `packages/api/src/__tests__/active-integrations.test.ts`
11. `packages/api/src/__tests__/migrations.test.ts`
12. `packages/database/__tests__/migration-numbering.test.ts` - Prevents duplicate migration prefixes

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

| #   | Test Case           | Steps                            | Expected Result                                  |
| --- | ------------------- | -------------------------------- | ------------------------------------------------ |
| 1   | Onboarding DM       | Add bot to new workspace         | User receives welcome DM with setup instructions |
| 2   | Dashboard Banner    | New workspace without onboarding | Banner prompts to complete setup                 |
| 3   | Interactive Buttons | Click action button in message   | Button callback fires, action executes           |
| 4   | Session Persistence | Send multi-step command          | Context maintained across messages               |

#### Test Commands

```bash
# View onboarding events
docker compose logs slack-bot | grep -i onboarding

# Check session storage
curl http://localhost:4098/api/slack/sessions
```

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
```

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
