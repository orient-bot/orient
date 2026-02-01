#!/bin/bash
# =============================================================================
# Orient - Development Mode Script (Fast Mode with tsx)
# =============================================================================
# Starts the development environment with instant hot-reload support.
#
# FAST DEV MODE: Uses tsx for JIT TypeScript execution - NO compilation needed!
# - No initial build step (saves 30-60+ seconds)
# - Instant restarts on file changes via tsx watch
# - Direct TypeScript execution from source
#
# What runs where:
#   Docker:  nginx:80 (proxies to Vite for hot-reload), minio:9000
#   Database: SQLite (local file, no Docker container needed)
#   Native:  vite:5173, opencode:4099, whatsapp:4097
#
# Access via nginx (localhost:80):
#   /           -> Dashboard with hot-reload (proxied to Vite)
#   /qr/        -> WhatsApp QR
#   /api/       -> Dashboard API
#
# Usage:
#   ./run.sh dev          # Start development environment
#   ./run.sh dev stop     # Stop all services
#   ./run.sh dev logs     # View logs
#   ./run.sh dev status   # Show service status
# =============================================================================

set -e

# Get the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load cross-platform utilities
source "$SCRIPT_DIR/lib/platform.sh"

# Load environment variables from .env file
# Use a safer method that handles values with spaces and special characters
if [ -f "$PROJECT_ROOT/.env" ]; then
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        [[ -z "$key" || "$key" =~ ^# ]] && continue
        # Remove leading/trailing whitespace from key
        key=$(echo "$key" | xargs)
        # Skip if key is empty after trimming
        [[ -z "$key" ]] && continue
        # Remove surrounding quotes from value if present
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"
        # Export the variable
        export "$key=$value"
    done < "$PROJECT_ROOT/.env"

    # Ensure ORIENT_MASTER_KEY exists (for upgrades from older versions)
    if ! grep -q "^ORIENT_MASTER_KEY=" "$PROJECT_ROOT/.env"; then
        echo "" >> "$PROJECT_ROOT/.env"
        echo "# Secrets Encryption (auto-generated on upgrade)" >> "$PROJECT_ROOT/.env"
        local master_key=$(openssl rand -hex 32)
        echo "ORIENT_MASTER_KEY=${master_key}" >> "$PROJECT_ROOT/.env"
        export ORIENT_MASTER_KEY="$master_key"
        echo -e "\033[1;33m[DEV]\033[0m Generated ORIENT_MASTER_KEY for secrets encryption"
    fi
fi

# Load instance environment configuration (multi-instance support)
source "$SCRIPT_DIR/instance-env.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# PID files for tracking background processes
# PID_DIR is set by instance-env.sh
# Note: TSC_PID_FILE removed - we use tsx watch instead of tsc --watch
OPENCODE_PID_FILE="$PID_DIR/opencode.pid"
WHATSAPP_PID_FILE="$PID_DIR/whatsapp.pid"
SLACK_PID_FILE="$PID_DIR/slack.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
DASHBOARD_PID_FILE="$PID_DIR/dashboard.pid"

# Service flags (can be disabled via command line)
# WhatsApp defaults to enabled for instance 0, disabled for worktrees (unless --enable-whatsapp)
RUN_WHATSAPP="${WHATSAPP_ENABLED:-true}"
RUN_SLACK=true
FRESH_START=false

# LOG_DIR is set by instance-env.sh

log_info() {
    echo -e "${GREEN}[DEV]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[DEV]${NC} $1"
}

log_error() {
    echo -e "${RED}[DEV]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[DEV]${NC} $1"
}

# =============================================================================
# Helper Functions
# =============================================================================

ensure_dirs() {
    mkdir -p "$PID_DIR" "$LOG_DIR" "$DATA_DIR" "$DATA_DIR/whatsapp-auth" "$DATA_DIR/media"
}

# =============================================================================
# Mini-Apps Setup and Build
# =============================================================================

setup_miniapps_shared() {
    local apps_dir="$PROJECT_ROOT/apps"
    local shared_dir="$apps_dir/_shared"

    # Skip if no apps directory
    if [ ! -d "$apps_dir" ]; then
        return 0
    fi

    # Ensure _shared has package.json (required for TypeScript module resolution)
    if [ ! -f "$shared_dir/package.json" ]; then
        log_step "Creating apps/_shared/package.json for TypeScript resolution..."
        cat > "$shared_dir/package.json" << 'SHAREDJSON'
{
  "name": "@orient/mini-apps-shared",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zod": "^4.1.13"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "typescript": "^5.3.3"
  }
}
SHAREDJSON
        log_info "Created apps/_shared/package.json"
    fi

    # Install _shared dependencies if node_modules is missing
    if [ ! -d "$shared_dir/node_modules" ]; then
        log_step "Installing apps/_shared dependencies..."
        (cd "$shared_dir" && npm install --silent) || {
            log_warn "Failed to install _shared dependencies (mini-apps may not build)"
            return 1
        }
        log_info "Installed apps/_shared dependencies"
    fi

    return 0
}

build_miniapps() {
    local apps_dir="$PROJECT_ROOT/apps"

    # Skip if no apps directory
    if [ ! -d "$apps_dir" ]; then
        return 0
    fi

    # Ensure _shared is set up first
    setup_miniapps_shared || return 1

    log_step "Checking mini-apps for build..."

    local apps_built=0
    local apps_skipped=0
    local apps_failed=0

    # Find all app directories (exclude _shared and hidden dirs)
    for app_dir in "$apps_dir"/*/; do
        local app_name=$(basename "$app_dir")

        # Skip _shared and hidden directories
        [[ "$app_name" == "_shared" || "$app_name" == .* ]] && continue

        # Skip if no APP.yaml (not a valid mini-app)
        [ ! -f "$app_dir/APP.yaml" ] && continue

        local dist_dir="$app_dir/dist"
        local src_dir="$app_dir/src"
        local package_json="$app_dir/package.json"

        # Skip if no package.json
        [ ! -f "$package_json" ] && continue

        # Check if build is needed:
        # 1. No dist folder
        # 2. Source files newer than dist
        local needs_build=false

        if [ ! -d "$dist_dir" ] || [ ! -f "$dist_dir/index.html" ]; then
            needs_build=true
            log_info "  $app_name: needs build (no dist)"
        elif [ -d "$src_dir" ]; then
            # Check if any source file is newer than dist/index.html
            local newest_src=$(find "$src_dir" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.css" \) -newer "$dist_dir/index.html" 2>/dev/null | head -1)
            if [ -n "$newest_src" ]; then
                needs_build=true
                log_info "  $app_name: needs build (source changed)"
            fi
            # Also check _shared for changes
            local newest_shared=$(find "$apps_dir/_shared" -type f \( -name "*.ts" -o -name "*.tsx" \) -newer "$dist_dir/index.html" 2>/dev/null | head -1)
            if [ -n "$newest_shared" ]; then
                needs_build=true
                log_info "  $app_name: needs build (_shared changed)"
            fi
        fi

        if [ "$needs_build" = true ]; then
            log_step "  Building $app_name..."

            # Install dependencies if needed
            if [ ! -d "$app_dir/node_modules" ]; then
                (cd "$app_dir" && npm install --silent) || {
                    log_warn "  $app_name: failed to install dependencies"
                    apps_failed=$((apps_failed + 1))
                    continue
                }
            fi

            # Ensure tsconfig has baseUrl for proper module resolution
            if [ -f "$app_dir/tsconfig.json" ]; then
                if ! grep -q '"baseUrl"' "$app_dir/tsconfig.json"; then
                    log_info "  $app_name: adding baseUrl to tsconfig.json"
                    # Add baseUrl after the first { in compilerOptions
                    sed_inplace "$app_dir/tsconfig.json" 's/"compilerOptions": {/"compilerOptions": {\n    "baseUrl": ".",/' 2>/dev/null || true
                fi
            fi

            # Build the app
            if (cd "$app_dir" && npm run build > "$LOG_DIR/miniapp-$app_name-build.log" 2>&1); then
                log_info "  $app_name: built successfully"
                apps_built=$((apps_built + 1))
            else
                log_warn "  $app_name: build failed (see $LOG_DIR/miniapp-$app_name-build.log)"
                apps_failed=$((apps_failed + 1))
            fi
        else
            apps_skipped=$((apps_skipped + 1))
        fi
    done

    if [ $apps_built -gt 0 ] || [ $apps_failed -gt 0 ]; then
        log_info "Mini-apps: $apps_built built, $apps_skipped up-to-date, $apps_failed failed"
    elif [ $apps_skipped -gt 0 ]; then
        log_info "Mini-apps: $apps_skipped up-to-date (no rebuild needed)"
    fi

    return 0
}

is_process_running() {
    local pid_file="$1"
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

# Kill process and all its children recursively
kill_process_tree() {
    local pid="$1"
    local name="$2"
    
    if ! kill -0 "$pid" 2>/dev/null; then
        return
    fi
    
    log_info "Stopping $name (PID: $pid) and children..."
    
    # Get all child processes
    local children=$(pgrep -P "$pid" 2>/dev/null || true)
    
    # Kill children first
    for child in $children; do
        kill_process_tree "$child" "$name child"
    done
    
    # Kill the parent
    kill -TERM "$pid" 2>/dev/null || true
    
    # Wait briefly for graceful shutdown
    local wait_count=0
    while kill -0 "$pid" 2>/dev/null && [ $wait_count -lt 5 ]; do
        sleep 0.2
        wait_count=$((wait_count + 1))
    done
    
    # Force kill if still running
    if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
    fi
}

# Kill any process using a specific port
kill_port() {
    local port="$1"
    local pids=$(lsof -ti ":$port" 2>/dev/null || true)

    if [ -n "$pids" ]; then
        log_warn "Stopping process(es) on port $port: $pids"
        echo "$pids" | xargs kill -TERM 2>/dev/null || true
        sleep 0.3
        local remaining=$(lsof -ti ":$port" 2>/dev/null || true)
        if [ -n "$remaining" ]; then
            log_warn "Force killing process(es) still on port $port: $remaining"
            echo "$remaining" | xargs kill -9 2>/dev/null || true
        fi
    fi
}

# Kill processes matching a pattern
kill_by_pattern() {
    local pattern="$1"
    local name="$2"
    local pids=$(pgrep -f "$pattern" 2>/dev/null || true)
    
    if [ -n "$pids" ]; then
        log_info "Killing $name processes matching '$pattern'..."
        for pid in $pids; do
            kill_process_tree "$pid" "$name"
        done
    fi
}

kill_process() {
    local pid_file="$1"
    local name="$2"
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            kill_process_tree "$pid" "$name"
        fi
        rm -f "$pid_file"
    fi
}

wait_for_opencode() {
    log_step "Waiting for OpenCode to be ready..."
    for i in {1..60}; do
        if curl -sf "http://localhost:${OPENCODE_PORT}/global/health" >/dev/null 2>&1; then
            log_info "OpenCode is ready!"
            return 0
        fi
        sleep 1
    done
    log_error "OpenCode failed to start within 60 seconds"
    return 1
}

# Get the OpenCode binary to use
# Priority: 1) OPENCODE_BIN env var, 2) bundled binary, 3) system opencode
get_opencode_binary() {
    # Allow override via environment variable
    if [[ -n "${OPENCODE_BIN:-}" ]] && [[ -x "$OPENCODE_BIN" ]]; then
        echo "$OPENCODE_BIN"
        return 0
    fi

    # Check for bundled binary
    local os arch platform bundled_binary
    os=$(uname -s | tr '[:upper:]' '[:lower:]')
    arch=$(uname -m)
    [[ "$arch" == "arm64" || "$arch" == "aarch64" ]] && arch="arm64"
    [[ "$arch" == "x86_64" ]] && arch="x64"
    platform="${os}-${arch}"
    bundled_binary="$PROJECT_ROOT/vendor/opencode/$platform/opencode"

    if [[ -x "$bundled_binary" ]]; then
        # Verify it's not an LFS pointer (small file)
        local size
        size=$(stat -f%z "$bundled_binary" 2>/dev/null || stat -c%s "$bundled_binary" 2>/dev/null)
        if [[ "$size" -gt 1000000 ]]; then
            echo "$bundled_binary"
            return 0
        else
            log_warn "Bundled binary appears to be LFS pointer. Run 'git lfs pull'"
        fi
    fi

    # Fall back to system opencode
    if command -v opencode &> /dev/null; then
        echo "opencode"
        return 0
    fi

    log_error "OpenCode not found. Install with: ./installer/install-local.sh"
    return 1
}

wait_for_whatsapp() {
    log_step "Waiting for WhatsApp bot to be ready..."
    for i in {1..30}; do
        if curl -sf "http://localhost:${WHATSAPP_PORT}/health" >/dev/null 2>&1; then
            log_info "WhatsApp bot is ready!"
            return 0
        fi
        sleep 1
    done
    log_error "WhatsApp bot failed to start within 30 seconds"
    return 1
}

wait_for_dashboard() {
    log_step "Waiting for dashboard API to be ready..."
    local max_attempts=60
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        # Check if port is listening
        if lsof -ti ":${DASHBOARD_PORT}" >/dev/null 2>&1; then
            # Check if API endpoint responds
            if curl -sf "http://localhost:${DASHBOARD_PORT}/api/auth/setup-required" >/dev/null 2>&1; then
                log_info "Dashboard API is ready!"
                return 0
            fi
        fi
        
        # Check for startup errors in log
        if [ -f "$LOG_DIR/dashboard-dev.log" ]; then
            if grep -q "ERR_PACKAGE_PATH_NOT_EXPORTED\|Error.*module\|Failed to start" "$LOG_DIR/dashboard-dev.log" 2>/dev/null; then
                log_error "Dashboard startup error detected. Check logs: $LOG_DIR/dashboard-dev.log"
                tail -20 "$LOG_DIR/dashboard-dev.log" | grep -A 5 -B 5 "Error\|ERR" || true
                return 1
            fi
        fi
        
        attempt=$((attempt + 1))
        sleep 1
    done
    
    log_error "Dashboard API failed to start within ${max_attempts} seconds"
    if [ -f "$LOG_DIR/dashboard-dev.log" ]; then
        log_error "Last 20 lines of dashboard log:"
        tail -20 "$LOG_DIR/dashboard-dev.log"
    fi
    return 1
}

is_slack_configured() {
    # Check if Slack credentials are available
    if [ -n "$SLACK_BOT_TOKEN" ] && [ -n "$SLACK_SIGNING_SECRET" ] && [ -n "$SLACK_APP_TOKEN" ]; then
        return 0
    fi
    return 1
}

# =============================================================================
# Cleanup Orphaned Processes
# =============================================================================

cleanup_orphaned_processes() {
    log_step "Checking for orphaned processes on required ports..."
    local had_orphans=false
    
    for port in "$WHATSAPP_PORT" "$DASHBOARD_PORT" "$OPENCODE_PORT" "$VITE_PORT"; do
        local pids=$(lsof -ti ":$port" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            had_orphans=true
            log_warn "Found orphaned process on port $port (PIDs: $pids) - cleaning up..."
            kill_port "$port"
        fi
    done
    
    if [ "$had_orphans" = true ]; then
        log_info "Orphaned processes cleaned up"
        # Brief pause to ensure ports are fully released
        sleep 1
    else
        log_info "No orphaned processes found"
    fi
}

# =============================================================================
# Fresh Start (Clean Build)
# =============================================================================

fresh_start() {
    log_step "Fresh start requested - cleaning up..."

    # Stop everything forcefully
    log_info "Stopping all services..."
    "$SCRIPT_DIR/stop.sh" --force 2>/dev/null || true

    # Clean build artifacts
    log_info "Cleaning build artifacts..."
    cd "$PROJECT_ROOT"

    # Remove turbo cache (but keep dist folders for faster rebuilds)
    rm -rf .turbo node_modules/.cache 2>/dev/null || true

    # Rebuild only core packages needed for dev (using turbo for proper dependency handling)
    log_info "Rebuilding core packages..."
    pnpm turbo build --filter=@orient/core --filter=@orient-bot/database --filter=@orient-bot/database-services --filter=@orient/apps --filter=@orient/mcp-tools --filter=@orient/agents 2>&1 | tail -20 || {
        log_warn "Some packages failed to build. Dev mode may still work with tsx."
    }

    log_info "Fresh start cleanup complete!"
}

# =============================================================================
# Start Development Environment
# =============================================================================

start_dev() {
    # Handle fresh start if requested
    if [ "$FRESH_START" = true ]; then
        fresh_start
    fi

    ensure_dirs

    # Auto-create .env from .env.example if it doesn't exist
    if [ ! -f "$PROJECT_ROOT/.env" ]; then
        if [ -f "$PROJECT_ROOT/.env.example" ]; then
            log_info "Creating .env from .env.example..."
            cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"

            # Generate secure ORIENT_MASTER_KEY (64 hex characters = 256 bits)
            local master_key=$(openssl rand -hex 32)
            sed_inplace "$PROJECT_ROOT/.env" "s/ORIENT_MASTER_KEY=GENERATE_ON_INSTALL/ORIENT_MASTER_KEY=${master_key}/"
            log_info "Generated secure ORIENT_MASTER_KEY for secrets encryption"

            # Generate secure DASHBOARD_JWT_SECRET (64 hex characters)
            local jwt_secret=$(openssl rand -hex 32)
            sed_inplace "$PROJECT_ROOT/.env" "s/DASHBOARD_JWT_SECRET=dev-jwt-secret-for-local-development-only-change-in-production/DASHBOARD_JWT_SECRET=${jwt_secret}/"
            log_info "Generated secure DASHBOARD_JWT_SECRET"

            log_warn "Created .env with development defaults. Review and customize as needed."
            log_info "Tip: Configure integrations via Dashboard at http://localhost:${NGINX_PORT}/dashboard/integrations"
            # Re-source the .env file
            while IFS='=' read -r key value; do
                [[ -z "$key" || "$key" =~ ^# ]] && continue
                key=$(echo "$key" | xargs)
                [[ -z "$key" ]] && continue
                value="${value%\"}"
                value="${value#\"}"
                value="${value%\'}"
                value="${value#\'}"
                export "$key=$value"
            done < "$PROJECT_ROOT/.env"
        else
            log_error "No .env or .env.example found!"
            log_error "Please create .env manually or restore .env.example from git"
            exit 1
        fi
    fi

    # Cleanup any orphaned processes from previous sessions BEFORE starting
    cleanup_orphaned_processes

    # Display instance information
    display_instance_info

    # Generate instance-specific Nginx configuration from template
    log_step "Generating Nginx configuration for instance $AI_INSTANCE_ID..."
    envsubst '$VITE_PORT,$WHATSAPP_PORT,$DASHBOARD_PORT,$OPENCODE_PORT' < "$PROJECT_ROOT/docker/nginx-local.template.conf" > "$PROJECT_ROOT/docker/nginx-local.conf"
    log_info "Nginx config generated: docker/nginx-local.conf"

    # Step 1: Start Docker infrastructure
    log_step "Starting Docker infrastructure..."
    cd "$PROJECT_ROOT/docker"
    if ! docker compose -f docker-compose.infra.yml up -d 2>&1 | tee /tmp/docker-compose-output.txt; then
        if grep -q "already in use" /tmp/docker-compose-output.txt; then
            log_error "Docker container name conflict detected!"
            log_error "This happens when containers exist from a previous run that wasn't fully cleaned up."
            log_error ""
            log_error "To fix this, run:"
            log_error "  ./run.sh stop --force && ./run.sh dev"
            log_error ""
            log_error "This will remove the old containers and start fresh."
            rm -f /tmp/docker-compose-output.txt
            exit 1
        fi
        # Some other docker compose error
        cat /tmp/docker-compose-output.txt
        rm -f /tmp/docker-compose-output.txt
        exit 1
    fi
    rm -f /tmp/docker-compose-output.txt
    cd "$PROJECT_ROOT"

    # Step 2: Initialize database schema (SQLite, migrations + agent seed)
    log_step "Initializing database schema..."
    if [ -f "$PROJECT_ROOT/scripts/init-db.sh" ]; then
        "$PROJECT_ROOT/scripts/init-db.sh" || {
            log_warn "Database initialization had issues (continuing anyway)"
        }
    else
        log_warn "init-db.sh not found, skipping database initialization"
    fi

    # Note: No TypeScript build step needed!
    # We use tsx for JIT TypeScript execution - saves 30-60+ seconds
    log_info "Skipping TypeScript build (using tsx for instant dev mode)"

    # Step 2c: Build mini-apps if needed
    build_miniapps || {
        log_warn "Mini-app build had issues (continuing anyway)"
    }

    # Step 3: Start frontend dev server with hot-reload
    log_step "Starting frontend dev server (Vite)..."
    cd "$PROJECT_ROOT"
    pnpm --filter @orient-bot/dashboard-frontend run dev > "$LOG_DIR/frontend-dev.log" 2>&1 &
    echo $! > "$FRONTEND_PID_FILE"
    log_info "Frontend dev server started (PID: $(cat $FRONTEND_PID_FILE))"

    # Step 3b: Start dashboard API server (Express)
    log_step "Starting dashboard API server..."
    cd "$PROJECT_ROOT"
    
    # Ensure database package is built (required for module resolution with tsx)
    if [ ! -f "packages/database/dist/index.js" ]; then
        log_warn "Database package not built, building now..."
        pnpm --filter @orient-bot/database build || {
            log_error "Failed to build database package"
            return 1
        }
    fi
    
    # Ensure database-services package is built (it imports from database)
    if [ ! -f "packages/database-services/dist/index.js" ]; then
        log_warn "Database-services package not built, building now..."
        pnpm --filter @orient-bot/database-services build || {
            log_error "Failed to build database-services package"
            return 1
        }
    fi

    # Ensure apps package is built (required for storage capabilities in mini-apps)
    if [ ! -f "packages/apps/dist/types.js" ]; then
        log_warn "Apps package not built, building now..."
        pnpm --filter @orient/apps build || {
            log_error "Failed to build apps package"
            return 1
        }
    fi

    # Start dashboard using pnpm (handles workspace resolution better than direct tsx)
    # Run from project root to ensure proper workspace resolution
    pnpm --filter @orient-bot/dashboard dev > "$LOG_DIR/dashboard-dev.log" 2>&1 &
    echo $! > "$DASHBOARD_PID_FILE"
    log_info "Dashboard API server started (PID: $(cat $DASHBOARD_PID_FILE))"
    
    # Wait for dashboard to be ready and verify it's actually running
    if ! wait_for_dashboard; then
        log_error "Dashboard failed to start. Check logs: $LOG_DIR/dashboard-dev.log"
        log_error "Common issues:"
        log_error "  1. Database package not built - run: pnpm --filter @orient-bot/database build"
        log_error "  2. Module resolution issues - try: pnpm install"
        log_error "  3. Port already in use - check: lsof -i :${DASHBOARD_PORT}"
        return 1
    fi

    # Reload apps cache to pick up any newly built mini-apps
    if curl -sf -X POST "http://localhost:${DASHBOARD_PORT}/api/apps/reload" >/dev/null 2>&1; then
        log_info "Mini-apps cache refreshed"
    fi

    # Step 4: Start OpenCode server (dashboard must be ready first)
    log_step "Starting OpenCode server..."
    # Use local config if it exists
    if [ -f "$PROJECT_ROOT/opencode.local.json" ]; then
        export OPENCODE_CONFIG="$PROJECT_ROOT/opencode.local.json"
    fi
    # Use bundled binary if available, otherwise fall back to system opencode
    local opencode_bin
    opencode_bin=$(get_opencode_binary) || { log_error "Failed to find OpenCode binary"; return 1; }
    log_info "Using OpenCode binary: $opencode_bin"
    local opencode_version
    opencode_version=$("$opencode_bin" --version 2>&1 | tail -1)
    log_info "OpenCode version: $opencode_version"
    # Bind to 127.0.0.1 for local dev - only localhost can reach OpenCode
    # This avoids network exposure and removes need for password auth
    "$opencode_bin" serve --port "$OPENCODE_PORT" --hostname 127.0.0.1 > "$LOG_DIR/opencode-dev.log" 2>&1 &
    echo $! > "$OPENCODE_PID_FILE"
    log_info "OpenCode started (PID: $(cat $OPENCODE_PID_FILE))"

    # Step 5: Wait for OpenCode
    wait_for_opencode

    # Step 6: Start WhatsApp bot with tsx watch (instant hot-reload)

    # Set environment variables for local development
    # (DATABASE_URL, AWS_ENDPOINT_URL, and S3_BUCKET are already set by instance-env.sh)
    export NODE_ENV="development"
    export OPENCODE_URL="http://localhost:${OPENCODE_PORT}"
    export OPENCODE_SERVER_URL="http://localhost:${OPENCODE_PORT}"
    export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-minioadmin}"
    export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-minioadmin123}"
    # Avoid starting the legacy dashboard inside the WhatsApp bot.
    # The dashboard API is already started via @orient-bot/dashboard.
    export DASHBOARD_ENABLED="false"

    # Step 5b: Load secrets from database into environment
    # This makes secrets saved via the dashboard available to bots
    if [ -f "$PROJECT_ROOT/scripts/load-secrets.ts" ]; then
        log_step "Loading secrets from database..."
        local secrets_output
        # Filter to only export lines (script may output logger messages to stdout)
        if secrets_output=$(cd "$PROJECT_ROOT" && npx tsx scripts/load-secrets.ts 2>/dev/null | grep "^export "); then
            eval "$secrets_output"
            local secret_count=$(echo "$secrets_output" | wc -l | tr -d ' ')
            log_info "Loaded $secret_count secrets from database"
        else
            log_info "Loaded 0 secrets from database"
        fi
    fi

    # Run with tsx watch for instant hot-reload (JIT TypeScript execution)
    # - No compilation step needed - tsx executes TypeScript directly
    # - Watches src/ and packages/ for changes, restarts on any .ts change
    # - Much faster than nodemon + tsc --watch
    if [ "$RUN_WHATSAPP" = true ]; then
        log_step "Starting WhatsApp bot with tsx watch..."
        npx tsx watch --clear-screen=false packages/bot-whatsapp/src/main.ts > "$LOG_DIR/whatsapp-dev.log" 2>&1 &
        echo $! > "$WHATSAPP_PID_FILE"
        log_info "WhatsApp bot started with tsx watch (PID: $(cat $WHATSAPP_PID_FILE))"
        
        # Wait for WhatsApp bot to be ready before continuing
        wait_for_whatsapp
    else
        if [ "$AI_INSTANCE_ID" != "0" ]; then
            log_warn "WhatsApp bot disabled in worktree (use --enable-whatsapp to override)"
        else
            log_warn "WhatsApp bot disabled (--no-whatsapp)"
        fi
    fi

    # Step 7: Start Slack bot if configured
    if [ "$RUN_SLACK" = true ] && is_slack_configured; then
        log_step "Starting Slack bot with tsx watch..."
        npx tsx watch --clear-screen=false packages/bot-slack/src/main.ts > "$LOG_DIR/slack-dev.log" 2>&1 &
        echo $! > "$SLACK_PID_FILE"
        log_info "Slack bot started with tsx watch (PID: $(cat $SLACK_PID_FILE))"
    elif [ "$RUN_SLACK" = true ]; then
        log_warn "Slack bot not started (SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_APP_TOKEN not set)"
    else
        log_warn "Slack bot disabled (--no-slack)"
    fi
    
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  Development environment is running!                          ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║  Access points:                                               ║${NC}"
    printf "${GREEN}║    • http://localhost:%-6s      - Dashboard (hot-reload!)    ║${NC}\n" "$NGINX_PORT"
    if [ "$RUN_WHATSAPP" = true ]; then
    printf "${GREEN}║    • http://localhost:%-6s/qr/  - WhatsApp QR                ║${NC}\n" "$NGINX_PORT"
    fi
    printf "${GREEN}║    • http://localhost:%-6s      - OpenCode (direct)          ║${NC}\n" "$OPENCODE_PORT"
    printf "${GREEN}║    • http://localhost:%-6s      - MinIO Console              ║${NC}\n" "$MINIO_CONSOLE_PORT"
    echo -e "${GREEN}║                                                               ║${NC}"
    echo -e "${GREEN}║  Services:                                                    ║${NC}"
    if [ "$RUN_WHATSAPP" = true ]; then
    printf "${GREEN}║    • WhatsApp bot: running (port %-6s)                   ║${NC}\n" "$WHATSAPP_PORT"
    fi
    if [ "$RUN_SLACK" = true ] && is_slack_configured; then
    echo -e "${GREEN}║    • Slack bot: running (Socket Mode)                         ║${NC}"
    fi
    echo -e "${GREEN}║                                                               ║${NC}"
    echo -e "${GREEN}║  Hot-reload (tsx watch):                                      ║${NC}"
    echo -e "${GREEN}║    • Frontend: Edit packages/dashboard-frontend/* -> refresh   ║${NC}"
    echo -e "${GREEN}║    • Backend:  Edit src/*.ts -> instant restart (no build!)   ║${NC}"
    echo -e "${GREEN}║                                                               ║${NC}"
    printf "${GREEN}║  Logs: tail -f %s/*.log${NC}\n" "$(basename $LOG_DIR)"
    echo -e "${GREEN}║  Press Ctrl+C to stop all services                            ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Wait for processes and handle Ctrl+C
    trap 'stop_dev; exit 0' SIGINT SIGTERM
    
    # Collect all bot PIDs to monitor
    WAIT_PIDS=""
    if [ "$RUN_WHATSAPP" = true ] && [ -f "$WHATSAPP_PID_FILE" ]; then
        WAIT_PIDS="$WAIT_PIDS $(cat $WHATSAPP_PID_FILE)"
    fi
    if [ "$RUN_SLACK" = true ] && [ -f "$SLACK_PID_FILE" ]; then
        WAIT_PIDS="$WAIT_PIDS $(cat $SLACK_PID_FILE)"
    fi
    
    if [ -z "$WAIT_PIDS" ]; then
        log_warn "No bots running, press Ctrl+C to stop"
        while true; do sleep 3600; done
    else
        # Monitor all bot processes - if any exits, clean up all
        while true; do
            for pid in $WAIT_PIDS; do
                if ! kill -0 $pid 2>/dev/null; then
                    log_warn "Bot process (PID: $pid) exited, stopping all services..."
                    stop_dev
                    exit 1
                fi
            done
            sleep 2
        done
    fi
}

# =============================================================================
# Stop Development Environment
# =============================================================================

stop_dev() {
    echo ""
    log_info "Stopping development environment..."

    # Step 1: Stop tracked processes via PID files
    for pid_file in "$WHATSAPP_PID_FILE" "$SLACK_PID_FILE" "$FRONTEND_PID_FILE" "$DASHBOARD_PID_FILE" "$OPENCODE_PID_FILE"; do
        if [ -f "$pid_file" ]; then
            local pid=$(cat "$pid_file")
            local name=$(basename "$pid_file" .pid)
            kill_process_tree "$pid" "$name"
            rm -f "$pid_file"
        fi
    done

    # Step 2: Kill any tsx/node processes related to our bots
    kill_by_pattern "tsx.*watch.*whatsapp-bot" "WhatsApp tsx"
    kill_by_pattern "tsx.*watch.*slack-bot" "Slack tsx"
    kill_by_pattern "tsx.*packages/dashboard/src/main.ts" "Dashboard API"
    kill_by_pattern "tsx.*src/main.ts" "Dashboard API (tsx)"
    kill_by_pattern "pnpm.*@orient-bot/dashboard.*dev" "Dashboard API (pnpm)"
    kill_by_pattern "node.*whatsapp-bot" "WhatsApp node"
    kill_by_pattern "node.*slack-bot" "Slack node"
    kill_by_pattern "vite.*dashboard-frontend" "Vite"
    
    # Step 3: Clean up any orphaned processes on our ports
    log_step "Checking for orphaned processes on ports..."
    kill_port "$WHATSAPP_PORT"  # WhatsApp bot
    kill_port "$DASHBOARD_PORT"  # Dashboard API
    kill_port "$OPENCODE_PORT"  # OpenCode
    kill_port "$VITE_PORT"  # Vite dev server

    # Step 4: Stop Docker infrastructure
    log_step "Stopping Docker infrastructure..."
    cd "$PROJECT_ROOT/docker"
    docker compose -p "$COMPOSE_PROJECT_NAME" -f docker-compose.infra.yml down --remove-orphans 2>/dev/null || true
    cd "$PROJECT_ROOT"

    # Step 5: Clean up PID directory
    rm -f "$PID_DIR"/*.pid 2>/dev/null || true

    log_info "Development environment stopped"
    
    # Final verification
    local remaining=""
    for port in "$WHATSAPP_PORT" "$DASHBOARD_PORT" "$OPENCODE_PORT" "$VITE_PORT"; do
        if lsof -ti ":$port" >/dev/null 2>&1; then
            remaining="$remaining $port"
        fi
    done

    if [ -n "$remaining" ]; then
        log_warn "Warning: Ports still in use:$remaining"
        log_warn "You may need to manually kill these processes"
    else
        log_info "All instance $AI_INSTANCE_ID ports are free"
    fi
}

# =============================================================================
# Show Logs
# =============================================================================

show_logs() {
    echo -e "${CYAN}Tailing development logs (Ctrl+C to stop)...${NC}"
    tail -f "$LOG_DIR/whatsapp-dev.log" "$LOG_DIR/frontend-dev.log" "$LOG_DIR/opencode-dev.log" 2>/dev/null
}

# =============================================================================
# Show Status
# =============================================================================

show_status() {
    echo ""
    echo -e "${CYAN}Development Environment Status${NC}"
    echo "═══════════════════════════════════════"
    
    # Check Docker containers
    echo -e "\n${BLUE}Docker Containers (Instance $AI_INSTANCE_ID):${NC}"
    if docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "orienter-.*-${AI_INSTANCE_ID}" 2>/dev/null; then
        :
    else
        echo "  No instance $AI_INSTANCE_ID containers running"
    fi
    
    # Check native processes
    echo -e "\n${BLUE}Native Processes:${NC}"

    if is_process_running "$FRONTEND_PID_FILE"; then
        echo -e "  Frontend (Vite):  ${GREEN}running${NC} (PID: $(cat $FRONTEND_PID_FILE))"
    else
        echo -e "  Frontend (Vite):  ${RED}stopped${NC}"
    fi

    if is_process_running "$DASHBOARD_PID_FILE"; then
        echo -e "  Dashboard API:    ${GREEN}running${NC} (PID: $(cat $DASHBOARD_PID_FILE))"
    else
        echo -e "  Dashboard API:    ${RED}stopped${NC}"
    fi

    if is_process_running "$OPENCODE_PID_FILE"; then
        echo -e "  OpenCode:         ${GREEN}running${NC} (PID: $(cat $OPENCODE_PID_FILE))"
    else
        echo -e "  OpenCode:         ${RED}stopped${NC}"
    fi

    if is_process_running "$WHATSAPP_PID_FILE"; then
        echo -e "  WhatsApp bot:     ${GREEN}running${NC} (PID: $(cat $WHATSAPP_PID_FILE))"
    else
        echo -e "  WhatsApp bot:     ${RED}stopped${NC}"
    fi

    if is_process_running "$SLACK_PID_FILE"; then
        echo -e "  Slack bot:        ${GREEN}running${NC} (PID: $(cat $SLACK_PID_FILE))"
    elif is_slack_configured; then
        echo -e "  Slack bot:        ${RED}stopped${NC}"
    else
        echo -e "  Slack bot:        ${YELLOW}not configured${NC}"
    fi
    
    # Check endpoints
    echo -e "\n${BLUE}Endpoints:${NC}"
    if curl -sf "http://localhost:$NGINX_PORT/" >/dev/null 2>&1; then
        echo -e "  Dashboard ($NGINX_PORT):     ${GREEN}healthy${NC} (hot-reload via nginx)"
    else
        echo -e "  Dashboard ($NGINX_PORT):     ${RED}unreachable${NC}"
    fi

    if curl -sf "http://localhost:$VITE_PORT" >/dev/null 2>&1; then
        echo -e "  Vite ($VITE_PORT):      ${GREEN}healthy${NC}"
    else
        echo -e "  Vite ($VITE_PORT):      ${RED}unreachable${NC}"
    fi

    if curl -sf "http://localhost:$DASHBOARD_PORT/api/auth/setup-required" >/dev/null 2>&1; then
        echo -e "  Dashboard API ($DASHBOARD_PORT): ${GREEN}healthy${NC}"
    else
        echo -e "  Dashboard API ($DASHBOARD_PORT): ${RED}unhealthy${NC}"
        if [ -f "$LOG_DIR/dashboard-dev.log" ]; then
            local last_error=$(tail -10 "$LOG_DIR/dashboard-dev.log" | grep -i "error\|failed\|err" | tail -1)
            if [ -n "$last_error" ]; then
                echo -e "    ${YELLOW}Last error: ${last_error:0:80}...${NC}"
            fi
        fi
    fi

    if curl -sf "http://localhost:$OPENCODE_PORT/global/health" >/dev/null 2>&1; then
        echo -e "  OpenCode ($OPENCODE_PORT):  ${GREEN}healthy${NC}"
    else
        echo -e "  OpenCode ($OPENCODE_PORT):  ${RED}unreachable${NC}"
    fi

    if curl -sf "http://localhost:$WHATSAPP_PORT/health" >/dev/null 2>&1; then
        echo -e "  WhatsApp ($WHATSAPP_PORT):  ${GREEN}healthy${NC}"
    else
        echo -e "  WhatsApp ($WHATSAPP_PORT):  ${RED}unreachable${NC}"
    fi

    if curl -sf "http://localhost:$NGINX_PORT/health" >/dev/null 2>&1; then
        echo -e "  Nginx ($NGINX_PORT):       ${GREEN}healthy${NC}"
    else
        echo -e "  Nginx ($NGINX_PORT):       ${RED}unreachable${NC}"
    fi

    echo ""
}

# =============================================================================
# Main
# =============================================================================

# Get the command (first arg), but if it starts with -- it's a flag, not a command
if [[ "${1:-}" == --* ]]; then
    CMD="start"
else
    CMD="${1:-start}"
    shift || true
fi

# Parse remaining options
while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-slack)
            RUN_SLACK=false
            shift
            ;;
        --no-whatsapp)
            RUN_WHATSAPP=false
            shift
            ;;
        --enable-whatsapp)
            RUN_WHATSAPP=true
            shift
            ;;
        --slack-only)
            RUN_WHATSAPP=false
            RUN_SLACK=true
            shift
            ;;
        --whatsapp-only)
            RUN_WHATSAPP=true
            RUN_SLACK=false
            shift
            ;;
        --fresh)
            FRESH_START=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

case "$CMD" in
    start|"")
        start_dev
        ;;
    stop)
        stop_dev
        ;;
    logs)
        show_logs
        ;;
    status)
        show_status
        ;;
    restart)
        stop_dev
        sleep 2
        start_dev
        ;;
    *)
        echo "Usage: ./run.sh dev [start|stop|logs|status|restart] [options]"
        echo ""
        echo "Options:"
        echo "  --fresh             Clean rebuild: stop all, clear dist folders, rebuild packages"
        echo "  --no-slack          Don't start Slack bot"
        echo "  --no-whatsapp       Don't start WhatsApp bot"
        echo "  --enable-whatsapp   Enable WhatsApp in worktrees (disabled by default)"
        echo "  --slack-only        Only start Slack bot"
        echo "  --whatsapp-only     Only start WhatsApp bot"
        exit 1
        ;;
esac

