# @orient-bot/api-gateway

REST API gateway for the Orient.

## Features

- **Scheduler Service**: Cron-based message scheduling
- **Webhook Forwarding**: Route incoming webhooks to handlers
- **Health Monitoring**: Service health checks and metrics
- **Notification Dispatch**: Send messages across platforms

## Installation

```bash
pnpm add @orient-bot/api-gateway
```

## Usage

```typescript
import { createApiServer, SchedulerService } from '@orient-bot/api-gateway';
import { loadConfig } from '@orient-bot/core';

const config = loadConfig();
const server = createApiServer(config);

// Start scheduler
const scheduler = new SchedulerService(config);
await scheduler.start();

// Start API server
server.listen(4098);
```

## API Endpoints

| Endpoint         | Method    | Description               |
| ---------------- | --------- | ------------------------- |
| `/health`        | GET       | System health status      |
| `/api/schedules` | GET, POST | Manage scheduled messages |
| `/api/webhooks`  | GET, POST | Manage webhook forwards   |
| `/webhook/*`     | POST      | Incoming webhook handler  |

## Scheduled Messages

```json
{
  "name": "Daily standup reminder",
  "cronExpression": "30 9 * * 1-5",
  "targetType": "slack",
  "targetId": "#standup",
  "message": "Time for standup! 🚀"
}
```

## Development

```bash
# Build
pnpm build

# Run tests
pnpm test

# Start server (development)
pnpm dev

# Start server (production)
pnpm start
```

## Docker

This package includes a per-package Dockerfile for containerized deployment:

```bash
# Build the Docker image
docker build -t orienter-api-gateway -f packages/api-gateway/Dockerfile .

# Run the container
docker run -d \
  --name api-gateway \
  -p 4100:4100 \
  orienter-api-gateway
```

For full stack deployment:

```bash
docker compose -f docker/docker-compose.v2.yml --profile api up -d
```
