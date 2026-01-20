# Production Containers Reference

## Container Overview

| Container | Image | Purpose |
|-----------|-------|---------|
| orienter-nginx | nginx:alpine | Reverse proxy, SSL termination, routing |
| orienter-opencode | ghcr.io/.../opencode | OpenCode AI runtime for agent capabilities |
| orienter-whatsapp-bot | ghcr.io/.../whatsapp-bot | Dashboard server, WhatsApp webhook, MCP client |
| orienter-postgres | postgres:16-alpine | Message database, user storage |
| orienter-minio | minio/minio | S3-compatible object storage |
| orienter-slack-bot | ghcr.io/.../slack-bot | Slack integration (optional profile) |

## Container Details

### orienter-nginx
**Purpose**: Reverse proxy handling SSL termination and routing requests to backend services.

**Ports**: 80 (HTTP), 443 (HTTPS)

**Routes**:
- `/` → whatsapp-bot (dashboard)
- `/api/` → whatsapp-bot (API)
- `/opencode/` → opencode (OpenCode UI)
- `/oauth/callback` → whatsapp-bot (OAuth callbacks)

**Common Issues**:
- **502 Bad Gateway**: Backend container is down or unhealthy
- **SSL certificate errors**: Certificate renewal failed
- **Timeouts**: Backend taking too long to respond

**Debug Commands**:
```bash
docker logs orienter-nginx --tail 50
docker exec orienter-nginx nginx -t  # Test config
```

### orienter-opencode
**Purpose**: OpenCode AI runtime providing agent capabilities and MCP server hosting.

**Port**: 4096 (internal)

**Health Check**: HTTP GET /health

**Common Issues**:
- **OOM (Out of Memory)**: Large context causing memory spikes
- **Slow responses**: API rate limits or model latency
- **Startup failures**: Missing environment variables or API keys

**Debug Commands**:
```bash
docker logs orienter-opencode --tail 100
docker exec orienter-opencode cat /app/.opencode/config.json
docker stats orienter-opencode --no-stream
```

### orienter-whatsapp-bot
**Purpose**: Main application server hosting:
- Dashboard web UI
- REST API
- WhatsApp webhook handler
- MCP client manager
- OAuth flow handler

**Port**: 8765 (internal)

**Health Check**: HTTP GET /health

**Common Issues**:
- **Auth failures**: JWT secret mismatch or expired tokens
- **Webhook errors**: WhatsApp API token issues
- **MCP connection failures**: OAuth or network issues
- **Database connection refused**: Postgres not ready

**Debug Commands**:
```bash
docker logs orienter-whatsapp-bot --tail 100
docker logs orienter-whatsapp-bot 2>&1 | grep -i error
docker exec orienter-whatsapp-bot ls -la /app/data/
```

### orienter-postgres
**Purpose**: PostgreSQL database storing messages, users, and permissions.

**Port**: 5432 (internal)

**Credentials**: Set via POSTGRES_USER, POSTGRES_PASSWORD in .env

**Common Issues**:
- **Connection refused**: Container not ready or crashed
- **Disk full**: Data volume out of space
- **Corrupted data**: Improper shutdown

**Debug Commands**:
```bash
docker logs orienter-postgres --tail 50
docker exec orienter-postgres psql -U aibot -d whatsapp_bot -c "SELECT COUNT(*) FROM messages;"
docker exec orienter-postgres pg_isready
```

### orienter-minio
**Purpose**: S3-compatible object storage for WhatsApp session data and file uploads.

**Ports**: 9000 (API), 9001 (Console)

**Credentials**: Set via MINIO_ROOT_USER, MINIO_ROOT_PASSWORD in .env

**Common Issues**:
- **Bucket access denied**: Incorrect credentials
- **Session restore failures**: Corrupted session data

**Debug Commands**:
```bash
docker logs orienter-minio --tail 50
docker exec orienter-minio mc ls local/
```

## Container Dependencies

```
nginx
├── opencode (health check required)
└── whatsapp-bot
    ├── opencode (health check required)
    ├── postgres (health check required)
    └── minio (optional)
```

## Health Check Status

Check all container health:
```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

A healthy status shows "(healthy)" after the uptime.

## Resource Limits

Containers are configured with these resource limits in production:
- opencode: 4GB memory limit (AI workloads)
- whatsapp-bot: 1GB memory limit
- postgres: 512MB memory limit
- nginx: 128MB memory limit
- minio: 512MB memory limit


