#!/bin/bash
# =============================================================================
# Orient - Production Deployment Script
# =============================================================================
# Deploys the production stack with SSL and pre-built images.
#
# What runs where:
#   Docker (all): nginx:443 (SSL), postgres, minio/r2, opencode, whatsapp-bot
#
# Usage:
#   ./run.sh deploy           # Deploy with MinIO storage
#   ./run.sh deploy --r2      # Deploy with Cloudflare R2 storage
#   ./run.sh deploy stop      # Stop production stack
#   ./run.sh deploy logs      # View production logs
#   ./run.sh deploy status    # Show production status
#   ./run.sh deploy update    # Pull latest images and restart
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

# Compose files for production (SSL, pre-built images)
COMPOSE_BASE="-f docker-compose.yml -f docker-compose.prod.yml"
COMPOSE_R2="$COMPOSE_BASE -f docker-compose.r2.yml"

# Track which compose configuration is being used
USE_R2=false

log_info() {
    echo -e "${GREEN}[DEPLOY]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[DEPLOY]${NC} $1"
}

log_error() {
    echo -e "${RED}[DEPLOY]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[DEPLOY]${NC} $1"
}

get_compose_files() {
    if [ "$USE_R2" = true ]; then
        echo "$COMPOSE_R2"
    else
        echo "$COMPOSE_BASE"
    fi
}

# =============================================================================
# Pre-flight Checks
# =============================================================================

preflight_checks() {
    log_step "Running pre-flight checks..."
    
    # Check for .env file
    if [ ! -f "$PROJECT_ROOT/.env" ]; then
        log_error ".env file not found. Copy .env.example and configure it."
        exit 1
    fi
    
    # Check for SSL certificates
    if [ ! -d "$PROJECT_ROOT/certbot/conf/live" ]; then
        log_warn "SSL certificates not found in certbot/conf/live/"
        log_warn "Make sure Let's Encrypt certificates are properly configured"
    fi
    
    # Check for R2 credentials if using R2
    if [ "$USE_R2" = true ]; then
        if ! grep -q "R2_ACCESS_KEY_ID" "$PROJECT_ROOT/.env" 2>/dev/null; then
            log_error "R2 credentials not found in .env file"
            log_error "Required: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID"
            exit 1
        fi
        log_info "R2 storage mode enabled"
    fi
    
    log_info "Pre-flight checks passed"
}

# =============================================================================
# Deploy Production
# =============================================================================

deploy_production() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    if [ "$USE_R2" = true ]; then
        echo -e "${CYAN}║  Orient - Production Deployment (Cloudflare R2)      ║${NC}"
    else
        echo -e "${CYAN}║  Orient - Production Deployment (MinIO)              ║${NC}"
    fi
    echo -e "${CYAN}╠═══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║  Using pre-built images from ghcr.io with SSL enabled         ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    preflight_checks
    
    cd "$DOCKER_DIR"
    local compose_files=$(get_compose_files)
    
    log_step "Pulling latest images from ghcr.io..."
    docker compose $compose_files pull
    
    log_step "Starting production containers..."
    docker compose $compose_files up -d
    
    log_step "Waiting for services to be healthy..."
    sleep 15
    
    show_production_info
}

# =============================================================================
# Update Production (Pull and Restart)
# =============================================================================

update_production() {
    log_info "Updating production deployment..."
    
    cd "$DOCKER_DIR"
    local compose_files=$(get_compose_files)
    
    log_step "Pulling latest images..."
    docker compose $compose_files pull
    
    log_step "Restarting containers with new images..."
    docker compose $compose_files up -d
    
    log_info "Update complete"
    show_status
}

# =============================================================================
# Show Production Info
# =============================================================================

show_production_info() {
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  Production deployment is running!                            ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║  Access points (via configured domain):                       ║${NC}"
    echo -e "${GREEN}║    • https://your-domain.com/qr/        - WhatsApp QR         ║${NC}"
    echo -e "${GREEN}║    • https://your-domain.com/dashboard/ - Dashboard           ║${NC}"
    echo -e "${GREEN}║    • https://your-domain.com/opencode/  - OpenCode API        ║${NC}"
    echo -e "${GREEN}║                                                               ║${NC}"
    echo -e "${GREEN}║  Commands:                                                    ║${NC}"
    echo -e "${GREEN}║    ./run.sh deploy logs    - View production logs             ║${NC}"
    echo -e "${GREEN}║    ./run.sh deploy status  - Show production status           ║${NC}"
    echo -e "${GREEN}║    ./run.sh deploy update  - Pull and restart                 ║${NC}"
    echo -e "${GREEN}║    ./run.sh deploy stop    - Stop production                  ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# =============================================================================
# Stop Production
# =============================================================================

stop_production() {
    log_info "Stopping production deployment..."
    cd "$DOCKER_DIR"
    docker compose $COMPOSE_BASE down 2>/dev/null || docker compose $COMPOSE_R2 down 2>/dev/null || true
    log_info "Production stopped"
}

# =============================================================================
# Show Logs
# =============================================================================

show_logs() {
    cd "$DOCKER_DIR"
    echo -e "${CYAN}Tailing production logs (Ctrl+C to stop)...${NC}"
    docker compose $COMPOSE_BASE logs -f 2>/dev/null || docker compose $COMPOSE_R2 logs -f 2>/dev/null
}

# =============================================================================
# Show Status
# =============================================================================

show_status() {
    echo ""
    echo -e "${CYAN}Production Environment Status${NC}"
    echo "═══════════════════════════════════════"
    
    cd "$DOCKER_DIR"
    
    echo -e "\n${BLUE}Container Status:${NC}"
    docker compose $COMPOSE_BASE ps 2>/dev/null || docker compose $COMPOSE_R2 ps 2>/dev/null || echo "No containers running"
    
    echo -e "\n${BLUE}Health Checks:${NC}"
    
    # Check via localhost (internal)
    if curl -sf "http://localhost/health" >/dev/null 2>&1; then
        echo -e "  Nginx:        ${GREEN}healthy${NC}"
    else
        echo -e "  Nginx:        ${RED}unreachable${NC}"
    fi
    
    if docker exec orienter-opencode curl -sf "http://localhost:4099/global/health" >/dev/null 2>&1; then
        echo -e "  OpenCode:     ${GREEN}healthy${NC}"
    else
        echo -e "  OpenCode:     ${RED}unreachable${NC}"
    fi
    
    if docker exec orienter-whatsapp-bot curl -sf "http://localhost:4097/health" >/dev/null 2>&1; then
        echo -e "  WhatsApp:     ${GREEN}healthy${NC}"
    else
        echo -e "  WhatsApp:     ${RED}unreachable${NC}"
    fi
    
    if docker exec orienter-postgres pg_isready -U aibot -d whatsapp_bot >/dev/null 2>&1; then
        echo -e "  PostgreSQL:   ${GREEN}healthy${NC}"
    else
        echo -e "  PostgreSQL:   ${RED}unreachable${NC}"
    fi
    
    # Check MinIO only if not using R2
    if docker ps --format '{{.Names}}' | grep -q "orienter-minio"; then
        if curl -sf "http://localhost:9000/minio/health/live" >/dev/null 2>&1; then
            echo -e "  MinIO:        ${GREEN}healthy${NC}"
        else
            echo -e "  MinIO:        ${RED}unreachable${NC}"
        fi
    else
        echo -e "  Storage:      ${BLUE}Cloudflare R2${NC}"
    fi
    
    echo ""
}

# =============================================================================
# Main
# =============================================================================

# Parse --r2 flag from any position
for arg in "$@"; do
    if [ "$arg" = "--r2" ] || [ "$arg" = "-r2" ]; then
        USE_R2=true
    fi
done

# Remove --r2 from arguments
args=()
for arg in "$@"; do
    if [ "$arg" != "--r2" ] && [ "$arg" != "-r2" ]; then
        args+=("$arg")
    fi
done

case "${args[0]:-start}" in
    start|"")
        deploy_production
        ;;
    update)
        update_production
        ;;
    stop)
        stop_production
        ;;
    logs)
        show_logs
        ;;
    status)
        show_status
        ;;
    restart)
        stop_production
        sleep 2
        deploy_production
        ;;
    *)
        echo "Usage: ./run.sh deploy [--r2] [start|update|stop|logs|status|restart]"
        echo ""
        echo "Options:"
        echo "  --r2       Use Cloudflare R2 instead of MinIO for storage"
        echo ""
        echo "Commands:"
        echo "  start      Deploy production stack (default)"
        echo "  update     Pull latest images and restart"
        echo "  stop       Stop production stack"
        echo "  logs       View production logs"
        echo "  status     Show production status"
        echo "  restart    Stop and start again"
        exit 1
        ;;
esac




