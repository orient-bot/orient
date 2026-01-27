# @orientbot/dashboard

Dashboard package for the Orient.

## Features

- **Dashboard API Server**: Express-based API for dashboard data
- **Health Monitoring**: System health checks and status
- **Stats Aggregation**: Message and usage statistics
- **Chat Management**: Configure chat permissions
- **Schedule Management**: Manage scheduled messages

## Installation

```bash
pnpm add @orientbot/dashboard
```

## Usage

### Starting the Server

```typescript
import { startDashboardServer } from '@orientbot/dashboard';

await startDashboardServer({
  port: 3001,
  staticPath: './public',
});
```

### Using the Router

```typescript
import express from 'express';
import { createDashboardRouter } from '@orientbot/dashboard/server';

const app = express();
app.use('/dashboard/api', createDashboardRouter());
```

## API Endpoints

| Endpoint         | Method | Description             |
| ---------------- | ------ | ----------------------- |
| `/api/health`    | GET    | Health check            |
| `/api/stats`     | GET    | Platform statistics     |
| `/api/chats`     | GET    | List chats              |
| `/api/schedules` | GET    | List scheduled messages |

## Types

The package exports all types for dashboard data:

```typescript
import type {
  HealthStatus,
  PlatformStats,
  ChatConfig,
  ScheduledMessage,
  AuditLogEntry,
} from '@orientbot/dashboard';
```

## Development

```bash
# Build
pnpm build

# Watch mode
pnpm dev

# Test
pnpm test
```
