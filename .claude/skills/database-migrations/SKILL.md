---
name: database-migrations
description: Guide for creating and managing database migrations. Use when adding new tables, modifying schema, creating migrations, or before deploying database changes. Covers migration workflow, testing locally, and CI validation.
---

# Database Migrations (SQLite)

## Quick Reference

```bash
# Push schema to SQLite database
pnpm --filter @orientbot/database run db:push:sqlite

# Open Drizzle Studio to inspect database
pnpm db:studio

# Seed default agent data
pnpm run agents:seed
```

## Database: SQLite (File-Based)

The Orient uses SQLite for all database operations. The database file is located at:

- **Dev mode**: `.dev-data/instance-N/orient.db`
- **Docker**: `/app/data/orient.db`
- **Production**: Configured via `SQLITE_DATABASE` environment variable

**Environment variables:**

```bash
DATABASE_TYPE=sqlite
SQLITE_DATABASE=/path/to/orient.db
# OR use instance-aware path:
SQLITE_DB_PATH=/path/to/orient.db
```

## When to Create a Migration

Create schema changes when:

- Adding a new table
- Adding columns to existing tables
- Creating new indexes
- Adding constraints

**Do NOT need migrations for:**

- Updating seed data (use seed scripts)
- Modifying application code only

## Schema Workflow

### Step 1: Update Drizzle Schema

Edit `packages/database/src/schema/` files:

```typescript
// packages/database/src/schema/yourTable.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const yourTable = sqliteTable('your_table', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
```

### Step 2: Push Schema to Database

```bash
# Push schema changes to SQLite
pnpm --filter @orientbot/database run db:push:sqlite

# Or using environment variables
DATABASE_TYPE=sqlite SQLITE_DATABASE=./data/orient.db pnpm --filter @orientbot/database run db:push:sqlite
```

### Step 3: Verify Changes

```bash
# Open Drizzle Studio
pnpm db:studio

# Or use sqlite3 CLI
sqlite3 .dev-data/instance-0/orient.db ".schema your_table"
```

### Step 4: Update Tests

If your schema adds required tables, update the schema validation tests:

```typescript
const REQUIRED_TABLES = [
  // ... existing tables
  'your_table', // Add new table
];
```

## Pre-merge Checklist

Before merging a PR with database changes:

- [ ] Schema updated in `packages/database/src/schema/`
- [ ] Schema pushed locally: `pnpm --filter @orientbot/database run db:push:sqlite`
- [ ] Schema validation test updated if needed
- [ ] Integration tests pass: `pnpm test:integration`
- [ ] Seed data created if needed (e.g., `data/seeds/`)

## CI Validation

The CI pipeline automatically:

1. Creates a fresh SQLite database
2. Pushes schema using Drizzle
3. Runs schema validation tests
4. Fails the build if any required tables are missing

**If CI fails with "Missing required tables":**

- Ensure your schema is exported from `packages/database/src/schema/index.ts`
- Check that schema files use correct SQLite types
- Verify REQUIRED_TABLES includes your new table

## Troubleshooting

### "Directory does not exist" error

When running `db:push:sqlite`, you may see:

```
TypeError: Cannot open database because the directory does not exist
```

**Cause:** Drizzle uses a relative path (`./data/orient.db`) but runs from the package directory.

**Solution:** Use the `SQLITE_DATABASE` env var with the full path:

```bash
# From packages/database directory
cd packages/database
SQLITE_DATABASE="$HOME/.orient/orient/data/orient.db" pnpm run db:push:sqlite

# Or from monorepo root
SQLITE_DATABASE="/full/path/to/orient.db" pnpm --filter @orientbot/database run db:push:sqlite
```

### "No such table" error at runtime

The database file exists but tables weren't created:

```
SqliteError: no such table: slack_channel_permissions
```

**Solution:** Push the schema to create all tables:

```bash
# Ensure database directory exists
mkdir -p ~/.orient/orient/data

# Push schema with explicit path
SQLITE_DATABASE="$HOME/.orient/orient/data/orient.db" \
  pnpm --filter @orientbot/database run db:push:sqlite
```

### "Table already exists" error

SQLite schema push is idempotent. If this happens:

- Check for duplicate table definitions
- Ensure you're not mixing schema sources

### "Column does not exist" error

Schema mismatch between code and database:

1. Check `packages/database/src/schema/` matches your expectations
2. Run `pnpm --filter @orientbot/database run db:push:sqlite` to apply pending changes
3. Verify with `sqlite3 your.db ".schema tablename"`

### Integration tests fail in CI but pass locally

- Schema may not be pushing in CI
- Check `.github/workflows/test.yml` for schema push step
- Ensure schema files are committed to git

### PM2 processes missing environment variables

When services like OpenCode or Slack bot fail because they can't find API keys:

```bash
# Restart with environment from .env file
cd ~/.orient/orient
export OPENAI_API_KEY=$(grep OPENAI_API_KEY .env | cut -d= -f2)
export ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY .env | cut -d= -f2)
pm2 restart orient-opencode orient-slack --update-env
```

**Note:** `--update-env` tells PM2 to capture the current shell environment.

## E2E Test Database Setup

E2E tests require their own database with the schema initialized. Without this, tests fail with "no such table" errors.

### Initialize Test Database

```bash
# 1. Create the test data directory
mkdir -p data

# 2. Push schema to test database (from project root)
SQLITE_DATABASE="/full/path/to/project/data/orient.db" \
  pnpm --filter @orientbot/database run db:push:sqlite
```

### Using SQLITE_DATABASE Environment Variable

When running E2E tests, set the `SQLITE_DATABASE` environment variable:

```bash
# Run E2E tests with test database
SQLITE_DATABASE="$(pwd)/data/orient.db" pnpm test:e2e

# Or export for the session
export SQLITE_DATABASE="$(pwd)/data/orient.db"
pnpm test:e2e
```

### Troubleshooting "No Such Table" in E2E Tests

If you see errors like:

```
SqliteError: no such table: messages
SqliteError: no such table: slack_messages
```

**Solution:**

1. Create the test database directory:

   ```bash
   mkdir -p data
   ```

2. Push the schema with an absolute path:

   ```bash
   SQLITE_DATABASE="$(pwd)/data/orient.db" \
     pnpm --filter @orientbot/database run db:push:sqlite
   ```

3. Re-run E2E tests:
   ```bash
   SQLITE_DATABASE="$(pwd)/data/orient.db" pnpm test:e2e
   ```

### CI E2E Test Database

In CI workflows, the test database should be initialized before running E2E tests:

```yaml
# .github/workflows/test.yml
- name: Initialize test database
  run: |
    mkdir -p data
    SQLITE_DATABASE="${{ github.workspace }}/data/orient.db" \
      pnpm --filter @orientbot/database run db:push:sqlite
```

## Worktree Database Setup

When working in git worktrees, you have two database strategies:

### Shared Database (Default)

All worktrees use the same development database. Best for:

- Normal feature development
- Bug fixes
- Frontend work

```bash
# No special setup needed - uses SQLITE_DB_PATH from instance-env.sh
./run.sh dev
```

### Isolated Database (For Schema Testing)

Each worktree gets its own database. Use for:

- Testing new schema changes
- Schema modifications
- Isolated experiments

```bash
# Create isolated database and seed
ISOLATED=true ./scripts/seed-worktree-db.sh

# Or when creating worktree:
worktree create my-migration-test --isolated
```

### What Gets Seeded

The unified seeder (`data/seeds/index.ts`) runs in order:

1. **Agents** - 5 agents + 6 context rules (required for agent routing)
2. **Test permissions** - Sample WhatsApp/Slack permissions (if table exists)
3. **Sample prompts** - Default system prompts (if table exists)

```bash
# Seed all data
pnpm run db:seed:all

# Force re-seed (override existing)
pnpm run db:seed:all:force

# Seed agents only
pnpm run agents:seed
```

## File Locations

| Purpose            | Location                                |
| ------------------ | --------------------------------------- |
| Drizzle schema     | `packages/database/src/schema/`         |
| Schema exports     | `packages/database/src/schema/index.ts` |
| SQLite config      | `packages/database/drizzle.config.ts`   |
| Seed scripts       | `data/seeds/*.ts`                       |
| Unified seeder     | `data/seeds/index.ts`                   |
| Worktree DB script | `scripts/seed-worktree-db.sh`           |
| CI workflow        | `.github/workflows/test.yml`            |

## SQLite-Specific Notes

### Data Types

SQLite uses different types than PostgreSQL:

| PostgreSQL     | SQLite                                  |
| -------------- | --------------------------------------- |
| `SERIAL`       | `integer('id').primaryKey()`            |
| `TIMESTAMPTZ`  | `integer('col', { mode: 'timestamp' })` |
| `VARCHAR(255)` | `text('col')`                           |
| `BOOLEAN`      | `integer('col', { mode: 'boolean' })`   |
| `JSONB`        | `text('col', { mode: 'json' })`         |

### Transactions

SQLite transactions work slightly differently:

```typescript
import { db } from '@orientbot/database';

await db.transaction(async (tx) => {
  await tx.insert(yourTable).values({ ... });
  await tx.update(otherTable).set({ ... });
});
```

### Concurrency

SQLite uses file-level locking. For high-concurrency scenarios:

- Use WAL mode (Write-Ahead Logging) - configured by default
- Keep transactions short
- Consider read replicas for read-heavy workloads
