# End-to-End Tests

This directory contains end-to-end tests that verify complete system flows.

## Prerequisites

- PostgreSQL running (via Docker or local installation)
- Environment variables set:
  - `DATABASE_URL` or `TEST_DATABASE_URL`
  - `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN` (for JIRA tests)

## Running E2E Tests

```bash
# Start infrastructure
docker compose -f docker/docker-compose.infra.yml up -d

# Run E2E tests
npm run test:e2e

# Or specific test
npm test -- tests/e2e/message-flow.e2e.test.ts
```

## Test Files

| File                          | Description                            |
| ----------------------------- | -------------------------------------- |
| `message-flow.e2e.test.ts`    | Tests complete message processing flow |
| `jira-operations.e2e.test.ts` | Tests JIRA CRUD operations             |
| `permission-flow.e2e.test.ts` | Tests permission management            |

## Writing E2E Tests

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDatabase, closeDatabase } from '@orientbot/database';

describe('Feature E2E', () => {
  beforeAll(async () => {
    // Setup - ensure database is ready
    const db = getDatabase();
  });

  afterAll(async () => {
    // Cleanup
    await closeDatabase();
  });

  it('should complete full flow', async () => {
    // Test implementation
  });
});
```

## Skip Conditions

E2E tests are automatically skipped if:

- `DATABASE_URL` is not set
- Database is not accessible
- Required external services are unavailable
