# Deployment Troubleshooting

## Deployment Flow Overview

1. GitHub Actions builds ARM64 Docker images
2. Images are pushed to GitHub Container Registry (ghcr.io)
3. Server pulls new images via rsync + docker compose pull
4. Containers are restarted with new images
5. Health checks verify services are running

## Check Deployment Status

### Via GitHub CLI (run locally)

```bash
gh run list --limit 5
gh run view <run-id> --log-failed
```

### Via Server Logs

```bash
ssh $OCI_USER@$OCI_HOST "cat ~/orient/logs/deploy.log | tail -100"
```

## Common Deployment Failures

### 1. Build Failures

**Symptoms**: GitHub Actions workflow fails at "Build" step

**Causes**:

- TypeScript compilation errors
- Missing dependencies
- Dockerfile syntax errors

**Debug**:

```bash
gh run view <run-id> --log-failed
```

**Fix**: Address code errors locally, push fix to main

### 2. Image Pull Failures

**Symptoms**: Deployment fails with "image not found" or "unauthorized"

**Causes**:

- GitHub Container Registry auth issues
- Network connectivity problems
- Image wasn't pushed

**Debug on server**:

```bash
ssh $OCI_USER@$OCI_HOST "docker pull ghcr.io/orient-core/orient/whatsapp-bot:latest"
```

**Fix**: Check GITHUB_TOKEN secret is valid, re-run deployment

### 3. Container Startup Failures

**Symptoms**: Containers exit immediately after starting

**Check exit codes**:

```bash
ssh $OCI_USER@$OCI_HOST "docker ps -a --format 'table {{.Names}}\t{{.Status}}'"
```

**View startup logs**:

```bash
ssh $OCI_USER@$OCI_HOST "docker logs orienter-bot-whatsapp 2>&1 | head -50"
```

**Common causes**:

- Missing environment variables in .env
- Database connection failures
- Port conflicts

### 4. Health Check Failures

**Symptoms**: Container marked as "unhealthy", nginx returns 502

**Check health status**:

```bash
ssh $OCI_USER@$OCI_HOST "docker inspect orienter-dashboard | jq '.[0].State.Health'"
```

**View health check logs**:

```bash
ssh $OCI_USER@$OCI_HOST "docker inspect orienter-dashboard | jq '.[0].State.Health.Log[-3:]'"
```

**Common causes**:

- Service crashed after starting
- Health endpoint not responding
- Dependency service unavailable

### 5. Disk Space Issues

**Symptoms**: Deployment hangs or fails with "no space left"

**Check disk**:

```bash
ssh $OCI_USER@$OCI_HOST "df -h /home && docker system df"
```

**Clean up**:

```bash
ssh $OCI_USER@$OCI_HOST "docker system prune -f && docker image prune -a -f --filter 'until=168h'"
```

### 6. SSH Connection Failures

**Symptoms**: GitHub Actions can't connect to server

**Check server accessibility**:

```bash
ssh -o ConnectTimeout=10 $OCI_USER@$OCI_HOST "echo OK"
```

**Common causes**:

- Server firewall blocking port 22
- SSH key mismatch
- Server is down/rebooting

## Rollback Procedure

### Quick Rollback

```bash
ssh $OCI_USER@$OCI_HOST "cd ~/orient/docker && ./deploy-server.sh rollback"
```

### Manual Rollback Steps

1. SSH into server:

   ```bash
   ssh $OCI_USER@$OCI_HOST
   ```

2. Navigate to docker directory:

   ```bash
   cd ~/orient/docker
   ```

3. List available backups:

   ```bash
   ls -la ~/orient/backups/
   ```

4. Restore previous compose files:

   ```bash
   cp ~/orient/backups/TIMESTAMP/docker-compose*.yml ./
   ```

5. Pull previous images (if tagged):

   ```bash
   docker compose -f docker-compose.v2.yml -f docker-compose.prod.yml pull
   ```

6. Restart services:
   ```bash
   docker compose -f docker-compose.v2.yml -f docker-compose.prod.yml -f docker-compose.r2.yml up -d
   ```

## Emergency Recovery

### All Containers Down

```bash
ssh $OCI_USER@$OCI_HOST "
  cd ~/orient/docker
  docker compose -f docker-compose.v2.yml -f docker-compose.prod.yml -f docker-compose.r2.yml down
  docker compose -f docker-compose.v2.yml -f docker-compose.prod.yml -f docker-compose.r2.yml up -d
"
```

### Database Corrupted

```bash
# Check SQLite database integrity
ssh $OCI_USER@$OCI_HOST "docker exec orienter-dashboard sqlite3 /app/data/orient.db 'PRAGMA integrity_check;'"

# If corrupted, restore from backup (if available)
ssh $OCI_USER@$OCI_HOST "cp ~/orient/backups/orient.db ~/orient/data/orient.db && docker restart orienter-dashboard"
```

### Server Completely Unresponsive

1. Access Oracle Cloud Console
2. Reboot the instance
3. After reboot, containers should auto-start (restart: unless-stopped)
4. If not, SSH in and run: `cd ~/orient/docker && docker compose up -d`

## Monitoring After Deployment

### Verify All Services Are Healthy

```bash
ssh $OCI_USER@$OCI_HOST "
  echo '=== Container Status ==='
  docker ps --format 'table {{.Names}}\t{{.Status}}'
  echo ''
  echo '=== Recent Errors ==='
  docker logs orienter-dashboard 2>&1 | grep -i error | tail -5
"
```

### Test Endpoints

```bash
# Health check
curl -s https://app.orient.bot/health | jq .

# Dashboard
curl -s -o /dev/null -w "%{http_code}" https://app.orient.bot/
```

## Multi-Stack Management

Production and staging run as separate Docker Compose stacks on the same server.

### Architecture

| Stack      | Project Name       | Network                  | Container Prefix     |
| ---------- | ------------------ | ------------------------ | -------------------- |
| Production | `docker` (default) | `docker_orient-network`  | `orienter-*`         |
| Staging    | `staging`          | `staging_orient-network` | `orienter-*-staging` |

### Start Production

```bash
cd ~/orient/docker
docker compose -f docker-compose.v2.yml -f docker-compose.prod.yml -f docker-compose.r2.yml up -d
```

### Start Staging

```bash
cd ~/orient/docker
docker compose -p staging -f docker-compose.v2.yml -f docker-compose.staging.yml up -d
```

### Connect Staging to Production Network (for nginx DNS)

```bash
PROD_NETWORK="docker_orient-network"
docker network connect $PROD_NETWORK orienter-opencode-staging 2>/dev/null || true
docker network connect $PROD_NETWORK orienter-dashboard-staging 2>/dev/null || true
docker network connect $PROD_NETWORK orienter-bot-whatsapp-staging 2>/dev/null || true
docker restart orienter-nginx
```
