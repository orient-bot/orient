#!/bin/bash
# OpenCode + MCP Server Entrypoint Script
# This script starts the OpenCode server with MCP server configured as a local tool

set -e

# =============================================================================
# Configuration
# =============================================================================
OPENCODE_PORT="${OPENCODE_PORT:-4096}"
OPENCODE_HOSTNAME="${OPENCODE_HOSTNAME:-0.0.0.0}"
MCP_SERVER_PATH="${MCP_SERVER_PATH:-/app/packages/mcp-servers/dist/coding-server.js}"
LOG_DIR="${LOG_DIR:-/app/logs}"
DATA_DIR="${DATA_DIR:-/app/data}"
# Project directory - OpenCode will run from here for meaningful project name
PROJECT_DIR="${PROJECT_DIR:-/home/opencode/pm-assistant}"
# Deployment environment (local or prod) - determines skill exclusions
DEPLOY_ENV="${DEPLOY_ENV:-local}"

# =============================================================================
# Logging
# =============================================================================
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
}

# =============================================================================
# S3 Sync (if configured)
# =============================================================================
# Build AWS CLI endpoint argument if endpoint URL is set (for MinIO)
AWS_OPTS=""
if [ -n "$AWS_ENDPOINT_URL" ]; then
    AWS_OPTS="--endpoint-url $AWS_ENDPOINT_URL"
fi

sync_from_s3() {
    if [ -n "$S3_BUCKET" ] && [ -n "$AWS_ACCESS_KEY_ID" ]; then
        log "Syncing data from S3 bucket: $S3_BUCKET"
        if [ -n "$AWS_ENDPOINT_URL" ]; then
            log "Using S3 endpoint: $AWS_ENDPOINT_URL"
        fi
        
        # Sync data directory from S3
        aws $AWS_OPTS s3 sync "s3://${S3_BUCKET}/data/" "${DATA_DIR}/" --quiet || {
            log "Warning: S3 sync failed or bucket is empty (first run)"
        }
        
        log "S3 sync complete"
    else
        log "S3 not configured, skipping sync"
    fi
}

sync_to_s3() {
    if [ -n "$S3_BUCKET" ] && [ -n "$AWS_ACCESS_KEY_ID" ]; then
        log "Syncing data to S3 bucket: $S3_BUCKET"
        aws $AWS_OPTS s3 sync "${DATA_DIR}/" "s3://${S3_BUCKET}/data/" --quiet || {
            log_error "S3 upload sync failed"
        }
    fi
}

# =============================================================================
# Graceful Shutdown Handler
# =============================================================================
cleanup() {
    log "Received shutdown signal, cleaning up..."
    
    # Sync to S3 before exit
    sync_to_s3
    
    # Kill OpenCode if running
    if [ -n "$OPENCODE_PID" ]; then
        log "Stopping OpenCode server (PID: $OPENCODE_PID)"
        kill -TERM "$OPENCODE_PID" 2>/dev/null || true
        wait "$OPENCODE_PID" 2>/dev/null || true
    fi
    
    log "Cleanup complete, exiting"
    exit 0
}

trap cleanup SIGTERM SIGINT SIGQUIT

# =============================================================================
# Periodic S3 Sync Background Process
# =============================================================================
start_periodic_sync() {
    if [ -n "$S3_BUCKET" ] && [ -n "$AWS_ACCESS_KEY_ID" ]; then
        SYNC_INTERVAL="${S3_SYNC_INTERVAL:-300}"  # Default: 5 minutes
        log "Starting periodic S3 sync every ${SYNC_INTERVAL} seconds"
        
        while true; do
            sleep "$SYNC_INTERVAL"
            sync_to_s3
        done &
        SYNC_PID=$!
        log "Periodic sync started (PID: $SYNC_PID)"
    fi
}

# =============================================================================
# Fix Directory Permissions
# =============================================================================
fix_permissions() {
    # The container starts as root but the opencode process should run as opencode (1001).
    # This function ensures the mounted volumes are writable by the opencode user.
    
    if [ "$(id -u)" = "0" ]; then
        log "Running as root - fixing permissions on mounted volumes..."
        
        # Fix log directory
        if [ -d "${LOG_DIR}" ]; then
            chown -R 1001:1001 "${LOG_DIR}" 2>/dev/null || {
                log_error "Failed to fix permissions on logs"
            }
            chmod -R 755 "${LOG_DIR}" 2>/dev/null || true
            log "  ✓ Fixed permissions: ${LOG_DIR}"
        fi
        
        # Fix data directory
        if [ -d "${DATA_DIR}" ]; then
            chown -R 1001:1001 "${DATA_DIR}" 2>/dev/null || true
            chmod -R 755 "${DATA_DIR}" 2>/dev/null || true
            log "  ✓ Fixed permissions: ${DATA_DIR}"
        fi
        
        # Fix OpenCode storage directory
        if [ -d "/home/opencode/.local/share/opencode/storage" ]; then
            chown -R 1001:1001 "/home/opencode/.local/share/opencode/storage" 2>/dev/null || true
            log "  ✓ Fixed permissions: OpenCode storage"
        fi
        
        # Fix OAuth tokens directory (used by Atlassian MCP)
        if [ -d "${DATA_DIR}/oauth-tokens" ]; then
            chown -R 1001:1001 "${DATA_DIR}/oauth-tokens" 2>/dev/null || true
            chmod -R 755 "${DATA_DIR}/oauth-tokens" 2>/dev/null || true
            log "  ✓ Fixed permissions: OAuth tokens"
        fi
        
        log "Permissions fixed successfully"
    else
        log "Not running as root - skipping permission fix"
    fi
}

# =============================================================================
# Main
# =============================================================================
main() {
    log "=========================================="
    log "Orient PM - OpenCode + MCP Server"
    log "=========================================="
    log "OpenCode Port: $OPENCODE_PORT"
    log "OpenCode Hostname: $OPENCODE_HOSTNAME"
    log "MCP Server Path: $MCP_SERVER_PATH"
    log "Data Directory: $DATA_DIR"
    log "Log Directory: $LOG_DIR"
    log "Project Directory: $PROJECT_DIR"
    log "Deployment Environment: $DEPLOY_ENV"

    # Configure OpenCode isolation for container environment
    # This ensures OpenCode uses container-local paths instead of any mounted home directory
    export OPENCODE_TEST_HOME="/home/opencode"
    export XDG_DATA_HOME="/home/opencode/.local/share"
    export XDG_CONFIG_HOME="/home/opencode/.config"
    export XDG_CACHE_HOME="/home/opencode/.cache"
    export XDG_STATE_HOME="/home/opencode/.local/state"
    log "OpenCode isolation configured (OPENCODE_TEST_HOME=/home/opencode)"
    
    # Ensure directories exist
    mkdir -p "$LOG_DIR" "$DATA_DIR"
    
    # Fix permissions if needed (common issue with mounted volumes)
    fix_permissions
    
    # Sync data from S3 on startup
    sync_from_s3
    
    # Sync agent configuration from database (new Agent Registry system)
    # This replaces the legacy filter-skills.sh approach
    if [ -f "/app/scripts/sync-agent-config.ts" ]; then
        log "Syncing agent configuration from database..."
        cd /app && npx tsx scripts/sync-agent-config.ts --env "$DEPLOY_ENV" --seed || {
            log "Warning: Agent sync failed, falling back to legacy skill filtering"
            # Fallback to legacy skill filtering if database sync fails
            if [ -x /usr/local/bin/filter-skills.sh ]; then
                log "Applying legacy skill exclusions for environment: $DEPLOY_ENV"
                /usr/local/bin/filter-skills.sh "$DEPLOY_ENV" || {
                    log "Warning: Legacy skill filtering also failed, continuing with all skills"
                }
            fi
        }
    elif [ -x /usr/local/bin/filter-skills.sh ]; then
        # Legacy fallback: Apply skill exclusions based on deployment environment
        log "Using legacy skill filtering for environment: $DEPLOY_ENV"
        /usr/local/bin/filter-skills.sh "$DEPLOY_ENV" || {
            log "Warning: Skill filtering failed, continuing with all skills"
        }
    else
        log "No skill management configured, keeping all skills"
    fi
    
    # Verify MCP server exists
    if [ ! -f "$MCP_SERVER_PATH" ]; then
        log_error "MCP server not found at: $MCP_SERVER_PATH"
        exit 1
    fi
    
    # Verify OpenCode is installed
    if ! command -v opencode &> /dev/null; then
        log_error "OpenCode not found in PATH"
        exit 1
    fi
    
    log "OpenCode version: $(opencode --version 2>/dev/null || echo 'unknown')"
    
    # Start periodic S3 sync in background
    start_periodic_sync
    
    # Change to project directory so OpenCode uses it as the project root
    # This gives the project a meaningful name instead of "/"
    if [ -d "$PROJECT_DIR" ]; then
        log "Changing to project directory: $PROJECT_DIR"
        cd "$PROJECT_DIR"
    else
        log_error "Project directory not found: $PROJECT_DIR"
        exit 1
    fi
    
    # Start OpenCode server
    # The opencode.json config file tells OpenCode to use the local MCP server
    log "Starting OpenCode server on ${OPENCODE_HOSTNAME}:${OPENCODE_PORT}..."
    
    # If running as root, drop privileges to opencode user using gosu
    if [ "$(id -u)" = "0" ]; then
        log "Dropping privileges to opencode user (1001)..."
        gosu opencode opencode serve \
            --port "$OPENCODE_PORT" \
            --hostname "$OPENCODE_HOSTNAME" \
            2>&1 | tee -a "${LOG_DIR}/opencode.log" &
    else
        opencode serve \
            --port "$OPENCODE_PORT" \
            --hostname "$OPENCODE_HOSTNAME" \
            2>&1 | tee -a "${LOG_DIR}/opencode.log" &
    fi
    
    OPENCODE_PID=$!
    log "OpenCode server started (PID: $OPENCODE_PID)"
    
    # Wait for OpenCode to be ready
    log "Waiting for OpenCode to be ready..."
    for i in {1..30}; do
        if curl -sf "http://localhost:${OPENCODE_PORT}/global/health" > /dev/null 2>&1; then
            log "OpenCode is ready!"
            break
        fi
        sleep 1
    done
    
    # Verify it's running
    if ! curl -sf "http://localhost:${OPENCODE_PORT}/global/health" > /dev/null 2>&1; then
        log_error "OpenCode failed to start or health check failed"
        exit 1
    fi
    
    log "=========================================="
    log "OpenCode server is running and healthy"
    log "API available at: http://${OPENCODE_HOSTNAME}:${OPENCODE_PORT}"
    log "=========================================="
    
    # Wait for the OpenCode process
    wait "$OPENCODE_PID"
}

# Run main function
main "$@"

