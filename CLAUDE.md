# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

Orient is an open-source AI agent that runs on your infrastructure. It's a **pnpm monorepo** with 16+ packages supporting WhatsApp, Slack, OpenCode/IDE, and CLI platforms.

## Essential Commands

### Quick Start

```bash
./run.sh doctor --fix     # Check prerequisites, auto-fix
pnpm install              # Install dependencies
pnpm build:packages       # Build workspace packages
./run.sh dev              # Start development environment
```

### Development

```bash
./run.sh dev              # Start all services (Docker + apps)
./run.sh dev stop         # Stop development services
./run.sh dev status       # Show service status
```

### Testing

```bash
pnpm test                 # Run all tests
pnpm --filter @orient-bot/core test  # Package-specific
pnpm test:e2e             # E2E tests (requires running infra)
```

### Building

```bash
pnpm build:packages       # Build all workspace packages
pnpm turbo run typecheck  # TypeScript type checking
pnpm lint                 # Run linting
```

## Development Workflow

### For Non-Trivial Features: Discovery-First

Use `/discover` before creating worktrees when:

- Adding new features or functionality
- Refactoring code touching 3+ files
- Requirements are unclear

```
Phase 1: Understand     → Explore codebase, ask questions (one at a time)
Phase 2: Design         → Propose approaches, validate in sections
Phase 3: Plan           → Write to docs/plans/YYYY-MM-DD-feature.md
```

The `/discover` skill outputs an implementation plan that can be used with worktrees.

### Worktree Operations

For isolated development, use worktrees via `/claude-worktree-manager`:

```bash
# Create worktree with plan (after /discover)
Skill(skill: 'claude-worktree-manager', args: 'create feature-name --plan docs/plans/2026-02-01-feature.md')

# Create worktree with goal (simple tasks)
Skill(skill: 'claude-worktree-manager', args: 'create bug-fix --goal "Fix the login redirect"')

# List worktrees
Skill(skill: 'claude-worktree-manager', args: 'list')

# Cleanup old worktrees
Skill(skill: 'claude-worktree-manager', args: 'cleanup --days 7')
```

**Multi-instance support**: Worktrees get unique instance IDs (ports offset by instance_id × 1000).

**Slack bot warning**: Only ONE Slack bot instance can run at a time. Use `./run.sh dev --no-slack` in secondary worktrees.

### Plan Execution

When working with `--plan` in a worktree, follow `/plan-executor` principles:

- **Evidence before claims**: Never claim completion without verification output
- **Two-stage review**: Spec compliance first, then code quality
- **Batch checkpoints**: Execute 3 tasks, report, continue

## Architecture

```
orient/
├── packages/              # 16+ workspace packages
│   ├── core/              # Config, logging, utilities
│   ├── database/          # Drizzle ORM schemas
│   ├── agents/            # Agent registry, skills
│   ├── mcp-tools/         # MCP tool implementations
│   ├── dashboard/         # Dashboard server + React frontend
│   ├── bot-whatsapp/      # WhatsApp bot
│   ├── bot-slack/         # Slack bot
│   └── ...
├── .claude/skills/        # 54+ Claude skills
├── docker/                # Docker Compose files
└── src/                   # DEPRECATED - do not add new code here
```

## React & Frontend Guidelines

Use `/frontend-design` skill for any UI work. Core principles:

- **Tech stack**: React + Vite + Tailwind CSS v3.4+
- **Black & white dominant**: Color only for semantic status
- **Semantic tokens only**: Use `bg-background`, `text-foreground`, never `bg-white`
- **Monospace for data**: IDs, dates, timestamps, code always in `font-mono`
- **Border-based hierarchy**: Avoid heavy shadows

### Component Quick Reference

| Element       | Classes                                             |
| ------------- | --------------------------------------------------- |
| Page bg       | `bg-background`                                     |
| Card          | `rounded-xl border border-border bg-card shadow-sm` |
| Button height | `h-9`                                               |
| Muted text    | `text-muted-foreground`                             |
| Data values   | `font-mono text-sm`                                 |

### Performance Rules (from `/vercel-react-best-practices`)

**Critical:**

- `async-parallel`: Use Promise.all() for independent operations
- `bundle-barrel-imports`: Import directly, avoid barrel files
- `bundle-dynamic-imports`: Use next/dynamic for heavy components

**High:**

- `server-cache-react`: Use React.cache() for per-request deduplication
- `rerender-memo`: Extract expensive work into memoized components

## Skills System

Skills provide task-specific guidance. Location: `.claude/skills/<name>/SKILL.md`

| Skill                     | Use When                           |
| ------------------------- | ---------------------------------- |
| `discover`                | Planning non-trivial features      |
| `claude-worktree-manager` | Creating isolated dev environments |
| `plan-executor`           | Executing implementation plans     |
| `frontend-design`         | Any UI/component work              |
| `testing-strategy`        | Running or writing tests           |
| `git-workflow`            | Creating commits and PRs           |
| `database-migrations`     | Schema changes                     |
| `project-architecture`    | Understanding codebase             |

Invoke via Skill tool or `/skill-name` command.

## Custom Agents

Specialized agents for focused tasks. Location: `.claude/agents/<name>.md`

| Agent           | Model     | Purpose                                           |
| --------------- | --------- | ------------------------------------------------- |
| `code-reviewer` | inherit   | PR reviews, pattern enforcement (read-only tools) |
| `test-writer`   | inherit   | Write and run tests with Vitest                   |
| `migration`     | **opus**  | Database schema changes (extra safety)            |
| `integration`   | inherit   | Add OAuth integrations                            |
| `docs`          | **haiku** | Documentation and skills (lightweight)            |

Invoke via `/agent <name>` command.

**When to use agents vs skills vs worktrees:**

- **Agents**: Focused, single-purpose tasks matching an agent's specialty
- **Skills**: Guidance and context for specific workflows
- **Worktrees**: Larger features spanning multiple concerns

## Key Conventions

- **Package imports**: Use `@orient-bot/package-name` for workspace packages
- **New code**: Always in `packages/`, never in `src/` (deprecated)
- **Tests**: `__tests__/*.test.ts` for unit, `*.integration.test.ts`, `*.e2e.test.ts`
- **Database**: PostgreSQL with Drizzle ORM
- **Build**: Turborepo handles order via `pnpm build:packages`

## Access Points (Development)

| Service       | URL                     |
| ------------- | ----------------------- |
| Dashboard     | http://localhost:80     |
| WhatsApp QR   | http://localhost:80/qr/ |
| Dashboard API | http://localhost:4098   |
| OpenCode      | http://localhost:4099   |

## Documentation References

| Topic                | Location                                              |
| -------------------- | ----------------------------------------------------- |
| LLM Onboarding       | `.claude/README.LLM.md`                               |
| Agent System         | `AGENTS.md`                                           |
| Worktree Details     | `.claude/skills/worktree-operations/SKILL.md`         |
| React Best Practices | `.claude/skills/vercel-react-best-practices/SKILL.md` |
| Contributing         | `CONTRIBUTING.md`                                     |
