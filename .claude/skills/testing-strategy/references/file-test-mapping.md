# File to Test Mapping

This document maps source files to their corresponding test files in the monorepo.

## Package: @orient/core

| Source File                     | Test File                                | Category                          |
| ------------------------------- | ---------------------------------------- | --------------------------------- |
| `packages/core/src/config/*.ts` | `packages/core/__tests__/config.test.ts` | Unit                              |
| `packages/core/src/logger/*.ts` | `packages/core/__tests__/logger.test.ts` | Unit                              |
| `packages/core/src/utils/*.ts`  | `packages/core/__tests__/utils.test.ts`  | Unit                              |
| `packages/core/src/types/*.ts`  | -                                        | Type definitions (no test needed) |

## Package: @orient/database

| Source File                         | Test File                                        | Category                          |
| ----------------------------------- | ------------------------------------------------ | --------------------------------- |
| `packages/database/src/schema/*.ts` | `packages/database/__tests__/schema.test.ts`     | Unit                              |
| `packages/database/src/client.ts`   | `packages/database/__tests__/client.e2e.test.ts` | E2E                               |
| `packages/database/src/types.ts`    | -                                                | Type definitions (no test needed) |

## Package: @orient/mcp-tools

| Source File                               | Test File                                       | Category |
| ----------------------------------------- | ----------------------------------------------- | -------- |
| `packages/mcp-tools/src/tools/base.ts`    | `packages/mcp-tools/__tests__/base.test.ts`     | Unit     |
| `packages/mcp-tools/src/registry/*.ts`    | `packages/mcp-tools/__tests__/registry.test.ts` | Unit     |
| `packages/mcp-tools/src/tools/context.ts` | `packages/mcp-tools/__tests__/context.test.ts`  | Unit     |

## Root-Level Services (Legacy - during migration)

| Source File                                | Test File                                                 | Category |
| ------------------------------------------ | --------------------------------------------------------- | -------- |
| `src/services/jiraService.ts`              | `src/services/__tests__/jiraService.test.ts`              | Unit     |
| `src/services/chatPermissionService.ts`    | `src/services/__tests__/chatPermissionService.test.ts`    | Unit     |
| `src/services/promptService.ts`            | `src/services/__tests__/promptService.test.ts`            | Unit     |
| `src/services/progressiveResponder.ts`     | `src/services/__tests__/progressiveResponder.test.ts`     | Unit     |
| `src/services/slidesService.ts`            | `src/services/__tests__/slidesService.test.ts`            | Unit     |
| `src/services/toolDiscovery.ts`            | `src/services/__tests__/toolDiscovery.test.ts`            | Unit     |
| `src/services/messageDatabaseDrizzle.ts`   | `src/services/__tests__/messageDatabaseDrizzle.test.ts`   | Unit     |
| `src/services/openCodeMessageProcessor.ts` | `src/services/__tests__/openCodeMessageProcessor.test.ts` | Unit     |
| `src/services/openCodeWhatsAppHandler.ts`  | `src/services/__tests__/openCodeWhatsAppHandler.test.ts`  | Unit     |
| `src/services/openCodeSlackHandler.ts`     | `src/services/__tests__/openCodeSlackHandler.test.ts`     | Unit     |

## Root-Level Tools

| Source File            | Test File                          | Category                          |
| ---------------------- | ---------------------------------- | --------------------------------- |
| `src/tools/base.ts`    | `src/tools/__tests__/base.test.ts` | Unit                              |
| `src/tools/context.ts` | -                                  | No test                           |
| `src/tools/types.ts`   | -                                  | Type definitions (no test needed) |

## Root-Level Configuration

| Source File            | Test File                             | Category |
| ---------------------- | ------------------------------------- | -------- |
| `src/config/index.ts`  | `src/config/__tests__/config.test.ts` | Unit     |
| `src/config/schema.ts` | `src/config/__tests__/config.test.ts` | Unit     |

## Root-Level Database

| Source File        | Test File                              | Category |
| ------------------ | -------------------------------------- | -------- |
| `src/db/index.ts`  | `src/db/__tests__/drizzle.e2e.test.ts` | E2E      |
| `src/db/schema.ts` | `src/db/__tests__/drizzle.e2e.test.ts` | E2E      |
| `src/db/client.ts` | `src/db/__tests__/drizzle.e2e.test.ts` | E2E      |

## MCP Server

| Source File         | Test File                                      | Category    |
| ------------------- | ---------------------------------------------- | ----------- |
| `src/mcp-server.ts` | `src/__tests__/mcp-server.integration.test.ts` | Integration |

## Cross-Package Tests

| Test Location                             | Purpose                    |
| ----------------------------------------- | -------------------------- |
| `tests/integration/*.integration.test.ts` | Multi-package interactions |
| `tests/e2e/*.e2e.test.ts`                 | Full system flows          |
| `tests/contracts/*.contract.test.ts`      | Package API stability      |

## Services Without Tests (Candidates for Coverage)

| Source File                           | Priority | Notes                       |
| ------------------------------------- | -------- | --------------------------- |
| `src/services/agentService.ts`        | Medium   | AI agent orchestration      |
| `src/services/billingService.ts`      | Low      | Cost tracking               |
| `src/services/mcpClientManager.ts`    | Medium   | MCP client management       |
| `src/services/mediaStorageService.ts` | Medium   | Media file handling         |
| `src/services/whatsappService.ts`     | High     | Core WhatsApp functionality |
| `src/services/slackService.ts`        | High     | Core Slack functionality    |
| `src/services/notificationService.ts` | Medium   | Notification dispatch       |

## Running Tests for Specific Files

```bash
# Package test
pnpm --filter @orient/core test -- __tests__/config.test.ts

# Root test
npm test -- src/services/__tests__/jiraService.test.ts

# Pattern matching
npm test -- --testNamePattern="chatPermission"

# Watch mode for specific file
npm run test:watch -- src/services/__tests__/jiraService.test.ts
```
