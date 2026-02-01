# Complete Migration Plan: src/ → packages/

This document outlines the complete migration of all remaining code from `src/` to the monorepo `packages/` structure.

## Migration Progress (Last Updated: Jan 16, 2026)

### MIGRATION COMPLETE - src/ DIRECTORY REMOVED

The entire `src/` directory has been eliminated. All code now lives in the `packages/` monorepo structure.

**Key Accomplishments:**

- Removed 170+ TypeScript files from src/
- Migrated 55+ service files to appropriate packages
- Created new packages: @orient-bot/eval, @orient-bot/cli
- Fixed tsconfig rootDir settings across all packages
- Eliminated all re-exports pointing to src/

### Completed Migrations

| Phase   | Description                                                     | Files | Status      |
| ------- | --------------------------------------------------------------- | ----- | ----------- |
| Phase 1 | Foundation Services - Core utilities and database layer         | 4     | ✅ Complete |
| Phase 2 | Google Services - sheets, slides, gmail, calendar, tasks, oauth | 5     | ✅ Complete |
| Phase 3 | External Integrations - GitHub, gitWorktree, JIRA               | 2     | ✅ Complete |
| Phase 4 | Agent Core - tool registry, discovery, calling, context         | 11    | ✅ Complete |
| Phase 5 | WhatsApp Bot - event handlers, messaging, cloud API             | 9     | ✅ Complete |
| Phase 7 | Apps System - generator, runtime, git, miniapp editor           | 6     | ✅ Complete |

### Total: 37 files migrated from src/ to packages/

### Files Migrated This Session

1. **@orient-bot/core** (4 files)
   - `src/utils/portChecker.ts` → `packages/core/src/utils/`
   - `src/config/models.ts` → `packages/core/src/config/models.ts`
   - `src/config/opencode-exclusions.ts` → `packages/core/src/config/opencode-exclusions.ts`

2. **@orient-bot/integrations** (5 files)
   - `src/services/sheetsService.ts` → `packages/integrations/src/google/sheets.ts`
   - `src/services/slidesService.ts` → `packages/integrations/src/google/slides.ts`
   - `src/services/googleOAuthService.ts` → `packages/integrations/src/google/oauth.ts`
   - `src/services/githubService.ts` → `packages/integrations/src/github.ts`
   - `src/services/gitWorktreeService.ts` → `packages/integrations/src/gitWorktree.ts`

3. **@orient-bot/agents** (11 files)
   - `toolCallingService.ts`, `openCodeClient.ts`, `toolRegistry.ts`, `toolDiscovery.ts`
   - `agentContextLoader.ts`, `agentRegistry.ts`, `agentService.ts`, `contextService.ts`
   - `mcpClientManager.ts`, `oauthClientProvider.ts`, `whatsappAgentService.ts`

4. **@orient-bot/bot-whatsapp** (9 files)
   - `mediaStorageService.ts`, `openCodeWhatsAppHandler.ts`, `progressiveResponder.ts`
   - `transcriptionService.ts`, `whatsappApiServer.ts`, `whatsappCloudApiService.ts`
   - `whatsappEventHandlers.ts`, `whatsappHealthMonitor.ts`, `whatsappMessageRouter.ts`

5. **@orient-bot/apps** (6 files)
   - `appGeneratorService.ts`, `appGitService.ts`, `appRuntimeService.ts`
   - `appsService.ts`, `miniappEditDatabase.ts`, `miniappEditService.ts`

### Remaining Work

| Package                 | Re-exports Remaining | Status   |
| ----------------------- | -------------------- | -------- |
| @orient-bot/agents       | 0 files              | MIGRATED |
| @orient-bot/bot-whatsapp | 0 files              | MIGRATED |
| @orient-bot/apps         | 0 files              | MIGRATED |
| @orient-bot/integrations | 0 files              | MIGRATED |

**ALL RE-EXPORTS HAVE BEEN ELIMINATED!**

### Build Blockers (to fix next)

The following issues prevent clean builds:

1. **Missing `@orient-bot/database-services` package** - Many files import from this non-existent package
2. **rootDir: "../.."** in tsconfigs causes cross-package compilation (can be removed now)
3. **Missing subpath exports** - Packages need `exports` field in package.json for subpath imports like `@orient-bot/integrations/jira`
4. **Import path fixes** - Some migrated files still reference old paths that need updating

### Build Notes

Packages with `rootDir: "../.."` in tsconfig.json (to support re-exports):

- @orient-bot/agents, @orient-bot/apps, @orient-bot/bot-whatsapp, @orient-bot/bot-slack
- @orient-bot/mcp-tools, @orient-bot/mcp-servers, @orient-bot/dashboard, @orient-bot/integrations

These will need tsconfig updates after all re-exports are eliminated.

---

## Overview

| Category     | Files | Target Package               | Priority | Status             |
| ------------ | ----- | ---------------------------- | -------- | ------------------ |
| Services     | 53    | Multiple                     | High     | 27 re-exported     |
| Tools        | 18    | @orient-bot/mcp-tools         | Medium   | Partially migrated |
| MCP Servers  | 9     | @orient-bot/mcp-servers       | Medium   | Not started        |
| Config       | 6     | @orient-bot/core              | Low      | Partial            |
| Types        | 5     | @orient-bot/database-services | Done     | ✓                  |
| DB           | 6     | @orient-bot/database          | Low      | Partial            |
| Utils        | 2     | @orient-bot/core              | Low      | 1 migrated         |
| CLI          | 4     | New: @orient-bot/cli          | Low      | Not started        |
| Dashboard    | 3     | @orient-bot/dashboard         | Low      | Partial            |
| Eval         | 21    | New: @orient-bot/eval         | Low      | Not started        |
| Apps Portal  | 10    | @orient-bot/dashboard         | Low      | Not started        |
| Managers     | 1     | @orient-bot/agents            | Low      | Not started        |
| Entry Points | 2     | Remove                       | Low      | Not started        |
| Tests        | 35+   | Co-locate                    | Low      | Partial            |
| Mocks        | 4     | @orient-bot/test-utils        | Low      | Partial            |

---

## Current Re-export Status

These files in `packages/` are **re-exporting from src/** and need full migration:

### @orient-bot/agents (9 files remaining - 1 migrated)

- `packages/agents/src/services/agentContextLoader.ts` ⏳
- `packages/agents/src/services/agentRegistry.ts` ⏳
- `packages/agents/src/services/agentService.ts` ⏳
- `packages/agents/src/services/contextService.ts` ⏳
- `packages/agents/src/services/mcpClientManager.ts` ⏳
- `packages/agents/src/services/openCodeClient.ts` ⏳
- ~~`packages/agents/src/services/toolCallingService.ts`~~ ✅ MIGRATED
- `packages/agents/src/services/toolDiscovery.ts` ⏳
- `packages/agents/src/services/toolRegistry.ts` ⏳ (3200+ lines)
- `packages/agents/src/services/whatsappAgentService.ts` ⏳ (1768 lines)

### @orient-bot/apps (6 files remaining)

- `packages/apps/src/services/appGeneratorService.ts` ⏳
- `packages/apps/src/services/appGitService.ts` ⏳
- `packages/apps/src/services/appRuntimeService.ts` ⏳
- `packages/apps/src/services/appsService.ts` ⏳
- `packages/apps/src/services/miniappEditDatabase.ts` ⏳
- `packages/apps/src/services/miniappEditService.ts` ⏳

### @orient-bot/bot-whatsapp (8 files remaining)

- `packages/bot-whatsapp/src/services/mediaStorageService.ts` ⏳
- `packages/bot-whatsapp/src/services/openCodeWhatsAppHandler.ts` ⏳
- `packages/bot-whatsapp/src/services/progressiveResponder.ts` ⏳
- `packages/bot-whatsapp/src/services/transcriptionService.ts` ⏳
- `packages/bot-whatsapp/src/services/whatsappApiServer.ts` ⏳
- `packages/bot-whatsapp/src/services/whatsappCloudApiService.ts` ⏳
- `packages/bot-whatsapp/src/services/whatsappEventHandlers.ts` ⏳
- `packages/bot-whatsapp/src/services/whatsappHealthMonitor.ts` ⏳
- `packages/bot-whatsapp/src/services/whatsappMessageRouter.ts` ⏳

### @orient-bot/integrations (0 files remaining in google/ - all migrated)

- ~~`packages/integrations/src/google/sheets.ts`~~ ✅ MIGRATED
- ~~`packages/integrations/src/google/slides.ts`~~ ✅ MIGRATED
- ~~`packages/integrations/src/google/oauth.ts`~~ ✅ MIGRATED
- ~~`packages/integrations/src/github.ts`~~ ✅ MIGRATED
- ~~`packages/integrations/src/gitWorktree.ts`~~ ✅ MIGRATED

### Pending migrations for @orient-bot/integrations

- `src/services/sheetsOAuthService.ts` → `packages/integrations/src/google/sheets-oauth.ts`
- `src/services/slidesOAuthService.ts` → `packages/integrations/src/google/slides-oauth.ts`

---

## Dependency Graph

Understanding the dependency order is critical for successful migration:

```
                     ┌─────────────┐
                     │  @orient-bot/   │
                     │   core      │  ← Foundation (no deps)
                     └──────┬──────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
       ┌──────────┐  ┌──────────┐  ┌──────────────┐
       │ database │  │ test-    │  │ integrations │
       │          │  │ utils    │  │ (jira,google)│
       └────┬─────┘  └──────────┘  └──────┬───────┘
            │                             │
            ▼                             ▼
    ┌───────────────┐            ┌────────────────┐
    │ database-     │            │    agents      │
    │ services      │◄───────────│                │
    └───────────────┘            └───────┬────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              ▼                          ▼                          ▼
       ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
       │  bot-slack   │          │ bot-whatsapp │          │    apps      │
       └──────────────┘          └──────────────┘          └──────────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              ▼                          ▼                          ▼
       ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
       │  mcp-tools   │          │ mcp-servers  │          │  dashboard   │
       └──────────────┘          └──────────────┘          └──────────────┘
```

**Migration Order**: core → database → database-services → integrations → agents → bot-_ → apps → mcp-_ → dashboard

---

## Phase 1: Foundation Services (Week 1)

These are utility services with few dependencies that other services rely on.

### 1.1 Core Utilities → @orient-bot/core

- [ ] `src/utils/logger.ts` → Already in @orient-bot/core ✓
- [ ] `src/utils/portChecker.ts` → `packages/core/src/utils/portChecker.ts`
- [ ] `src/config/schema.ts` → `packages/core/src/config/schema.ts`
- [ ] `src/config/defaults.ts` → `packages/core/src/config/defaults.ts`
- [ ] `src/config/models.ts` → `packages/core/src/config/models.ts`
- [ ] `src/config/opencode-exclusions.ts` → `packages/core/src/config/opencode-exclusions.ts`
- [ ] `src/config/index.ts` → `packages/core/src/config/index.ts`

### 1.2 Database Layer → @orient-bot/database

- [ ] `src/db/schema.ts` → Verify against `packages/database/src/schema/`
- [ ] `src/db/types.ts` → Merge into `packages/database/src/types.ts`
- [ ] `src/db/client.ts` → `packages/database/src/client.ts`
- [ ] `src/db/index.ts` → Update package exports

---

## Phase 2: Google Services (Week 1-2)

Complete the @orient-bot/integrations/google migration.

### 2.1 Google OAuth & Services → @orient-bot/integrations/google

Currently re-exported, need full migration:

- [ ] `src/services/googleOAuthService.ts` → `packages/integrations/src/google/oauth.ts`
- [ ] `src/services/sheetsService.ts` → `packages/integrations/src/google/sheets.ts` (move from re-export)
- [ ] `src/services/slidesService.ts` → `packages/integrations/src/google/slides.ts` (move from re-export)
- [ ] `src/services/sheetsOAuthService.ts` → `packages/integrations/src/google/sheetsOAuth.ts`
- [ ] `src/services/slidesOAuthService.ts` → `packages/integrations/src/google/slidesOAuth.ts`
- [ ] `src/services/gmailService.ts` → `packages/integrations/src/google/gmail.ts`
- [ ] `src/services/calendarService.ts` → `packages/integrations/src/google/calendar.ts`
- [ ] `src/services/tasksService.ts` → `packages/integrations/src/google/tasks.ts`

**Verification:**

- [ ] Update `packages/integrations/src/google/index.ts` exports
- [ ] Run Google OAuth test flow
- [ ] Test Gmail, Calendar, Sheets, Slides operations

---

## Phase 3: External Integrations (Week 2)

### 3.1 GitHub & Git → @orient-bot/integrations

- [ ] `src/services/githubService.ts` → `packages/integrations/src/catalog/github/service.ts`
- [ ] `src/services/gitWorktreeService.ts` → `packages/integrations/src/git/worktree.ts`

### 3.2 JIRA → @orient-bot/integrations/jira

- [ ] `src/services/jiraService.ts` → Verify against existing `packages/integrations/src/jira/`

### 3.3 Atlassian OAuth → @orient-bot/mcp-servers or @orient-bot/integrations

- [ ] `src/services/oauthClientProvider.ts` → `packages/mcp-servers/src/oauth/atlassian.ts`

---

## Phase 4: Agent Core (Week 2-3)

These are the core agent services. Migrate in dependency order.

### 4.1 Tool Infrastructure → @orient-bot/agents

Migrate first (no agent dependencies):

- [ ] `src/services/toolRegistry.ts` → `packages/agents/src/tools/registry.ts`
- [ ] `src/services/toolDiscovery.ts` → `packages/agents/src/tools/discovery.ts`
- [ ] `src/services/toolCallingService.ts` → `packages/agents/src/tools/calling.ts`

### 4.2 Context & Registry → @orient-bot/agents

- [ ] `src/services/contextService.ts` → `packages/agents/src/context/service.ts`
- [ ] `src/services/agentRegistry.ts` → `packages/agents/src/registry/agent-registry.ts`
- [ ] `src/services/agentContextLoader.ts` → `packages/agents/src/registry/context-loader.ts`

### 4.3 Agent Services → @orient-bot/agents

- [ ] `src/services/agentService.ts` → `packages/agents/src/services/agent.ts`
- [ ] `src/services/progressiveResponder.ts` → `packages/agents/src/services/progressive-responder.ts`
- [ ] `src/services/whatsappAgentService.ts` → Move to @orient-bot/bot-whatsapp

### 4.4 OpenCode Integration → @orient-bot/agents

- [ ] `src/services/openCodeClient.ts` → `packages/agents/src/opencode/client.ts`
- [ ] `src/services/openCodeMessageProcessor.ts` → `packages/agents/src/opencode/message-processor.ts`
- [ ] `src/services/openCodeBotIntegration.ts` → `packages/agents/src/opencode/bot-integration.ts`

### 4.5 MCP Client → @orient-bot/agents or @orient-bot/mcp-servers

- [ ] `src/services/mcpClientManager.ts` → `packages/agents/src/mcp/client-manager.ts`

---

## Phase 5: WhatsApp Bot (Week 3)

### 5.1 Core WhatsApp → @orient-bot/bot-whatsapp

- [ ] `src/services/whatsappService.ts` → `packages/bot-whatsapp/src/services/whatsapp.ts`
- [ ] `src/services/whatsappEventHandlers.ts` → `packages/bot-whatsapp/src/handlers/events.ts`
- [ ] `src/services/whatsappMessageRouter.ts` → `packages/bot-whatsapp/src/handlers/router.ts`
- [ ] `src/services/whatsappHealthMonitor.ts` → `packages/bot-whatsapp/src/monitoring/health.ts`
- [ ] `src/services/whatsappApiServer.ts` → `packages/bot-whatsapp/src/api/server.ts`
- [ ] `src/services/whatsappCloudApiService.ts` → `packages/bot-whatsapp/src/api/cloud-api.ts`

### 5.2 WhatsApp Handlers → @orient-bot/bot-whatsapp

- [ ] `src/services/openCodeWhatsAppHandler.ts` → `packages/bot-whatsapp/src/handlers/opencode.ts`
- [ ] `src/services/whatsappAgentService.ts` → `packages/bot-whatsapp/src/services/agent.ts`

### 5.3 Media Services → @orient-bot/bot-whatsapp

- [ ] `src/services/mediaStorageService.ts` → `packages/bot-whatsapp/src/media/storage.ts`
- [ ] `src/services/transcriptionService.ts` → `packages/bot-whatsapp/src/media/transcription.ts`

---

## Phase 6: Slack Bot (Week 3)

### 6.1 Core Slack → @orient-bot/bot-slack

- [ ] `src/services/slackService.ts` → `packages/bot-slack/src/services/slack.ts`
- [ ] `src/services/slackBotService.ts` → `packages/bot-slack/src/services/bot.ts`
- [ ] `src/services/slackDualModeClient.ts` → `packages/bot-slack/src/services/dual-mode.ts`
- [ ] `src/services/slackUserTokenService.ts` → `packages/bot-slack/src/services/user-token.ts`

### 6.2 Slack Handlers → @orient-bot/bot-slack

- [ ] `src/services/openCodeSlackHandler.ts` → `packages/bot-slack/src/handlers/opencode.ts`

### 6.3 Slack Database → @orient-bot/bot-slack

- [ ] `src/services/slackDatabaseDrizzle.ts` → `packages/bot-slack/src/database/drizzle.ts`

---

## Phase 7: Apps System (Week 4)

### 7.1 Apps Core → @orient-bot/apps

- [ ] `src/services/appsService.ts` → `packages/apps/src/services/apps.ts`
- [ ] `src/services/appGeneratorService.ts` → `packages/apps/src/services/generator.ts`
- [ ] `src/services/appGitService.ts` → `packages/apps/src/services/git.ts`
- [ ] `src/services/appRuntimeService.ts` → `packages/apps/src/services/runtime.ts`

### 7.2 Mini-App Editor → @orient-bot/apps

- [ ] `src/services/miniappEditService.ts` → `packages/apps/src/editor/service.ts`
- [ ] `src/services/miniappEditDatabase.ts` → `packages/apps/src/editor/database.ts`
- [ ] `src/services/appApiRoutes.ts` → `packages/apps/src/api/routes.ts`

---

## Phase 8: MCP Tools (Week 4)

### 8.1 Agent Tools → @orient-bot/mcp-tools

- [ ] `src/tools/agents/get-agent-context.ts` → `packages/mcp-tools/src/tools/agents/get-context.ts`
- [ ] `src/tools/agents/list-agents.ts` → `packages/mcp-tools/src/tools/agents/list.ts`
- [ ] `src/tools/agents/handoff-to-agent.ts` → `packages/mcp-tools/src/tools/agents/handoff.ts`

### 8.2 Context Tools → @orient-bot/mcp-tools

- [ ] `src/tools/context/read-context.ts` → `packages/mcp-tools/src/tools/context/read.ts`
- [ ] `src/tools/context/update-context.ts` → `packages/mcp-tools/src/tools/context/update.ts`

### 8.3 JIRA Tools → @orient-bot/mcp-tools

- [ ] `src/tools/jira/get-issue.ts` → `packages/mcp-tools/src/tools/jira/get-issue.ts`
- [ ] `src/tools/jira/get-all-issues.ts` → `packages/mcp-tools/src/tools/jira/get-all.ts`
- [ ] `src/tools/jira/get-in-progress.ts` → `packages/mcp-tools/src/tools/jira/get-in-progress.ts`

### 8.4 Apps Tools → @orient-bot/mcp-tools

- [ ] `src/tools/apps/create-app.ts` → `packages/mcp-tools/src/tools/apps/create.ts`
- [ ] `src/tools/apps/get-app.ts` → `packages/mcp-tools/src/tools/apps/get.ts`
- [ ] `src/tools/apps/list-apps.ts` → `packages/mcp-tools/src/tools/apps/list.ts`
- [ ] `src/tools/apps/update-app.ts` → `packages/mcp-tools/src/tools/apps/update.ts`
- [ ] `src/tools/apps/share-app.ts` → `packages/mcp-tools/src/tools/apps/share.ts`

### 8.5 Tool Base → @orient-bot/mcp-tools

- [ ] `src/tools/base.ts` → `packages/mcp-tools/src/tools/base.ts`
- [ ] `src/tools/types.ts` → `packages/mcp-tools/src/types.ts`

---

## Phase 9: MCP Servers (Week 4-5)

### 9.1 Server Infrastructure → @orient-bot/mcp-servers

- [ ] `src/mcp-servers/types.ts` → `packages/mcp-servers/src/types.ts` (already done)
- [ ] `src/mcp-servers/base-server.ts` → `packages/mcp-servers/src/servers/base.ts`
- [ ] `src/mcp-servers/tool-executor.ts` → `packages/mcp-servers/src/execution/executor.ts`
- [ ] `src/mcp-servers/tool-filter.ts` → `packages/mcp-servers/src/execution/filter.ts`

### 9.2 Server Implementations → @orient-bot/mcp-servers

- [ ] `src/mcp-servers/core-server.ts` → `packages/mcp-servers/src/servers/core.ts`
- [ ] `src/mcp-servers/coding-server.ts` → `packages/mcp-servers/src/servers/coding.ts`
- [ ] `src/mcp-servers/assistant-server.ts` → `packages/mcp-servers/src/servers/assistant.ts`

---

## Phase 10: Dashboard & Supporting (Week 5)

### 10.1 Dashboard → @orient-bot/dashboard

- [ ] `src/dashboard/server.ts` → Already migrated to packages/dashboard
- [ ] `src/dashboard/auth.ts` → `packages/dashboard/src/server/auth.ts`

### 10.2 Scheduler & Notifications → @orient-bot/dashboard or @orient-bot/core

- [ ] `src/services/schedulerService.ts` → `packages/dashboard/src/services/scheduler.ts`
- [ ] `src/services/notificationService.ts` → `packages/dashboard/src/services/notification.ts`
- [ ] `src/services/webhookService.ts` → `packages/dashboard/src/services/webhook.ts`
- [ ] `src/services/webhookForwardingService.ts` → `packages/dashboard/src/services/webhook-forwarding.ts`

### 10.3 Billing → @orient-bot/dashboard

- [ ] `src/services/billingService.ts` → `packages/dashboard/src/services/billing.ts`

### 10.4 Message Database → @orient-bot/database-services

- [ ] `src/services/messageDatabaseDrizzle.ts` → `packages/database-services/src/messages.ts`

### 10.5 Meeting & Standup → @orient-bot/integrations or new package

- [ ] `src/services/meetingService.ts` → `packages/integrations/src/google/meeting.ts`
- [ ] `src/managers/StandupManager.ts` → `packages/agents/src/managers/standup.ts`

### 10.6 Poll Actions → @orient-bot/mcp-tools

- [ ] `src/services/pollActionRegistry.ts` → `packages/mcp-tools/src/tools/config/poll-registry.ts`

---

## Phase 11: CLI & Eval (Week 5-6)

### 11.1 CLI → New @orient-bot/cli package

Create new package:

- [ ] `packages/cli/package.json`
- [ ] `packages/cli/src/index.ts`
- [ ] `packages/cli/tsconfig.json`
- [ ] Add to root `pnpm-workspace.yaml`

Migrate:

- [ ] `src/cli/workflow.ts` → `packages/cli/src/commands/workflow.ts`
- [ ] `src/cli/meeting.ts` → `packages/cli/src/commands/meeting.ts`
- [ ] `src/cli/update-presentation.ts` → `packages/cli/src/commands/slides.ts`
- [ ] `src/cli/dashboard-admin.ts` → `packages/cli/src/commands/admin.ts`

**package.json template:**

```json
{
  "name": "@orient-bot/cli",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "orient": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@orient-bot/core": "workspace:*",
    "@orient-bot/integrations": "workspace:*",
    "@orient-bot/agents": "workspace:*",
    "commander": "^12.0.0"
  }
}
```

### 11.2 Eval Framework → New @orient-bot/eval package

Create new package:

- [ ] `packages/eval/package.json`
- [ ] `packages/eval/src/index.ts`
- [ ] `packages/eval/tsconfig.json`
- [ ] `packages/eval/vitest.config.ts`
- [ ] Add to root `pnpm-workspace.yaml`

Migrate:

- [ ] `src/eval/runner/` → `packages/eval/src/runner/`
- [ ] `src/eval/judge/` → `packages/eval/src/judge/`
- [ ] `src/eval/mocks/` → `packages/eval/src/mocks/`
- [ ] `src/eval/http-wrapper/` → `packages/eval/src/http-wrapper/`
- [ ] `src/eval/cli.ts` → `packages/eval/src/cli.ts`
- [ ] `src/eval/types.ts` → `packages/eval/src/types.ts`
- [ ] `src/eval/setup.ts` → `packages/eval/src/setup.ts`
- [ ] `src/eval/all.eval.test.ts` → `packages/eval/__tests__/all.eval.test.ts`
- [ ] `src/eval/vitest-adapter.ts` → `packages/eval/src/vitest-adapter.ts`
- [ ] `src/eval/index.ts` → `packages/eval/src/index.ts`

---

## Phase 12: Apps Portal (Week 6)

### 12.1 Apps Portal → Merge into @orient-bot/dashboard

The apps portal is a small React app for browsing/running mini-apps. Merge into dashboard:

- [ ] Move `src/apps-portal/src/` → `packages/dashboard/frontend/src/apps-portal/`
- [ ] Update vite config in dashboard to include apps-portal route
- [ ] Move `src/apps-portal/index.html` → Integrate as dashboard route

**Alternative**: Create standalone @orient-bot/apps-portal package if it needs independent deployment.

### 12.2 Apps Portal Files

- [ ] `src/apps-portal/src/App.tsx` → `packages/dashboard/frontend/src/apps-portal/App.tsx`
- [ ] `src/apps-portal/src/main.tsx` → Integrate into dashboard routes
- [ ] `src/apps-portal/src/components/AppBrowser.tsx` → Dashboard component
- [ ] `src/apps-portal/src/components/AppRunner.tsx` → Dashboard component
- [ ] `src/apps-portal/src/components/NotFound.tsx` → Use dashboard's existing NotFound

---

## Phase 13: Entry Points & Mocks (Week 6)

### 13.1 Entry Points → Remove after migration

These files will be obsolete after migration:

- [ ] `src/mcp-server.ts` → Functionality in `packages/mcp-servers/src/index.ts`
- [ ] `src/packages.ts` → Remove (placeholder file)

### 13.2 Mocks → @orient-bot/test-utils

Migrate test mocks to centralized test utilities:

- [ ] `src/__mocks__/config.ts` → Already in `packages/test-utils/src/mocks/config.ts` ✓
- [ ] `src/__mocks__/logger.ts` → Already in `packages/test-utils/src/mocks/logger.ts` ✓
- [ ] `src/__mocks__/googleapis.ts` → `packages/test-utils/src/mocks/googleapis.ts`
- [ ] `src/__mocks__/jira.js.ts` → `packages/test-utils/src/mocks/jira.ts`

### 13.3 Integration Tests

Migrate integration tests to appropriate packages:

| Source                                                   | Target                                   |
| -------------------------------------------------------- | ---------------------------------------- |
| `src/__tests__/mcp-server.integration.test.ts`           | `packages/mcp-servers/__tests__/`        |
| `src/config/__tests__/config.test.ts`                    | `packages/core/__tests__/config.test.ts` |
| `src/dashboard/__tests__/agents-api.integration.test.ts` | `packages/dashboard/__tests__/`          |
| `src/db/__tests__/*.test.ts`                             | `packages/database/__tests__/`           |
| `src/mcp-servers/__tests__/*.test.ts`                    | `packages/mcp-servers/__tests__/`        |

### 13.4 Service Tests

Migrate service tests to co-locate with implementations:

| Source                                                    | Target Package               |
| --------------------------------------------------------- | ---------------------------- |
| `src/services/__tests__/agentContextLoader.test.ts`       | @orient-bot/agents            |
| `src/services/__tests__/agentRegistry.*.test.ts`          | @orient-bot/agents            |
| `src/services/__tests__/appRuntimeService.test.ts`        | @orient-bot/apps              |
| `src/services/__tests__/appsService.test.ts`              | @orient-bot/apps              |
| `src/services/__tests__/chatPermissionService.test.ts`    | @orient-bot/database-services |
| `src/services/__tests__/contextService.*.test.ts`         | @orient-bot/agents            |
| `src/services/__tests__/googleOAuthService.*.test.ts`     | @orient-bot/integrations      |
| `src/services/__tests__/googleServices.e2e.test.ts`       | @orient-bot/integrations      |
| `src/services/__tests__/jiraService.test.ts`              | @orient-bot/integrations      |
| `src/services/__tests__/messageDatabaseDrizzle.test.ts`   | @orient-bot/database-services |
| `src/services/__tests__/openCodeClient.test.ts`           | @orient-bot/agents            |
| `src/services/__tests__/openCodeMessageProcessor.test.ts` | @orient-bot/agents            |
| `src/services/__tests__/openCodeSlackHandler.test.ts`     | @orient-bot/bot-slack         |
| `src/services/__tests__/openCodeWhatsAppHandler.test.ts`  | @orient-bot/bot-whatsapp      |
| `src/services/__tests__/progressiveResponder.test.ts`     | @orient-bot/agents            |
| `src/services/__tests__/promptService.test.ts`            | @orient-bot/agents            |
| `src/services/__tests__/skillEditing.integration.test.ts` | @orient-bot/agents            |
| `src/services/__tests__/slidesService.test.ts`            | @orient-bot/integrations      |
| `src/services/__tests__/toolCallingService.test.ts`       | @orient-bot/agents            |
| `src/services/__tests__/toolDiscovery.test.ts`            | @orient-bot/agents            |

---

## Phase 14: Cleanup & Verification (Week 6-7)

### 14.1 Remove src/ re-exports

After full migration, update packages to use native imports:

- [ ] Remove `export * from '../../../../src/services/...'` patterns
- [ ] Update all package imports to use native implementations
- [ ] Verify: `pnpm exec grep -r "from '../../../../src" packages/` returns empty

### 14.2 Delete src/ Directories (in order)

Pre-deletion verification:

- [ ] All tests pass: `pnpm test`
- [ ] All builds succeed: `pnpm build`

Delete directories:

- [ ] `src/services/`
- [ ] `src/tools/`
- [ ] `src/mcp-servers/`
- [ ] `src/config/`
- [ ] `src/db/`
- [ ] `src/cli/`
- [ ] `src/eval/`
- [ ] `src/managers/`
- [ ] `src/apps-portal/`
- [ ] `src/dashboard/`
- [ ] `src/__mocks__/`
- [ ] `src/__tests__/`
- [ ] `src/types/`

Delete files:

- [ ] `src/mcp-server.ts`
- [ ] `src/packages.ts`
- [ ] Update tsconfig.json to remove `src/` from includes

### 14.3 Update Documentation

- [ ] Update AGENTS.md - remove deprecation warning about src/
- [ ] Update root README.md with new package structure
- [ ] Update individual package READMEs
- [ ] Delete or archive `.cursor/rules/src-deprecated.mdc`
- [ ] Update CONTRIBUTING.md if it exists

### 14.4 Final Verification Checklist

**Build Verification:**

- [ ] `pnpm build` - full build succeeds
- [ ] `pnpm test` - all tests pass
- [ ] `pnpm lint` - no lint errors
- [ ] `pnpm exec tsc --noEmit` - type check passes

**Runtime Verification:**

- [ ] WhatsApp bot starts: `pnpm --filter @orient-bot/bot-whatsapp dev`
- [ ] Slack bot starts: `pnpm --filter @orient-bot/bot-slack dev`
- [ ] Dashboard starts: `pnpm --filter @orient-bot/dashboard dev`
- [ ] MCP servers respond to tool calls

**E2E Verification:**

- [ ] E2E tests pass
- [ ] Docker builds work
- [ ] Production build works: `NODE_ENV=production pnpm build`

**Integration Verification:**

- [ ] JIRA integration (create/read issue)
- [ ] Google OAuth flow
- [ ] Google Sheets read/write
- [ ] Google Slides operations
- [ ] Slack messaging
- [ ] WhatsApp messaging
- [ ] Mini-apps creation
- [ ] Agent context resolution

---

## Migration Process for Each File

### Standard Migration Steps

1. **Create target file** in the appropriate package
2. **Copy content** from src/ file
3. **Update imports** to use package paths (@orient-bot/...)
4. **Export from package** index.ts
5. **Update consumers** to import from package
6. **Remove re-export** file if it exists
7. **Test** the migrated functionality
8. **Delete** original src/ file

### Common Import Transformations

| Old Import                | New Import                       |
| ------------------------- | -------------------------------- |
| `../utils/logger.js`      | `@orient-bot/core`                |
| `../db/client.js`         | `@orient-bot/database`            |
| `./jiraService.js`        | `@orient-bot/integrations/jira`   |
| `./googleOAuthService.js` | `@orient-bot/integrations/google` |
| `./toolRegistry.js`       | `@orient-bot/agents`              |
| `./whatsappService.js`    | `@orient-bot/bot-whatsapp`        |
| `./slackService.js`       | `@orient-bot/bot-slack`           |

---

## Worktree Setup

```bash
# Create worktree for migration work
git worktree add ../orient-migration feature/complete-src-migration

# Navigate to worktree
cd ../orient-migration

# Create tracking branch
git checkout -b feature/complete-src-migration

# Install dependencies
pnpm install

# Work on phases incrementally, commit after each phase
```

## Testing Strategy

After each phase:

1. Run `pnpm build` (verify compilation)
2. Run `pnpm test` (verify unit tests)
3. Run `pnpm --filter @orient-bot/<package> test` (package-specific)
4. Run config tests: `npx vitest run tests/config/`
5. Manual smoke test of affected functionality

---

## Estimated Timeline

| Phase                          | Duration | Dependencies |
| ------------------------------ | -------- | ------------ |
| Phase 1: Foundation            | 2-3 days | None         |
| Phase 2: Google Services       | 2-3 days | Phase 1      |
| Phase 3: External Integrations | 1-2 days | Phase 1      |
| Phase 4: Agent Core            | 3-4 days | Phases 1-3   |
| Phase 5: WhatsApp Bot          | 2-3 days | Phase 4      |
| Phase 6: Slack Bot             | 2-3 days | Phase 4      |
| Phase 7: Apps System           | 2-3 days | Phase 4      |
| Phase 8: MCP Tools             | 2-3 days | Phases 4-7   |
| Phase 9: MCP Servers           | 2-3 days | Phase 8      |
| Phase 10: Dashboard            | 2-3 days | Phases 1-4   |
| Phase 11: CLI & Eval           | 2-3 days | All above    |
| Phase 12: Apps Portal          | 1-2 days | Phase 10     |
| Phase 13: Entry Points & Tests | 2-3 days | All above    |
| Phase 14: Cleanup              | 2-3 days | All above    |

**Total: ~5-7 weeks**

---

## Quick Start: Phase 1

Start with the simplest migrations to establish the pattern:

```bash
# 1. Create worktree
git worktree add ../orient-migration feature/src-migration-phase1

# 2. Start with portChecker (simplest)
cp src/utils/portChecker.ts packages/core/src/utils/portChecker.ts

# 3. Update imports and exports
# 4. Test
# 5. Commit

# Continue with other Phase 1 items...
```

---

## Risk Assessment

### High Risk Areas

| Area                | Risk                               | Mitigation                          |
| ------------------- | ---------------------------------- | ----------------------------------- |
| Agent Services      | Core functionality, many consumers | Migrate last, thorough testing      |
| Google OAuth        | Token storage, auth flows          | Test OAuth flow end-to-end          |
| WhatsApp Connection | Baileys session state              | Test reconnection scenarios         |
| Database Migrations | Schema changes                     | No schema changes in this migration |

### Medium Risk Areas

| Area                  | Risk                 | Mitigation                         |
| --------------------- | -------------------- | ---------------------------------- |
| Import Paths          | Broken imports       | Use grep to find all consumers     |
| Circular Dependencies | New import structure | Map dependencies before moving     |
| Test Coverage         | Tests may break      | Migrate tests with implementations |

### Low Risk Areas

| Area   | Risk                 | Mitigation            |
| ------ | -------------------- | --------------------- |
| Config | Static configuration | Simple file copy      |
| CLI    | Standalone scripts   | Independent migration |
| Eval   | Test framework       | Can be done last      |

---

## Rollback Strategy

### Per-Phase Rollback

Each phase should be a separate PR. If issues arise:

1. **Revert PR**: `git revert <merge-commit>`
2. **Restore re-exports**: Re-add the `export * from '../../../../src/...'` line
3. **Rebuild**: `pnpm build`
4. **Verify**: `pnpm test`

### Full Rollback

If the entire migration needs to be rolled back:

```bash
# From main branch
git log --oneline | grep "migration"  # Find all migration commits
git revert <commit1> <commit2> ...    # Revert in reverse order

# Or revert to pre-migration tag
git tag pre-src-migration             # Create before starting
git checkout pre-src-migration        # If rollback needed
```

### Emergency Hotfix

If production is broken and rollback isn't feasible:

1. **Re-add re-export file** in packages/
2. **Copy source back** from git history: `git show HEAD~1:src/services/file.ts > src/services/file.ts`
3. **Deploy hotfix**
4. **Debug and fix properly**

---

## Migration Scripts

### Check Migration Status

```bash
#!/bin/bash
# scripts/migration-status.sh

echo "=== Re-exports remaining ==="
grep -r "from '../../../../src" packages/ | wc -l

echo ""
echo "=== Files still in src/services ==="
ls -la src/services/*.ts 2>/dev/null | wc -l

echo ""
echo "=== Files in each package ==="
for pkg in packages/*/; do
  count=$(find "$pkg/src" -name "*.ts" 2>/dev/null | wc -l)
  echo "$pkg: $count files"
done
```

### Migrate Single File

```bash
#!/bin/bash
# scripts/migrate-file.sh <src-path> <dest-path>

SRC=$1
DEST=$2

# Copy file
cp "$SRC" "$DEST"

# Update imports (basic transformation)
sed -i '' "s|from '../utils/logger.js'|from '@orient-bot/core'|g" "$DEST"
sed -i '' "s|from '../db/client.js'|from '@orient-bot/database'|g" "$DEST"

echo "Migrated $SRC -> $DEST"
echo "TODO: Update package index.ts exports"
echo "TODO: Update consumers"
echo "TODO: Run tests"
```

### Find Consumers

```bash
#!/bin/bash
# scripts/find-consumers.sh <service-name>

SERVICE=$1

echo "=== Direct imports of $SERVICE ==="
grep -r "from '.*$SERVICE" packages/ src/

echo ""
echo "=== Usage of exports from $SERVICE ==="
grep -r "import.*$SERVICE" packages/ src/
```

---

## Progress Tracking

### Tracking Spreadsheet

Maintain a tracking spreadsheet with columns:

| File                           | Status      | PR   | Verified | Notes                   |
| ------------------------------ | ----------- | ---- | -------- | ----------------------- |
| `src/services/agentService.ts` | In Progress | #123 | ❌       | Depends on toolRegistry |
| `src/services/toolRegistry.ts` | Done        | #122 | ✅       |                         |

### Status Values

- **Not Started**: File still in src/, re-export exists or not
- **In Progress**: PR open for migration
- **Done**: File migrated, re-export removed, tests passing
- **Verified**: Smoke tested in staging/production
- **Blocked**: Waiting on dependency

### Weekly Check-in

At the end of each week:

1. Run `scripts/migration-status.sh`
2. Update tracking spreadsheet
3. Identify blockers
4. Plan next week's targets

---

## Appendix: File Count Summary

```
src/ directory contents (to be migrated):
├── services/        53 .ts files
├── tools/           18 .ts files
├── mcp-servers/      9 .ts files
├── config/           6 .ts files
├── db/               6 .ts files
├── cli/              4 .ts files
├── eval/            21 .ts files (across subdirs)
├── apps-portal/     10 files (React app)
├── managers/         1 .ts file
├── dashboard/        3 files
├── types/            5 .ts files
├── __mocks__/        4 .ts files
└── __tests__/        2 .ts files
                    ─────────
                    ~140 files total
```

---

## Appendix: Package Dependencies

```json
{
  "@orient-bot/core": [],
  "@orient-bot/database": ["@orient-bot/core"],
  "@orient-bot/database-services": ["@orient-bot/core", "@orient-bot/database"],
  "@orient-bot/test-utils": ["@orient-bot/core"],
  "@orient-bot/integrations": ["@orient-bot/core", "@orient-bot/database-services"],
  "@orient-bot/agents": [
    "@orient-bot/core",
    "@orient-bot/database",
    "@orient-bot/database-services",
    "@orient-bot/integrations"
  ],
  "@orient-bot/apps": ["@orient-bot/core", "@orient-bot/agents"],
  "@orient-bot/bot-whatsapp": ["@orient-bot/core", "@orient-bot/agents", "@orient-bot/integrations"],
  "@orient-bot/bot-slack": ["@orient-bot/core", "@orient-bot/agents", "@orient-bot/integrations"],
  "@orient-bot/mcp-tools": [
    "@orient-bot/core",
    "@orient-bot/agents",
    "@orient-bot/integrations",
    "@orient-bot/apps"
  ],
  "@orient-bot/mcp-servers": ["@orient-bot/core", "@orient-bot/mcp-tools"],
  "@orient-bot/dashboard": [
    "@orient-bot/core",
    "@orient-bot/agents",
    "@orient-bot/apps",
    "@orient-bot/database-services"
  ],
  "@orient-bot/cli": ["@orient-bot/core", "@orient-bot/integrations", "@orient-bot/agents"],
  "@orient-bot/eval": ["@orient-bot/core", "@orient-bot/agents", "@orient-bot/test-utils"]
}
```
