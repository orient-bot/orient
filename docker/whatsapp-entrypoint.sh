#!/bin/bash
# WhatsApp Bot Entrypoint Script
# Handles S3 sync on startup/shutdown and starts the WhatsApp bot

set -e

# =============================================================================
# Configuration
# =============================================================================
DATA_DIR="${DATA_DIR:-/app/data}"
LOG_DIR="${LOG_DIR:-/app/logs}"
OPENCODE_URL="${OPENCODE_URL:-http://opencode:4096}"

# =============================================================================
# Logging
# =============================================================================
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [whatsapp-bot] $1"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [whatsapp-bot] ERROR: $1" >&2
}

# =============================================================================
# S3 Sync Functions
# =============================================================================
# Build AWS CLI endpoint argument if endpoint URL is set (for MinIO)
AWS_OPTS=""
if [ -n "$AWS_ENDPOINT_URL" ]; then
    AWS_OPTS="--endpoint-url $AWS_ENDPOINT_URL"
fi

# Pairing mode marker file - when present, S3 sync should NOT restore session
PAIRING_MODE_MARKER=".pairing-mode"

# Check if bot is in pairing mode (waiting for fresh pairing)
is_pairing_mode() {
    [ -f "${DATA_DIR}/whatsapp-auth/${PAIRING_MODE_MARKER}" ]
}

# Clear WhatsApp session from S3 (for factory reset)
clear_s3_session() {
    if [ -n "$S3_BUCKET" ] && [ -n "$AWS_ACCESS_KEY_ID" ]; then
        log "Clearing WhatsApp session from S3..."
        aws $AWS_OPTS s3 rm "s3://${S3_BUCKET}/data/whatsapp-auth/" --recursive --quiet 2>/dev/null || {
            log_error "Failed to clear WhatsApp auth from S3 (may not exist)"
        }
        log "S3 WhatsApp session cleared"
    else
        log "S3 not configured, nothing to clear"
    fi
}

sync_from_s3() {
    if [ -n "$S3_BUCKET" ] && [ -n "$AWS_ACCESS_KEY_ID" ]; then
        log "Syncing WhatsApp data from S3..."
        if [ -n "$AWS_ENDPOINT_URL" ]; then
            log "Using S3 endpoint: $AWS_ENDPOINT_URL"
        fi
        
        # Check if in pairing mode - if so, skip session restore to prevent stale credentials
        if is_pairing_mode; then
            log "PAIRING MODE ACTIVE - Skipping WhatsApp session restore from S3"
            log "  (This prevents stale credentials from interfering with fresh pairing)"
        else
            # Sync WhatsApp auth session
            aws $AWS_OPTS s3 sync "s3://${S3_BUCKET}/data/whatsapp-auth/" "${DATA_DIR}/whatsapp-auth/" --quiet 2>/dev/null || {
                log "Warning: WhatsApp auth not found in S3 (first run - QR code scan required)"
            }
        fi
        
        # Sync messages database
        aws $AWS_OPTS s3 cp "s3://${S3_BUCKET}/data/messages.db" "${DATA_DIR}/messages.db" --quiet 2>/dev/null || {
            log "Warning: messages.db not found in S3 (will be created)"
        }
        
        # Sync WAL files if they exist
        aws $AWS_OPTS s3 cp "s3://${S3_BUCKET}/data/messages.db-wal" "${DATA_DIR}/messages.db-wal" --quiet 2>/dev/null || true
        aws $AWS_OPTS s3 cp "s3://${S3_BUCKET}/data/messages.db-shm" "${DATA_DIR}/messages.db-shm" --quiet 2>/dev/null || true
        
        # Sync media directory
        aws $AWS_OPTS s3 sync "s3://${S3_BUCKET}/data/media/" "${DATA_DIR}/media/" --quiet 2>/dev/null || {
            log "Warning: media directory not found in S3"
        }
        
        log "S3 sync complete"
    else
        log "S3 not configured, using local storage only"
    fi
}

sync_to_s3() {
    if [ -n "$S3_BUCKET" ] && [ -n "$AWS_ACCESS_KEY_ID" ]; then
        log "Syncing WhatsApp data to S3..."
        
        # Sync WhatsApp auth session (skip if in pairing mode to prevent pushing empty/stale session)
        if is_pairing_mode; then
            log "  Skipping session sync (pairing mode active)"
        elif [ -d "${DATA_DIR}/whatsapp-auth" ]; then
            aws $AWS_OPTS s3 sync "${DATA_DIR}/whatsapp-auth/" "s3://${S3_BUCKET}/data/whatsapp-auth/" --quiet || {
                log_error "Failed to sync WhatsApp auth to S3"
            }
        fi
        
        # Sync messages database
        if [ -f "${DATA_DIR}/messages.db" ]; then
            aws $AWS_OPTS s3 cp "${DATA_DIR}/messages.db" "s3://${S3_BUCKET}/data/messages.db" --quiet || {
                log_error "Failed to sync messages.db to S3"
            }
        fi
        
        # Sync WAL files
        [ -f "${DATA_DIR}/messages.db-wal" ] && aws $AWS_OPTS s3 cp "${DATA_DIR}/messages.db-wal" "s3://${S3_BUCKET}/data/messages.db-wal" --quiet 2>/dev/null || true
        [ -f "${DATA_DIR}/messages.db-shm" ] && aws $AWS_OPTS s3 cp "${DATA_DIR}/messages.db-shm" "s3://${S3_BUCKET}/data/messages.db-shm" --quiet 2>/dev/null || true
        
        # Sync media directory
        if [ -d "${DATA_DIR}/media" ]; then
            aws $AWS_OPTS s3 sync "${DATA_DIR}/media/" "s3://${S3_BUCKET}/data/media/" --quiet || {
                log_error "Failed to sync media to S3"
            }
        fi
        
        log "S3 sync to cloud complete"
    fi
}

# =============================================================================
# Graceful Shutdown Handler
# =============================================================================
cleanup() {
    log "Received shutdown signal, cleaning up..."
    
    # Sync data to S3 before exit
    sync_to_s3
    
    # Kill bot process if running
    if [ -n "$BOT_PID" ]; then
        log "Stopping WhatsApp bot (PID: $BOT_PID)"
        kill -TERM "$BOT_PID" 2>/dev/null || true
        wait "$BOT_PID" 2>/dev/null || true
    fi
    
    log "Cleanup complete, exiting"
    exit 0
}

trap cleanup SIGTERM SIGINT SIGQUIT

# =============================================================================
# Periodic S3 Sync
# =============================================================================
start_periodic_sync() {
    if [ -n "$S3_BUCKET" ] && [ -n "$AWS_ACCESS_KEY_ID" ]; then
        SYNC_INTERVAL="${S3_SYNC_INTERVAL:-300}"
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
# Wait for OpenCode
# =============================================================================
wait_for_opencode() {
    if [ "$OPENCODE_ENABLED" = "true" ] && [ -n "$OPENCODE_URL" ]; then
        log "Waiting for OpenCode server at ${OPENCODE_URL}..."
        
        for i in {1..60}; do
            if curl -sf "${OPENCODE_URL}/global/health" > /dev/null 2>&1; then
                log "OpenCode is ready!"
                return 0
            fi
            sleep 2
        done
        
        log_error "OpenCode not available after 120 seconds"
        log "Continuing anyway - WhatsApp bot will work without AI features"
    fi
}

# =============================================================================
# Fix Directory Permissions
# =============================================================================
fix_permissions() {
    # The container starts as root but the node process should run as nodejs (1001).
    # This function ensures the mounted volumes are writable by the nodejs user.
    
    if [ "$(id -u)" = "0" ]; then
        log "Running as root - fixing permissions on mounted volumes..."
        
        # Fix whatsapp-auth directory (critical for pairing)
        if [ -d "${DATA_DIR}/whatsapp-auth" ]; then
            chown -R 1001:1001 "${DATA_DIR}/whatsapp-auth" 2>/dev/null || {
                log_error "Failed to fix permissions on whatsapp-auth"
            }
            chmod -R 755 "${DATA_DIR}/whatsapp-auth" 2>/dev/null || true
            log "  ✓ Fixed permissions: ${DATA_DIR}/whatsapp-auth"
        fi
        
        # Fix media directory
        if [ -d "${DATA_DIR}/media" ]; then
            chown -R 1001:1001 "${DATA_DIR}/media" 2>/dev/null || true
            chmod -R 755 "${DATA_DIR}/media" 2>/dev/null || true
            log "  ✓ Fixed permissions: ${DATA_DIR}/media"
        fi
        
        # Fix logs directory
        if [ -d "${LOG_DIR}" ]; then
            chown -R 1001:1001 "${LOG_DIR}" 2>/dev/null || true
            chmod -R 755 "${LOG_DIR}" 2>/dev/null || true
            log "  ✓ Fixed permissions: ${LOG_DIR}"
        fi
        
        # Fix top-level data directory
        chown 1001:1001 "${DATA_DIR}" 2>/dev/null || true
        
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
    log "Orient PM - WhatsApp Bot"
    log "=========================================="
    log "Data Directory: $DATA_DIR"
    log "Log Directory: $LOG_DIR"
    log "OpenCode URL: $OPENCODE_URL"
    log "OpenCode Enabled: ${OPENCODE_ENABLED:-false}"
    
    # Ensure directories exist
    mkdir -p "$DATA_DIR/whatsapp-auth" "$DATA_DIR/media" "$LOG_DIR"
    
    # Fix permissions if needed (common issue with mounted volumes)
    fix_permissions
    
    # Sync data from S3 on startup
    sync_from_s3
    
    # Wait for OpenCode to be ready
    wait_for_opencode
    
    # Start periodic S3 sync in background
    start_periodic_sync
    
    # Start WhatsApp bot
    log "Starting WhatsApp bot..."
    log "=========================================="
    log "WhatsApp bot is starting"
    log "=========================================="
    
    # If running as root, drop privileges to nodejs user using su-exec
    if [ "$(id -u)" = "0" ]; then
        log "Dropping privileges to nodejs user (1001)..."
        # Run node as nodejs user in background so we can still handle signals
        su-exec nodejs:nodejs node dist/whatsapp-bot.js &
        BOT_PID=$!
    else
        # Already running as nodejs user
        node dist/whatsapp-bot.js &
        BOT_PID=$!
    fi
    
    log "WhatsApp bot started (PID: $BOT_PID)"
    
    # Wait for the bot process
    wait "$BOT_PID"
    BOT_EXIT_CODE=$?
    
    log "WhatsApp bot exited with code $BOT_EXIT_CODE"
    
    # Final S3 sync before exit
    sync_to_s3
    
    exit $BOT_EXIT_CODE
}

# Run main function
main "$@"

