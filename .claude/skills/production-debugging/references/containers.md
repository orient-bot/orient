# Production Containers Reference

## Container Overview

| Container             | Image                                   | Purpose                                    |
| --------------------- | --------------------------------------- | ------------------------------------------ |
| orienter-nginx        | nginx:alpine                            | Reverse proxy, SSL termination, routing    |
| orienter-opencode     | ghcr.io/orient-core/orient/opencode     | OpenCode AI runtime for agent capabilities |
| orienter-bot-whatsapp | ghcr.io/orient-core/orient/whatsapp-bot | WhatsApp bot, webhook handler, QR/pairing  |
| orienter-dashboard    | ghcr.io/orient-core/orient/dashboard    | Dashboard server, MCP client               |
| orienter-postgres     | postgres:16-alpine                      | Message database, user storage             |

## Container Details

### orienter-nginx

**Purpose**: Reverse proxy handling SSL termination and routing requests to backend services.

**Ports**: 80 (HTTP), 443 (HTTPS)

**Routes**:

- `app.orient.bot/` -> dashboard (port 4098)
- `app.orient.bot/qr` -> bot-whatsapp (port 4097)
- `code.orient.bot/` -> opencode (port 4099)
- `app.orient.bot/oauth/callback` -> opencode OAuth (port 8765)

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

**Port**: 4099 (internal), 8765 (OAuth callback)

**Health Check**: HTTP GET /global/health

**Common Issues**:

- **OOM (Out of Memory)**: Large context causing memory spikes
- **Slow responses**: API rate limits or model latency
- **Startup failures**: Missing environment variables or API keys

**Debug Commands**:

```bash
docker logs orienter-opencode --tail 100
docker stats orienter-opencode --no-stream
```

### orienter-bot-whatsapp

**Purpose**: WhatsApp bot handling:

- WhatsApp webhook
- QR code pairing
- Message processing

**Port**: 4097 (internal)

**Health Check**: HTTP GET /health

**Common Issues**:

- **Pairing failures**: Session corrupted
- **Webhook errors**: WhatsApp API token issues
- **Connection drops**: Network issues

**Debug Commands**:

```bash
docker logs orienter-bot-whatsapp --tail 100
docker logs orienter-bot-whatsapp 2>&1 | grep -i error
```

### orienter-dashboard

**Purpose**: Dashboard web application:

- Admin UI
- REST API
- OAuth flow handler

**Port**: 4098 (internal)

**Health Check**: HTTP GET /api/health

**Common Issues**:

- **Auth failures**: JWT secret mismatch or expired tokens
- **Database connection refused**: Postgres not ready
- **Express 5 errors**: path-to-regexp breaking changes

**Debug Commands**:

```bash
docker logs orienter-dashboard --tail 100
docker exec orienter-dashboard env | grep DATABASE_URL
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

## Container Dependencies

```
nginx
├── opencode (health check required)
├── dashboard (health check required)
└── bot-whatsapp
    └── postgres (health check required)
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
- dashboard: 1GB memory limit
- bot-whatsapp: 1GB memory limit
- postgres: 512MB memory limit
- nginx: 128MB memory limit
