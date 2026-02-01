# Production Deployment

Production deployment is environment-specific and requires secure secrets management.

## Prerequisites

Before deploying, verify your local environment is set up correctly:

```bash
./run.sh doctor
```

This ensures all required tools (Docker, Docker Compose) are available.

## Pre-Deployment Checklist

- [ ] Run `./run.sh doctor` to verify environment
- [ ] Configure production secrets (never in repo)
- [ ] Set up SSL certificates
- [ ] Configure OAuth callback URLs for your domain
- [ ] Set `SSH_HOST` for monitoring (optional)
- [ ] Test locally with `./run.sh test`

## Deployment Commands

```bash
# Deploy with MinIO storage
./run.sh deploy

# Deploy with Cloudflare R2 storage
./run.sh deploy --r2

# Update running deployment
./run.sh deploy update

# Stop production
./run.sh deploy stop

# View production logs
./run.sh deploy logs
```

## Required Environment Variables

Ensure these are set in your production `.env`:

| Variable               | Description                                  |
| ---------------------- | -------------------------------------------- |
| `DATABASE_TYPE`        | Set to `sqlite`                              |
| `SQLITE_DATABASE`      | Path to SQLite database file                 |
| `MINIO_ROOT_USER`      | MinIO admin username                         |
| `MINIO_ROOT_PASSWORD`  | MinIO admin password (use a strong password) |
| `DASHBOARD_JWT_SECRET` | JWT secret for dashboard authentication      |
| `ORIENT_MASTER_KEY`    | Master key for secrets encryption            |
| `ANTHROPIC_API_KEY`    | Anthropic API key for Claude                 |
| `JIRA_*`               | Jira integration credentials                 |
| `SLACK_*`              | Slack app credentials                        |
| `GOOGLE_*`             | Google OAuth credentials                     |

## SSL Configuration

Mount your SSL certificates in the nginx container:

```yaml
volumes:
  - /path/to/cert.pem:/etc/nginx/ssl/cert.pem:ro
  - /path/to/key.pem:/etc/nginx/ssl/key.pem:ro
```

## Network Security

Production deployments use Docker network isolation. Only Nginx (ports 80/443) is exposed to the host network. All other services communicate internally via Docker's bridge network.

### Accessing Internal Services

**Database Access via SSH:**

```bash
# SSH into the production server
ssh user@production-server

# Use sqlite3 to access the database
sqlite3 /app/data/orient.db
```

**MinIO Console Access via SSH Tunnel:**

```bash
# Forward MinIO console port
ssh -L 9001:orienter-minio:9001 user@production-server

# Access at http://localhost:9001
```

### Services Available via Nginx

All application services are accessible through the Nginx reverse proxy:

| Service   | Nginx Path     | Internal Port |
| --------- | -------------- | ------------- |
| Dashboard | `/dashboard/*` | 4098          |
| WhatsApp  | `/qr/*`        | 4098          |
| OpenCode  | `/opencode/*`  | 4099          |
| Webhooks  | `/webhook/*`   | 4098          |

### Disabling Port Hardening

To restore direct port access (for debugging), remove `docker-compose.prod-secure.yml` from the compose stack:

```bash
# Without port hardening (exposes all ports)
docker compose -f docker-compose.v2.yml -f docker-compose.prod.yml -f docker-compose.r2.yml up -d

# With port hardening (production default)
docker compose -f docker-compose.v2.yml -f docker-compose.prod.yml -f docker-compose.r2.yml -f docker-compose.prod-secure.yml up -d
```

## Notes

Use your infrastructure tooling to deploy and manage updates. This repository does not ship production credentials.
