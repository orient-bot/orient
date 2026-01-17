#!/bin/bash
# S3 Sync Script for Orient
# Handles bidirectional sync between local data and S3/MinIO bucket
# 
# Usage:
#   ./s3-sync.sh pull     - Download from S3 to local
#   ./s3-sync.sh push     - Upload from local to S3
#   ./s3-sync.sh daemon   - Run continuous sync daemon
#   ./s3-sync.sh status   - Check sync status

set -e

# =============================================================================
# Configuration
# =============================================================================
S3_BUCKET="${S3_BUCKET:-}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-}"  # For MinIO/S3-compatible storage
DATA_DIR="${DATA_DIR:-/app/data}"
LOG_DIR="${LOG_DIR:-/app/logs}"
SYNC_INTERVAL="${S3_SYNC_INTERVAL:-300}"  # 5 minutes default
SYNC_LOG="${LOG_DIR}/s3-sync.log"

# Build AWS CLI endpoint argument if endpoint URL is set (for MinIO)
AWS_OPTS=""
if [ -n "$AWS_ENDPOINT_URL" ]; then
    AWS_OPTS="--endpoint-url $AWS_ENDPOINT_URL"
fi

# Subdirectories to sync
SYNC_PATHS=(
    "whatsapp-auth"
    "media"
    "oauth-tokens"
)

# Pairing mode marker file - when present, skip session sync
PAIRING_MODE_MARKER=".pairing-mode"

# Check if bot is in pairing mode (waiting for fresh pairing)
is_pairing_mode() {
    [ -f "${DATA_DIR}/whatsapp-auth/${PAIRING_MODE_MARKER}" ]
}

# Files to sync
SYNC_FILES=(
    "messages.db"
    "messages.db-shm"
    "messages.db-wal"
)

# =============================================================================
# Logging
# =============================================================================
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg"
    echo "$msg" >> "$SYNC_LOG" 2>/dev/null || true
}

log_error() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1"
    echo "$msg" >&2
    echo "$msg" >> "$SYNC_LOG" 2>/dev/null || true
}

# =============================================================================
# Validation
# =============================================================================
validate_config() {
    if [ -z "$S3_BUCKET" ]; then
        log_error "S3_BUCKET environment variable not set"
        return 1
    fi
    
    if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
        log_error "AWS credentials not configured"
        return 1
    fi
    
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI not installed"
        return 1
    fi
    
    if [ -n "$AWS_ENDPOINT_URL" ]; then
        log "Using custom S3 endpoint: $AWS_ENDPOINT_URL"
    fi
    
    return 0
}

# =============================================================================
# S3 Operations
# =============================================================================
s3_pull() {
    log "Starting S3 pull from s3://${S3_BUCKET}/ to ${DATA_DIR}/"
    
    mkdir -p "$DATA_DIR"
    
    # Check if in pairing mode
    local skip_session=false
    if is_pairing_mode; then
        log "  PAIRING MODE ACTIVE - Skipping whatsapp-auth sync"
        skip_session=true
    fi
    
    # Sync directories
    for path in "${SYNC_PATHS[@]}"; do
        local s3_path="s3://${S3_BUCKET}/data/${path}/"
        local local_path="${DATA_DIR}/${path}/"
        
        # Skip whatsapp-auth if in pairing mode
        if [ "$path" = "whatsapp-auth" ] && [ "$skip_session" = true ]; then
            log "  Skipping whatsapp-auth (pairing mode)"
            continue
        fi
        
        log "  Syncing directory: ${path}"
        mkdir -p "$local_path"
        aws $AWS_OPTS s3 sync "$s3_path" "$local_path" --quiet 2>/dev/null || {
            log "  Warning: ${path} not found in S3 (may be first run)"
        }
    done
    
    # Sync individual files
    for file in "${SYNC_FILES[@]}"; do
        local s3_path="s3://${S3_BUCKET}/data/${file}"
        local local_path="${DATA_DIR}/${file}"
        
        log "  Syncing file: ${file}"
        aws $AWS_OPTS s3 cp "$s3_path" "$local_path" --quiet 2>/dev/null || {
            log "  Warning: ${file} not found in S3 (may be first run)"
        }
    done
    
    # Sync logs directory
    log "  Syncing logs directory"
    mkdir -p "$LOG_DIR"
    aws $AWS_OPTS s3 sync "s3://${S3_BUCKET}/logs/" "$LOG_DIR/" --quiet 2>/dev/null || {
        log "  Warning: logs not found in S3"
    }
    
    log "S3 pull complete"
}

s3_push() {
    log "Starting S3 push from ${DATA_DIR}/ to s3://${S3_BUCKET}/"
    
    # Check if in pairing mode
    local skip_session=false
    if is_pairing_mode; then
        log "  PAIRING MODE ACTIVE - Skipping whatsapp-auth sync"
        skip_session=true
    fi
    
    # Sync directories
    for path in "${SYNC_PATHS[@]}"; do
        local s3_path="s3://${S3_BUCKET}/data/${path}/"
        local local_path="${DATA_DIR}/${path}/"
        
        # Skip whatsapp-auth if in pairing mode
        if [ "$path" = "whatsapp-auth" ] && [ "$skip_session" = true ]; then
            log "  Skipping whatsapp-auth (pairing mode)"
            continue
        fi
        
        if [ -d "$local_path" ]; then
            log "  Syncing directory: ${path}"
            aws $AWS_OPTS s3 sync "$local_path" "$s3_path" --quiet || {
                log_error "Failed to sync ${path}"
            }
        fi
    done
    
    # Sync individual files
    for file in "${SYNC_FILES[@]}"; do
        local s3_path="s3://${S3_BUCKET}/data/${file}"
        local local_path="${DATA_DIR}/${file}"
        
        if [ -f "$local_path" ]; then
            log "  Syncing file: ${file}"
            aws $AWS_OPTS s3 cp "$local_path" "$s3_path" --quiet || {
                log_error "Failed to sync ${file}"
            }
        fi
    done
    
    # Sync logs directory
    if [ -d "$LOG_DIR" ]; then
        log "  Syncing logs directory"
        aws $AWS_OPTS s3 sync "$LOG_DIR/" "s3://${S3_BUCKET}/logs/" \
            --exclude "*.tmp" \
            --quiet || {
            log_error "Failed to sync logs"
        }
    fi
    
    log "S3 push complete"
}

s3_status() {
    echo "S3 Sync Status"
    echo "=============="
    echo "Bucket: s3://${S3_BUCKET}"
    echo "Endpoint: ${AWS_ENDPOINT_URL:-AWS S3}"
    echo "Data Dir: ${DATA_DIR}"
    echo "Log Dir: ${LOG_DIR}"
    echo "Sync Interval: ${SYNC_INTERVAL}s"
    echo ""
    
    echo "Local Data:"
    if [ -d "$DATA_DIR" ]; then
        du -sh "${DATA_DIR}"/* 2>/dev/null || echo "  (empty)"
    else
        echo "  (not found)"
    fi
    echo ""
    
    echo "S3 Contents:"
    aws $AWS_OPTS s3 ls "s3://${S3_BUCKET}/" --recursive --human-readable --summarize 2>/dev/null | tail -5 || {
        echo "  (unable to list or empty)"
    }
}

# =============================================================================
# Daemon Mode
# =============================================================================
run_daemon() {
    log "Starting S3 sync daemon (interval: ${SYNC_INTERVAL}s)"
    if [ -n "$AWS_ENDPOINT_URL" ]; then
        log "Using S3 endpoint: $AWS_ENDPOINT_URL"
    fi
    
    # Initial pull
    s3_pull
    
    # Trap for graceful shutdown
    trap 'log "Daemon stopping..."; s3_push; exit 0' SIGTERM SIGINT SIGQUIT
    
    # Continuous sync loop
    while true; do
        sleep "$SYNC_INTERVAL"
        log "Running periodic sync..."
        s3_push
    done
}

# =============================================================================
# Main
# =============================================================================
main() {
    local command="${1:-help}"
    
    # Create log directory
    mkdir -p "$LOG_DIR"
    
    case "$command" in
        pull)
            validate_config || exit 1
            s3_pull
            ;;
        push)
            validate_config || exit 1
            s3_push
            ;;
        daemon)
            validate_config || exit 1
            run_daemon
            ;;
        status)
            validate_config || exit 1
            s3_status
            ;;
        help|--help|-h)
            echo "S3 Sync Script for Orient"
            echo ""
            echo "Usage: $0 <command>"
            echo ""
            echo "Commands:"
            echo "  pull    - Download data from S3 to local"
            echo "  push    - Upload local data to S3"
            echo "  daemon  - Run continuous sync daemon"
            echo "  status  - Show sync status and bucket contents"
            echo "  help    - Show this help message"
            echo ""
            echo "Environment Variables:"
            echo "  S3_BUCKET              - S3 bucket name (required)"
            echo "  AWS_ACCESS_KEY_ID      - AWS access key (required)"
            echo "  AWS_SECRET_ACCESS_KEY  - AWS secret key (required)"
            echo "  AWS_ENDPOINT_URL       - Custom S3 endpoint (for MinIO)"
            echo "  AWS_REGION             - AWS region (default: us-east-1)"
            echo "  DATA_DIR               - Local data directory (default: /app/data)"
            echo "  LOG_DIR                - Local log directory (default: /app/logs)"
            echo "  S3_SYNC_INTERVAL       - Sync interval in seconds (default: 300)"
            ;;
        *)
            log_error "Unknown command: $command"
            echo "Run '$0 help' for usage information"
            exit 1
            ;;
    esac
}

main "$@"
