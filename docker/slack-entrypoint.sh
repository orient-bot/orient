#!/bin/bash
# Slack Bot Entrypoint Script
# Starts the Slack bot with proper initialization

set -e

# =============================================================================
# Configuration
# =============================================================================
LOG_DIR="${LOG_DIR:-/app/logs}"
OPENCODE_URL="${OPENCODE_URL:-http://opencode:4099}"
DATABASE_URL="${DATABASE_URL:-}"

# =============================================================================
# Logging
# =============================================================================
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [slack-bot] $1"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [slack-bot] ERROR: $1" >&2
}

# =============================================================================
# Graceful Shutdown Handler
# =============================================================================
cleanup() {
    log "Received shutdown signal, cleaning up..."
    
    # Kill bot process if running
    if [ -n "$BOT_PID" ]; then
        log "Stopping Slack bot (PID: $BOT_PID)"
        kill -TERM "$BOT_PID" 2>/dev/null || true
        wait "$BOT_PID" 2>/dev/null || true
    fi
    
    log "Cleanup complete, exiting"
    exit 0
}

trap cleanup SIGTERM SIGINT SIGQUIT

# =============================================================================
# Wait for PostgreSQL
# =============================================================================
wait_for_postgres() {
    if [ -n "$DATABASE_URL" ]; then
        # Extract host from DATABASE_URL
        DB_HOST=$(echo "$DATABASE_URL" | sed -E 's/.*@([^:\/]+).*/\1/')
        DB_PORT=$(echo "$DATABASE_URL" | sed -E 's/.*:([0-9]+)\/.*/\1/')
        
        log "Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."
        
        for i in {1..30}; do
            # Use Node.js to check connection since nc may not be available
            # Pass variables via environment to avoid shell injection risks
            if DB_CHECK_HOST="$DB_HOST" DB_CHECK_PORT="$DB_PORT" node -e "const net = require('net'); const s = new net.Socket(); s.setTimeout(1000); s.on('connect', () => { s.destroy(); process.exit(0); }).on('error', () => process.exit(1)).on('timeout', () => { s.destroy(); process.exit(1); }).connect(parseInt(process.env.DB_CHECK_PORT, 10), process.env.DB_CHECK_HOST);" 2>/dev/null; then
                log "PostgreSQL is ready!"
                return 0
            fi
            sleep 2
        done
        
        log_error "PostgreSQL not available after 60 seconds"
        exit 1
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
        log "Continuing anyway - Slack bot will fail without AI features"
    fi
}

# =============================================================================
# Validate Slack Configuration
# =============================================================================
validate_slack_config() {
    local missing=""
    
    if [ -z "$SLACK_BOT_TOKEN" ]; then
        missing="$missing SLACK_BOT_TOKEN"
    fi
    
    if [ -z "$SLACK_SIGNING_SECRET" ]; then
        missing="$missing SLACK_SIGNING_SECRET"
    fi
    
    if [ -z "$SLACK_APP_TOKEN" ]; then
        missing="$missing SLACK_APP_TOKEN"
    fi
    
    if [ -n "$missing" ]; then
        log_error "Missing required Slack environment variables:$missing"
        log_error "Please set these in your .env file or docker-compose.yml"
        exit 1
    fi
    
    log "Slack configuration validated"
}

# =============================================================================
# Main
# =============================================================================
main() {
    log "=========================================="
    log "Orient PM - Slack Bot"
    log "=========================================="
    log "Log Directory: $LOG_DIR"
    log "OpenCode URL: $OPENCODE_URL"
    log "OpenCode Enabled: ${OPENCODE_ENABLED:-false}"
    log "Database: ${DATABASE_URL//:*@/:****@}"
    
    # Ensure directories exist
    mkdir -p "$LOG_DIR"
    
    # Validate Slack configuration
    validate_slack_config
    
    # Wait for PostgreSQL to be ready
    wait_for_postgres
    
    # Wait for OpenCode to be ready
    wait_for_opencode
    
    # Start Slack bot
    log "Starting Slack bot..."
    node dist/slack-bot.js 2>&1 | tee -a "${LOG_DIR}/slack-bot.log" &
    BOT_PID=$!
    log "Slack bot started (PID: $BOT_PID)"
    
    log "=========================================="
    log "Slack bot is running"
    log "=========================================="
    
    # Wait for the bot process
    wait "$BOT_PID"
}

# Run main function
main "$@"

