---
name: local-dev-startup
description: Start the website (Docusaurus) and dashboard (Vite) locally. Use when asked to "run the website", "start docs locally", "run the dashboard", "start dev servers", or any request to run local development services.
---

# Local Development Startup

## Quick Start

Start both services in parallel:

```bash
# Website docs (Docusaurus) - port 3000
cd website && pnpm start &

# Dashboard frontend (Vite) - port 5173
pnpm --filter @orient/dashboard-frontend run dev &
```

## Services

| Service           | Port | Command                                            | URL                   |
| ----------------- | ---- | -------------------------------------------------- | --------------------- |
| Docs (Docusaurus) | 3000 | `cd website && pnpm start`                         | http://localhost:3000 |
| Dashboard (Vite)  | 5173 | `pnpm --filter @orient/dashboard-frontend run dev` | http://localhost:5173 |

## Verification

Check if services are running:

```bash
# Check port 3000 (docs)
lsof -i :3000 | head -5

# Check port 5173 (dashboard)
lsof -i :5173 | head -5

# Check running processes
ps aux | grep -E "(docusaurus|vite)" | grep -v grep
```

## Troubleshooting

### Port Already in Use

If a port is occupied, find and optionally kill the process:

```bash
# Find process on port
lsof -ti :3000  # or :5173

# Kill if needed
kill $(lsof -ti :3000)
```

### Stalled or Hung Services

```bash
# Kill all node processes related to dev servers
pkill -f docusaurus
pkill -f vite

# Restart services
cd website && pnpm start &
pnpm --filter @orient/dashboard-frontend run dev &
```

### Dependencies Missing

```bash
# Install all dependencies from root
pnpm install

# Or for specific package
cd website && pnpm install
```

## Full Dev Environment

For the complete stack (including backend, database, nginx):

```bash
./run.sh dev
```

This starts all services including PostgreSQL, MinIO, and the dashboard backend on port 4098.
