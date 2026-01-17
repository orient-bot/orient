# Organization Customization Guide

This guide explains how to customize the Orient for your organization.

## Quick Start

1. **Copy the example config:**

   ```bash
   cp templates/organization/config.example.json .mcp.config.local.json
   ```

2. **Edit `.mcp.config.local.json`** with your organization's settings

3. **Set up environment variables** for secrets (see below)

4. **Run the bot:**
   ```bash
   npm run dev:mcp
   ```

## Configuration Structure

### Organization Settings

```json
{
  "organization": {
    "name": "Your Organization Name",
    "jiraProjectKey": "PROJ",
    "jiraComponent": "Your-Component"
  }
}
```

| Field            | Required | Description                                  |
| ---------------- | -------- | -------------------------------------------- |
| `name`           | Yes      | Human-readable name for your organization    |
| `jiraProjectKey` | Yes      | Your JIRA project key (e.g., "PROJ", "PROJ") |
| `jiraComponent`  | No       | Filter issues by component (optional)        |

### Environment Variables

Sensitive values should be set via environment variables, not in the config file.
The config supports `${VAR_NAME}` syntax for substitution:

```json
{
  "integrations": {
    "jira": {
      "host": "${JIRA_HOST}",
      "email": "${JIRA_EMAIL}",
      "apiToken": "${JIRA_API_TOKEN}"
    }
  }
}
```

**Required Environment Variables:**

| Variable         | Description                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `JIRA_HOST`      | Your Atlassian host (e.g., `yourorg.atlassian.net`)                                          |
| `JIRA_EMAIL`     | Email for JIRA API authentication                                                            |
| `JIRA_API_TOKEN` | JIRA API token ([Generate one](https://id.atlassian.com/manage-profile/security/api-tokens)) |

**Optional Environment Variables:**

| Variable                        | Description                        |
| ------------------------------- | ---------------------------------- |
| `SLACK_BOT_TOKEN`               | Slack bot OAuth token              |
| `SLACK_SIGNING_SECRET`          | Slack signing secret               |
| `SLACK_APP_TOKEN`               | Slack app-level token              |
| `WHATSAPP_ADMIN_PHONE`          | Admin phone for WhatsApp bot       |
| `ANTHROPIC_API_KEY`             | API key for Claude agent           |
| `GOOGLE_SLIDES_PRESENTATION_ID` | Presentation ID for weekly updates |

**Google OAuth Environment Variables (for personal account access):**

| Variable                     | Description                                                   |
| ---------------------------- | ------------------------------------------------------------- |
| `GOOGLE_OAUTH_CLIENT_ID`     | OAuth 2.0 Client ID from Google Cloud Console                 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth 2.0 Client Secret from Google Cloud Console             |
| `GOOGLE_OAUTH_CALLBACK_PORT` | Local callback port (default: 8766)                           |
| `GOOGLE_OAUTH_CALLBACK_URL`  | Production callback URL (optional, for deployed environments) |

See [Credentials README](../../credentials/README.md) for detailed OAuth setup instructions.

### Feature Flags

Enable only the features you need:

```json
{
  "features": {
    "slaMonitoring": true,
    "weeklyReports": true,
    "whatsappBot": false,
    "slackBot": false,
    "googleSlides": false,
    "mcpServer": true
  }
}
```

### SLA Configuration

Customize SLA thresholds for your workflow:

```json
{
  "sla": {
    "enabled": true,
    "thresholds": [
      { "status": "In Progress", "maxDays": 3 },
      { "status": "In Review", "maxDays": 2 },
      { "status": "To Do", "maxDays": 5 }
    ]
  }
}
```

### Board Configuration

Configure which statuses are in the Kanban backlog (not visible on the board):

```json
{
  "board": {
    "kanbanBacklogStatuses": ["IN BACKLOG", "BACKLOG- NEXT IN LINE", "BACKLOG"]
  }
}
```

## Customizing Skills

Skills are modular AI capabilities. You can create organization-specific skills:

1. **Create a skill directory:**

   ```bash
   mkdir -p .cursor/skills/my-org-skill
   ```

2. **Create `SKILL.md`:**

   ```markdown
   ---
   name: my-org-skill
   description: Organization-specific workflow
   ---

   # My Organization Skill

   Instructions for the AI agent...
   ```

3. **Register in `AGENTS.md`** (if using the skills system)

## Testing Your Configuration

1. **Validate the config:**

   ```bash
   npm run typecheck
   ```

2. **Test locally with hot-reload:**

   ```bash
   npm run dev:mcp
   ```

3. **Test in Docker:**
   ```bash
   ./run.sh test
   ```

## Troubleshooting

### "Missing required environment variable"

Ensure all required variables are set:

```bash
export JIRA_HOST="yourorg.atlassian.net"
export JIRA_EMAIL="you@example.com"
export JIRA_API_TOKEN="your-api-token"
```

### "Configuration validation failed"

Check the error messages for which fields are invalid. Common issues:

- Invalid email format
- Missing required fields
- Wrong data types (string instead of number)

### JIRA Connection Issues

1. Verify your API token is valid
2. Check your `jiraProjectKey` matches your actual project
3. Ensure your account has access to the project

## Next Steps

- Read the [Architecture Overview](../../docs/architecture/overview.md)
- Learn about [Creating Tools](../../docs/guides/creating-tools.md)
- Explore [Workflow Automation](../../docs/guides/workflow-guide.md)
