# @orientbot/test-utils

Shared test utilities for the Orient monorepo.

## Features

- **Mock Objects**: Pre-configured mocks for logger, config, database
- **Factory Functions**: Generate test data for JIRA, messages, etc.
- **Assertion Helpers**: Custom assertions for common patterns
- **Database Utilities**: Helpers for database tests

## Installation

```bash
pnpm add -D @orientbot/test-utils
```

## Usage

### Mocks

```typescript
import { createMockLogger, createMockConfig } from '@orientbot/test-utils';

describe('MyService', () => {
  it('should use logger', () => {
    const logger = createMockLogger();
    const config = createMockConfig();

    const service = new MyService(config, logger);
    service.doSomething();

    expect(logger.info).toHaveBeenCalled();
  });
});
```

### Factories

```typescript
import { createJiraIssue, createWhatsAppMessage } from '@orientbot/test-utils';

describe('IssueProcessor', () => {
  it('should process issue', () => {
    const issue = createJiraIssue({
      key: 'TEST-1',
      fields: { summary: 'My test issue' },
    });

    expect(processIssue(issue)).toBeDefined();
  });
});

describe('MessageHandler', () => {
  it('should handle message', () => {
    const message = createWhatsAppMessage({ text: 'hello' });

    expect(handleMessage(message)).toBe('response');
  });
});
```

### Assertion Helpers

```typescript
import { expectAsyncError, expectHasKeys } from '@orientbot/test-utils';

describe('ErrorHandling', () => {
  it('should throw on invalid input', async () => {
    await expectAsyncError(() => validateInput(null), 'Input is required');
  });

  it('should have required keys', () => {
    expectHasKeys(result, ['id', 'name', 'created']);
  });
});
```

### Database Helpers

```typescript
import { skipIfNoDatabase, createMockDatabase } from '@orientbot/test-utils';

describe('Database operations', () => {
  beforeAll(() => {
    if (skipIfNoDatabase()) {
      console.log('Skipping database tests - no DATABASE_URL');
      return;
    }
  });

  it('should mock database', () => {
    const db = createMockDatabase();
    db.select.mockResolvedValueOnce([{ id: 1 }]);

    // Use mock database
  });
});
```

## Package Structure

```
src/
├── mocks/
│   ├── logger.ts    # Mock logger
│   └── config.ts    # Mock config
├── factories/
│   ├── jira.ts      # JIRA test data
│   └── messages.ts  # Message test data
├── helpers/
│   ├── assertions.ts # Custom assertions
│   └── database.ts   # Database helpers
└── index.ts          # Main exports
```
