# @orient-bot/bot-whatsapp

WhatsApp bot service for the Orient.

## Features

- **Baileys Integration**: WhatsApp Web multi-device protocol
- **Message Handling**: Text, media, and poll message processing
- **QR Code Pairing**: Web interface for device pairing
- **Health Monitoring**: Connection health checks with auto-reconnect

## Installation

```bash
pnpm add @orient-bot/bot-whatsapp
```

## Usage

```typescript
import { WhatsAppBotService } from '@orient-bot/bot-whatsapp';
import { loadConfig } from '@orient-bot/core';

const config = loadConfig();
const bot = new WhatsAppBotService(config);

await bot.start();
```

## Configuration

```json
{
  "whatsapp": {
    "personal": {
      "enabled": true,
      "adminPhone": "972501234567",
      "sessionPath": "./data/whatsapp-auth",
      "autoReconnect": true,
      "messageRateLimit": 10,
      "allowedGroupIds": []
    }
  }
}
```

## Message Flow

```
1. Message received (Baileys)
        │
        ▼
2. Parse and validate message
        │
        ▼
3. Check permission (read_only, read_write, ignored)
        │
        ├── ignored: Drop message
        ├── read_only: Store only
        └── read_write: Process with AI
                │
                ▼
4. Route to handler (text, media, poll)
        │
        ▼
5. Process with OpenCode (if AI)
        │
        ▼
6. Send response
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
docker build -t orienter-bot-whatsapp -f packages/bot-whatsapp/Dockerfile .

# Run the container
docker run -d \
  --name whatsapp-bot \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  -p 4097:4097 \
  -p 4098:4098 \
  orienter-bot-whatsapp
```

For full stack deployment, use docker-compose:

```bash
docker compose -f docker/docker-compose.v2.yml up -d bot-whatsapp
```
