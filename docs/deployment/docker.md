# Docker Deployment

## Prerequisites

Ensure Docker and Docker Compose are installed. Run the doctor script to verify:

```bash
./run.sh doctor
```

## Build

```bash
docker compose -f docker/docker-compose.v2.yml build
```

## Run

```bash
docker compose -f docker/docker-compose.v2.yml up -d
```

## Development Mode

For local development with hot-reload:

```bash
./run.sh dev
```

This starts:

- **Docker**: nginx, minio (infrastructure only)
- **Native**: Vite dev server, OpenCode, Dashboard (with WhatsApp), Slack bots with tsx watch
- **SQLite**: File-based database (no container needed)

## Available Docker Compose Files

| File                       | Purpose                            |
| -------------------------- | ---------------------------------- |
| `docker-compose.v2.yml`    | Base service definitions           |
| `docker-compose.infra.yml` | Infrastructure only (nginx, minio) |
| `docker-compose.local.yml` | Local development overrides        |
| `docker-compose.prod.yml`  | Production overrides               |

## Common Commands

```bash
# Check status
docker compose -f docker/docker-compose.v2.yml ps

# View logs
docker compose -f docker/docker-compose.v2.yml logs -f

# Stop
docker compose -f docker/docker-compose.v2.yml down

# Stop and remove volumes
docker compose -f docker/docker-compose.v2.yml down -v
```

## Database

Orient uses SQLite for all database operations. The database file is stored in a Docker volume or bind-mounted directory:

- **Dev mode**: `.dev-data/instance-N/orient.db`
- **Docker**: `/app/data/orient.db` (volume-mounted)

No separate database container is required.

## Notes

Set environment variables via `.env` or Docker env files before running.
