# @orientbot/database-services

Database service implementations for the Orient.

## Services

- **MessageDatabase**: WhatsApp message storage and retrieval (SQLite)
- **SlackDatabase**: Slack integration data (PostgreSQL via Drizzle)
- **SchedulerDatabase**: Scheduled message storage (PostgreSQL via Drizzle)
- **WebhookDatabase**: Webhook configuration storage (PostgreSQL via Drizzle)

## Usage

```typescript
import {
  MessageDatabase,
  createSlackDatabase,
  createSchedulerDatabase,
  createWebhookDatabase,
} from '@orientbot/database-services';

// SQLite message database
const messageDb = new MessageDatabase('./data/messages.db');
await messageDb.initialize();

// PostgreSQL Drizzle-based databases
const slackDb = createSlackDatabase();
const schedulerDb = createSchedulerDatabase();
const webhookDb = createWebhookDatabase();
```

## Directory Structure

```
src/
├── index.ts              # Main exports
├── messageDatabase.ts    # WhatsApp message storage (SQLite)
├── slackDatabase.ts      # Slack integration data
├── schedulerDatabase.ts  # Scheduled messages
└── webhookDatabase.ts    # Webhook configurations
```
