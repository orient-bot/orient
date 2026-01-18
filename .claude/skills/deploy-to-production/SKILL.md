---
name: deploy-to-production
description: Comprehensive guide for deploying Orient to production. Use this skill when deploying changes, updating production, fixing deployment failures, or rolling back. Covers pre-flight checks, environment variables, Docker compose configuration, CI/CD pipeline, smart change detection, and health verification.
---

# Deploy to Production

## Quick Reference

### Deploy via GitHub Actions (Recommended)

```bash
# Push to main triggers automatic deployment
git push origin main

# Watch deployment progress
gh run watch --exit-status

# Check deployment status
gh run list --limit 5
```

### Force Rebuild All Images

When you need to bypass change detection and rebuild everything:

```bash
# Via GitHub Actions UI: Run workflow with "Force rebuild all images" checked
# Or use workflow_dispatch:
gh workflow run deploy.yml -f force_build_all=true
```

### Manual Deployment (Emergency)

```bash
# SSH to server
ssh $OCI_USER@$OCI_HOST

# Navigate to docker directory
cd ~/orient/docker

# Pull and restart (uses v2 compose by default)
sudo docker compose -f docker-compose.v2.yml -f docker-compose.prod.yml -f docker-compose.r2.yml pull
sudo docker compose -f docker-compose.v2.yml -f docker-compose.prod.yml -f docker-compose.r2.yml up -d
```

## Smart Change Detection

The CI/CD pipeline uses intelligent change detection to only rebuild images when their source code changes.

### How It Works

The `detect-changes` job analyzes which files changed and sets build flags:

| Image          | Triggered By Changes In                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenCode**   | `src/**`, `packages/core/**`, `packages/mcp-tools/**`, `packages/mcp-servers/**`, `packages/agents/**`, `docker/Dockerfile.opencode*` |
| **WhatsApp**   | `packages/bot-whatsapp/**`, `packages/core/**`, `packages/database/**`                                                                |
| **Dashboard**  | `packages/dashboard/**`, `packages/dashboard-frontend/**`, `packages/core/**`                                                         |
| **All Images** | `package.json`, `pnpm-lock.yaml` (dependency changes)                                                                                 |

### Time Savings

| Scenario                            | Old Pipeline | New Pipeline |
| ----------------------------------- | ------------ | ------------ |
| Single package change               | ~20 min      | ~5-8 min     |
| Config-only change (nginx, compose) | ~20 min      | ~3 min       |
| All packages change                 | ~20 min      | ~20 min      |

### Workflow Jobs

```
detect-changes (8s)
     |
   test (40s)
     |
+----+----+----+
|    |    |    |
v    v    v    v
build-opencode  build-whatsapp  build-dashboard  (conditional)
     |              |                |
     +------+-------+----------------+
            |
            v
      deploy (2min)
```

## Pre-Deployment Checklist

### 1. Local Validation

Before pushing changes, always verify locally:

```bash
# Run tests (CI mode excludes e2e and eval tests)
pnpm run test:ci

# Run Docker validation tests
pnpm turbo test --filter @orient/core...

# Validate Docker compose syntax
cd docker
docker compose -f docker-compose.v2.yml -f docker-compose.prod.yml -f docker-compose.r2.yml config --services
```

### 2. Check Service Names Consistency

The v2 compose uses specific service names:

| Service   | V2 Service Name | Container Name        |
| --------- | --------------- | --------------------- |
| WhatsApp  | bot-whatsapp    | orienter-bot-whatsapp |
| Slack     | bot-slack       | orienter-bot-slack    |
| OpenCode  | opencode        | orienter-opencode     |
| Dashboard | dashboard       | orienter-dashboard    |

### 3. Environment Variables & GitHub Secrets

**CRITICAL**: Environment variables must be properly configured in three places:

1. `.env.production` file (local reference)
2. GitHub Secrets (for CI/CD)
3. Server `.env` file at `/home/opc/orient/.env`

#### Managing GitHub Secrets

**Update all secrets from .env.production**:

```bash
cat .env.production | grep -E '^[A-Z_][A-Z0-9_]*=' | while IFS='=' read -r key value; do
  value=$(echo "$value" | sed 's/^"//; s/"$//')
  echo "Setting: $key"
  echo "$value" | gh secret set "$key" --repo orient-core/orient
done
```

#### Critical Environment Variables

Required for production:

```bash
# Database
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}

# Dashboard Security (REQUIRED - causes crash loop if missing)
DASHBOARD_JWT_SECRET="<32+ character secure string>"

# Storage (R2)
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ACCOUNT_ID=

# OAuth Callbacks (must match registered URLs)
OAUTH_CALLBACK_URL=https://app.orient.bot/oauth/callback
GOOGLE_OAUTH_CALLBACK_URL=https://app.orient.bot/oauth/google/callback

# API Keys
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# Slack Configuration (optional)
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
SLACK_APP_TOKEN=
```

#### Applying Environment Variable Changes

**IMPORTANT**: `docker restart` does NOT reload environment variables from `.env`.

```bash
# WRONG - Won't pick up new env vars
ssh $OCI_USER@$OCI_HOST "docker restart orienter-dashboard"

# CORRECT - Recreates container with new env vars
ssh $OCI_USER@$OCI_HOST "cd /home/opc/orient/docker && \
  docker compose --env-file ../.env \
    -f docker-compose.v2.yml \
    -f docker-compose.prod.yml \
    -f docker-compose.r2.yml \
    up -d dashboard"
```

## CI/CD Pipeline

### GitHub Actions Workflow (.github/workflows/deploy.yml)

The deployment pipeline:

1. **Detect Changes** - Determines which images need rebuilding (8s)
2. **Tests** - Runs `pnpm run test:ci` (excludes e2e/eval tests)
3. **Build Images** - Only builds changed packages (conditional)
4. **Deploy** - Syncs files and restarts services

### Common CI Failures

| Issue                                  | Cause                     | Fix                             |
| -------------------------------------- | ------------------------- | ------------------------------- |
| `Cannot find package`                  | Missing devDependency     | Check pnpm-lock.yaml            |
| `No test found in suite`               | Eval tests included       | Use `test:ci` instead of `test` |
| Dockerfile not found                   | Path changed              | Update workflow matrix          |
| Container name conflict                | V1/V2 name mismatch       | Clean up both names             |
| `Missing parameter name at index 1: *` | Express 5 breaking change | Use `/{*splat}` not `*`         |

### Express 5 / path-to-regexp v8 Breaking Changes

Express 5 uses path-to-regexp v8, which has breaking changes:

**Problem**: Bare `*` wildcards no longer work

```typescript
// BROKEN in Express 5
app.get('*', (req, res) => { ... });

// FIXED - use named wildcard
app.get('/{*splat}', (req, res) => { ... });
```

**Error message**: `TypeError: Missing parameter name at index 1: *`

## Health Verification

### Production Health Checks

```bash
# Check all containers
ssh $OCI_USER@$OCI_HOST "docker ps --format 'table {{.Names}}\t{{.Status}}'"

# Check specific services
curl -sf https://app.orient.bot/health        # Nginx
curl -sf https://code.orient.bot/global/health  # OpenCode
curl -sf https://app.orient.bot/dashboard/api/health    # Dashboard
```

### Expected Container Names

- `orienter-nginx`
- `orienter-bot-whatsapp`
- `orienter-opencode`
- `orienter-dashboard`
- `orienter-postgres`

## Rollback Procedure

### Automatic Rollback

The CI pipeline automatically rolls back if health checks fail.

### Manual Rollback

```bash
ssh $OCI_USER@$OCI_HOST

cd ~/orient/docker
COMPOSE_FILES="-f docker-compose.v2.yml -f docker-compose.prod.yml -f docker-compose.r2.yml"

# Find latest backup
ls -t ~/orient/backups | head -5

# Restore
LATEST=$(ls -t ~/orient/backups | head -1)
sudo docker compose ${COMPOSE_FILES} down
cp -f ~/orient/backups/${LATEST}/*.yml .
sudo docker compose ${COMPOSE_FILES} up -d
```

## Troubleshooting

### Container Won't Start

1. Check logs: `docker logs orienter-dashboard --tail 100`
2. Check compose config: `docker compose config`
3. Verify service names match between compose files

### Dashboard Crash Loop

Check for Express 5 errors:

```bash
ssh $OCI_USER@$OCI_HOST "docker logs orienter-dashboard --tail 50 2>&1 | grep -i 'parameter name\|path-to-regexp'"
```

If you see `Missing parameter name at index 1: *`, fix the SPA catch-all route.

### SSL Certificate Issues

```bash
# Check certificate paths
ls -la ~/orient/certbot/conf/live/

# Verify nginx can read certs
docker exec orienter-nginx ls -la /etc/nginx/ssl/
```

### Database Connection Failed

```bash
# Check database health
docker exec orienter-postgres pg_isready -U aibot -d whatsapp_bot

# Check DATABASE_URL in container
docker exec orienter-dashboard env | grep DATABASE_URL
```

### WhatsApp Pairing Issues After Deploy

```bash
# Container restart usually fixes pairing issues
docker restart orienter-bot-whatsapp

# Full reset if needed (clears session)
rm -rf ~/orient/data/whatsapp-auth/*
docker restart orienter-bot-whatsapp
```

## Quick Commands

```bash
# Check production status
ssh opc@152.70.172.33 "docker ps --format 'table {{.Names}}\t{{.Status}}'"

# View dashboard logs
ssh opc@152.70.172.33 "docker logs orienter-dashboard --tail 100"

# View nginx logs
ssh opc@152.70.172.33 "docker logs orienter-nginx --tail 50"

# Restart dashboard
ssh opc@152.70.172.33 "docker restart orienter-dashboard"

# Full redeploy
git push origin main && gh run watch --exit-status

# Force full rebuild
gh workflow run deploy.yml -f force_build_all=true
```

## Server Details

- **Host**: 152.70.172.33
- **User**: opc
- **Deploy Directory**: ~/orient
- **Docker Directory**: ~/orient/docker
- **Data Directory**: ~/orient/data
- **Domains**:
  - `app.orient.bot` - Dashboard
  - `code.orient.bot` - OpenCode
  - `staging.orient.bot` - Staging Dashboard
  - `code-staging.orient.bot` - Staging OpenCode
