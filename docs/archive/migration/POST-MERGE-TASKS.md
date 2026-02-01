# Post-Migration Tasks

## Overview

The `feat/complete-src-migration` branch completes the migration from `src/` to `packages/`. The `src/` directory has been completely removed.

**Before merging to dev**, the following tasks need to be completed to ensure the codebase builds and tests pass.

---

## Priority 1: Fix Build Errors

### 1.1 Missing Type Exports from @orient-bot/database

Several packages import types that aren't exported from `@orient-bot/database`. Add these exports:

```bash
# Files affected:
packages/database-services/src/services/messageDatabaseDrizzle.ts
packages/database-services/src/services/slackDatabaseDrizzle.ts
```

**Types to export from `@orient-bot/database`:**

- `Message`, `NewMessage`, `Group`, `NewGroup`
- `ChatPermissionRecord`, `NewChatPermission`
- `PermissionAuditEntry`, `NewPermissionAuditEntry`
- `DashboardUser`, `NewDashboardUser`
- `SystemPrompt`, `NewSystemPrompt`
- `MessageSearchOptions`, `StoreMessageOptions`
- `MessageStats`, `MediaStats`, `DashboardStats`
- `ChatType`, `ChatPermission`, `PromptPlatform`
- `SlackMessage`, `SlackChannel`, `SlackChannelPermissionRecord`
- `SlackMessageSearchOptions`, `StoreSlackMessageOptions`
- `SlackMessageStats`, `SlackDashboardStats`
- `SlackChannelType`, `SlackChannelPermission`

### 1.2 Fix Implicit `any` Types

Several migrated files have implicit `any` type errors due to strict mode. Fix these:

```bash
# Run to find all implicit any errors:
pnpm --filter @orient-bot/database-services build 2>&1 | grep "TS7006"
```

Common pattern - add explicit types to callbacks:

```typescript
// Before:
.map(r => r.id)

// After:
.map((r: SomeType) => r.id)
```

### 1.3 Update Package Exports

Add subpath exports to `package.json` files for packages that need them:

**@orient-bot/integrations/package.json:**

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./jira": "./dist/jira/index.js",
    "./google": "./dist/google/index.js",
    "./gemini": "./dist/gemini/index.js"
  }
}
```

**@orient-bot/apps/package.json:**

```json
{
  "exports": {
    ".": "./dist/index.js"
  }
}
```

---

## Priority 2: Fix Import Paths

### 2.1 Update Relative Imports in Migrated Files

Some migrated files still have incorrect relative imports. Search and fix:

```bash
# Find files with old import patterns:
grep -r "from '\.\./\.\./\.\." packages/*/src/ --include="*.ts"
grep -r "from '\.\./utils/logger" packages/*/src/ --include="*.ts"
grep -r "from '\.\./db/" packages/*/src/ --include="*.ts"
```

Replace with package imports:

- `../utils/logger.js` → `@orient-bot/core`
- `../db/index.js` → `@orient-bot/database`
- `../services/jiraService.js` → `@orient-bot/integrations/jira`

### 2.2 Fix .js Extensions

Ensure all relative imports have `.js` extensions (required for ESM):

```bash
# Find missing extensions:
grep -r "from '\.\/" packages/*/src/ --include="*.ts" | grep -v "\.js'"
```

---

## Priority 3: Update Tests

### 3.1 Update Test Imports

Tests in `packages/*/__tests__/` may still import from `src/`. Update them:

```bash
# Find tests importing from src:
grep -r "from '.*src/" packages/*/__tests__/ --include="*.ts"
```

### 3.2 Run Test Suite

```bash
pnpm test
```

Fix any failing tests due to import changes.

---

## Priority 4: Update CI/CD

### 4.1 Update Build Scripts

Verify `package.json` build scripts work:

```bash
pnpm build
```

### 4.2 Update Docker Builds

If Dockerfiles reference `src/`, update them to use `packages/`:

```bash
grep -r "src/" Dockerfile* docker-compose*
```

### 4.3 Update GitHub Actions

Check `.github/workflows/` for any `src/` references.

---

## Priority 5: New Package Setup

### 5.1 @orient-bot/eval Package

The eval package was created but needs:

- [ ] Update imports to use `@orient-bot/*` packages
- [ ] Add to workspace in root `package.json`
- [ ] Test that eval framework works

### 5.2 @orient-bot/cli Package

The CLI package was created but needs:

- [ ] Update imports to use `@orient-bot/*` packages
- [ ] Add bin scripts to package.json
- [ ] Test CLI commands work

---

## Verification Checklist

Before merging to dev:

- [ ] `pnpm install` succeeds
- [ ] `pnpm build` succeeds for all packages
- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes (may need to run with `--fix`)
- [ ] No references to `src/` remain in source files
- [ ] Docker build works
- [ ] Local development server starts

---

## Quick Reference: Package Locations

| Old Location                      | New Location                                            |
| --------------------------------- | ------------------------------------------------------- |
| `src/services/toolRegistry.ts`    | `packages/agents/src/services/toolRegistry.ts`          |
| `src/services/whatsappService.ts` | `packages/bot-whatsapp/src/services/whatsappService.ts` |
| `src/services/slackService.ts`    | `packages/bot-slack/src/services/slackService.ts`       |
| `src/services/appsService.ts`     | `packages/apps/src/services/appsService.ts`             |
| `src/utils/logger.ts`             | `packages/core/src/utils/logger.ts`                     |
| `src/config/*`                    | `packages/core/src/config/*`                            |
| `src/db/*`                        | `packages/database/src/*`                               |
| `src/mcp-server.ts`               | `packages/mcp-servers/src/mcp-server.ts`                |
| `src/eval/*`                      | `packages/eval/src/*`                                   |
| `src/cli/*`                       | `packages/cli/src/*`                                    |

---

## Contact

If you encounter issues not covered here, check the migration plan at:
`docs/migration/src-to-packages-plan.md`
