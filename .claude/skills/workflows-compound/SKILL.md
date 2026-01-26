---
name: workflows-compound
description: Capture learnings after solving problems to build institutional knowledge. Use when asked to "document this solution", "capture what we learned", "add to solutions docs", or after phrases like "that worked", "problem solved", "finally fixed it". Uses parallel agents to extract problem/solution patterns and writes to docs/solutions/.
---

# Workflows: Compound

Knowledge capture workflow that transforms debugging sessions into reusable documentation.

## Philosophy

> "First occurrence: 30 minutes of research. Documentation: 5 minutes. Subsequent occurrences: 2 minutes to reference."

Every solved problem is an investment opportunity. Capturing the solution compounds returns across:

- Future debugging sessions
- Team onboarding
- AI agent context

## Quick Start

After solving a problem, capture it:

1. **Identify the problem/solution** from recent conversation
2. **Classify the category**
3. **Extract key information** via parallel agents
4. **Write to docs/solutions/{category}/**

## Trigger Phrases

This skill activates on:

- "That worked!"
- "Problem solved"
- "Finally fixed it"
- "Document this solution"
- "Capture what we learned"
- "Add to solutions docs"
- "Run /workflows:compound"

## Knowledge Extraction Process

### Step 1: Context Analysis

Review the recent conversation to identify:

- **Problem symptoms** - What was observed
- **Investigation path** - What was tried
- **Root cause** - Why it happened
- **Solution** - What fixed it

### Step 2: Parallel Agent Extraction

Launch specialized agents to extract and format:

```
Agent 1: Context Analyzer
- Summarize the problem context
- Identify when/where it occurs

Agent 2: Solution Extractor
- Extract the exact fix
- Note any configuration changes

Agent 3: Related Docs Finder
- Search for related documentation
- Link to relevant resources

Agent 4: Prevention Strategist
- Identify how to prevent recurrence
- Suggest guards or tests

Agent 5: Category Classifier
- Determine solution category
- Suggest keywords for discovery
```

### Step 3: Write Solution Document

Create file in `docs/solutions/{category}/`:

````yaml
---
title: Brief descriptive title
date: 2024-01-15
tags: [tag1, tag2, tag3]
---

## Problem

[1-2 sentence description of what went wrong]

## Symptoms

- Symptom 1 (what you observed)
- Symptom 2 (error messages)
- Symptom 3 (unexpected behavior)

## Root Cause

[Why this happened - the underlying issue]

## Solution

[Step-by-step fix]

```code
// Code example if applicable
````

## Prevention

[How to avoid this in the future]

## Related

- [Link to related doc 1]
- [Link to related doc 2]

```

## Solution Categories

Organize solutions by category:

```

docs/solutions/
├── typescript-errors/
│ ├── module-not-found.md
│ └── type-mismatch.md
├── database-patterns/
│ ├── connection-pool-exhaustion.md
│ └── migration-failures.md
├── performance-issues/
│ ├── memory-leaks.md
│ └── slow-queries.md
├── api-integration/
│ ├── auth-token-expiry.md
│ └── rate-limiting.md
├── testing-patterns/
│ ├── mock-setup-failures.md
│ └── async-timing-issues.md
├── deployment-fixes/
│ ├── docker-build-errors.md
│ └── env-var-missing.md
└── tooling/
├── pnpm-issues.md
└── turbo-cache-problems.md

````

## Category Selection Guide

| Problem Type | Category | Examples |
|--------------|----------|----------|
| Import/export errors | `typescript-errors/` | Module resolution, type exports |
| DB connection issues | `database-patterns/` | Pool exhaustion, timeouts |
| Slow operations | `performance-issues/` | Memory, query optimization |
| External API failures | `api-integration/` | Auth, rate limits, formats |
| Test failures | `testing-patterns/` | Mocks, async, coverage |
| CI/CD problems | `deployment-fixes/` | Docker, env vars, secrets |
| Dev tools | `tooling/` | pnpm, turbo, eslint |

## Naming Convention

Files: `{kebab-case-problem-description}.md`

Examples:
- `module-not-found-monorepo.md`
- `pg-pool-connection-timeout.md`
- `vitest-mock-not-resetting.md`

## Example: Full Capture Flow

**Scenario:** Fixed a TypeScript error where imports weren't resolving.

```markdown
---
title: ESM import resolution in monorepo packages
date: 2024-01-15
tags: [typescript, esm, monorepo, imports]
---

## Problem

Package imports failing with "Cannot find module" despite correct paths.

## Symptoms

- `Cannot find module '@orient/core'` in IDE
- Build succeeds but runtime fails
- Works after full rebuild, breaks again

## Root Cause

TypeScript project references not properly configured. The `references`
array in `tsconfig.json` was missing the dependent package.

## Solution

1. Add package to `references` in `tsconfig.json`:

```json
{
  "references": [
    { "path": "../core" }
  ]
}
````

2. Ensure dependent package has `composite: true`:

```json
{
  "compilerOptions": {
    "composite": true
  }
}
```

3. Rebuild: `pnpm turbo build --force`

## Prevention

- Always add `references` when importing internal packages
- Run `pnpm turbo build` after adding new package dependencies
- Use the `typescript-monorepo-builds` skill for guidance

## Related

- `.claude/skills/typescript-monorepo-builds/SKILL.md`
- `packages/core/tsconfig.json` (example of proper setup)

````

## Integration with Hooks

Consider adding a hook to prompt for knowledge capture:

```json
{
  "hooks": {
    "post-tool-call": {
      "patterns": ["that worked", "fixed", "solved"],
      "action": "suggest /workflows:compound"
    }
  }
}
````

## Best Practices

1. **Capture immediately** - Context fades quickly
2. **Be specific** - Include actual error messages
3. **Link related docs** - Build a knowledge graph
4. **Include prevention** - Help avoid future occurrences
5. **Use consistent tags** - Enable discovery

## Discovery

Find solutions using Grep:

```bash
# Find solutions by keyword
grep -r "connection" docs/solutions/

# Find solutions by tag
grep -l "tags:.*typescript" docs/solutions/
```

Or ask Claude: "Search solutions for [problem description]"
