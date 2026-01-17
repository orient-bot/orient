#!/bin/bash
# =============================================================================
# Orient - Server-Side Deployment Script
# =============================================================================
# This script runs ON THE SERVER to handle deployment safely.
# It handles permissions, backups, and atomic deployments.
#
# Usage: deploy-server.sh [action]
#   Actions:
#     prepare     - Prepare directories and fix permissions
#     deploy      - Deploy new configuration and restart services
#     rollback    - Rollback to previous configuration
#     health      - Check service health
#     cleanup     - Clean up old images and backups
# =============================================================================

set -euo pipefail

# Configuration
DEPLOY_DIR="${HOME}/orienter"
DOCKER_DIR="${DEPLOY_DIR}/docker"
BACKUP_DIR="${DEPLOY_DIR}/backups"
CONFIG_DIR="${DEPLOY_DIR}/config"  # Staging directory for configs
MAX_BACKUPS=5

# Compose files for production
# V2 is the default (per-package builds architecture)
# Set USE_V2_COMPOSE=0 to use the legacy monolithic Dockerfiles
if [[ "${USE_V2_COMPOSE:-1}" == "0" ]]; then
    COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.r2.yml"
    warn "Using legacy compose files (monolithic builds)"
else
    COMPOSE_FILES="-f docker-compose.v2.yml -f docker-compose.prod.yml -f docker-compose.r2.yml"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[DEPLOY]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# =============================================================================
# PREPARE: Set up directories and fix permissions
# =============================================================================
prepare() {
    log "Preparing deployment directories..."
    
    # Create all required directories
    mkdir -p "${DOCKER_DIR}"
    mkdir -p "${BACKUP_DIR}"
    mkdir -p "${CONFIG_DIR}"
    mkdir -p "${DEPLOY_DIR}/data"
    mkdir -p "${DEPLOY_DIR}/logs"
    
    # Fix ownership - ensure deploy user owns everything
    # This is the key fix: we take ownership BEFORE docker creates anything
    sudo chown -R "$(whoami):$(whoami)" "${DEPLOY_DIR}" 2>/dev/null || true
    
    # Set proper permissions
    chmod 755 "${DEPLOY_DIR}"
    chmod 755 "${DOCKER_DIR}"
    chmod 755 "${CONFIG_DIR}"
    chmod 700 "${BACKUP_DIR}"  # Backups are private
    
    # Ensure .env symlink exists
    if [[ -f "${DEPLOY_DIR}/.env" ]] && [[ ! -f "${DOCKER_DIR}/.env" ]]; then
        ln -sf "${DEPLOY_DIR}/.env" "${DOCKER_DIR}/.env"
        log "Created .env symlink"
    fi
    
    log "Directories prepared successfully"
}

# =============================================================================
# STAGE: Stage new config files (called before deploy)
# =============================================================================
stage_config() {
    local file="$1"
    local content
    
    # Read content from stdin
    content=$(cat)
    
    # Write to staging directory
    echo "$content" > "${CONFIG_DIR}/${file}"
    log "Staged: ${file}"
}

# =============================================================================
# DEPLOY: Deploy staged configuration and restart services
# =============================================================================
deploy() {
    local commit_sha="${1:-unknown}"
    local timestamp=$(date +%Y%m%d_%H%M%S)
    
    log "Starting deployment..."
    log "Commit: ${commit_sha}"
    log "Timestamp: ${timestamp}"
    
    cd "${DOCKER_DIR}"
    
    # Step 1: Create backup of current config
    if [[ -f "docker-compose.yml" ]]; then
        log "Creating backup..."
        local backup_name="backup_${timestamp}"
        mkdir -p "${BACKUP_DIR}/${backup_name}"
        cp -f *.yml "${BACKUP_DIR}/${backup_name}/" 2>/dev/null || true
        cp -f *.conf "${BACKUP_DIR}/${backup_name}/" 2>/dev/null || true
        echo "${commit_sha}" > "${BACKUP_DIR}/${backup_name}/commit.txt"
        log "Backup created: ${backup_name}"
    fi
    
    # Step 2: Stop services gracefully
    log "Stopping services..."
    sudo docker compose ${COMPOSE_FILES} down --remove-orphans 2>/dev/null || true
    
    # Step 3: Fix any permission issues BEFORE copying new files
    # Docker may have created files as root
    sudo chown -R "$(whoami):$(whoami)" "${DOCKER_DIR}" 2>/dev/null || true
    
    # Step 4: Move staged configs to docker directory
    if [[ -d "${CONFIG_DIR}" ]] && [[ "$(ls -A ${CONFIG_DIR} 2>/dev/null)" ]]; then
        log "Applying staged configuration..."
        mv -f "${CONFIG_DIR}"/* "${DOCKER_DIR}/" 2>/dev/null || true
    fi
    
    # Step 5: Pull new images
    log "Pulling latest images..."
    sudo docker compose ${COMPOSE_FILES} pull
    
    # Step 6: Start services
    log "Starting services..."
    sudo docker compose ${COMPOSE_FILES} up -d
    
    # Step 7: Wait for services to start
    log "Waiting for services to initialize..."
    sleep 10
    
    # Step 8: Show status
    log "Service status:"
    sudo docker compose ${COMPOSE_FILES} ps
    
    # Step 9: Clean up old backups (keep only MAX_BACKUPS)
    cleanup_backups
    
    log "Deployment complete!"
}

# =============================================================================
# ROLLBACK: Restore previous configuration
# =============================================================================
rollback() {
    log "Starting rollback..."
    
    cd "${DOCKER_DIR}"
    
    # Find the most recent backup
    local latest_backup=$(ls -t "${BACKUP_DIR}" 2>/dev/null | head -1)
    
    if [[ -z "${latest_backup}" ]]; then
        error "No backup found to rollback to"
    fi
    
    log "Rolling back to: ${latest_backup}"
    
    # Stop services
    log "Stopping services..."
    sudo docker compose ${COMPOSE_FILES} down --remove-orphans 2>/dev/null || true
    
    # Fix permissions
    sudo chown -R "$(whoami):$(whoami)" "${DOCKER_DIR}" 2>/dev/null || true
    
    # Restore backup
    log "Restoring configuration..."
    cp -f "${BACKUP_DIR}/${latest_backup}"/*.yml "${DOCKER_DIR}/" 2>/dev/null || true
    cp -f "${BACKUP_DIR}/${latest_backup}"/*.conf "${DOCKER_DIR}/" 2>/dev/null || true
    
    # Start services
    log "Starting services..."
    sudo docker compose ${COMPOSE_FILES} up -d
    
    log "Rollback complete!"
}

# =============================================================================
# HEALTH: Check service health
# =============================================================================
health() {
    log "Checking service health..."
    
    local all_healthy=true
    
    cd "${DOCKER_DIR}"
    
    # Check if containers are running
    log "Container status:"
    sudo docker compose ${COMPOSE_FILES} ps
    
    # Check nginx health endpoint
    if curl -sf "http://localhost/health" > /dev/null 2>&1; then
        log "✅ Nginx: healthy"
    else
        warn "❌ Nginx: unhealthy or not responding"
        all_healthy=false
    fi
    
    # Check OpenCode health
    if curl -sf "http://localhost/opencode/global/health" > /dev/null 2>&1; then
        log "✅ OpenCode: healthy"
    else
        warn "⚠️ OpenCode: may still be starting"
    fi
    
    # Check WhatsApp dashboard
    if curl -sf "http://localhost/dashboard/api/health" > /dev/null 2>&1; then
        log "✅ WhatsApp Dashboard: healthy"
    else
        warn "⚠️ WhatsApp Dashboard: may still be starting"
    fi
    
    if [[ "${all_healthy}" == "true" ]]; then
        log "All services healthy!"
        return 0
    else
        warn "Some services may need attention"
        return 1
    fi
}

# =============================================================================
# CLEANUP: Clean up old images and backups
# =============================================================================
cleanup() {
    log "Starting cleanup..."
    
    # Clean up old docker images
    log "Removing unused Docker images..."
    sudo docker image prune -af --filter "until=24h" 2>/dev/null || true
    
    # Clean up old containers
    log "Removing stopped containers..."
    sudo docker container prune -f 2>/dev/null || true
    
    # Clean up old backups
    cleanup_backups
    
    log "Cleanup complete!"
}

cleanup_backups() {
    log "Cleaning old backups (keeping ${MAX_BACKUPS})..."
    
    local backup_count=$(ls -1 "${BACKUP_DIR}" 2>/dev/null | wc -l)
    
    if [[ ${backup_count} -gt ${MAX_BACKUPS} ]]; then
        local to_delete=$((backup_count - MAX_BACKUPS))
        ls -t "${BACKUP_DIR}" | tail -n ${to_delete} | while read backup; do
            log "Removing old backup: ${backup}"
            rm -rf "${BACKUP_DIR}/${backup}"
        done
    fi
}

# =============================================================================
# MAIN
# =============================================================================
main() {
    local action="${1:-help}"
    
    case "${action}" in
        prepare)
            prepare
            ;;
        stage)
            # Usage: echo "content" | deploy-server.sh stage filename
            stage_config "${2:-}"
            ;;
        deploy)
            deploy "${2:-unknown}"
            ;;
        rollback)
            rollback
            ;;
        health)
            health
            ;;
        cleanup)
            cleanup
            ;;
        *)
            echo "Usage: $0 {prepare|deploy|rollback|health|cleanup}"
            echo ""
            echo "Actions:"
            echo "  prepare   - Prepare directories and fix permissions"
            echo "  deploy    - Deploy new configuration and restart services"
            echo "  rollback  - Rollback to previous configuration"
            echo "  health    - Check service health"
            echo "  cleanup   - Clean up old images and backups"
            exit 1
            ;;
    esac
}

main "$@"




