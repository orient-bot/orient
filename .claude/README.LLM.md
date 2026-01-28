# LLM Onboarding Guide

This guide is for AI/LLM agents setting up Orient for the first time.

## Quick Start (Fresh Installation)

```bash
# Step 1: Run diagnostics
./run.sh doctor

# Step 2: Review output and approve changes
# Only after you approve, run:
./run.sh doctor --fix

# Step 3: Install/build/start
pnpm install
pnpm build:packages
./run.sh dev
```

Or step by step:

### 1. Prerequisites Check

Run the doctor script to verify your environment:

```bash
./run.sh doctor
```

If there are issues, review the output and decide what should be changed. Only after you approve should you run fix mode:

```bash
./run.sh doctor --fix
```

Fix mode can:

- Install `pnpm`
- Create or update `.env` from `.env.example`
- Generate secrets (JWT/master key)
- Copy MCP config templates
- Install dependencies
- Pull Docker images

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Build Workspace Packages

The workspace packages must be built before running the dev server:

```bash
pnpm build:packages
```

This builds all packages in the `packages/` directory in dependency order:

- `@orientbot/core` - Configuration, logging, utilities
- `@orientbot/database` - Database schemas and clients
- `@orientbot/database-services` - Database service layer
- `@orientbot/integrations` - Third-party integrations
- `@orientbot/agents` - Agent framework
- `@orientbot/mcp-tools` - MCP tool implementations
- `@orientbot/dashboard` - Dashboard server and API

### 4. Start Development Environment

```bash
./run.sh dev
```

**Note**: On first run, `.env` is automatically created from `.env.example` with working defaults.

This starts:

- Docker infrastructure (PostgreSQL, MinIO, Nginx)
- Vite frontend dev server with hot-reload
- Dashboard API server
- OpenCode MCP server
- WhatsApp bot (optional)
- Slack bot (if configured)

## Environment Setup (Automatic)

Fresh clones auto-configure on first run:

1. **`.env` creation**: `./run.sh dev` or `./run.sh doctor --fix` creates `.env` from `.env.example`
2. **Default credentials**: Work with Docker infrastructure out of the box
3. **Setup wizard**: At http://localhost:80 for first-time admin user creation
4. **Integration config**: Via Dashboard at `/dashboard/integrations/secrets`

### Default Development Credentials

| Variable               | Default Value        | Notes                                  |
| ---------------------- | -------------------- | -------------------------------------- |
| `POSTGRES_USER`        | `aibot`              | Matches Docker init script             |
| `POSTGRES_PASSWORD`    | `aibot123`           | Local development only                 |
| `MINIO_ROOT_USER`      | `minioadmin`         | Default MinIO credentials              |
| `MINIO_ROOT_PASSWORD`  | `minioadmin123`      | Default MinIO credentials              |
| `DASHBOARD_JWT_SECRET` | `dev-jwt-secret-...` | 64 chars, auto-generated in --fix mode |

**For production**: Generate secure values for all passwords and secrets!

### 5. Access Points

| Service       | URL                     | Description               |
| ------------- | ----------------------- | ------------------------- |
| Dashboard     | http://localhost:80     | Main UI (via Nginx proxy) |
| WhatsApp QR   | http://localhost:80/qr/ | Scan to connect WhatsApp  |
| Dashboard API | http://localhost:4098   | Backend API               |
| OpenCode      | http://localhost:4099   | MCP server for IDEs       |
| Vite Dev      | http://localhost:5173   | Frontend hot-reload       |
| MinIO Console | http://localhost:9001   | S3 storage admin          |
| PostgreSQL    | localhost:5432          | Database                  |

## Multi-Instance Support

You can run multiple Orient instances using `AI_INSTANCE_ID`:

```bash
# Instance 0 (default) - ports 80, 4097, 4098, 4099
./run.sh dev

# Instance 1 - ports offset by 1000: 1080, 5097, 5098, 5099
AI_INSTANCE_ID=1 ./run.sh dev

# Instance 2 - ports offset by 2000: 2080, 6097, 6098, 6099
AI_INSTANCE_ID=2 ./run.sh dev
```

Each instance uses separate:

- Docker containers (e.g., `orienter-postgres-1`)
- PostgreSQL database (`whatsapp_bot_1`)
- MinIO bucket (`orienter-data-1`)
- Data directories (`.dev-data/instance-1/`)
- Log files (`logs/instance-1/`)

## First-Time Setup Wizard

On first access to the dashboard, the Setup Wizard appears:

1. **Required Fields**:
   - `POSTGRES_USER` / `POSTGRES_PASSWORD` - Database credentials
   - `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` - S3 storage credentials
   - `DASHBOARD_JWT_SECRET` - 32+ character secret for JWT signing

2. **Quick Setup**: Click "Use defaults and continue" to auto-generate secure defaults

3. **Admin User**: Create the first admin user (username + password)

4. **Restart Required**: After setup, restart the dev server to apply changes

## Browser-Based Configuration

### Configure Secrets (API Keys)

Navigate to `/dashboard/integrations/secrets` to add:

- `ANTHROPIC_API_KEY` - For Claude models
- `OPENAI_API_KEY` - For GPT models and Whisper transcription
- `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN` - For Jira integration
- `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN` - For Slack

### Configure Providers

Navigate to `/dashboard/integrations/providers` to set model preferences.

### Configure Schedules

Navigate to `/dashboard/automation/schedules` to create recurring jobs.

## Stopping and Cleaning Up

```bash
# Stop the dev environment
./run.sh dev stop

# Show running status
./run.sh dev status

# List all running instances
./run.sh instances
```

## Troubleshooting

### Port Already in Use

```bash
# Check what's using a port
lsof -i :4097

# Kill processes on that port
./run.sh dev stop
```

### Database Connection Failed

Check if PostgreSQL is running:

```bash
docker ps | grep orienter-postgres
```

### Module Resolution Errors

Ensure packages are built:

```bash
pnpm build:packages
```

### Dashboard Won't Start

Check logs:

```bash
tail -f logs/instance-0/dashboard-dev.log
```

Common fixes:

1. Rebuild database package: `pnpm --filter @orientbot/database build`
2. Reinstall dependencies: `pnpm install`
3. Check port availability: `lsof -i :4098`

## Architecture Overview

```
orient/
├── packages/           # Workspace packages (npm modules)
│   ├── core/          # Shared utilities, config, logging
│   ├── database/      # Drizzle schemas, migrations
│   ├── database-services/  # Database service layer
│   ├── integrations/  # Jira, Slack, Google, etc.
│   ├── agents/        # Agent framework and registry
│   ├── mcp-tools/     # MCP tool implementations
│   ├── dashboard/     # Dashboard server + React frontend
│   ├── bot-whatsapp/  # WhatsApp bot service
│   └── bot-slack/     # Slack bot service
├── src/               # Root application code (legacy)
├── docker/            # Docker Compose files
├── scripts/           # Shell scripts for dev/deploy
└── data/              # Runtime data (SQLite, media)
```

## Key Files

| File                                | Purpose                             |
| ----------------------------------- | ----------------------------------- |
| `run.sh`                            | Main entry point for all operations |
| `scripts/dev.sh`                    | Development environment script      |
| `scripts/doctor.sh`                 | Environment diagnostics             |
| `docker/docker-compose.infra.yml`   | Local dev infrastructure            |
| `packages/dashboard/src/main.ts`    | Dashboard server entry              |
| `packages/bot-whatsapp/src/main.ts` | WhatsApp bot entry                  |

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run E2E tests (requires running infrastructure)
pnpm test:e2e
```

## For AI Agents

When working on this codebase:

1. **Always check `./run.sh doctor`** before making changes
2. **Build packages after changes**: `pnpm build:packages`
3. **Use multi-instance mode** to test changes without affecting main dev data
4. **Check logs** in `logs/instance-N/` for debugging
5. **The dashboard at :80** is the main UI entry point
6. **The setup wizard** handles first-time configuration automatically
