# Docker Deployment

## Prerequisites

Ensure Docker and Docker Compose are installed. Run the doctor script to verify:

```bash
./run.sh doctor
```

## Build

```bash
docker compose -f docker/docker-compose.yml build
```

## Run

```bash
docker compose -f docker/docker-compose.yml up -d
```

## Development Mode

For local development with hot-reload:

```bash
./run.sh dev
```

This starts:

- **Docker**: nginx, postgres, minio (infrastructure only)
- **Native**: Vite dev server, OpenCode, WhatsApp/Slack bots with tsx watch

## Available Docker Compose Files

| File                       | Purpose                                      |
| -------------------------- | -------------------------------------------- |
| `docker-compose.infra.yml` | Infrastructure only (nginx, postgres, minio) |
| `docker-compose.demo.yml`  | Quick demo with demo credentials             |
| `docker-compose.yml`       | Full stack                                   |
| `docker-compose.prod.yml`  | Production overrides                         |

## Common Commands

```bash
# Check status
docker compose -f docker/docker-compose.yml ps

# View logs
docker compose -f docker/docker-compose.yml logs -f

# Stop
docker compose -f docker/docker-compose.yml down

# Stop and remove volumes
docker compose -f docker/docker-compose.yml down -v
```

## Notes

Set environment variables via `.env` or Docker env files before running.
