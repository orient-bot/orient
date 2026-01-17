#!/bin/bash
# =============================================================================
# Orient - Staging Deployment Script (Server-side)
# =============================================================================
# This script deploys and manages the staging environment on the Oracle Cloud
# server. It should be run on the server (not locally).
#
# Usage:
#   ./deploy-staging.sh init       # First-time setup (DNS, SSL, database)
#   ./deploy-staging.sh deploy     # Deploy/update staging
#   ./deploy-staging.sh start      # Start staging services
#   ./deploy-staging.sh stop       # Stop staging services
#   ./deploy-staging.sh restart    # Restart staging services
#   ./deploy-staging.sh logs       # View staging logs
#   ./deploy-staging.sh status     # Show staging status
#   ./deploy-staging.sh clean      # Remove staging (WARNING: deletes data!)
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
DEPLOY_DIR="${HOME}/orienter"
DOCKER_DIR="${DEPLOY_DIR}/docker"
COMPOSE_FILES="-f docker-compose.v2.yml -f docker-compose.staging.yml"
STAGING_DOMAIN="staging.example.com"
STAGING_DB="whatsapp_bot_staging"

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
# Check if running on server
# =============================================================================
check_environment() {
    if [[ ! -d "$DEPLOY_DIR" ]]; then
        log_error "Deploy directory not found: $DEPLOY_DIR"
        log_error "This script must be run on the Oracle Cloud server"
        exit 1
    fi

    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    if ! sudo docker info &> /dev/null; then
        log_error "Cannot connect to Docker daemon"
        exit 1
    fi
}

# =============================================================================
# Initialize staging environment (first-time setup)
# =============================================================================
init_staging() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  Staging Environment - First-Time Setup                       ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    log_step "Step 1: Checking DNS configuration..."
    if dig +short $STAGING_DOMAIN | grep -q "152.70.172.33"; then
        log_info "✓ DNS is configured correctly"
    else
        log_warn "⚠ DNS may not be configured for $STAGING_DOMAIN"
        log_warn "  Add A record: $STAGING_DOMAIN -> 152.70.172.33"
    fi

    log_step "Step 2: Checking SSL certificate..."
    if [[ -f "/etc/letsencrypt/live/$STAGING_DOMAIN/fullchain.pem" ]]; then
        log_info "✓ SSL certificate exists"
    else
        log_warn "⚠ SSL certificate not found"
        log_warn "  Run: sudo certbot certonly --standalone -d $STAGING_DOMAIN"
        read -p "Press Enter after configuring SSL certificate..."
    fi

    log_step "Step 3: Creating staging database..."
    if sudo docker exec orienter-postgres psql -U aibot -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$STAGING_DB'" | grep -q 1; then
        log_info "✓ Staging database already exists"
    else
        sudo docker exec orienter-postgres psql -U aibot -d postgres -c "CREATE DATABASE $STAGING_DB;"
        sudo docker exec orienter-postgres psql -U aibot -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE $STAGING_DB TO aibot;"
        log_info "✓ Created staging database: $STAGING_DB"
    fi

    log_step "Step 4: Creating staging directories..."
    mkdir -p "${DEPLOY_DIR}/data/staging/whatsapp-auth"
    mkdir -p "${DEPLOY_DIR}/data/staging/media"
    mkdir -p "${DEPLOY_DIR}/logs/staging"
    mkdir -p "${DEPLOY_DIR}/data/oauth-tokens-staging"
    log_info "✓ Directories created"

    log_step "Step 5: Setting permissions..."
    sudo chown -R $(whoami):$(whoami) "${DEPLOY_DIR}" 2>/dev/null || true
    sudo chown -R 1001:1001 "${DEPLOY_DIR}/data/staging" 2>/dev/null || true
    sudo chown -R 1001:1001 "${DEPLOY_DIR}/logs/staging" 2>/dev/null || true
    sudo chmod -R 755 "${DEPLOY_DIR}/data/staging" 2>/dev/null || true
    sudo chmod -R 755 "${DEPLOY_DIR}/logs/staging" 2>/dev/null || true
    log_info "✓ Permissions set"

    echo ""
    log_info "✅ Staging environment initialized successfully!"
    echo ""
    log_info "Next steps:"
    echo "  1. Review .env file for staging-specific variables"
    echo "  2. Run: ./deploy-staging.sh deploy"
    echo ""
}

# =============================================================================
# Deploy staging environment
# =============================================================================
deploy_staging() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  Deploying Staging Environment                                ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    cd "$DOCKER_DIR"

    log_step "Pulling latest staging images from ghcr.io..."
    sudo docker compose $COMPOSE_FILES pull

    log_step "Stopping existing staging services..."
    sudo docker compose $COMPOSE_FILES down --remove-orphans 2>/dev/null || true

    log_step "Starting staging services..."
    sudo docker compose --env-file "${DEPLOY_DIR}/.env" $COMPOSE_FILES up -d

    log_step "Waiting for services to initialize..."
    sleep 15

    log_info "✅ Staging deployment complete!"
    echo ""

    show_status
}

# =============================================================================
# Start staging services
# =============================================================================
start_staging() {
    log_info "Starting staging services..."
    cd "$DOCKER_DIR"
    sudo docker compose --env-file "${DEPLOY_DIR}/.env" $COMPOSE_FILES up -d
    log_info "✅ Staging services started"
}

# =============================================================================
# Stop staging services
# =============================================================================
stop_staging() {
    log_info "Stopping staging services..."
    cd "$DOCKER_DIR"
    sudo docker compose $COMPOSE_FILES down
    log_info "✅ Staging services stopped"
}

# =============================================================================
# Restart staging services
# =============================================================================
restart_staging() {
    log_info "Restarting staging services..."
    cd "$DOCKER_DIR"
    sudo docker compose $COMPOSE_FILES restart
    log_info "✅ Staging services restarted"
}

# =============================================================================
# Show staging logs
# =============================================================================
show_logs() {
    cd "$DOCKER_DIR"
    log_info "Showing staging logs (Ctrl+C to exit)..."
    sudo docker compose $COMPOSE_FILES logs -f
}

# =============================================================================
# Show staging status
# =============================================================================
show_status() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  STAGING ENVIRONMENT STATUS${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""

    cd "$DOCKER_DIR"

    echo -e "${BLUE}Container Status:${NC}"
    sudo docker compose $COMPOSE_FILES ps
    echo ""

    echo -e "${BLUE}Health Checks:${NC}"

    # Nginx
    if curl -sf "http://localhost:8080/health" >/dev/null 2>&1; then
        echo -e "  Nginx (staging):        ${GREEN}✓ healthy${NC}"
    else
        echo -e "  Nginx (staging):        ${RED}✗ unhealthy${NC}"
    fi

    # OpenCode
    if curl -sf "http://localhost:5099/global/health" >/dev/null 2>&1; then
        echo -e "  OpenCode (staging):     ${GREEN}✓ healthy${NC}"
    else
        echo -e "  OpenCode (staging):     ${RED}✗ unhealthy${NC}"
    fi

    # Dashboard
    if curl -sf "http://localhost:5098/health" >/dev/null 2>&1; then
        echo -e "  Dashboard (staging):    ${GREEN}✓ healthy${NC}"
    else
        echo -e "  Dashboard (staging):    ${RED}✗ unhealthy${NC}"
    fi

    # WhatsApp
    if curl -sf "http://localhost:5097/health" >/dev/null 2>&1; then
        echo -e "  WhatsApp (staging):     ${GREEN}✓ healthy${NC}"
    else
        echo -e "  WhatsApp (staging):     ${RED}✗ unhealthy${NC}"
    fi

    # PostgreSQL
    if sudo docker exec orienter-postgres-staging pg_isready -U aibot -d $STAGING_DB >/dev/null 2>&1; then
        echo -e "  PostgreSQL (staging):   ${GREEN}✓ healthy${NC}"
    else
        echo -e "  PostgreSQL (staging):   ${RED}✗ unhealthy${NC}"
    fi

    # MinIO
    if curl -sf "http://localhost:9010/minio/health/live" >/dev/null 2>&1; then
        echo -e "  MinIO (staging):        ${GREEN}✓ healthy${NC}"
    else
        echo -e "  MinIO (staging):        ${RED}✗ unhealthy${NC}"
    fi

    echo ""
    echo -e "${BLUE}Access URLs:${NC}"
    echo "  Dashboard:     https://$STAGING_DOMAIN/"
    echo "  WhatsApp QR:   https://$STAGING_DOMAIN/qr/"
    echo "  OpenCode API:  https://$STAGING_DOMAIN/opencode/"
    echo ""
}

# =============================================================================
# Clean staging environment (WARNING: deletes data!)
# =============================================================================
clean_staging() {
    echo ""
    log_warn "═══════════════════════════════════════════════════════════════"
    log_warn "  WARNING: This will DELETE all staging data!"
    log_warn "═══════════════════════════════════════════════════════════════"
    echo ""
    log_warn "This will remove:"
    echo "  - All staging containers"
    echo "  - All staging Docker volumes"
    echo "  - Staging database (whatsapp_bot_staging)"
    echo "  - Data files in ${DEPLOY_DIR}/data/staging/"
    echo ""
    read -p "Are you sure you want to continue? Type 'yes' to confirm: " -r
    echo

    if [[ "$REPLY" != "yes" ]]; then
        log_info "Clean cancelled"
        exit 0
    fi

    cd "$DOCKER_DIR"

    log_step "Stopping and removing staging containers and volumes..."
    sudo docker compose $COMPOSE_FILES down -v

    log_step "Removing staging database..."
    sudo docker exec orienter-postgres psql -U aibot -d postgres -c "DROP DATABASE IF EXISTS $STAGING_DB;" || true

    log_step "Removing staging data files..."
    rm -rf "${DEPLOY_DIR}/data/staging/"
    rm -rf "${DEPLOY_DIR}/logs/staging/"
    rm -rf "${DEPLOY_DIR}/data/oauth-tokens-staging/"

    log_info "✅ Staging environment cleaned"
}

# =============================================================================
# Show help
# =============================================================================
show_help() {
    cat << 'EOF'
╔═══════════════════════════════════════════════════════════════╗
║  Orient - Staging Deployment Script                  ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Commands:                                                    ║
║    ./deploy-staging.sh init      First-time setup             ║
║    ./deploy-staging.sh deploy    Deploy/update staging        ║
║    ./deploy-staging.sh start     Start staging services       ║
║    ./deploy-staging.sh stop      Stop staging services        ║
║    ./deploy-staging.sh restart   Restart staging services     ║
║    ./deploy-staging.sh logs      View staging logs            ║
║    ./deploy-staging.sh status    Show staging status          ║
║    ./deploy-staging.sh clean     Remove staging (deletes data)║
║    ./deploy-staging.sh help      Show this help               ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
EOF
}

# =============================================================================
# Main
# =============================================================================

check_environment

case "${1:-help}" in
    init)
        init_staging
        ;;
    deploy)
        deploy_staging
        ;;
    start)
        start_staging
        ;;
    stop)
        stop_staging
        ;;
    restart)
        restart_staging
        ;;
    logs)
        show_logs
        ;;
    status)
        show_status
        ;;
    clean)
        clean_staging
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        log_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
