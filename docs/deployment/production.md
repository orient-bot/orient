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

| Variable              | Description                                  |
| --------------------- | -------------------------------------------- |
| `POSTGRES_USER`       | PostgreSQL username                          |
| `POSTGRES_PASSWORD`   | PostgreSQL password (use a strong password)  |
| `MINIO_ROOT_USER`     | MinIO admin username                         |
| `MINIO_ROOT_PASSWORD` | MinIO admin password (use a strong password) |
| `ANTHROPIC_API_KEY`   | Anthropic API key for Claude                 |
| `JIRA_*`              | Jira integration credentials                 |
| `SLACK_*`             | Slack app credentials                        |
| `GOOGLE_*`            | Google OAuth credentials                     |

## SSL Configuration

Mount your SSL certificates in the nginx container:

```yaml
volumes:
  - /path/to/cert.pem:/etc/nginx/ssl/cert.pem:ro
  - /path/to/key.pem:/etc/nginx/ssl/key.pem:ro
```

## Notes

Use your infrastructure tooling to deploy and manage updates. This repository does not ship production credentials.
