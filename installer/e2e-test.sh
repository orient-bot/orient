#!/bin/bash
#
# Orient E2E Installer Test
#
# Tests a fresh installation with:
# - SQLite database
# - Local storage
# - Opens browser when complete
#
# Usage: ./e2e-test.sh [--no-browser] [--keep]
#

set -e

# Parse arguments
OPEN_BROWSER=true
KEEP_INSTALL=false
for arg in "$@"; do
    case $arg in
        --no-browser)
            OPEN_BROWSER=false
            ;;
        --keep)
            KEEP_INSTALL=true
            ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Test directory - use unique name with timestamp
TEST_ID="e2e-$(date +%s)"
TEST_HOME="/tmp/orient-$TEST_ID"
export ORIENT_HOME="$TEST_HOME"

# Get the script directory (installer directory)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# Calculate instance ports (instance 2 for this worktree)
INSTANCE_ID=2
PORT_OFFSET=$((INSTANCE_ID * 1000))
DASHBOARD_PORT=$((4098 + PORT_OFFSET))
VITE_PORT=$((5173 + PORT_OFFSET))

log() {
    echo -e "${GREEN}[e2e-test]${NC} $1"
}

info() {
    echo -e "${BLUE}[e2e-test]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[e2e-test]${NC} $1"
}

error() {
    echo -e "${RED}[e2e-test]${NC} $1"
}

success() {
    echo -e "${CYAN}[e2e-test]${NC} ${GREEN}✓${NC} $1"
}

fail() {
    echo -e "${CYAN}[e2e-test]${NC} ${RED}✗${NC} $1"
    cleanup
    exit 1
}

# Cleanup function
cleanup() {
    if [[ "$KEEP_INSTALL" == "false" ]]; then
        log "Cleaning up test installation..."

        # Stop any running services
        if command -v pm2 &>/dev/null; then
            pm2 delete "orient-e2e-api" 2>/dev/null || true
            pm2 delete "orient-e2e-frontend" 2>/dev/null || true
        fi

        # Kill any processes using our test ports
        lsof -ti :$DASHBOARD_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
        lsof -ti :$VITE_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true

        # Remove test directory
        if [[ -d "$TEST_HOME" ]]; then
            rm -rf "$TEST_HOME"
        fi

        log "Cleanup complete"
    else
        log "Keeping installation at $TEST_HOME"
    fi
}

# Set up trap for cleanup on exit
trap cleanup EXIT

# ============================================
# TEST FUNCTIONS
# ============================================

test_prerequisites() {
    log "Testing prerequisites..."

    # Node.js
    if ! command -v node &>/dev/null; then
        fail "Node.js not found"
    fi
    local node_version=$(node -v | cut -d. -f1 | tr -d 'v')
    if [[ "$node_version" -lt 20 ]]; then
        fail "Node.js 20+ required (found: $(node -v))"
    fi
    success "Node.js $(node -v)"

    # pnpm
    if ! command -v pnpm &>/dev/null; then
        fail "pnpm not found"
    fi
    success "pnpm $(pnpm -v)"

    # git
    if ! command -v git &>/dev/null; then
        fail "git not found"
    fi
    success "git"
}

test_create_directories() {
    log "Creating test directory structure..."

    mkdir -p "$TEST_HOME"/{data/sqlite,data/media,data/whatsapp-auth,logs,bin}

    # Verify
    for dir in data/sqlite data/media data/whatsapp-auth logs bin; do
        if [[ ! -d "$TEST_HOME/$dir" ]]; then
            fail "Failed to create $dir"
        fi
    done

    success "Directory structure created at $TEST_HOME"
}

test_create_config() {
    log "Creating test configuration..."

    local env_file="$TEST_HOME/.env"
    local master_key=$(openssl rand -hex 32)
    local jwt_secret=$(openssl rand -hex 32)
    local sqlite_path="$TEST_HOME/data/sqlite/orient.db"
    local storage_path="$TEST_HOME/data/media"

    cat > "$env_file" << EOF
# =============================================================================
# Orient E2E Test Configuration
# Generated: $(date)
# =============================================================================

# Environment
NODE_ENV=development
LOG_LEVEL=debug

# Database (SQLite)
DATABASE_TYPE=sqlite
SQLITE_DATABASE=$sqlite_path

# Storage (Local)
STORAGE_TYPE=local
STORAGE_PATH=$storage_path

# Security
ORIENT_MASTER_KEY=$master_key
DASHBOARD_JWT_SECRET=$jwt_secret

# Dashboard - Use instance-specific port (unified with WhatsApp)
DASHBOARD_PORT=$DASHBOARD_PORT
BASE_URL=http://localhost:$DASHBOARD_PORT

# AI Provider (mock for testing)
ANTHROPIC_API_KEY=test-key-not-real
EOF

    chmod 600 "$env_file"

    if [[ ! -f "$env_file" ]]; then
        fail "Failed to create .env file"
    fi

    success "Configuration created with SQLite and local storage"
    success "Dashboard port: $DASHBOARD_PORT"
}

test_link_repo() {
    log "Linking repository for testing..."

    # Instead of cloning, symlink the existing repo for faster testing
    ln -s "$REPO_ROOT" "$TEST_HOME/orient"

    if [[ ! -L "$TEST_HOME/orient" ]]; then
        fail "Failed to link repository"
    fi

    success "Repository linked from $REPO_ROOT"
}

test_initialize_database() {
    log "Initializing SQLite database..."

    cd "$TEST_HOME/orient"

    # Source environment
    set -a
    source "$TEST_HOME/.env"
    set +a

    # Create SQLite database directory
    mkdir -p "$(dirname "$SQLITE_DATABASE")"

    # Try to push schema
    if pnpm --filter @orient/database run db:push:sqlite 2>&1; then
        success "SQLite schema created"
    else
        warn "Schema push had issues (may be expected if schema already exists)"
    fi

    # Verify database file was created
    if [[ -f "$SQLITE_DATABASE" ]]; then
        local db_size=$(du -h "$SQLITE_DATABASE" | cut -f1)
        success "SQLite database created: $SQLITE_DATABASE ($db_size)"
    else
        warn "Database file not created yet (will be created on first access)"
    fi
}

test_check_tsx() {
    log "Checking tsx availability for dev mode..."

    cd "$TEST_HOME/orient"

    # tsx allows running TypeScript directly without compilation
    if pnpm exec tsx --version &>/dev/null; then
        success "tsx available for development mode"
    else
        warn "tsx not found, installing..."
        pnpm add -D tsx 2>/dev/null || true
    fi
}

test_create_pm2_config() {
    log "Creating PM2 ecosystem configuration..."

    # Get secrets from .env
    local master_key=$(grep ORIENT_MASTER_KEY "$TEST_HOME/.env" | cut -d= -f2)
    local jwt_secret=$(grep DASHBOARD_JWT_SECRET "$TEST_HOME/.env" | cut -d= -f2)

    # Use tsx to run TypeScript directly (dev mode)
    cat > "$TEST_HOME/ecosystem.config.cjs" << ECOSYSTEM
const path = require('path');
const ORIENT_HOME = '$TEST_HOME';

module.exports = {
  apps: [
    {
      name: 'orient-e2e-api',
      cwd: path.join(ORIENT_HOME, 'orient'),
      script: 'node_modules/.bin/tsx',
      args: 'packages/dashboard/src/main.ts',
      interpreter: 'none',
      env: {
        NODE_ENV: 'development',
        DATABASE_TYPE: 'sqlite',
        SQLITE_DATABASE: '$TEST_HOME/data/sqlite/orient.db',
        STORAGE_TYPE: 'local',
        STORAGE_PATH: '$TEST_HOME/data/media',
        DASHBOARD_PORT: $DASHBOARD_PORT,
        BASE_URL: 'http://localhost:$DASHBOARD_PORT',
        GOOGLE_OAUTH_CALLBACK_URL: 'http://localhost:$DASHBOARD_PORT/api/auth/google/callback',
        ORIENT_MASTER_KEY: '$master_key',
        DASHBOARD_JWT_SECRET: '$jwt_secret',
        LOG_LEVEL: 'debug',
      },
      error_file: path.join(ORIENT_HOME, 'logs/api-error.log'),
      out_file: path.join(ORIENT_HOME, 'logs/api-out.log'),
      max_memory_restart: '500M',
    },
    {
      name: 'orient-e2e-frontend',
      cwd: path.join(ORIENT_HOME, 'orient/packages/dashboard-frontend'),
      script: 'node_modules/.bin/vite',
      args: '--port $VITE_PORT',
      interpreter: 'none',
      env: {
        VITE_PORT: $VITE_PORT,
        DASHBOARD_PORT: $DASHBOARD_PORT,
      },
      error_file: path.join(ORIENT_HOME, 'logs/frontend-error.log'),
      out_file: path.join(ORIENT_HOME, 'logs/frontend-out.log'),
      max_memory_restart: '300M',
    },
  ],
};
ECOSYSTEM

    if [[ ! -f "$TEST_HOME/ecosystem.config.cjs" ]]; then
        fail "Failed to create PM2 ecosystem config"
    fi

    success "PM2 ecosystem configuration created (dev mode)"
}

test_start_dashboard() {
    log "Starting dashboard service..."

    # Install PM2 if not present
    if ! command -v pm2 &>/dev/null; then
        warn "Installing PM2..."
        npm install -g pm2
    fi

    # Start dashboard via PM2
    cd "$TEST_HOME"
    pm2 start ecosystem.config.cjs

    success "Dashboard started via PM2"
}

test_wait_for_api() {
    log "Waiting for API server to be ready..."

    local max_attempts=30
    local attempt=0
    local url="http://localhost:$DASHBOARD_PORT"

    while [[ $attempt -lt $max_attempts ]]; do
        attempt=$((attempt + 1))

        # Check if API is responding
        if curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null | grep -qE "^(200|302|304)$"; then
            success "API server is ready at $url"
            return 0
        fi

        # Show progress
        printf "  Attempt %d/%d - waiting...\r" $attempt $max_attempts
        sleep 2
    done

    echo ""
    fail "API server failed to start within $((max_attempts * 2)) seconds"
}

test_wait_for_frontend() {
    log "Waiting for frontend to be ready..."

    local max_attempts=30
    local attempt=0
    local url="http://localhost:$VITE_PORT"

    while [[ $attempt -lt $max_attempts ]]; do
        attempt=$((attempt + 1))

        # Check if frontend is responding
        if curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null | grep -qE "^(200|302|304)$"; then
            success "Frontend is ready at $url"
            return 0
        fi

        # Show progress
        printf "  Attempt %d/%d - waiting...\r" $attempt $max_attempts
        sleep 2
    done

    echo ""
    fail "Frontend failed to start within $((max_attempts * 2)) seconds"
}

test_verify_database() {
    log "Verifying SQLite database..."

    local sqlite_path="$TEST_HOME/data/sqlite/orient.db"

    if [[ -f "$sqlite_path" ]]; then
        # Check file size
        local size=$(du -h "$sqlite_path" | cut -f1)
        success "Database exists: $sqlite_path ($size)"

        # Check WAL mode
        if [[ -f "${sqlite_path}-wal" ]]; then
            success "WAL mode enabled"
        fi

        # List tables using sqlite3
        if command -v sqlite3 &>/dev/null; then
            local tables=$(sqlite3 "$sqlite_path" ".tables" 2>/dev/null)
            if [[ -n "$tables" ]]; then
                info "Tables found: $(echo $tables | tr '\n' ' ')"
            fi
        fi
    else
        warn "Database file not found (may be created on first write)"
    fi
}

open_browser() {
    local url="http://localhost:$VITE_PORT"

    if [[ "$OPEN_BROWSER" == "true" ]]; then
        log "Opening browser at $url"

        if [[ "$(uname)" == "Darwin" ]]; then
            open "$url"
        elif command -v xdg-open &>/dev/null; then
            xdg-open "$url"
        else
            warn "Could not open browser automatically. Please open: $url"
        fi
    else
        info "Frontend available at: $url"
    fi
}

# ============================================
# MAIN
# ============================================

main() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║        Orient E2E Installer Test                          ║"
    echo "╠════════════════════════════════════════════════════════════╣"
    echo "║  Database:    SQLite                                      ║"
    echo "║  Storage:     Local filesystem                            ║"
    echo "║  Test ID:     $TEST_ID                                    ║"
    echo "║  Frontend:    http://localhost:$VITE_PORT                      ║"
echo "║  API:         http://localhost:$DASHBOARD_PORT                      ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""

    log "Starting E2E test..."
    echo ""

    # Run tests
    test_prerequisites
    echo ""

    test_create_directories
    echo ""

    test_create_config
    echo ""

    test_link_repo
    echo ""

    test_initialize_database
    echo ""

    test_check_tsx
    echo ""

    test_create_pm2_config
    echo ""

    test_start_dashboard
    echo ""

    test_wait_for_api
    echo ""

    test_wait_for_frontend
    echo ""

    test_verify_database
    echo ""

    # Summary
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo -e "${GREEN}E2E Test Complete!${NC}"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "  Installation directory: $TEST_HOME"
    echo "  Frontend URL:           http://localhost:$VITE_PORT"
    echo "  API URL:                http://localhost:$DASHBOARD_PORT"
    echo "  Database:               $TEST_HOME/data/sqlite/orient.db"
    echo ""

    # Open browser
    open_browser

    if [[ "$KEEP_INSTALL" == "true" ]]; then
        echo ""
        echo "  To stop services:  pm2 stop orient-e2e-api orient-e2e-frontend"
        echo "  To view logs:      pm2 logs"
        echo "  To cleanup:        rm -rf $TEST_HOME"
        echo ""
    else
        echo ""
        echo "  Press Enter to cleanup and exit, or Ctrl+C to keep running..."
        read -r
    fi
}

main "$@"
