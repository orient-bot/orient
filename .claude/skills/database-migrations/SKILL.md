---
name: database-migrations
description: Guide for creating and managing database migrations. Use when adding new tables, modifying schema, creating migrations, or before deploying database changes. Covers migration workflow, testing locally, and CI validation.
---

# Database Migrations

## Quick Reference

```bash
# Apply all migrations locally
npm run db:migrate

# Check current tables
npm run db:migrate:status

# Seed default agent data
npm run agents:seed
```

## When to Create a Migration

Create a new migration file when:

- Adding a new table
- Adding columns to existing tables
- Creating new indexes
- Adding constraints or foreign keys
- Creating triggers or functions

**Do NOT need migrations for:**

- Updating seed data (use seed scripts)
- Modifying application code only
- Changing Drizzle schema without DB changes (won't work!)

## Migration Workflow

### Step 1: Create Migration File

```bash
# Create new migration file with next sequence number
touch data/migrations/003_your_feature_name.sql
```

**Naming convention:** `XXX_description.sql` where XXX is the sequence number.

### Step 2: Write Migration SQL

```sql
-- Migration: 003_your_feature_name.sql
-- Description: Brief description of changes
-- Run: npm run db:migrate

BEGIN;

CREATE TABLE IF NOT EXISTS your_table (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_your_table_name ON your_table(name);

COMMIT;
```

**Best practices:**

- Wrap in `BEGIN;` ... `COMMIT;` for atomicity
- Use `IF NOT EXISTS` for idempotency
- Add `COMMENT ON TABLE/COLUMN` for documentation
- Create indexes for frequently queried columns

### Step 3: Update Drizzle Schema

Edit `src/db/schema.ts` to match your migration:

```typescript
export const yourTable = pgTable('your_table', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

### Step 4: Test Locally

```bash
# Apply migration to local database
npm run db:migrate

# Verify tables exist
npm run db:migrate:status

# Run schema validation test
npm run test:e2e -- src/db/__tests__/schema-validation
```

### Step 5: Update Tests

If your migration adds required tables, update `src/db/__tests__/schema-validation.e2e.test.ts`:

```typescript
const REQUIRED_TABLES = [
  // ... existing tables
  'your_table', // Add new table
];
```

## Pre-merge Checklist

Before merging a PR with database changes:

- [ ] Migration file created in `data/migrations/XXX_name.sql`
- [ ] Schema updated in `src/db/schema.ts`
- [ ] Migration tested locally: `npm run db:migrate`
- [ ] Schema validation test updated if needed
- [ ] Integration tests pass: `npm run test:integration`
- [ ] Seed data created if needed (e.g., `data/seeds/`)

## CI Validation

The CI pipeline automatically:

1. Starts a fresh PostgreSQL database
2. Applies all migrations from `data/migrations/`
3. Runs schema validation tests
4. Fails the build if any required tables are missing

**If CI fails with "Missing required tables":**

- Ensure your migration file is in `data/migrations/`
- Ensure the file is valid SQL
- Check that REQUIRED_TABLES includes your new table

## Troubleshooting

### "Table already exists" error

Migrations use `IF NOT EXISTS`, so this shouldn't happen. If it does:

- Check for duplicate table definitions
- Ensure migration is idempotent

### "Column does not exist" error

Schema mismatch between code and database:

1. Check `src/db/schema.ts` matches your migration
2. Run `npm run db:migrate` to apply pending migrations
3. Verify with `npm run db:migrate:status`

### Integration tests fail in CI but pass locally

- Migrations may not be applying in CI
- Check `.github/workflows/test.yml` for migration step
- Ensure migration files are committed to git

## Worktree Database Setup

When working in git worktrees, you have two database strategies:

### Shared Database (Default)

All worktrees use the same development database. Best for:

- Normal feature development
- Bug fixes
- Frontend work

```bash
# No special setup needed - uses DATABASE_URL from .env
pnpm run dev
```

### Isolated Database (For Schema Testing)

Each worktree gets its own database. Use for:

- Testing new migrations
- Schema changes
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
npm run db:seed:all

# Force re-seed (override existing)
npm run db:seed:all:force

# Seed agents only
npm run agents:seed
```

### .env Configuration

Ensure your `.env` has `DATABASE_URL` configured:

```bash
DATABASE_URL="postgresql://aibot:aibot123@localhost:5432/whatsapp_bot"
```

**Important:** Quote values containing special characters (cron expressions, `#` channels):

```bash
STANDUP_CRON="30 9 * * 1-5"        # Good
STANDUP_CHANNEL="#orienter-standups" # Good
```

## File Locations

| Purpose                | Location                                         |
| ---------------------- | ------------------------------------------------ |
| Migration files        | `data/migrations/*.sql`                          |
| Drizzle schema         | `src/db/schema.ts`                               |
| Schema validation test | `src/db/__tests__/schema-validation.e2e.test.ts` |
| Seed scripts           | `data/seeds/*.ts`                                |
| Unified seeder         | `data/seeds/index.ts`                            |
| Worktree DB script     | `scripts/seed-worktree-db.sh`                    |
| CI workflow            | `.github/workflows/test.yml`                     |

## Reference Materials

See [references/checklist.md](references/checklist.md) for the complete pre-merge migration checklist.
