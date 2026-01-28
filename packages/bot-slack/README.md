# @orientbot/bot-slack

Slack bot service for the Orient.

## Features

- **Slack Bolt Integration**: Event-driven Slack app framework
- **Socket Mode**: No public URL required
- **Mention Handling**: Respond to @mentions in channels
- **DM Handling**: Direct message conversations
- **Dual-Mode Posting**: Post as bot or as user

## Installation

```bash
pnpm add @orientbot/bot-slack
```

## Usage

```typescript
import { SlackBotService } from '@orientbot/bot-slack';
import { loadConfig } from '@orientbot/core';

const config = loadConfig();
const bot = new SlackBotService(config);

await bot.start();
```

## Configuration

```json
{
  "integrations": {
    "slack": {
      "bot": {
        "token": "${SLACK_BOT_TOKEN}",
        "signingSecret": "${SLACK_SIGNING_SECRET}",
        "appToken": "${SLACK_APP_TOKEN}"
      },
      "standupChannel": "#standup",
      "defaultMode": "bot"
    }
  }
}
```

## Message Flow

```
1. Event received (Slack Bolt)
        │
        ▼
2. Route by event type (mention, DM, command)
        │
        ▼
3. Check permission (channel-based)
        │
        ├── ignored: Drop message
        ├── read_only: Store only
        └── read_write: Process with AI
                │
                ▼
4. Process with OpenCode
        │
        ▼
5. Post response (bot or user token)
```

## Development

```bash
# Build
pnpm build

# Run tests
pnpm test

# Start bot (development)
pnpm dev

# Start bot (production)
pnpm start
```

## Docker

This package includes a per-package Dockerfile for containerized deployment:

```bash
# Build the Docker image
docker build -t orienter-bot-slack -f packages/bot-slack/Dockerfile .

# Run the container
docker run -d \
  --name slack-bot \
  -e SLACK_BOT_TOKEN=xoxb-... \
  -e SLACK_SIGNING_SECRET=... \
  -e SLACK_APP_TOKEN=xapp-... \
  orienter-bot-slack
```

For full stack deployment with Slack profile:

```bash
docker compose -f docker/docker-compose.v2.yml --profile slack up -d
```
