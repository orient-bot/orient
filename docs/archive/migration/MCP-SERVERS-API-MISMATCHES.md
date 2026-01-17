# MCP-Servers API Mismatch Issues

> **Status**: Pending - Requires separate PR  
> **Package**: `@orient/mcp-servers`  
> **Last Updated**: January 2026

## Overview

During the src/ to packages/ migration, the `@orient/mcp-servers` package failed to build due to API mismatches between the legacy code in `mcp-server.ts` (~6800 lines) and the updated package interfaces.

The file `mcp-server.ts` is the monolithic MCP server that needs to be updated to use the new package APIs.

---

## Error Categories

### 1. Missing Module Exports

**Location**: Lines 52-53, 86-88

```typescript
// These exports don't exist in @orient/integrations/google
import { getSheetsOAuthService, getSlidesOAuthService } from '@orient/integrations/google';

// @orient/apps module resolution issues
import { ... } from '@orient/apps';
```

**Root Cause**: The OAuth services were renamed or restructured during migration.

**Proposed Fix**:

- Check `@orient/integrations/google` for actual export names
- The exports should be `getGoogleOAuthService` (singular) instead of separate sheets/slides services
- Update imports to use the actual exported function names

---

### 2. StoredMessage Type Mismatch

**Location**: Lines 3922, 3982, 4043, 4115, 4332

```typescript
// Code expects:
(m: { id: string; ... }) => { ... }

// But StoredMessage has:
{ id: number; ... }  // id is number, not string
```

**Root Cause**: The database schema uses numeric IDs but the MCP server code expects string IDs.

**Proposed Fix**:
Option A - Convert at call site:

```typescript
messages.map((m) => ({
  ...m,
  id: String(m.id), // Convert to string
}));
```

Option B - Update StoredMessage type to use string (requires database migration)

**Recommendation**: Option A - Convert at call site to avoid schema changes.

---

### 3. CreateEventOptions Missing Properties

**Location**: Line 5485

```typescript
// Code uses:
{ addMeetLink: true, ... }

// But CreateEventOptions doesn't have 'addMeetLink'
```

**Root Cause**: The Google Calendar API wrapper was updated and `addMeetLink` was removed or renamed.

**Proposed Fix**:

- Check `@orient/integrations/google` for the current `CreateEventOptions` interface
- Either add the property back to the interface, or remove it from the call site
- If Meet links are needed, implement via `conferenceData` in the Google Calendar API

---

### 4. Function Argument Count Mismatches

**Location**: Lines 5565, 5618, 5852

```typescript
// Code calls with 4 arguments:
someFunction(arg1, arg2, arg3, arg4);

// But function signature only accepts 1-2 or 1-3 arguments
```

**Root Cause**: Service function signatures changed during migration.

**Proposed Fix**:

- Identify which functions are being called at these lines
- Update calls to match new signatures
- If additional context is needed, refactor to pass context object

---

### 5. TaskInfo Missing Properties

**Location**: Lines 5737, 5757, 5870

```typescript
// Code expects:
task.dueDate;
CreateTaskOptions.dueDate;

// But these properties don't exist on the types
```

**Root Cause**: Task-related types were simplified during migration.

**Proposed Fix**:

- Add `dueDate?: string` to `TaskInfo` and `CreateTaskOptions` in `@orient/integrations/google`
- Or remove dueDate usage from MCP server if not needed

---

### 6. RequestHandler Callback Signature

**Location**: Line 2274

```typescript
// Code provides callback without 'extra' parameter:
(request) => Promise<...>

// But SDK expects:
(request, extra: RequestHandlerExtra) => Promise<...>
```

**Root Cause**: @modelcontextprotocol/sdk updated its callback signature.

**Proposed Fix**:

```typescript
// Update callback to include extra parameter
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  // ...existing code
});
```

---

### 7. Implicit Any Types

**Location**: Lines 6235, 6244

```typescript
// Parameter 'app' implicitly has an 'any' type
apps.map(app => { ... })
```

**Proposed Fix**:

```typescript
// Add explicit type annotation
apps.map((app: AppSummary) => { ... })
```

---

### 8. Sheets Row Type Mismatch

**Location**: Line 3216

```typescript
// Code expects:
(row: Array<string | null | undefined>) => { ... }

// But data is:
unknown[][]
```

**Proposed Fix**:

- Add type assertion or type guard:

```typescript
rows.map((row: unknown[]) => ({
  ideaName: String(row[0] ?? ''),
  // ...
}));
```

---

## Recommended Approach

### Phase 1: Quick Fixes (1-2 hours)

1. Fix import statements for OAuth services
2. Add missing type annotations for implicit any
3. Convert StoredMessage.id to string at call sites
4. Add extra parameter to RequestHandler callbacks

### Phase 2: Interface Updates (2-3 hours)

1. Update CreateEventOptions to include addMeetLink or conferenceData
2. Update TaskInfo and CreateTaskOptions with dueDate
3. Fix function argument counts

### Phase 3: Refactoring (4+ hours)

1. Consider breaking mcp-server.ts into smaller modules
2. Create proper type definitions for MCP tool responses
3. Add comprehensive tests for the MCP server

---

## Testing Strategy

After fixes:

1. Run `pnpm build --filter=@orient/mcp-servers`
2. Start the MCP server and verify tool registration
3. Test each tool category:
   - JIRA tools
   - Calendar tools
   - Slack tools
   - WhatsApp tools
   - Apps tools
   - Agent tools

---

## Related Files

- `packages/mcp-servers/src/mcp-server.ts` - Main file with issues
- `packages/integrations/src/google/` - OAuth and calendar services
- `packages/database/src/types.ts` - StoredMessage type
- `packages/apps/src/` - Apps service exports
