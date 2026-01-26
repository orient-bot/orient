# Eval Infrastructure - Next Steps

## Current State (2026-01-26)

### What's Working

- Eval infrastructure runs: 53 tests discovered and executed
- 15 tests passing, 38 failing
- Database seeded with 5 agents: ori, communicator, scheduler, explorer, app-builder
- OpenCode configured with all required agents
- Vitest test discovery working with resolve aliases

### Changes Made This Session

1. **Eval Package Fixes**
   - `packages/eval/src/types.ts` - Added `enabled` field to EvalCase
   - `packages/eval/src/runner/index.ts` - Added public `start()` and `stop()` methods
   - `packages/eval/src/vitest-adapter.ts` - Fixed model defaults, server lifecycle
   - `packages/eval/vitest.config.ts` - NEW: Resolve aliases for .js -> .ts
   - `packages/eval/src/runner/loader-sync.ts` - NEW: Synchronous loader for Vitest

2. **Seed Script Fixes**
   - `data/seeds/test-permissions.ts` - Fixed imports to use @orientbot/database
   - `data/seeds/sample-prompts.ts` - Fixed imports to use @orientbot/database

3. **Eval File Fixes**
   - `evals/tool-selection/whatsapp-group-messages.yaml` - Fixed tool names (ai*first_whatsapp*_ -> whatsapp\__)

4. **OpenCode Config** (in ~/.orient/orient/opencode.json)
   - Added agents: ori, communicator, scheduler, explorer

---

## Next Steps to Complete

### 1. Skill Support in OpenCode

**Priority: HIGH**

The eval tests expect agents to activate skills, but OpenCode needs skill definitions.

Skills expected by evals:

- `personal-jira-project-management`
- `project-architecture`
- `mini-apps`
- `personal-message-scheduling`
- `tool-discovery`

**Action Items:**

- [ ] Check if OpenCode supports skill loading
- [ ] Define skills in OpenCode config or external files
- [ ] Map skill names to actual functionality

### 2. Agent Prompt Refinement

**Priority: HIGH**

Current agent prompts don't match eval expectations:

| Issue                                  | Failing Tests                          |
| -------------------------------------- | -------------------------------------- |
| Agents call tools for simple greetings | PM Assistant, Onboarder greeting tests |
| Missing action links in responses      | Onboarder response quality tests       |
| Incorrect Slack formatting             | Communicator standup test              |
| Not selecting expected tools           | Multiple tool_selection tests          |

**Action Items:**

- [ ] Update ori agent prompt to NOT call tools for greetings
- [ ] Update onboarder prompt to include action links
- [ ] Update communicator prompt for Slack mrkdwn formatting
- [ ] Review each failing test and adjust prompts accordingly

### 3. MCP Tool Naming Consistency

**Priority: MEDIUM**

Some tools use inconsistent naming:

- MCP server: `whatsapp_list_groups`
- Evals expected: `ai_first_whatsapp_list_groups`

**Action Items:**

- [ ] Audit all MCP tools for naming consistency
- [ ] Either rename tools in MCP server OR update all eval files
- [ ] Document tool naming convention

### 4. Multi-Step Workflow Support

**Priority: MEDIUM**

9 multi-step workflow tests fail. These require:

- Tool call sequencing (e.g., get blockers → send notification)
- State management across tool calls
- Proper error handling

**Action Items:**

- [ ] Analyze each failing multi-step test
- [ ] Check if MCP server provides all required tools
- [ ] Verify agent context includes necessary information

### 5. Anthropic Provider Setup (Optional)

**Priority: LOW**

Anthropic provider not configured in OpenCode (returns empty responses).
Currently using OpenAI as fallback.

**Action Items:**

- [ ] Add ANTHROPIC_API_KEY to OpenCode environment
- [ ] Test Anthropic provider with evals
- [ ] Consider which tests should use which model

---

## Test Categories Breakdown

| Category            | Passing | Failing | Notes                                 |
| ------------------- | ------- | ------- | ------------------------------------- |
| tool_selection      | ~8      | ~15     | Need prompt tuning for tool selection |
| skill_invocation    | 0       | 3       | Skills not configured in OpenCode     |
| response_quality    | ~4      | ~12     | Need prompt refinement                |
| multi_step_workflow | ~3      | ~9      | Complex workflows need investigation  |

---

## How to Run Evals

```bash
# Ensure OpenCode is running at localhost:4099
# Ensure database is seeded
DATABASE_TYPE=sqlite SQLITE_DATABASE="./data/orient.db" npx tsx data/seeds/agents.ts --force

# Run all evals
ANTHROPIC_API_KEY=test pnpm --filter @orientbot/eval test

# Run specific test category
ANTHROPIC_API_KEY=test npx vitest run --grep "tool_selection"
```

---

## Key Files

| File                                       | Purpose                               |
| ------------------------------------------ | ------------------------------------- |
| `packages/eval/src/vitest-adapter.ts`      | Creates test suites from YAML evals   |
| `packages/eval/vitest.config.ts`           | Vitest config with resolve aliases    |
| `packages/eval/src/http-wrapper/routes.ts` | Eval server routes (invokes OpenCode) |
| `data/seeds/agents.ts`                     | Agent seed data                       |
| `~/.orient/orient/opencode.json`           | OpenCode agent config                 |
| `evals/**/*.yaml`                          | Eval test definitions                 |

---

## Notes

- The eval system IS working correctly - it's revealing gaps in agent behavior
- Most failures are about agent prompts not matching expected behavior
- OpenCode skill support is the main missing feature for skill_invocation tests
