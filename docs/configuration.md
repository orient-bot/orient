# Configuration

Orient uses local configuration files that are gitignored by default.

## Verify Your Setup

Before configuring, run the doctor script to check your environment:

```bash
./run.sh doctor
```

This will verify:

- Required tools (Node.js 20+, pnpm 9+, Docker)
- Configuration files exist
- Environment variables are set
- Ports are available

Use `./run.sh doctor --fix` only after you review the doctor output and approve changes. Auto-fix can create config files and update local secrets.

## Environment Variables

Start with `.env.example` and copy it to `.env`:

```bash
cp .env.example .env
```

### Required Variables

| Variable              | Description          |
| --------------------- | -------------------- |
| `POSTGRES_USER`       | PostgreSQL username  |
| `POSTGRES_PASSWORD`   | PostgreSQL password  |
| `MINIO_ROOT_USER`     | MinIO admin username |
| `MINIO_ROOT_PASSWORD` | MinIO admin password |

### Integration Variables

| Variable                        | Description                             |
| ------------------------------- | --------------------------------------- |
| `JIRA_HOST`                     | Your Jira instance URL                  |
| `JIRA_EMAIL`                    | Jira account email                      |
| `JIRA_API_TOKEN`                | Jira API token                          |
| `SLACK_BOT_TOKEN`               | Slack bot OAuth token                   |
| `SLACK_SIGNING_SECRET`          | Slack app signing secret                |
| `SLACK_APP_TOKEN`               | Slack app-level token (for Socket Mode) |
| `GOOGLE_OAUTH_CLIENT_ID`        | Google OAuth client ID                  |
| `GOOGLE_OAUTH_CLIENT_SECRET`    | Google OAuth client secret              |
| `GOOGLE_SLIDES_PRESENTATION_ID` | Default presentation ID                 |

## MCP Configuration

Start with `.mcp.config.example.json` and copy it to `.mcp.config.local.json`:

```bash
cp .mcp.config.example.json .mcp.config.local.json
```

This file wires integrations for the MCP server and IDE tooling.

## Secrets Hygiene

Do not commit:

- `.env`
- `.mcp.config.local.json`
- `.claude/skills/local/`

## Dashboard Authentication

On first visit to the dashboard, you'll be prompted to create an admin user.

If you forget your password, see [Troubleshooting: Resetting the Admin Password](troubleshooting.md#resetting-the-admin-password).
