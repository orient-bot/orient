---
name: workflows-review
description: Multi-agent code review orchestration. Use when asked to "review this code", "review my changes", "review the PR", "check for issues", or before merging significant changes. Launches specialized reviewer agents in parallel, synthesizes findings with severity classification, and creates actionable todos.
---

# Workflows: Review

Multi-agent code review system that deploys specialized reviewers in parallel.

## Philosophy

No single reviewer catches everything. Specialized agents with focused expertise identify issues that generalists miss. Parallel execution makes comprehensive review practical.

## Quick Start

1. **Detect review target** (PR, branch, or working changes)
2. **Identify languages/patterns** in changed files
3. **Launch relevant reviewers** in parallel
4. **Synthesize findings** with severity levels
5. **Create todos** for remediation

## Review Targets

### Working Changes

```bash
git diff  # Unstaged changes
git diff --staged  # Staged changes
```

### Branch Changes

```bash
git diff main...HEAD  # Changes from main
git log main..HEAD --oneline  # Commits on branch
```

### Pull Request

```bash
gh pr diff {number}  # PR diff
gh pr view {number}  # PR metadata
```

## Specialized Reviewers

Launch reviewers based on changed file types:

| Reviewer                  | Trigger Files         | Focus Areas                        |
| ------------------------- | --------------------- | ---------------------------------- |
| **TypeScript Reviewer**   | `*.ts`, `*.tsx`       | Types, patterns, monorepo imports  |
| **Security Reviewer**     | All code files        | Auth, injection, secrets, OWASP    |
| **Performance Reviewer**  | `*.ts`, `*.sql`       | N+1 queries, memory, bundle size   |
| **Architecture Reviewer** | Cross-package changes | Boundaries, dependencies, coupling |
| **Database Reviewer**     | `*.sql`, migrations   | Schema, indexes, data integrity    |
| **API Reviewer**          | Route files, handlers | REST patterns, error handling      |
| **Test Reviewer**         | `*.test.ts`           | Coverage, mock usage, assertions   |

## Review Execution

### Step 1: Analyze Changes

```bash
# Get changed files
git diff --name-only main...HEAD

# Categorize by type
*.ts/*.tsx → TypeScript Reviewer
*.sql → Database Reviewer
**/routes/* → API Reviewer
*.test.ts → Test Reviewer
```

### Step 2: Launch Parallel Reviewers

Use Task tool to spawn reviewers:

```
Task: TypeScript Review
Prompt: Review the following TypeScript changes for:
- Type safety issues
- Missing error handling
- Monorepo import violations
- Code patterns inconsistent with codebase
[Include relevant diffs]

Task: Security Review
Prompt: Review for security vulnerabilities:
- Input validation
- SQL injection
- XSS vulnerabilities
- Secrets in code
- Auth/authz issues
[Include relevant diffs]

Task: Performance Review
Prompt: Review for performance issues:
- N+1 queries
- Missing indexes
- Memory leaks
- Unnecessary re-renders
- Bundle size impact
[Include relevant diffs]
```

### Step 3: Synthesize Findings

Collect results and classify by severity:

| Severity | Label     | Description                   | Action       |
| -------- | --------- | ----------------------------- | ------------ |
| **P1**   | Critical  | Security vuln, data loss risk | Block merge  |
| **P2**   | Important | Bugs, performance issues      | Should fix   |
| **P3**   | Minor     | Style, suggestions            | Nice to have |

## Review Report Format

```markdown
# Code Review: [Branch/PR Name]

## Summary

- Files changed: X
- Reviewers: [list]
- Findings: X P1, Y P2, Z P3

## Critical (P1) - Must Fix

### [Finding Title]

**File:** `path/to/file.ts:42`
**Issue:** [Description]
**Recommendation:** [How to fix]

## Important (P2) - Should Fix

### [Finding Title]

**File:** `path/to/file.ts:100`
**Issue:** [Description]
**Recommendation:** [How to fix]

## Minor (P3) - Consider

### [Finding Title]

**File:** `path/to/file.ts:200`
**Issue:** [Description]
**Recommendation:** [How to fix]

## Positive Notes

- [Good pattern observed]
- [Well-tested code]
```

## Reviewer Prompts

### TypeScript Reviewer

```
You are a TypeScript code reviewer for an Orient monorepo. Review for:

1. **Type Safety**
   - Proper type annotations
   - No `any` without justification
   - Correct generic usage

2. **Error Handling**
   - Try/catch for async operations
   - Proper error propagation
   - User-facing error messages

3. **Monorepo Patterns**
   - Imports from package dist/ not src/
   - No circular dependencies
   - Package boundaries respected

4. **Code Quality**
   - Functions under 50 lines
   - Clear naming
   - No dead code

Report findings with severity (P1/P2/P3), file:line, and fix recommendation.
```

### Security Reviewer

```
You are a security-focused code reviewer. Check for OWASP Top 10 and:

1. **Injection**
   - SQL injection
   - Command injection
   - XSS vulnerabilities

2. **Authentication/Authorization**
   - Auth bypass risks
   - Permission checks
   - Session handling

3. **Data Exposure**
   - Secrets in code
   - PII logging
   - Sensitive data in URLs

4. **Input Validation**
   - User input sanitization
   - File upload validation
   - API parameter validation

Flag any security issues as P1. Include CVE references where applicable.
```

### Performance Reviewer

```
You are a performance-focused code reviewer. Check for:

1. **Database**
   - N+1 query patterns
   - Missing indexes
   - Unbounded queries

2. **Memory**
   - Memory leaks
   - Large object retention
   - Unbounded caches

3. **Frontend**
   - Unnecessary re-renders
   - Missing memoization
   - Large bundle imports

4. **API**
   - Missing pagination
   - Over-fetching
   - Slow endpoints

Include impact estimates and optimization suggestions.
```

## Creating Remediation Todos

After review, create a todo list:

```
TodoWrite:
- [ ] P1: Fix SQL injection in userService.ts:42
- [ ] P1: Add auth check to deleteUser endpoint
- [ ] P2: Add error handling to api/handlers.ts
- [ ] P2: Replace any with proper type in utils.ts
- [ ] P3: Extract duplicate code to shared helper
```

## Integration with PR Workflow

Use before creating PRs:

1. Run `/workflows:review` on branch
2. Fix P1 and P2 issues
3. Create PR with clean review
4. Reference review in PR description

## Best Practices

1. **Review early** - Catch issues before they compound
2. **Fix P1 immediately** - Never merge security issues
3. **Track P3 as tech debt** - Create tickets if not fixing
4. **Learn from patterns** - Use `/workflows:compound` for recurring issues
5. **Automate where possible** - Add linters for caught issues

## Trigger Phrases

This skill activates on:

- "Review this code"
- "Review my changes"
- "Review the PR"
- "Check for issues"
- "Run a code review"
- "Run /workflows:review"
