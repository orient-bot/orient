---
name: worktree-database-consolidation
description: Guide for migrating database implementations to Drizzle ORM in monorepo worktrees. Use when consolidating raw pg.Pool queries to Drizzle, fixing ORM type mismatches, separating frontend/backend builds, organizing integration tests, or debugging turbo build issues during database migrations.
---

# Drizzle ORM Database Consolidation

Guide for migrating from raw `pg.Pool` to Drizzle ORM in TypeScript monorepos.

## Common Type Issues

### Partial Types for Optional Parameters

When database methods accept optional fields passed as separate required params:

```typescript
// Problem: StoreMessageOptions has required fields but caller only passes optional media fields
const storeOptions: StoreMessageOptions = {};  // Error: missing required fields

// Solution: Use Partial<> for optional parameter objects
const storeOptions: Partial<StoreMessageOptions> = {};

// Also update function signatures
async storeIncomingMessage(
  messageId: string,
  jid: string,
  // ... required params passed separately
  options?: Partial<StoreMessageOptions>  // Only optional fields
): Promise<number>
```

### Property Name Changes (snake_case to camelCase)

Drizzle returns camelCase properties by default. Update consumer code:

```typescript
// Before (raw SQL)
row.message_id, row.is_group, row.group_id

// After (Drizzle)
row.messageId, row.isGroup, row.groupId
```

## Monorepo Build Configuration

### Exclude Frontend Apps from Root tsconfig

Vite-based SPAs have their own build process. Exclude from root compilation:

```json
// tsconfig.json
{
  "exclude": [
    "node_modules",
    "**/dist/**",
    "packages/dashboard-frontend/**/*"  // Vite handles this
  ]
}
```

### Clean Stray Build Artifacts

If root `tsc` runs before turbo, it may emit `.js` files to wrong locations:

```bash
# Remove stray .js files from Vite project src/
rm -f packages/dashboard-frontend/src/*.js
```

## Test Organization

### E2E Tests Requiring Database

Rename integration tests to exclude from CI:

```bash
# Rename to .e2e.test.ts for exclusion
mv tests/database/migration.test.ts tests/database/migration.e2e.test.ts
```

CI script excludes these:
```json
"test:ci": "vitest run --exclude '**/*.e2e.test.ts'"
```

### Skip Tests with Missing Services

```typescript
// Skip when database unavailable
const skipE2E = !process.env.DATABASE_URL;
describe.skipIf(skipE2E)('Database Tests', () => { ... });

// Skip tests with broken mocks (TODO comment)
it.skip('test name', () => { ... });
```

## Worktree Operations

### Cherry-pick Fixes from Other Branches

```bash
# Find fix commit
git log --all --oneline -- "**/MissingFile.tsx"

# Cherry-pick without committing (review first)
git cherry-pick <commit-hash> --no-commit

# Check staged changes
git status --short
```

### Turbo Cache Issues

Clear turbo cache when build artifacts are stale:

```bash
# Clear all turbo caches
rm -rf node_modules/.cache/turbo

# Or force rebuild specific package
pnpm turbo run build --filter=@scope/package --force
```

## Infrastructure Setup

### Start Database for Testing

```bash
# Start postgres, minio, nginx
pnpm dev:infra

# Check container health
docker ps --filter "name=orienter" --format "table {{.Names}}\t{{.Status}}"

# Stop infrastructure
pnpm dev:infra:stop
```

## Checklist

1. [ ] Fix type mismatches (Partial<>, camelCase props)
2. [ ] Exclude frontend from root tsconfig
3. [ ] Clean stray build artifacts
4. [ ] Run `pnpm turbo run build`
5. [ ] Rename database tests to `.e2e.test.ts`
6. [ ] Run `pnpm test:ci` (excludes e2e)
7. [ ] Start infra and test dev mode
8. [ ] Run full test suite with database
