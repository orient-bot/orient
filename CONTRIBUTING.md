# Contributing

Thanks for contributing to Orient.

## Development Setup

### 1. Check Prerequisites

Run the doctor script to verify your environment:

```bash
./run.sh doctor
```

This checks for Node.js 20+, pnpm 9+, Docker, and other dependencies. Use `--fix` to auto-fix common issues:

```bash
./run.sh doctor --fix
```

### 2. Install and Configure

```bash
pnpm install
cp .env.example .env
cp .mcp.config.example.json .mcp.config.local.json
```

### 3. Start Development

```bash
./run.sh dev
```

### Useful Commands

| Command                    | Description                       |
| -------------------------- | --------------------------------- |
| `./run.sh doctor`          | Check environment prerequisites   |
| `./run.sh dev`             | Start development with hot-reload |
| `./run.sh dev stop`        | Stop all services                 |
| `./run.sh dev status`      | Show service status               |
| `./run.sh test`            | Run full Docker stack             |
| `pnpm test`                | Run unit tests                    |
| `pnpm turbo run typecheck` | TypeScript type checking          |

## Monorepo Structure

All new code lives under `packages/`. The legacy `src/` folder is deprecated
and should only be changed for migration tasks.

Key packages:

- `packages/bot-whatsapp` - WhatsApp bot + QR UI
- `packages/mcp-tools` - MCP tool registry and tools
- `packages/apps` - Mini-apps builder/hosting
- `packages/api-gateway` - Scheduler API and routing
- `packages/dashboard` - Dashboard server + frontend

## Testing

- Unit tests: `pnpm test` or `pnpm turbo run test`
- Typecheck: `pnpm turbo run typecheck`
- Lint: `pnpm turbo run lint`

## Code Style

- Use existing patterns and naming conventions
- Prefer small, focused PRs
- Add tests where behavior changes

## Pull Requests

- Describe what changed and why
- Include a short test plan
- Avoid committing secrets or local configs
