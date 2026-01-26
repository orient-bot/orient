---
name: workflows-plan
description: Structured planning workflow before implementation (80/20 principle). Use when asked to "plan this feature", "create implementation plan", "design the approach", or before starting any non-trivial implementation. Launches parallel research, creates detailed plan files, and ensures alignment before code is written.
---

# Workflows: Plan

Structured planning workflow that inverts traditional development: 80% planning, 20% execution.

## Philosophy

> "Each unit of engineering work should make subsequent units easier—not harder."

Poor planning leads to:

- Wasted implementation effort
- Rework when requirements are misunderstood
- Technical debt from hasty decisions

Good planning ensures:

- Alignment before code is written
- Discovery of edge cases early
- Reusable patterns documented for future work

## Quick Start

When planning a feature or task:

1. **Determine scope level** (MINIMAL, MORE, A LOT)
2. **Launch parallel research** via Task agents
3. **Synthesize findings** into plan file
4. **Get user approval** before implementation

## Detail Levels

| Level       | Scope              | Research Depth              | When to Use                   |
| ----------- | ------------------ | --------------------------- | ----------------------------- |
| **MINIMAL** | Single file change | Quick pattern check         | Bug fixes, small tweaks       |
| **MORE**    | Multi-file feature | Architecture review         | New features, refactors       |
| **A LOT**   | System-wide change | Deep research, all patterns | Breaking changes, new systems |

## Planning Workflow

### Step 1: Understand the Request

Before launching research, clarify:

- **What** is being requested?
- **Why** is it needed?
- **Who** will use it?
- **What constraints** exist?

If unclear, ask the user for clarification.

### Step 2: Launch Parallel Research (MORE/A LOT)

Use the Task tool to spawn parallel exploration agents:

```
Agent 1: Codebase Pattern Analysis
- Search for similar implementations
- Identify reusable patterns
- Note conventions used

Agent 2: Architecture Review
- Map affected components
- Identify integration points
- Check for constraints

Agent 3: Dependency Analysis
- Review related packages
- Check for breaking changes
- Identify test coverage

Agent 4: Documentation Review
- Check existing docs
- Find relevant decisions
- Note any TODOs or FIXMEs
```

### Step 3: Synthesize Findings

Combine research into a structured plan:

```markdown
# Plan: [Feature Name]

## Summary

[1-2 sentence description]

## Requirements

- [ ] Requirement 1
- [ ] Requirement 2

## Architecture

[How it fits into existing system]

## Implementation Steps

1. Step 1 - [description]
2. Step 2 - [description]

## Files to Modify

- `path/to/file1.ts` - [change description]
- `path/to/file2.ts` - [change description]

## New Files

- `path/to/new/file.ts` - [purpose]

## Testing Strategy

- Unit tests: [what to test]
- Integration tests: [what to test]

## Risks & Mitigations

- Risk 1: [mitigation]

## Open Questions

- Question 1?
```

### Step 4: Create Plan File

Write the plan to the `plans/` directory:

```
plans/
├── 2024-01-15-add-oauth-support.md
├── 2024-01-16-refactor-database.md
└── 2024-01-17-feature-xyz.md
```

Naming: `YYYY-MM-DD-{kebab-case-description}.md`

### Step 5: User Approval

Present the plan and get explicit approval:

1. Share plan summary
2. Highlight key decisions
3. Note any open questions
4. Wait for user confirmation

**Never start implementation without approval.**

## Plan Templates

### Feature Addition

```markdown
# Plan: Add [Feature Name]

## Summary

Add [feature] to enable [capability] for [users].

## Requirements

- [ ] Functional requirement 1
- [ ] Non-functional requirement (performance, security)

## Architecture

[Component diagram or description]

## API Design (if applicable)

[Endpoints, request/response formats]

## Implementation Steps

1. Create data models
2. Implement core logic
3. Add API endpoints
4. Build UI components
5. Add tests
6. Update documentation

## Files to Modify

[List with change descriptions]

## Testing Strategy

[What to test and how]
```

### Bug Fix

```markdown
# Plan: Fix [Bug Description]

## Problem

[What's broken and impact]

## Root Cause

[Why it's happening]

## Solution

[How to fix it]

## Implementation Steps

1. [Step 1]
2. [Step 2]

## Testing

- Regression test: [what]
- Edge cases: [what]

## Prevention

[How to prevent similar issues]
```

### Refactoring

```markdown
# Plan: Refactor [Component]

## Current State

[What exists now]

## Target State

[What it should become]

## Motivation

[Why refactor now]

## Migration Strategy

[How to transition safely]

## Implementation Steps

1. Create new structure
2. Migrate incrementally
3. Update consumers
4. Remove old code

## Breaking Changes

[List any]

## Rollback Plan

[How to revert if needed]
```

## Integration with Worktrees

For significant changes, create a planning worktree:

```bash
.claude/skills/worktree-manager/scripts/worktree.sh create plan-feature-xyz
```

This provides:

- Isolated environment for exploration
- No risk to main branch
- Easy cleanup after planning

## Best Practices

1. **Plan files are artifacts** - They become documentation
2. **Include rationale** - Explain why, not just what
3. **Note alternatives** - Document rejected approaches
4. **Keep plans updated** - Revise as understanding grows
5. **Reference plans in PRs** - Link to planning docs

## Triggering This Skill

This skill activates when you say things like:

- "Plan this feature"
- "Create an implementation plan"
- "Design the approach for..."
- "Before we start, let's plan..."
- "Run /workflows:plan"
