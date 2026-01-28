# @orientbot/core

Shared utilities, types, and configuration for the Orient.

## Features

- **Configuration**: Zod-validated configuration with environment variable substitution
- **Logger**: Structured logging with Winston, log rotation, and sensitive data redaction
- **Types**: Common type definitions used across all packages
- **Utils**: Utility functions for common operations

## Installation

```bash
pnpm add @orientbot/core
```

## Usage

### Configuration

```typescript
import { loadConfig, getConfig } from '@orientbot/core';

// Load configuration from file and environment
const config = loadConfig();

// Access configuration values
console.log(config.organization.name);
console.log(config.integrations.jira.host);
```

### Logger

```typescript
import { createServiceLogger, logger } from '@orientbot/core';

// Use the main logger
logger.info('Application started');

// Create a service-specific logger
const serviceLog = createServiceLogger('my-service');
serviceLog.info('Service initialized');

// Track operations with timing
const op = serviceLog.startOperation('fetchData');
try {
  await fetchData();
  op.success('Data fetched');
} catch (error) {
  op.failure(error);
}
```

### Types

```typescript
import type { JiraIssue, ChatPermission, WhatsAppMessage } from '@orientbot/core';

const issue: JiraIssue = {
  id: '10001',
  key: 'PROJ-123',
  summary: 'Example issue',
  // ...
};
```

### Utils

```typescript
import { sleep, retryWithBackoff, formatDuration, isProduction } from '@orientbot/core';

// Wait for a duration
await sleep(1000);

// Retry with exponential backoff
const result = await retryWithBackoff(
  () => fetchWithRetry(),
  3, // max retries
  1000 // initial delay
);

// Format duration
console.log(formatDuration(125000)); // "2m 5s"

// Environment checks
if (isProduction()) {
  // Production-specific code
}
```

## Configuration File

The config loader looks for configuration in this order:

1. `.mcp.config.local.json`
2. `.mcp.config.json`
3. `mcp-config.json`
4. `config.json`
5. `config/app.json`

Environment variables can be substituted using `${VAR_NAME}` syntax:

```json
{
  "integrations": {
    "jira": {
      "apiToken": "${JIRA_API_TOKEN}"
    }
  }
}
```

## Development

```bash
# Build
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck
```
