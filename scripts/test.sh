#!/bin/bash
# =============================================================================
# Orient - Testing Mode Script
# =============================================================================
# Starts the full Docker stack for pre-production testing.
#
# Instance Isolation:
#   Test mode uses instance 9 by default (dev mode uses instance 0).
#   This allows running both simultaneously without port conflicts.
#
#   Test mode ports (instance 9):
#     nginx:9080, postgres:14432, minio:18000/18001
#     whatsapp:13097, dashboard:13098, opencode:13099
#
# Usage:
#   ./run.sh test          # Start with local builds
#   ./run.sh test pull     # Start with pre-built images from ghcr.io
#   ./run.sh test stop     # Stop all containers
#   ./run.sh test logs     # View container logs
#   ./run.sh test status   # Show container status
#   ./run.sh test clean    # Stop and remove volumes (fresh start)
#
# Override instance:
#   AI_INSTANCE_ID=5 ./run.sh test   # Use instance 5 instead
# =============================================================================

set -e

# Get the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCKER_DIR="$PROJECT_ROOT/docker"

# Source instance environment for port/container isolation
# Test mode uses instance 9 by default to avoid conflicts with dev mode (instance 0)
# This allows test mode to run alongside dev mode
export AI_INSTANCE_ID="${AI_INSTANCE_ID:-9}"
source "$SCRIPT_DIR/instance-env.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Compose files for test mode (HTTP-only, local builds by default)
# Load .env from project root for all environment variables
# Include slack profile to start Slack bot
# Use V2 compose files with per-package builds
# Use project name flag for instance isolation
COMPOSE_FILES="--env-file $PROJECT_ROOT/.env -p $COMPOSE_PROJECT_NAME -f docker-compose.v2.yml -f docker-compose.local.yml --profile slack"
COMPOSE_FILES_PROD="--env-file $PROJECT_ROOT/.env -p $COMPOSE_PROJECT_NAME -f docker-compose.v2.yml -f docker-compose.local.yml -f docker-compose.prod.yml --profile slack"

log_info() {
    echo -e "${GREEN}[TEST]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[TEST]${NC} $1"
}

log_error() {
    echo -e "${RED}[TEST]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

# =============================================================================
# Start with Local Builds
# =============================================================================

# =============================================================================
# Apply Database Migrations
# =============================================================================

apply_migrations() {
    log_step "Applying database migrations..."

    # Use instance-aware container name
    local postgres_container="orienter-postgres-${AI_INSTANCE_ID:-0}"

    # Wait for postgres to be ready
    local max_attempts=30
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if docker exec "$postgres_container" pg_isready -U ${POSTGRES_USER:-orient} -d ${POSTGRES_DB:-whatsapp_bot_0} >/dev/null 2>&1; then
            break
        fi
        attempt=$((attempt + 1))
        sleep 1
    done

    if [ $attempt -eq $max_attempts ]; then
        log_warn "Postgres not ready after ${max_attempts} seconds, skipping migrations"
        return 1
    fi

    # Apply migrations
    for f in "$PROJECT_ROOT/data/migrations/"*.sql; do
        if [ -f "$f" ]; then
            log_info "Applying: $(basename "$f")"
            docker exec -i "$postgres_container" psql -U ${POSTGRES_USER:-orient} -d ${POSTGRES_DB:-whatsapp_bot_0} < "$f" 2>/dev/null || true
        fi
    done

    log_info "Database migrations applied"
}

start_local() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  Orient - Testing Mode (Local Builds)                ║${NC}"
    echo -e "${CYAN}╠═══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║  All services running in Docker containers (HTTP-only)        ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    cd "$DOCKER_DIR"
    
    log_step "Building and starting Docker containers..."
    docker compose $COMPOSE_FILES up -d --build
    
    log_step "Waiting for services to be healthy..."
    sleep 10
    
    # Apply database migrations
    apply_migrations
    
    show_access_info
}

# =============================================================================
# Start with Pre-built Images
# =============================================================================

start_pull() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  Orient - Testing Mode (Pre-built Images)            ║${NC}"
    echo -e "${CYAN}╠═══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║  Using images from ghcr.io (same as production)               ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    cd "$DOCKER_DIR"
    
    log_step "Pulling latest images from ghcr.io..."
    docker compose $COMPOSE_FILES_PROD pull
    
    log_step "Starting Docker containers..."
    docker compose $COMPOSE_FILES_PROD up -d
    
    log_step "Waiting for services to be healthy..."
    sleep 10
    
    # Apply database migrations
    apply_migrations
    
    show_access_info
}

# =============================================================================
# Show Access Info
# =============================================================================

show_access_info() {
    # Determine the nginx port for display
    local nginx_port="${NGINX_PORT:-80}"
    local port_suffix=""
    if [ "$nginx_port" != "80" ]; then
        port_suffix=":${nginx_port}"
    fi

    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  Testing environment is running! (Instance ${AI_INSTANCE_ID:-0})                 ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║  Access points:                                               ║${NC}"
    echo -e "${GREEN}║    • http://localhost${port_suffix}/qr/        - WhatsApp QR                ║${NC}"
    echo -e "${GREEN}║    • http://localhost${port_suffix}/dashboard/ - Dashboard                  ║${NC}"
    echo -e "${GREEN}║    • http://localhost${port_suffix}/opencode/  - OpenCode API               ║${NC}"
    echo -e "${GREEN}║    • http://localhost:${MINIO_CONSOLE_PORT:-9001}       - MinIO Console              ║${NC}"
    echo -e "${GREEN}║                                                               ║${NC}"
    echo -e "${GREEN}║  Commands:                                                    ║${NC}"
    echo -e "${GREEN}║    ./run.sh test logs    - View container logs                ║${NC}"
    echo -e "${GREEN}║    ./run.sh test status  - Show container status              ║${NC}"
    echo -e "${GREEN}║    ./run.sh test stop    - Stop all containers                ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# =============================================================================
# Stop Containers
# =============================================================================

stop_containers() {
    log_info "Stopping Docker containers..."
    cd "$DOCKER_DIR"
    docker compose $COMPOSE_FILES down 2>/dev/null || docker compose $COMPOSE_FILES_PROD down 2>/dev/null || true
    log_info "Containers stopped"
}

# =============================================================================
# Clean (Stop and Remove Volumes)
# =============================================================================

clean_all() {
    log_warn "This will stop all containers and remove volumes (data will be lost)"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd "$DOCKER_DIR"
        log_step "Stopping containers and removing volumes..."
        docker compose $COMPOSE_FILES down -v 2>/dev/null || docker compose $COMPOSE_FILES_PROD down -v 2>/dev/null || true
        log_info "Clean complete - all data removed"
    else
        log_info "Clean cancelled"
    fi
}

# =============================================================================
# Show Logs
# =============================================================================

show_logs() {
    cd "$DOCKER_DIR"
    echo -e "${CYAN}Tailing container logs (Ctrl+C to stop)...${NC}"
    docker compose $COMPOSE_FILES logs -f 2>/dev/null || docker compose $COMPOSE_FILES_PROD logs -f 2>/dev/null
}

# =============================================================================
# Show Status
# =============================================================================

show_status() {
    echo ""
    echo -e "${CYAN}Testing Environment Status (Instance ${AI_INSTANCE_ID:-0})${NC}"
    echo "═══════════════════════════════════════"

    cd "$DOCKER_DIR"

    # Use instance-aware ports and container names
    local nginx_port="${NGINX_PORT:-80}"
    local whatsapp_port="${WHATSAPP_PORT:-4097}"
    local minio_api_port="${MINIO_API_PORT:-9000}"
    local postgres_container="orienter-postgres-${AI_INSTANCE_ID:-0}"

    echo -e "\n${BLUE}Container Status:${NC}"
    docker compose $COMPOSE_FILES ps 2>/dev/null || docker compose $COMPOSE_FILES_PROD ps 2>/dev/null || echo "No containers running"

    echo -e "\n${BLUE}Health Checks:${NC}"

    if curl -sf "http://localhost:${nginx_port}/health" >/dev/null 2>&1; then
        echo -e "  Nginx:        ${GREEN}healthy${NC}"
    else
        echo -e "  Nginx:        ${RED}unreachable${NC}"
    fi

    if curl -sf "http://localhost:${nginx_port}/opencode/global/health" >/dev/null 2>&1; then
        echo -e "  OpenCode:     ${GREEN}healthy${NC}"
    else
        echo -e "  OpenCode:     ${RED}unreachable${NC}"
    fi

    if curl -sf "http://localhost:${whatsapp_port}/health" >/dev/null 2>&1; then
        echo -e "  WhatsApp:     ${GREEN}healthy${NC}"
    else
        echo -e "  WhatsApp:     ${RED}unreachable${NC}"
    fi

    if docker exec "$postgres_container" pg_isready -U ${POSTGRES_USER:-aibot} -d ${POSTGRES_DB:-whatsapp_bot_0} >/dev/null 2>&1; then
        echo -e "  PostgreSQL:   ${GREEN}healthy${NC}"
    else
        echo -e "  PostgreSQL:   ${RED}unreachable${NC}"
    fi

    if curl -sf "http://localhost:${minio_api_port}/minio/health/live" >/dev/null 2>&1; then
        echo -e "  MinIO:        ${GREEN}healthy${NC}"
    else
        echo -e "  MinIO:        ${RED}unreachable${NC}"
    fi

    echo ""
}

# =============================================================================
# Run E2E Test
# =============================================================================

run_e2e_test() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  Orient - End-to-End Test (Instance ${AI_INSTANCE_ID:-0})                     ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Use instance-aware port
    local whatsapp_port="${WHATSAPP_PORT:-4097}"

    # Check if WhatsApp bot is running
    if ! curl -sf "http://localhost:${whatsapp_port}/health" >/dev/null 2>&1; then
        log_error "WhatsApp bot is not running. Start it first with: ./run.sh test"
        exit 1
    fi

    log_step "Running E2E test..."

    # Get the admin phone JID from the QR status endpoint
    ADMIN_PHONE=$(curl -s "http://localhost:${whatsapp_port}/qr/status" | python3 -c "import sys, json; print(json.load(sys.stdin).get('adminPhone', ''))" 2>/dev/null)

    if [ -z "$ADMIN_PHONE" ]; then
        log_error "Could not get admin phone from WhatsApp bot. Make sure WhatsApp is connected."
        exit 1
    fi

    # Format as WhatsApp JID (phone@s.whatsapp.net for individual chats)
    TEST_JID="${ADMIN_PHONE}@s.whatsapp.net"
    log_info "Using test JID: $TEST_JID"

    # Call the E2E test endpoint
    RESPONSE=$(curl -s -X POST "http://localhost:${whatsapp_port}/e2e-test" \
        -H "Content-Type: application/json" \
        -d '{"jid": "'"$TEST_JID"'", "testMessage": "🧪 E2E Test from CLI - '"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}')
    
    # Check if curl succeeded
    if [ $? -ne 0 ]; then
        log_error "Failed to connect to WhatsApp bot"
        exit 1
    fi
    
    # Parse response using python for reliable JSON parsing
    SUCCESS=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null)
    MESSAGE=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('message', ''))" 2>/dev/null)
    DURATION=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('totalDuration', 0))" 2>/dev/null)
    
    echo ""
    echo -e "${BLUE}Response:${NC}"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
    echo ""
    
    if [ "$SUCCESS" = "True" ]; then
        echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║  ✅ E2E TEST PASSED                                           ║${NC}"
        echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════╣${NC}"
        echo -e "${GREEN}║  Duration: ${DURATION}ms                                              ║${NC}"
        echo -e "${GREEN}║  Check the 'Bot local' WhatsApp group for test messages       ║${NC}"
        echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
        exit 0
    else
        echo -e "${RED}╔═══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}║  ❌ E2E TEST FAILED                                           ║${NC}"
        echo -e "${RED}╠═══════════════════════════════════════════════════════════════╣${NC}"
        echo -e "${RED}║  ${MESSAGE:-Check the response above for details}${NC}"
        echo -e "${RED}╚═══════════════════════════════════════════════════════════════╝${NC}"
        exit 1
    fi
}

# Run full E2E test (WhatsApp + AI/OpenCode)
run_full_e2e_test() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  Orient - Full E2E Test (WhatsApp + AI) Instance ${AI_INSTANCE_ID:-0}          ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Use instance-aware port
    local whatsapp_port="${WHATSAPP_PORT:-4097}"

    # Check if WhatsApp bot is running
    if ! curl -sf "http://localhost:${whatsapp_port}/health" >/dev/null 2>&1; then
        log_error "WhatsApp bot is not running. Start it first with: ./run.sh test"
        exit 1
    fi

    log_step "Running full E2E test (WhatsApp + OpenCode AI)..."

    # Call the full E2E test endpoint
    RESPONSE=$(curl -s -X POST "http://localhost:${whatsapp_port}/e2e-test-full" \
        -H "Content-Type: application/json" \
        -d '{
            "testMessage": "🧪 Full E2E Test from CLI - '"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
            "aiTestMessage": "Say hello briefly to confirm AI is working."
        }')
    
    # Check if curl succeeded
    if [ $? -ne 0 ]; then
        log_error "Failed to connect to WhatsApp bot"
        exit 1
    fi
    
    # Parse response using python for reliable JSON parsing
    SUCCESS=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null)
    MESSAGE=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('message', ''))" 2>/dev/null)
    DURATION=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('totalDuration', 0))" 2>/dev/null)
    
    # Pretty print the response
    echo ""
    echo -e "${BLUE}Response:${NC}"
    echo "$RESPONSE" | python3 -m json.tool
    echo ""
    
    if [ "$SUCCESS" = "True" ]; then
        echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║  ✅ FULL E2E TEST PASSED                                      ║${NC}"
        echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════╣${NC}"
        echo -e "${GREEN}║  Duration: ${DURATION}ms                                              ║${NC}"
        echo -e "${GREEN}║  ${MESSAGE:-WhatsApp and AI tests passed}${NC}"
        echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
        exit 0
    else
        echo -e "${RED}╔═══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}║  ❌ FULL E2E TEST FAILED                                      ║${NC}"
        echo -e "${RED}╠═══════════════════════════════════════════════════════════════╣${NC}"
        echo -e "${RED}║  ${MESSAGE:-Check the response above for details}${NC}"
        echo -e "${RED}╚═══════════════════════════════════════════════════════════════╝${NC}"
        exit 1
    fi
}

# =============================================================================
# Main
# =============================================================================

case "${1:-start}" in
    start|"")
        start_local
        ;;
    pull)
        start_pull
        ;;
    stop)
        stop_containers
        ;;
    logs)
        show_logs
        ;;
    status)
        show_status
        ;;
    clean)
        clean_all
        ;;
    restart)
        stop_containers
        sleep 2
        start_local
        ;;
    e2e)
        run_e2e_test
        ;;
    e2e-full)
        run_full_e2e_test
        ;;
    *)
        echo "Usage: ./run.sh test [start|pull|stop|logs|status|clean|restart|e2e|e2e-full]"
        echo ""
        echo "Commands:"
        echo "  start    Start with local builds (default)"
        echo "  pull     Start with pre-built images from ghcr.io"
        echo "  stop     Stop all containers"
        echo "  logs     View container logs"
        echo "  status   Show container status"
        echo "  clean    Stop and remove volumes (fresh start)"
        echo "  restart  Stop and start again"
        echo "  e2e      Run end-to-end test (WhatsApp only)"
        echo "  e2e-full Run full E2E test (WhatsApp + AI/OpenCode)"
        exit 1
        ;;
esac



