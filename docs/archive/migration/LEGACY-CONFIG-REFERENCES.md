# Legacy Config References Analysis

> **Status**: Analysis Complete - Migration Plan Defined  
> **Last Updated**: January 2026

## Overview

This document analyzes remaining references to the legacy config system (`getLegacyConfig`) and provides a migration plan for each.

---

## Current Config System Architecture

### New Config System (Recommended)

```typescript
import { getConfig, loadConfig } from '@orient/core';

// In main initialization
await loadConfig();
const config = getConfig();

// Access nested config
const slackConfig = config.integrations.slack;
const jiraConfig = config.integrations.jira;
```

**Benefits:**

- Type-safe access via Zod schemas
- Environment variable substitution
- Validation at startup
- Supports new dual-mode configs (Slack bot/user, WhatsApp personal/bot)

### Legacy Config System (Deprecated)

```typescript
import { getLegacyConfig } from '@orient/core';

const config = getLegacyConfig();
// Returns flat BotConfig structure
```

**Maintained for:**

- Backward compatibility during migration
- Services that haven't been updated yet

---

## Legacy References Analysis

### 1. Slack Service (packages/bot-slack/src/services/slackService.ts)

**Status**: ⚠️ Migration Required

**Current Implementation:**

```typescript
// Lines 7-19
import { getLegacyConfig } from '@orient/core';

let cachedConfig: ReturnType<typeof getLegacyConfig> | null = null;
const getConfig = (): ReturnType<typeof getLegacyConfig> => {
  if (!cachedConfig) {
    cachedConfig = getLegacyConfig();
  }
  return cachedConfig;
};

export function initializeSlackApp(): App {
  const config = getConfig();
  app = new App({
    token: config.slack.botToken,
    signingSecret: config.slack.signingSecret,
    appToken: config.slack.appToken,
    socketMode: true,
  });
  // ...
}
```

**Issue:**

- `slackService.ts` loads config internally rather than receiving it as a parameter
- Creates tight coupling and makes testing difficult
- Uses legacy flat config structure instead of new nested structure
- Doesn't support new Slack dual-mode (bot/user)

**Usage Analysis:**

- `initializeSlackApp()` and `getSlackApp()` are exported but **NOT USED** anywhere
- `main.ts` uses `SlackBotService` instead, which properly receives config as constructor param
- The utility functions (postMessage, buildStandupPromptBlocks, etc.) don't need config
- This appears to be **dead code** or legacy standalone utilities

**Migration Plan:**

**Option A - Remove Dead Code (Recommended):**

1. Remove `initializeSlackApp()` and `getSlackApp()` functions
2. Remove the config loading logic (lines 7-19)
3. Keep only the utility functions (block builders, message posting)
4. Update utility functions to accept `app: App` parameter instead of using module-level `app`

**Option B - Refactor to Accept Config:**

1. Change `initializeSlackApp()` to accept config as parameter
2. Update to use new config structure
3. Add JSDoc noting this is for standalone use only

**Recommendation:** Option A - Remove dead code since `SlackBotService` is the modern replacement.

---

### 2. WhatsApp Types (packages/bot-whatsapp/src/types.ts)

**Status**: ✅ Intentional - Backward Compatibility

**Current Implementation:**

```typescript
// Lines 10-26
// Re-export core types from @orient/core
// Note: We use WhatsAppLegacyConfig as WhatsAppConfig for backward compatibility
// The new nested WhatsAppConfig (with personal/bot modes) is in the schema
export type {
  WhatsAppLegacyConfig as WhatsAppConfig,
  WhatsAppMessage,
  // ...
} from '@orient/core';
```

**Reasoning:**

- Provides backward compatibility during migration
- External code can still use `WhatsAppConfig` type alias
- Internal code can migrate to new dual-mode config at its own pace
- Schema includes both `WhatsAppLegacyConfig` and `WhatsAppConfig`
- `normalizeWhatsAppConfig()` function handles conversion automatically

**Action Required:**
✅ **Document as intentional** - This is a proper migration pattern

**Recommendation:**

- Add migration timeline comment
- Create tracking issue for full migration (e.g., Q2 2026)

---

### 3. Tool Executor (packages/mcp-servers/src/tool-executor.ts)

**Status**: ✅ Intentional - Gradual Migration Pattern

**Current Implementation:**

```typescript
// Lines 21-33
// Lazy-loaded tool handlers from the main mcp-server
// This allows gradual migration while keeping the switch statement intact
let legacyExecutor: ((name: string, args: Record<string, unknown>) => Promise<unknown>) | null =
  null;

export function setLegacyExecutor(
  executor: (name: string, args: Record<string, unknown>) => Promise<unknown>
): void {
  legacyExecutor = executor;
}

// Later used as fallback in executeToolCallFromRegistry
if (legacyExecutor) {
  try {
    const result = await legacyExecutor(name, args);
    return result as { content: Array<{ type: string; text: string }>; isError?: boolean };
  } catch (error) {
    logger.error('Legacy executor failed', { name, error });
    throw error;
  }
}
```

**Reasoning:**

- Allows gradual migration from monolithic switch statement to modular handlers
- New tools register via `ToolExecutorRegistry`
- Old tools fall back to legacy executor
- No disruption during migration
- Clear path to remove once all tools migrated

**Action Required:**
✅ **Document as intentional** - This is a proper migration pattern

**Migration Progress Tracking:**
Create tracking document for:

- List of tools still using legacy executor
- Tools migrated to registry
- Target date to remove fallback

---

## Migration Priority

### High Priority

- ✅ **Slack Service** - Remove dead code (1-2 hours)

### Medium Priority

- 📋 **Tool Executor** - Create migration tracking doc (30 min)
- 📋 **WhatsApp Types** - Add migration timeline comments (15 min)

### Low Priority

- 📋 Update all docs to reference new config system
- 📋 Add linter rule to flag new uses of `getLegacyConfig`

---

## Migration Checklist

### Phase 1: Immediate (This PR)

- [ ] Remove `initializeSlackApp()` and `getSlackApp()` from slackService.ts
- [ ] Update slackService.ts utility functions to accept `app` parameter
- [ ] Add JSDoc comments to WhatsAppLegacyConfig explaining backward compatibility
- [ ] Add comments to tool-executor.ts explaining gradual migration pattern
- [ ] Create this analysis document

### Phase 2: Short Term (Next Sprint)

- [ ] Create tool migration tracking document
- [ ] Add deprecation warnings to `getLegacyConfig` (not removal - just warnings)
- [ ] Update documentation to show new config patterns

### Phase 3: Long Term (Q2 2026)

- [ ] Complete tool executor migration
- [ ] Remove WhatsAppLegacyConfig alias
- [ ] Remove getLegacyConfig function
- [ ] Update all examples and docs

---

## Testing Strategy

After Phase 1 changes:

1. **Build**: `pnpm build --filter=@orient/bot-slack`
2. **Unit Tests**: Verify utility functions work with passed app parameter
3. **Integration**: Start Slack bot and verify all messaging works
4. **Regression**: Test standup, digest, SLA blocks render correctly

---

## Related Documentation

- `docs/configuration.md` - General config system docs
- `packages/core/src/config/README.md` - Config package docs
- `docs/migration/MCP-SERVERS-API-MISMATCHES.md` - Related migration issues
- `.cursor/rules/src-deprecated.mdc` - src/ deprecation tracking

---

## Conclusion

Only **1 out of 3** legacy references requires migration:

- ✅ Slack Service: Dead code removal
- ✅ WhatsApp Types: Intentional backward compatibility
- ✅ Tool Executor: Intentional gradual migration pattern

The other two are proper migration patterns and should be documented as intentional, not changed.
