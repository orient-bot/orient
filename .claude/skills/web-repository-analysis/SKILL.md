---
name: web-repository-analysis
description: Structured guidance for analyzing external GitHub repositories using WebFetch. Use when asked to "analyze this repo", "explore a GitHub repository", "understand this codebase", "review external code", or when given a GitHub URL to investigate. Covers GitHub API patterns, systematic exploration workflows, and synthesizing findings.
---

# Web Repository Analysis

Systematic approach for exploring and analyzing external GitHub repositories without cloning.

## Quick Start

When given a GitHub URL like `https://github.com/owner/repo`:

1. **Extract owner/repo** from URL
2. **Fetch README** for project overview
3. **Explore structure** via directory listings
4. **Deep-dive** into relevant files

## GitHub API Patterns

### Directory Listings

Fetch directory contents via GitHub Contents API:

```
https://api.github.com/repos/{owner}/{repo}/contents/{path}
```

**Response format:**

```json
[
  { "name": "src", "type": "dir", "path": "src" },
  { "name": "README.md", "type": "file", "path": "README.md", "size": 1234 }
]
```

### Raw File Content

Fetch raw file contents (best for reading code):

```
https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}
```

**Common branches:** `main`, `master`

### Repository Metadata

```
https://api.github.com/repos/{owner}/{repo}
```

Returns: description, default_branch, language, topics, stars, forks.

## Exploration Workflow

### Phase 1: Overview (Always Do First)

1. **README** - Understand purpose and setup

   ```
   https://raw.githubusercontent.com/{owner}/{repo}/main/README.md
   ```

2. **Root structure** - See project layout

   ```
   https://api.github.com/repos/{owner}/{repo}/contents/
   ```

3. **Package config** - Dependencies and scripts
   - `package.json` (Node/JS)
   - `pyproject.toml` / `requirements.txt` (Python)
   - `Cargo.toml` (Rust)
   - `go.mod` (Go)

### Phase 2: Architecture Discovery

Based on project type, explore key directories:

| Project Type     | Key Directories                             |
| ---------------- | ------------------------------------------- |
| Node/TypeScript  | `src/`, `lib/`, `packages/`                 |
| Python           | `src/`, module folder matching package name |
| CLI Tool         | `src/commands/`, `bin/`                     |
| Plugin/Extension | `src/`, config files defining entry points  |
| Monorepo         | `packages/`, `apps/`, workspace config      |

### Phase 3: Implementation Deep-Dive

After understanding structure, fetch specific implementation files:

1. **Entry points** - main.ts, index.ts, **main**.py
2. **Core logic** - Files mentioned in README or main exports
3. **Configuration** - How the tool is configured
4. **Key patterns** - Reusable patterns worth studying

## Handling Pagination

GitHub API paginates directory listings with 1000+ items:

- Check `Link` header for next page URL
- Fetch subsequent pages if needed
- Most directories are well under this limit

## Synthesizing Findings

After exploration, structure findings as:

1. **Purpose** - What the project does (1-2 sentences)
2. **Architecture** - How it's organized
3. **Key Components** - Important files/modules and their roles
4. **Patterns** - Interesting implementation patterns
5. **Dependencies** - Notable libraries used
6. **Applicability** - How findings apply to current task

## Example Analysis Flow

For analyzing `https://github.com/owner/compound-engineering-plugin`:

```
1. WebFetch: raw.githubusercontent.com/owner/compound-engineering-plugin/main/README.md
   Prompt: "What is this project's purpose and key features?"

2. WebFetch: api.github.com/repos/owner/compound-engineering-plugin/contents/
   Prompt: "List the top-level directory structure"

3. WebFetch: raw.githubusercontent.com/owner/compound-engineering-plugin/main/package.json
   Prompt: "What are the dependencies and main entry points?"

4. WebFetch: api.github.com/repos/owner/compound-engineering-plugin/contents/src
   Prompt: "List the source directory structure"

5. WebFetch: [specific implementation files based on findings]
   Prompt: "Extract the key implementation patterns"
```

## Rate Limiting

GitHub API has rate limits:

- **Unauthenticated:** 60 requests/hour
- **Authenticated:** 5000 requests/hour

For intensive analysis, prioritize high-value files and batch related fetches.

## Best Practices

1. **Start broad, go deep** - Overview before details
2. **Follow the README** - It usually guides you to important files
3. **Check entry points** - Main exports reveal architecture
4. **Read config files** - They define project structure
5. **Note patterns** - Document reusable patterns as you find them
6. **Synthesize continuously** - Build understanding incrementally
