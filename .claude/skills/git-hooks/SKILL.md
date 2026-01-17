---
name: git-hooks
description: Manage pre-commit hooks and temp commits for multi-agent workflows. Use when asked to "make a temp commit", "skip hooks", "bypass pre-commit", "commit without checks", or when working with multiple agents on the same codebase. Covers commit bypass options, hook configuration, and code quality checks.
---

# Git Hooks Management

## Overview

This monorepo uses Husky for Git hooks with a smart pre-commit hook that:

1. **Lints staged files** via lint-staged (ESLint + Prettier)
2. **Type checks** the codebase via TypeScript
3. **Runs related tests** for changed files via Vitest

The hooks support bypass mechanisms for temp commits when multiple agents work on the same codebase.

## Quick Reference - Commit Commands

### Regular Commit (with all checks)

```bash
git add .
git commit -m "feat: add new feature"
```

### Temp Commit (bypass all checks)

```bash
# Option 1: Use npm script
npm run commit:temp -- -m "[temp] work in progress"

# Option 2: Use --no-verify flag
git commit --no-verify -m "[temp] work in progress"

# Option 3: Use environment variable
TEMP_COMMIT=1 git commit -m "[temp] work in progress"

# Option 4: Quick WIP commit
npm run commit:wip
```

### Partial Bypass

```bash
# Skip tests only (still run lint + typecheck)
SKIP_TESTS=1 git commit -m "chore: minor update"

# Skip all hooks
SKIP_HOOKS=1 git commit -m "[temp] quick save"
```

## Commit Message Prefixes

The pre-commit hook automatically bypasses checks for commits with these prefixes:

| Prefix        | Purpose                            | Example                             |
| ------------- | ---------------------------------- | ----------------------------------- |
| `[temp]`      | Temporary commit, will be squashed | `[temp] partial implementation`     |
| `[wip]`       | Work in progress                   | `[wip] experimenting with approach` |
| `[skip-ci]`   | Skip CI and hooks                  | `[skip-ci] docs update`             |
| `[no-verify]` | Explicit bypass                    | `[no-verify] emergency fix`         |

## Multi-Agent Workflow

When multiple agents work on the same codebase:

### Scenario 1: Agent A needs to save work while Agent B is testing

```bash
# Agent A: Make a temp commit without running tests
npm run commit:temp -- -m "[temp] save progress on feature X"

# Later: Agent B can squash temp commits
git rebase -i HEAD~3  # Interactive rebase to squash
```

### Scenario 2: Quick iteration on a shared branch

```bash
# Make quick saves without full validation
TEMP_COMMIT=1 git commit -m "[wip] iteration 1"
TEMP_COMMIT=1 git commit -m "[wip] iteration 2"

# When ready, run full validation manually
pnpm turbo run typecheck lint test

# Final commit with full checks
git commit -m "feat: complete feature"
```

### Scenario 3: Emergency fix while another agent works

```bash
# Skip hooks for urgent fix
git commit --no-verify -m "[temp] urgent hotfix"
git push

# Don't forget to clean up later!
```

## Pre-commit Hook Details

### What runs during normal commits:

```
Step 1/3: lint-staged
  ├── ESLint --fix on *.ts, *.tsx files
  └── Prettier --write on *.ts, *.tsx, *.json, *.md, *.yml files

Step 2/3: TypeScript typecheck
  └── tsc --noEmit (via turbo for packages)

Step 3/3: Related tests (optional)
  └── vitest run --changed HEAD --passWithNoTests
```

### lint-staged Configuration

From `package.json`:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml,yaml}": ["prettier --write"]
  }
}
```

## Manual Quality Checks

Run checks manually without committing:

```bash
# Lint all staged files
npx lint-staged

# TypeScript check
npm run typecheck

# Run all tests
npm test

# Run only changed tests
npx vitest run --changed

# Full CI validation
npm run test:ci
```

## Troubleshooting

### Hook not running

```bash
# Ensure husky is installed
npm run prepare

# Verify hook is executable
chmod +x .husky/pre-commit
```

### Lint-staged taking too long

```bash
# Check what files are staged
git diff --cached --name-only

# If too many files, consider partial commits
```

### TypeScript errors blocking commit

```bash
# Fix types first
npm run typecheck

# Or bypass if urgent
git commit --no-verify -m "[temp] fix types later"
```

### Tests failing on unrelated code

```bash
# Skip tests but keep lint/typecheck
SKIP_TESTS=1 git commit -m "feat: unrelated change"
```

## Available NPM Scripts

| Script                            | Description                 |
| --------------------------------- | --------------------------- |
| `npm run commit:temp -- -m "msg"` | Temp commit bypassing hooks |
| `npm run commit:wip`              | Quick WIP commit            |
| `npm run lint`                    | Run ESLint                  |
| `npm run lint:fix`                | Run ESLint with auto-fix    |
| `npm run format`                  | Run Prettier                |
| `npm run typecheck`               | Run TypeScript check        |
| `npm run test`                    | Run all tests               |
| `npm run test:ci`                 | Run CI-safe tests           |

## Best Practices

1. **Use temp commits sparingly** - They're for coordination, not avoiding quality checks
2. **Squash temp commits** before merging to main branch
3. **Run full checks** before creating pull requests
4. **Communicate** with other agents when making temp commits
5. **Clean up** - Don't leave `[temp]` or `[wip]` commits in the history

## Hook Configuration Location

- **Pre-commit hook**: `.husky/pre-commit`
- **lint-staged config**: `package.json` (lint-staged field)
- **Husky config**: `.husky/_/` directory
