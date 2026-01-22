---
sidebar_position: 4
---

# Command-Line Interface

<div style={{ textAlign: 'center', marginBottom: '2rem' }}>
  <img src="/img/mascot/ori-thinking.png" alt="Ori with terminal" width="180" />
</div>

Manage Orient's schedulers, webhooks, and agents from the terminal.

## Overview

The Orient CLI provides a command-line interface for power users who prefer terminal-based workflows. While most users interact with Orient through WhatsApp, Slack, or the dashboard, the CLI offers direct database access for automation and scripting.

**Use the CLI for:**

- Bulk operations on schedulers and webhooks
- Scripting and automation workflows
- Remote server management via SSH tunneling
- DevOps and infrastructure-as-code scenarios

## Installation

```bash
# Navigate to CLI package
cd packages/cli

# Install dependencies
pnpm install

# Build the CLI
pnpm build

# Optional: Link globally
npm link
```

After linking, you can use the `orient` command from anywhere.

## Quick Start

### Initialize Configuration

```bash
# Create .orientrc configuration file
orient config init

# View current configuration
orient config list
```

### Common Commands

#### List Scheduled Jobs

```bash
# List all jobs
orient scheduler list

# Filter by provider
orient scheduler list --provider whatsapp

# Show only enabled jobs
orient scheduler list --enabled
```

#### Create a Daily Reminder

```bash
orient scheduler create \
  --name "daily-standup" \
  --type cron \
  --cron "0 9 * * 1-5" \
  --timezone "Asia/Jerusalem" \
  --provider slack \
  --target "#standup" \
  --message "🌅 Daily standup starts in 10 minutes!"
```

#### Manage Webhooks

```bash
# List webhooks
orient webhook list

# Create GitHub webhook
orient webhook create \
  --name "github-prs" \
  --source github \
  --event-filter "pull_request" \
  --provider slack \
  --target "#code-reviews"

# View webhook details
orient webhook get <webhook-id> --show-token
```

## Environment Configuration

The CLI supports multiple environments (local, production) via `.orientrc`:

```json
{
  "environments": {
    "local": {
      "type": "direct",
      "databaseUrl": "postgresql://orient:password@localhost:5432/whatsapp_bot_0"
    },
    "production": {
      "type": "ssh",
      "host": "your-server.example.com",
      "databaseUrl": "postgresql://orient:password@localhost:5432/whatsapp_bot_0"
    }
  },
  "defaultEnvironment": "local"
}
```

Switch environments with `--env`:

```bash
orient scheduler list --env production
```

## Available Command Groups

| Command Group | Description                             |
| ------------- | --------------------------------------- |
| `scheduler`   | Manage scheduled jobs and reminders     |
| `webhook`     | Configure webhooks for external events  |
| `agent`       | View and manage AI agent configurations |
| `config`      | Initialize and manage CLI configuration |

## Output Formats

All commands support two output modes:

- **Table** (default): Human-readable with color indicators
- **JSON**: Machine-readable for scripting with `--json` flag

```bash
# JSON output for scripting
orient scheduler list --json | jq '.[] | select(.enabled == true)'
```

## Common Workflows

### Daily Standup Setup

```bash
# 1. Initialize config
orient config init

# 2. Create weekday reminder
orient scheduler create \
  --name "daily-standup" \
  --type cron \
  --cron "0 9 * * 1-5" \
  --provider slack \
  --target "#standup" \
  --message "Good morning! Standup in 10 minutes."

# 3. Verify
orient scheduler list
```

### GitHub Notifications

```bash
# Create webhook for PR notifications
orient webhook create \
  --name "github-prs" \
  --source github \
  --event-filter "pull_request" \
  --provider slack \
  --target "#code-reviews"

# Copy the webhook URL and token
# Configure in GitHub: Settings → Webhooks → Add webhook
```

## Tips

1. **Use aliases**: `scheduler` → `sched`, `webhook` → `wh`
2. **JSON + jq**: Combine `--json` with `jq` for powerful filtering
3. **Verbose mode**: Add `--verbose` for detailed error information
4. **Help text**: Run `orient <command> --help` for usage details

## Full Documentation

For comprehensive documentation covering all 22 commands, advanced workflows, troubleshooting, and API details, see the [CLI README](https://github.com/orient-bot/orient/tree/main/packages/cli#readme).

## Next Steps

- [Schedule messages](../features/scheduling) via chat interface
- [Configure webhooks](../getting-started/webhooks) for integrations
- Check [troubleshooting](./troubleshooting) for common issues
