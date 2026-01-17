# Slack Integration

## Requirements

- Slack app with bot token and app token
- Signing secret

## Setup

Add these to `.env`:

- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `SLACK_APP_TOKEN`

Configure default channels in `.mcp.config.local.json` if needed.

## Notes

Slack support includes standups, alerts, and direct command workflows.
