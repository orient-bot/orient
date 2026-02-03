# Getting Started

This guide walks you through setting up Orient for local development.

## Prerequisites

- **Node.js 20+** - JavaScript runtime
- **pnpm 9+** - Package manager
- **Docker** - For local infrastructure (MinIO, Nginx)
- **Git** - Version control

## Step 1: Check Your Environment

Run the doctor script to verify your environment has all required tools:

```bash
./run.sh doctor
```

The doctor checks:

- Node.js and pnpm versions
- Docker and Docker Compose availability
- Required configuration files
- Port availability
- TypeScript compilation

If there are issues, review the output first. Only after you approve should you use auto-fix mode:

```bash
./run.sh doctor --fix
```

Auto-fix can install `pnpm`, create or update `.env`, generate secrets, copy config templates, install dependencies, and pull Docker images.

## Step 2: Install Dependencies

```bash
pnpm install
```

This installs all packages in the monorepo, including:

- `@orient-bot/core` - Configuration and utilities
- `@orient-bot/dashboard` - Dashboard server and frontend
- `@orient-bot/mcp-tools` - MCP tool implementations
- And more in `packages/`

## Step 3: Configure

Copy the example configuration files:

```bash
cp .env.example .env
cp .mcp.config.example.json .mcp.config.local.json
```

Edit `.env` with your credentials. At minimum, set:

- `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD`
- `DASHBOARD_JWT_SECRET`
- `ORIENT_MASTER_KEY`

See [Configuration](configuration.md) for all available settings.

## Step 4: Start Development

```bash
./run.sh dev
```

This starts:

| Service       | URL                     | Description                      |
| ------------- | ----------------------- | -------------------------------- |
| Dashboard     | http://localhost:80     | Main web UI (via Nginx)          |
| WhatsApp QR   | http://localhost:80/qr/ | QR code for WhatsApp pairing     |
| OpenCode      | http://localhost:4099   | MCP server for IDE integration   |
| Vite          | http://localhost:5173   | Frontend dev server (hot-reload) |
| MinIO Console | http://localhost:9001   | S3-compatible storage UI         |

**Note:** The database is SQLite (file-based at `.dev-data/instance-0/orient.db`) - no separate database service needed.

## Step 5: Verify

Check that everything is running:

```bash
./run.sh dev status
```

Or visit http://localhost:80 in your browser.

## Stopping

To stop all services:

```bash
./run.sh dev stop
```

## Available Commands

| Command                 | Description                    |
| ----------------------- | ------------------------------ |
| `./run.sh doctor`       | Check prerequisites            |
| `./run.sh doctor --fix` | Auto-fix issues (after review) |
| `./run.sh dev`          | Start development              |
| `./run.sh dev stop`     | Stop services                  |
| `./run.sh dev status`   | Show status                    |
| `./run.sh dev logs`     | View logs                      |
| `./run.sh instances`    | List running instances         |
| `./run.sh help`         | Show all commands              |

## Troubleshooting

For common issues like port conflicts, database problems, or password resets, see the full [Troubleshooting Guide](troubleshooting.md).

Quick fixes:

```bash
# Check environment
./run.sh doctor

# Auto-fix issues (after review)
./run.sh doctor --fix

# View logs
./run.sh dev logs
```

## Next Steps

- **[Integration Onboarding Guide](onboarding.md)** - Set up WhatsApp, Slack, and Google step-by-step
- Review [Configuration](configuration.md) for all available settings
- Set up [Integrations](integrations/slack.md) for Slack, WhatsApp, Jira
- Add custom skills under `.claude/skills/local/`
- Read [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines
