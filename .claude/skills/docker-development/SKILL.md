---
name: docker-development
description: Local Docker development workflow for the Orient. Use when asked to build Docker images, run containers locally, debug container issues, optimize builds, use docker-compose, or troubleshoot containerization problems. Covers per-package Dockerfiles, compose layering, build optimization, and local debugging.
---

# Docker Development Workflow

## Quick Reference

### Start Local Development Stack

```bash
# Start all services (per-package builds)
cd docker
docker compose -f docker-compose.v2.yml -f docker-compose.local.yml up -d

# Start specific services
docker compose -f docker-compose.v2.yml -f docker-compose.local.yml up -d bot-whatsapp opencode postgres

# Start with optional profiles
docker compose -f docker-compose.v2.yml -f docker-compose.local.yml --profile slack up -d
```

### Build Individual Packages

```bash
# From repository root
docker build -t orienter-bot-whatsapp -f packages/bot-whatsapp/Dockerfile .
docker build -t orienter-bot-slack -f packages/bot-slack/Dockerfile .
docker build -t orienter-api-gateway -f packages/api-gateway/Dockerfile .
docker build -t orienter-dashboard -f packages/dashboard/Dockerfile .
docker build -t orienter-mcp-tools -f packages/mcp-tools/Dockerfile.opencode .
```

### View Logs

```bash
docker logs -f orienter-bot-whatsapp
docker logs -f orienter-opencode
docker logs -f orienter-postgres
```

### Stop Stack

```bash
docker compose -f docker-compose.v2.yml -f docker-compose.local.yml down

# Remove volumes too
docker compose -f docker-compose.v2.yml -f docker-compose.local.yml down -v
```

## Per-Package Dockerfile Pattern

Each deployable package has its own multi-stage Dockerfile:

```
packages/
├── bot-whatsapp/Dockerfile      # WhatsApp bot container
├── bot-slack/Dockerfile         # Slack bot container
├── api-gateway/Dockerfile       # API gateway container
├── dashboard/Dockerfile         # Dashboard container
└── mcp-tools/Dockerfile.opencode # MCP server (OpenCode sidecar)
```

### Multi-Stage Build Pattern

All Dockerfiles follow a 4-stage pattern:

```dockerfile
# Stage 1: Base - Node + pnpm
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

# Stage 2: Dependencies - Install workspace deps
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/*/package.json ./packages/*/
RUN pnpm install --frozen-lockfile --filter @orient/package...

# Stage 3: Builder - Build the package
FROM deps AS builder
COPY packages/ ./packages/
RUN pnpm --filter @orient/package... build

# Stage 4: Runner - Production image
FROM node:20-alpine AS runner
COPY --from=builder /app/packages/ ./packages/
RUN pnpm install --frozen-lockfile --prod --filter @orient/package...
CMD ["node", "dist/main.js"]
```

### Why Per-Package?

| Benefit         | Before (Monolithic)  | After (Per-Package) |
| --------------- | -------------------- | ------------------- |
| Build time      | Full repo every time | Only package + deps |
| Image size      | ~500MB+              | ~150-250MB          |
| Cache usage     | Poor                 | Excellent           |
| Parallel builds | Limited              | Full parallelism    |

## Docker Compose Layering

### File Hierarchy

```
docker/
├── docker-compose.v2.yml      # Base services with per-package builds
├── docker-compose.local.yml   # Local overrides (MinIO, no SSL)
├── docker-compose.prod.yml    # Production overrides (R2, SSL)
├── docker-compose.r2.yml      # Cloudflare R2 storage
└── docker-compose.yml         # Legacy (deprecated)
```

### Local Development

```bash
docker compose -f docker-compose.v2.yml -f docker-compose.local.yml up -d
```

Includes:

- MinIO for local S3-compatible storage
- HTTP only (no SSL certificates)
- Local nginx config
- Health checks enabled

### Production

```bash
docker compose -f docker-compose.v2.yml -f docker-compose.prod.yml -f docker-compose.r2.yml up -d
```

Includes:

- Cloudflare R2 for storage
- HTTPS with Let's Encrypt
- SSL nginx config
- Restart policies

## Container Names

| Service      | Container Name          |
| ------------ | ----------------------- |
| WhatsApp Bot | `orienter-bot-whatsapp` |
| Slack Bot    | `orienter-bot-slack`    |
| OpenCode/MCP | `orienter-opencode`     |
| API Gateway  | `orienter-api-gateway`  |
| Dashboard    | `orienter-dashboard`    |
| PostgreSQL   | `orienter-postgres`     |
| MinIO        | `orienter-minio`        |
| Nginx        | `orienter-nginx`        |

## Build Optimization

### Faster Rebuilds

```bash
# Use BuildKit (auto-enabled in modern Docker)
DOCKER_BUILDKIT=1 docker build ...

# Build with cache from previous image
docker build --cache-from orienter-bot-whatsapp:latest \
  -t orienter-bot-whatsapp:new \
  -f packages/bot-whatsapp/Dockerfile .
```

### Layer Caching

The Dockerfile stages are designed to maximize cache reuse:

1. **deps stage**: Only rebuilds if `package.json` or lock file changes
2. **builder stage**: Only rebuilds if source code changes
3. **runner stage**: Reuses production deps from previous builds

### Parallel Builds

Build multiple images in parallel:

```bash
docker compose -f docker-compose.v2.yml build --parallel
```

## Debugging Containers

### Interactive Shell

```bash
# Running container
docker exec -it orienter-bot-whatsapp sh

# Start container with shell override
docker run -it --entrypoint sh orienter-bot-whatsapp
```

### Inspect Container State

```bash
# Container status
docker inspect orienter-bot-whatsapp | jq '.[0].State'

# Environment variables
docker inspect orienter-bot-whatsapp | jq '.[0].Config.Env'

# Volume mounts
docker inspect orienter-bot-whatsapp | jq '.[0].Mounts'
```

### Debug Build Failures

```bash
# Build with verbose output
docker build --progress=plain -f packages/bot-whatsapp/Dockerfile .

# Stop at specific stage
docker build --target deps -f packages/bot-whatsapp/Dockerfile .
```

### Check Health

```bash
# Health status
docker inspect orienter-bot-whatsapp | jq '.[0].State.Health'

# Health check logs
docker inspect orienter-bot-whatsapp | jq '.[0].State.Health.Log'
```

## Volume Mounts

| Volume/Mount                                         | Purpose                    |
| ---------------------------------------------------- | -------------------------- |
| `./data:/app/data`                                   | WhatsApp auth, media files |
| `./logs:/app/logs`                                   | Application logs           |
| `./credentials:/app/credentials`                     | Google service account     |
| `.mcp.config.local.json:/app/.mcp.config.local.json` | MCP configuration          |
| `postgres-data:/var/lib/postgresql/data`             | Database persistence       |
| `minio-data:/data`                                   | Local S3 storage           |

## Common Issues

### Container Won't Start

```bash
# Check logs
docker logs orienter-bot-whatsapp --tail 100

# Common causes:
# - Missing environment variables
# - Database not ready (check depends_on)
# - Port already in use
```

### Permission Issues

```bash
# Fix data directory ownership
sudo chown -R $(id -u):$(id -g) ./data ./logs

# Or run container as specific user
docker run --user $(id -u):$(id -g) ...
```

### Build Cache Issues

```bash
# Force rebuild without cache
docker compose build --no-cache bot-whatsapp

# Or single service
docker build --no-cache -f packages/bot-whatsapp/Dockerfile .
```

### Network Issues Between Containers

```bash
# Check container is on network
docker network inspect orienter-network

# Test connectivity from container
docker exec orienter-bot-whatsapp ping postgres
docker exec orienter-bot-whatsapp curl http://opencode:4099/global/health
```

## Running Tests Against Containers

```bash
# Run Docker tests
pnpm test:docker:files

# Build validation only
pnpm test:docker:build

# Full integration test
docker compose -f docker-compose.v2.yml -f docker-compose.local.yml up -d
sleep 30  # Wait for services
curl http://localhost:4097/health
curl http://localhost:4099/global/health
docker compose down
```

## Environment Variables

### Required for All Services

```bash
NODE_ENV=production
TZ=Asia/Jerusalem  # or your timezone
DATABASE_URL=postgresql://user:pass@postgres:5432/db
```

### Per-Service Variables

```bash
# WhatsApp Bot
SESSION_PATH=/app/data/whatsapp-auth
OPENCODE_URL=http://opencode:4099

# Slack Bot
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...

# API Gateway
API_GATEWAY_PORT=4100

# Dashboard
DASHBOARD_PORT=4098
```
