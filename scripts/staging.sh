#!/bin/bash
# =============================================================================
# Orient - Staging Environment Script
# =============================================================================
# Starts the staging Docker stack for pre-deployment testing.
#
# What runs where:
#   Docker (all): nginx:8080/8443, postgres-staging, minio-staging,
#                 opencode-staging:5099, whatsapp-bot-staging:5097,
#                 dashboard-staging:5098
#
# Usage:
#   ./run.sh staging          # Start with local builds
#   ./run.sh staging pull     # Start with pre-built :staging images
#   ./run.sh staging stop     # Stop all staging containers
#   ./run.sh staging logs     # View staging container logs
#   ./run.sh staging status   # Show staging container status
#   ./run.sh staging clean    # Stop and remove volumes (fresh start)
# =============================================================================

set -e

# Get the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCKER_DIR="$PROJECT_ROOT/docker"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Compose files for staging mode
# Use v2 base + staging override
COMPOSE_FILES="--env-file $PROJECT_ROOT/.env -f docker-compose.v2.yml -f docker-compose.staging.yml"
COMPOSE_FILES_PROD="--env-file $PROJECT_ROOT/.env -f docker-compose.v2.yml -f docker-compose.staging.yml"

log_info() {
    echo -e "${GREEN}[STAGING]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[STAGING]${NC} $1"
}

log_error() {
    echo -e "${RED}[STAGING]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STAGING]${NC} $1"
}

# =============================================================================
# Start with Local Builds
# =============================================================================

start_local() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  Orient - Staging Environment (Local Builds)         ║${NC}"
    echo -e "${CYAN}╠═══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║  Separate database, ports, and volumes from production       ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    cd "$DOCKER_DIR"

    log_step "Building and starting staging Docker containers..."
    docker compose $COMPOSE_FILES up -d --build

    log_step "Waiting for services to be healthy..."
    sleep 10

    show_access_info
}

# =============================================================================
# Start with Pre-built Images
# =============================================================================

start_pull() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  Orient - Staging Environment (Pre-built Images)     ║${NC}"
    echo -e "${CYAN}╠═══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║  Using :staging images from ghcr.io                           ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    cd "$DOCKER_DIR"

    log_step "Pulling latest :staging images from ghcr.io..."
    docker compose $COMPOSE_FILES_PROD pull

    log_step "Starting staging Docker containers..."
    docker compose $COMPOSE_FILES_PROD up -d

    log_step "Waiting for services to be healthy..."
    sleep 10

    show_access_info
}

# =============================================================================
# Show Access Info
# =============================================================================

show_access_info() {
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  Staging environment is running!                              ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║  Access points:                                               ║${NC}"
    echo -e "${GREEN}║    • http://localhost:8080/qr/       - WhatsApp QR (staging)  ║${NC}"
    echo -e "${GREEN}║    • http://localhost:8080/          - Dashboard (staging)    ║${NC}"
    echo -e "${GREEN}║    • http://localhost:5099/          - OpenCode API (staging) ║${NC}"
    echo -e "${GREEN}║    • http://localhost:9011           - MinIO Console (staging)║${NC}"
    echo -e "${GREEN}║                                                               ║${NC}"
    echo -e "${GREEN}║  Direct container ports (bypassing nginx):                   ║${NC}"
    echo -e "${GREEN}║    • http://localhost:5097/qr        - WhatsApp (direct)      ║${NC}"
    echo -e "${GREEN}║    • http://localhost:5098/          - Dashboard (direct)     ║${NC}"
    echo -e "${GREEN}║                                                               ║${NC}"
    echo -e "${GREEN}║  Commands:                                                    ║${NC}"
    echo -e "${GREEN}║    ./run.sh staging logs    - View container logs             ║${NC}"
    echo -e "${GREEN}║    ./run.sh staging status  - Show container status           ║${NC}"
    echo -e "${GREEN}║    ./run.sh staging stop    - Stop all containers             ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# =============================================================================
# Stop Containers
# =============================================================================

stop_containers() {
    log_info "Stopping staging Docker containers..."
    cd "$DOCKER_DIR"
    docker compose $COMPOSE_FILES down 2>/dev/null || docker compose $COMPOSE_FILES_PROD down 2>/dev/null || true
    log_info "Staging containers stopped"
}

# =============================================================================
# Clean (Stop and Remove Volumes)
# =============================================================================

clean_all() {
    log_warn "This will stop all staging containers and remove volumes (staging data will be lost)"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd "$DOCKER_DIR"
        log_step "Stopping staging containers and removing volumes..."
        docker compose $COMPOSE_FILES down -v 2>/dev/null || docker compose $COMPOSE_FILES_PROD down -v 2>/dev/null || true
        log_info "Clean complete - all staging data removed"
    else
        log_info "Clean cancelled"
    fi
}

# =============================================================================
# Show Logs
# =============================================================================

show_logs() {
    cd "$DOCKER_DIR"
    echo -e "${CYAN}Tailing staging container logs (Ctrl+C to stop)...${NC}"
    docker compose $COMPOSE_FILES logs -f 2>/dev/null || docker compose $COMPOSE_FILES_PROD logs -f 2>/dev/null
}

# =============================================================================
# Show Status
# =============================================================================

show_status() {
    echo ""
    echo -e "${CYAN}Staging Environment Status${NC}"
    echo "═══════════════════════════════════════"

    cd "$DOCKER_DIR"

    echo -e "\n${BLUE}Container Status:${NC}"
    docker compose $COMPOSE_FILES ps 2>/dev/null || docker compose $COMPOSE_FILES_PROD ps 2>/dev/null || echo "No containers running"

    echo -e "\n${BLUE}Health Checks:${NC}"

    if curl -sf "http://localhost:8080/health" >/dev/null 2>&1; then
        echo -e "  Nginx (staging):     ${GREEN}healthy${NC}"
    else
        echo -e "  Nginx (staging):     ${RED}unreachable${NC}"
    fi

    if curl -sf "http://localhost:5099/global/health" >/dev/null 2>&1; then
        echo -e "  OpenCode (staging):  ${GREEN}healthy${NC}"
    else
        echo -e "  OpenCode (staging):  ${RED}unreachable${NC}"
    fi

    if curl -sf "http://localhost:5097/health" >/dev/null 2>&1; then
        echo -e "  WhatsApp (staging):  ${GREEN}healthy${NC}"
    else
        echo -e "  WhatsApp (staging):  ${RED}unreachable${NC}"
    fi

    if docker exec orienter-postgres-staging pg_isready -U aibot -d whatsapp_bot_staging >/dev/null 2>&1; then
        echo -e "  PostgreSQL (staging):${GREEN}healthy${NC}"
    else
        echo -e "  PostgreSQL (staging):${RED}unreachable${NC}"
    fi

    if curl -sf "http://localhost:9010/minio/health/live" >/dev/null 2>&1; then
        echo -e "  MinIO (staging):     ${GREEN}healthy${NC}"
    else
        echo -e "  MinIO (staging):     ${RED}unreachable${NC}"
    fi

    echo ""
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
    *)
        echo "Usage: ./run.sh staging [start|pull|stop|logs|status|clean|restart]"
        echo ""
        echo "Commands:"
        echo "  start    Start with local builds (default)"
        echo "  pull     Start with pre-built :staging images from ghcr.io"
        echo "  stop     Stop all staging containers"
        echo "  logs     View staging container logs"
        echo "  status   Show staging container status"
        echo "  clean    Stop and remove volumes (fresh start)"
        echo "  restart  Stop and start again"
        exit 1
        ;;
esac
