# @orient/database

Database schemas, migrations, and clients for the Orient.

## Features

- **Drizzle ORM**: Type-safe database operations with PostgreSQL
- **Schema Definitions**: All tables defined using Drizzle schema
- **Connection Pooling**: Efficient database connections
- **Type Exports**: TypeScript types inferred from schema

## Installation

```bash
pnpm add @orient/database
```

## Usage

### Basic Usage

```typescript
import { getDatabase, schema, eq } from '@orient/database';

// Get database instance
const db = getDatabase();

// Query messages
const messages = await db
  .select()
  .from(schema.messages)
  .where(eq(schema.messages.phone, '1234567890'))
  .limit(10);

// Insert a new message
await db.insert(schema.messages).values({
  direction: 'incoming',
  jid: '1234567890@s.whatsapp.net',
  phone: '1234567890',
  text: 'Hello!',
  isGroup: false,
  timestamp: new Date(),
});
```

### Using Types

```typescript
import type { Message, NewMessage, ChatPermission } from '@orient/database';

const newMessage: NewMessage = {
  direction: 'outgoing',
  jid: '1234567890@s.whatsapp.net',
  phone: '1234567890',
  text: 'Response',
  isGroup: false,
  timestamp: new Date(),
};
```

### Database Configuration

```typescript
import { getDatabase } from '@orient/database';

const db = getDatabase({
  connectionString: process.env.DATABASE_URL,
  maxConnections: 10,
  idleTimeout: 30,
  connectTimeout: 5,
});
```

### Cleanup

```typescript
import { closeDatabase } from '@orient/database';

// Close connection on app shutdown
process.on('SIGTERM', async () => {
  await closeDatabase();
  process.exit(0);
});
```

## Tables

### WhatsApp

- `messages` - Message history
- `groups` - Group metadata
- `chatPermissions` - Per-chat permissions
- `permissionAuditLog` - Permission change history

### Slack

- `slackMessages` - Slack message history
- `slackChannels` - Channel metadata
- `slackChannelPermissions` - Per-channel permissions
- `slackPermissionAuditLog` - Permission change history

### Shared

- `dashboardUsers` - Admin dashboard users
- `systemPrompts` - Custom system prompts per chat
- `scheduledMessages` - Cron-scheduled messages
- `webhookForwards` - Webhook forwarding rules

## Development

```bash
# Build
pnpm build

# Run tests
pnpm test

# Generate migrations
pnpm db:generate

# Run migrations
pnpm db:migrate

# Open Drizzle Studio
pnpm db:studio
```

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `TEST_DATABASE_URL` - Test database connection (for E2E tests)
