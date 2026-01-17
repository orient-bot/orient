# Stub Implementations TODO

> **Status**: Pending Implementation  
> **Created**: January 2026  
> **Related PR**: src/ to packages/ migration

## Overview

During the migration, several tool implementations were stubbed out to allow the build to pass. These stubs return placeholder responses and need to be replaced with actual implementations.

---

## 1. Agent Tools (`@orient/mcp-tools`)

**Location**: `packages/mcp-tools/src/tools/agents/index.ts`

### Tools to Implement

#### 1.1 `getAgentContextTool`

**Purpose**: Retrieves the current agent context (role, skills, permissions)

**Current Stub**:

```typescript
export const getAgentContextTool = {
  async run(_params: unknown, _context: unknown): Promise<ToolResult> {
    return {
      success: false,
      error: 'Agent context tool not yet migrated',
    };
  },
};
```

**Original Source**: `src/tools/agents/get-agent-context.ts`

**Implementation Notes**:

- Import `getAgentRegistry` from `@orient/agents`
- Call `registry.getAgentContext(platform, chatId)`
- Return agent ID, skills, tool permissions

#### 1.2 `listAgentsTool`

**Purpose**: Lists all available agents in the registry

**Current Stub**:

```typescript
export const listAgentsTool = {
  async run(_params: unknown, _context: unknown): Promise<ToolResult> {
    return {
      success: false,
      error: 'List agents tool not yet migrated',
    };
  },
};
```

**Original Source**: `src/tools/agents/list-agents.ts`

**Implementation Notes**:

- Import `getAgentRegistry` from `@orient/agents`
- Call `registry.listAgents(includeDetails: boolean)`
- Return array of agent summaries

#### 1.3 `handoffToAgentTool`

**Purpose**: Delegates a task to a specialized agent

**Current Stub**:

```typescript
export const handoffToAgentTool = {
  async run(_params: unknown, _context: unknown): Promise<ToolResult> {
    return {
      success: false,
      error: 'Handoff to agent tool not yet migrated',
    };
  },
};
```

**Original Source**: `src/tools/agents/handoff-to-agent.ts`

**Implementation Notes**:

- Import agent handoff service from `@orient/agents`
- Create sub-session with target agent
- Execute task and return result
- Parameters: `{ agent: string, task: string, context?: string, waitForCompletion?: boolean }`

---

## 2. Context Tools (`@orient/mcp-tools`)

**Location**: `packages/mcp-tools/src/tools/context/index.ts`

### Tools to Implement

#### 2.1 `readContextTool`

**Purpose**: Reads agent context/memory for a chat

**Current Stub**:

```typescript
export const readContextTool = {
  async run(_params: unknown, _context: unknown): Promise<ToolResult> {
    return {
      success: false,
      error: 'Read context tool not yet migrated',
    };
  },
};
```

**Original Source**: `src/tools/context/read-context.ts`

**Implementation Notes**:

- Access context storage (database or memory)
- Parameters: `{ platform: string, chatId: string, keys?: string[] }`
- Return context values for the specified chat

#### 2.2 `updateContextTool`

**Purpose**: Updates agent context/memory for a chat

**Current Stub**:

```typescript
export const updateContextTool = {
  async run(_params: unknown, _context: unknown): Promise<ToolResult> {
    return {
      success: false,
      error: 'Update context tool not yet migrated',
    };
  },
};
```

**Original Source**: `src/tools/context/update-context.ts`

**Implementation Notes**:

- Update context storage (database or memory)
- Parameters: `{ platform: string, chatId: string, updates: Record<string, unknown> }`
- Validate and store context updates

---

## 3. Apps Service Stubs (`@orient/apps`)

**Location**: `packages/apps/src/services/appRuntimeService.ts`

### Stubbed Services

#### 3.1 `SchedulerService`

**Current Stub**:

```typescript
interface SchedulerService {
  scheduleJob(config: unknown): Promise<unknown>;
  cancelJob(jobId: string): Promise<void>;
}
```

**Implementation Notes**:

- Integrate with node-cron or similar scheduler
- Store scheduled jobs in database
- Support recurring and one-time jobs

#### 3.2 `WebhookService`

**Current Stub**:

```typescript
interface WebhookService {
  registerWebhook(config: unknown): Promise<unknown>;
  unregisterWebhook(webhookId: string): Promise<void>;
}
```

**Implementation Notes**:

- Handle incoming webhook requests
- Route to appropriate app handlers
- Support authentication/verification

---

## Migration Checklist

### Agent Tools

- [ ] Migrate `getAgentContextTool` from `src/tools/agents/get-agent-context.ts`
- [ ] Migrate `listAgentsTool` from `src/tools/agents/list-agents.ts`
- [ ] Migrate `handoffToAgentTool` from `src/tools/agents/handoff-to-agent.ts`
- [ ] Add tests for agent tools
- [ ] Update exports in `@orient/mcp-tools`

### Context Tools

- [ ] Migrate `readContextTool` from `src/tools/context/read-context.ts`
- [ ] Migrate `updateContextTool` from `src/tools/context/update-context.ts`
- [ ] Add tests for context tools
- [ ] Update exports in `@orient/mcp-tools`

### Apps Services

- [ ] Implement `SchedulerService` for Mini-Apps
- [ ] Implement `WebhookService` for Mini-Apps
- [ ] Remove stub type definitions
- [ ] Add tests for runtime services

---

## How to Migrate a Tool

1. **Find the original file** in `src/tools/` directory
2. **Copy the implementation** to the appropriate package
3. **Update imports** to use package aliases (`@orient/core`, etc.)
4. **Update the export** in `packages/mcp-tools/src/index.ts`
5. **Remove the stub** from the index file
6. **Add tests** for the migrated tool
7. **Build and verify** with `pnpm build --filter=@orient/mcp-tools`

---

## Related Documentation

- [POST-MERGE-TASKS.md](./POST-MERGE-TASKS.md) - Overall migration status
- [MCP-SERVERS-API-MISMATCHES.md](./MCP-SERVERS-API-MISMATCHES.md) - MCP server issues
