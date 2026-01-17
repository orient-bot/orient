# Mock Catalog

This document catalogs all available mocks in `src/__mocks__/` and their usage patterns.

## Available Mocks

| Mock        | File                          | Purpose                     |
| ----------- | ----------------------------- | --------------------------- |
| Logger      | `src/__mocks__/logger.ts`     | Mocks logging functions     |
| Config      | `src/__mocks__/config.ts`     | Provides test configuration |
| Jira API    | `src/__mocks__/jira.js.ts`    | Mocks Jira REST API         |
| Google APIs | `src/__mocks__/googleapis.ts` | Mocks Google Slides API     |

---

## Logger Mock

**File**: `src/__mocks__/logger.ts`

### Exports

| Export                         | Type     | Description                                     |
| ------------------------------ | -------- | ----------------------------------------------- |
| `logger`                       | Object   | Base logger with info/error/warn/debug          |
| `createServiceLogger`          | Function | Factory for service loggers with startOperation |
| `createDedicatedServiceLogger` | Function | Factory for dedicated service loggers           |
| `resetLoggerMocks`             | Function | Resets all logger mocks                         |

### Usage

```typescript
// Basic usage - import the mock
vi.mock('../../utils/logger', () => import('../../__mocks__/logger'));

// Or for .js extension (ESM)
vi.mock('../../utils/logger.js', () => import('../../__mocks__/logger'));
```

The mock automatically provides:

- `logger.info()`, `logger.error()`, `logger.warn()`, `logger.debug()` - all as vi.fn()
- `createServiceLogger()` - returns logger with `startOperation()` method
- `createDedicatedServiceLogger()` - returns basic logger object

---

## Config Mock

**File**: `src/__mocks__/config.ts`

### Exports

| Export             | Type      | Description                                  |
| ------------------ | --------- | -------------------------------------------- |
| `config`           | AppConfig | Complete test configuration                  |
| `createMockConfig` | Function  | Factory to create config with overrides      |
| `legacyConfig`     | Object    | Legacy format config for compatibility tests |
| `loadConfig`       | Function  | Returns mock config                          |
| `getConfig`        | Function  | Returns mock config                          |

### Usage

```typescript
// Basic usage
vi.mock('../../config', () => import('../../__mocks__/config'));

// With custom overrides (inline mock)
vi.mock('../../config', async () => {
  const mock = await import('../../__mocks__/config');
  return {
    ...mock,
    config: {
      ...mock.config,
      sla: {
        enabled: false,
        thresholds: [],
      },
    },
  };
});
```

### Default Config Values

```typescript
{
  organization: {
    name: 'Test Organization',
    jiraProjectKey: 'TEST',
    jiraComponent: 'TF-Test',
  },
  integrations: {
    jira: {
      host: 'test.atlassian.net',
      email: 'test@example.com',
      apiToken: 'test-api-token',
    },
    // ... slack, whatsapp, googleDocs
  },
  sla: {
    enabled: true,
    thresholds: [
      { status: 'In Progress', maxDays: 3 },
      { status: 'In Review', maxDays: 2 },
      { status: 'To Do', maxDays: 5 },
    ],
  },
  // ... features, cron, agent, dashboard, etc.
}
```

---

## Jira API Mock

**File**: `src/__mocks__/jira.js.ts`

### Exports

| Export            | Type     | Description                        |
| ----------------- | -------- | ---------------------------------- |
| `createMockIssue` | Function | Factory to create mock Jira issues |
| `mockIssueSearch` | Object   | Mock for issueSearch API methods   |
| `mockIssues`      | Object   | Mock for issues API methods        |
| `mockMyself`      | Object   | Mock for myself API methods        |
| `mockUserSearch`  | Object   | Mock for userSearch API methods    |
| `Version3Client`  | Class    | Mock Jira client class             |
| `resetJiraMocks`  | Function | Resets all Jira mocks              |

### Usage

```typescript
import { createMockIssue, mockIssueSearch, mockIssues, resetJiraMocks } from '../__mocks__/jira.js';

vi.mock('jira.js', () => ({
  Version3Client: vi.fn().mockImplementation(() => ({
    issueSearch: mockIssueSearch,
    issues: mockIssues,
  })),
}));

// In tests
beforeEach(() => resetJiraMocks());

it('should handle issues', async () => {
  mockIssueSearch.searchForIssuesUsingJql.mockResolvedValueOnce({
    issues: [createMockIssue({ key: 'TEST-123' })],
    total: 1,
  });

  // ... test code
});
```

### createMockIssue Options

```typescript
createMockIssue({
  key: 'CUSTOM-123',
  fields: {
    summary: 'Custom summary',
    status: { name: 'Done', statusCategory: { name: 'Done' } },
    assignee: null, // Unassigned
    priority: { name: 'Blocker' },
    labels: ['urgent', 'blocked'],
    customfield_10016: 5, // Story points
  },
});
```

---

## Google APIs Mock

**File**: `src/__mocks__/googleapis.ts`

### Exports

| Export                     | Type     | Description                             |
| -------------------------- | -------- | --------------------------------------- |
| `createMockSlide`          | Function | Factory to create mock slides           |
| `createMockSlideWithTable` | Function | Creates slide with table element        |
| `mockPresentation`         | Object   | Mock presentation data                  |
| `mockSlidesGet`            | vi.fn    | Mock for presentations.get              |
| `mockSlidesBatchUpdate`    | vi.fn    | Mock for presentations.batchUpdate      |
| `google`                   | Object   | Mock google object with auth and slides |
| `resetGoogleMocks`         | Function | Resets all Google mocks                 |

### Usage

```typescript
import {
  createMockSlide,
  mockSlidesGet,
  mockSlidesBatchUpdate,
  mockPresentation,
  resetGoogleMocks,
} from '../__mocks__/googleapis';

vi.mock('googleapis', () => ({
  google: {
    auth: { GoogleAuth: vi.fn() },
    slides: vi.fn().mockReturnValue({
      presentations: {
        get: mockSlidesGet,
        batchUpdate: mockSlidesBatchUpdate,
      },
    }),
  },
}));

// In tests
beforeEach(() => resetGoogleMocks());

it('should get presentation', async () => {
  mockSlidesGet.mockResolvedValueOnce({
    data: mockPresentation,
  });

  // ... test code
});
```

---

## Inline Mock Patterns

For dependencies not covered by `__mocks__/`, use inline mocks:

### Database Mock

```typescript
const mockGetChatPermission = vi.fn();
const mockSetChatPermission = vi.fn();

const createMockDb = () => ({
  getChatPermission: mockGetChatPermission,
  setChatPermission: mockSetChatPermission,
});

// Use in test
const mockDb = createMockDb() as unknown as MessageDatabase;
const service = new Service(mockDb);
```

### External API Client Mock

```typescript
vi.mock('../openCodeClient.js', () => ({
  createOpenCodeClient: vi.fn(() => ({
    healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
    chat: vi.fn().mockResolvedValue({
      sessionId: 'test-session',
      response: 'Mock response',
    }),
  })),
}));
```

### GitHub API Mock (for Skill Editing)

```typescript
// Mock global fetch for GitHub API
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockImplementation(async (url: string, options: RequestInit) => {
    const urlStr = url.toString();

    // Mock PR creation
    if (urlStr.includes('/pulls') && options?.method === 'POST') {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            number: 42,
            html_url: 'https://github.com/org/repo/pull/42',
            title: 'Add skill: test-skill',
            state: 'open',
          }),
      };
    }

    // Mock listing PRs
    if (urlStr.includes('/pulls') && !options?.method) {
      return {
        ok: true,
        text: async () =>
          JSON.stringify([
            {
              number: 42,
              title: 'Add skill: test-skill',
              html_url: 'https://github.com/org/repo/pull/42',
              state: 'open',
              created_at: '2025-01-07T10:00:00Z',
              updated_at: '2025-01-07T10:00:00Z',
              head: { ref: 'skill/test-skill-1234' },
              user: { login: 'ai-bot' },
            },
          ]),
      };
    }

    // Mock branch deletion
    if (urlStr.includes('/git/refs/heads/') && options?.method === 'DELETE') {
      return { ok: true, text: async () => '' };
    }

    // Default: return empty response
    return { ok: true, text: async () => '{}' };
  });
});
```

### File System Mock (for Skills Testing)

When testing skills that need file system access:

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_REPO_PATH = path.join(os.tmpdir(), 'test-repo');

beforeAll(() => {
  // Create test skill directory structure
  fs.mkdirSync(path.join(TEST_REPO_PATH, '.claude', 'skills', 'test-skill'), { recursive: true });
  fs.writeFileSync(
    path.join(TEST_REPO_PATH, '.claude', 'skills', 'test-skill', 'SKILL.md'),
    `---
name: test-skill
description: A test skill for integration testing
---

# Test Skill

This skill exists for testing.
`
  );
});

afterAll(() => {
  fs.rmSync(TEST_REPO_PATH, { recursive: true, force: true });
});
```
