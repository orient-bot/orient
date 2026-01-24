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
ssh $OCI_USER@$OCI_HOST "cat ~/orienter/logs/deploy.log | tail -100"
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
ssh $OCI_USER@$OCI_HOST "docker pull ghcr.io/tombensim/orienter/whatsapp-bot:latest"
```

**Fix**: Check GHCR_TOKEN secret is valid, re-run deployment

### 3. Container Startup Failures

**Symptoms**: Containers exit immediately after starting

**Check exit codes**:
```bash
ssh $OCI_USER@$OCI_HOST "docker ps -a --format 'table {{.Names}}\t{{.Status}}'"
```

**View startup logs**:
```bash
ssh $OCI_USER@$OCI_HOST "docker logs orienter-whatsapp-bot 2>&1 | head -50"
```

**Common causes**:
- Missing environment variables in .env
- Database connection failures
- Port conflicts

### 4. Health Check Failures

**Symptoms**: Container marked as "unhealthy", nginx returns 502

**Check health status**:
```bash
ssh $OCI_USER@$OCI_HOST "docker inspect orienter-whatsapp-bot | jq '.[0].State.Health'"
```

**View health check logs**:
```bash
ssh $OCI_USER@$OCI_HOST "docker inspect orienter-whatsapp-bot | jq '.[0].State.Health.Log[-3:]'"
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
ssh $OCI_USER@$OCI_HOST "cd ~/orienter/docker && ./deploy-server.sh rollback"
```

### Manual Rollback Steps
1. SSH into server:
   ```bash
   ssh $OCI_USER@$OCI_HOST
   ```

2. Navigate to docker directory:
   ```bash
   cd ~/orienter/docker
   ```

3. List available backups:
   ```bash
   ls -la ~/orienter/backups/
   ```

4. Restore previous compose files:
   ```bash
   cp ~/orienter/backups/TIMESTAMP/docker-compose*.yml ./
   ```

5. Pull previous images (if tagged):
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
   ```

6. Restart services:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.r2.yml up -d
   ```

## Emergency Recovery

### All Containers Down
```bash
ssh $OCI_USER@$OCI_HOST "
  cd ~/orienter/docker
  docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.r2.yml down
  docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.r2.yml up -d
"
```

### Database Corrupted
```bash
# Check if postgres is running
ssh $OCI_USER@$OCI_HOST "docker logs orienter-postgres 2>&1 | tail -20"

# If corrupted, restore from backup (if available)
ssh $OCI_USER@$OCI_HOST "
  docker exec orienter-postgres pg_restore -U aibot -d whatsapp_bot /backups/latest.dump
"
```

### Server Completely Unresponsive
1. Access Oracle Cloud Console
2. Reboot the instance
3. After reboot, containers should auto-start (restart: unless-stopped)
4. If not, SSH in and run: `cd ~/orienter/docker && docker compose up -d`

## Monitoring After Deployment

### Verify All Services Are Healthy
```bash
ssh $OCI_USER@$OCI_HOST "
  echo '=== Container Status ===' 
  docker ps --format 'table {{.Names}}\t{{.Status}}'
  echo ''
  echo '=== Recent Errors ==='
  docker logs orienter-whatsapp-bot 2>&1 | grep -i error | tail -5
"
```

### Test Endpoints
```bash
# Health check
curl -s https://ai.proph.bet/health | jq .

# Dashboard
curl -s -o /dev/null -w "%{http_code}" https://ai.proph.bet/
```


