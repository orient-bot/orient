#!/bin/bash
# =============================================================================
# One-Command Staging Deployment
# =============================================================================
# This script does EVERYTHING needed to deploy staging in one command.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/orient-code/orient/staging/docker/quick-deploy-staging.sh | bash
#
# What it does:
#   1. Prepares directories and permissions
#   2. Creates staging database
#   3. Pulls latest code
#   4. Authenticates with GitHub Container Registry
#   5. Pulls staging images
#   6. Deploys staging environment
#   7. Verifies health
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration
DEPLOY_DIR="${HOME}/orient"
DOCKER_DIR="${DEPLOY_DIR}/docker"
COMPOSE_FILES="-f docker-compose.v2.yml -f docker-compose.staging.yml"

# Banner
echo ""
echo -e "${CYAN}${BOLD}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║                                                                ║${NC}"
echo -e "${CYAN}${BOLD}║           Orient - Staging Deployment                 ║${NC}"
echo -e "${CYAN}${BOLD}║                                                                ║${NC}"
echo -e "${CYAN}${BOLD}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Utility functions
log_step() {
    echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} ${BOLD}$1${NC}"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_info() {
    echo -e "${CYAN}ℹ${NC} $1"
}

# Check prerequisites
log_step "Step 1/8: Checking prerequisites..."

if [[ $EUID -eq 0 ]]; then
   log_error "This script should NOT be run as root"
   exit 1
fi

if ! sudo docker info >/dev/null 2>&1; then
    log_error "Docker is not accessible"
    exit 1
fi

log_success "Prerequisites OK"
echo ""

# Prepare directories
log_step "Step 2/8: Preparing directories and permissions..."

sudo mkdir -p "${DEPLOY_DIR}/logs/staging" 2>/dev/null || true
sudo mkdir -p "${DEPLOY_DIR}/data/staging/whatsapp-auth" 2>/dev/null || true
sudo mkdir -p "${DEPLOY_DIR}/data/staging/media" 2>/dev/null || true
sudo mkdir -p "${DEPLOY_DIR}/data/oauth-tokens-staging" 2>/dev/null || true

sudo chown -R $(whoami):$(whoami) "${DEPLOY_DIR}" 2>/dev/null || true
sudo chown -R 1001:1001 "${DEPLOY_DIR}/data/staging" 2>/dev/null || true
sudo chown -R 1001:1001 "${DEPLOY_DIR}/logs/staging" 2>/dev/null || true
sudo chmod -R 755 "${DEPLOY_DIR}/data/staging" 2>/dev/null || true
sudo chmod -R 755 "${DEPLOY_DIR}/logs/staging" 2>/dev/null || true

log_success "Directories prepared"
echo ""

# Create staging database
log_step "Step 3/8: Creating staging database..."

if sudo docker ps -a --format '{{.Names}}' | grep -q "^orienter-postgres$"; then
    if sudo docker exec orienter-postgres psql -U aibot -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='whatsapp_bot_staging'" 2>/dev/null | grep -q 1; then
        log_info "Staging database already exists"
    else
        sudo docker exec orienter-postgres psql -U aibot -d postgres -c "CREATE DATABASE whatsapp_bot_staging;" 2>/dev/null || true
        sudo docker exec orienter-postgres psql -U aibot -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE whatsapp_bot_staging TO aibot;" 2>/dev/null || true
        log_success "Staging database created"
    fi
else
    log_info "PostgreSQL container will be created during deployment"
fi
echo ""

# Pull latest code
log_step "Step 4/8: Pulling latest staging code..."

cd "${DEPLOY_DIR}"
if [[ -d .git ]]; then
    git fetch origin staging >/dev/null 2>&1 || true
    git checkout staging >/dev/null 2>&1 || true
    git pull origin staging >/dev/null 2>&1 || true
    log_success "Code updated to latest staging"
else
    log_info "Not a git repository, skipping code update"
fi
echo ""

# Navigate to docker directory
cd "${DOCKER_DIR}"

# GitHub Container Registry authentication
log_step "Step 5/8: Authenticating with GitHub Container Registry..."

echo -e "${YELLOW}Note: You need a GitHub token with packages:read permission${NC}"
echo -e "${YELLOW}If you don't have one, the script will try to use existing authentication${NC}"
echo ""

if [[ -n "${GITHUB_TOKEN}" ]]; then
    echo "${GITHUB_TOKEN}" | sudo docker login ghcr.io -u "${GITHUB_USER:-$(whoami)}" --password-stdin >/dev/null 2>&1 && log_success "Authenticated with GitHub token" || log_info "Using existing authentication"
else
    log_info "No GITHUB_TOKEN found, using existing authentication"
fi
echo ""

# Pull staging images
log_step "Step 6/8: Pulling staging Docker images..."

log_info "This may take a few minutes..."
sudo docker compose $COMPOSE_FILES pull || {
    log_error "Failed to pull images. You may need to authenticate:"
    echo ""
    echo "  echo YOUR_GITHUB_TOKEN | sudo docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin"
    echo ""
    exit 1
}

log_success "Images pulled successfully"
echo ""

# Deploy staging
log_step "Step 7/8: Deploying staging environment..."

# Stop existing staging services
sudo docker compose $COMPOSE_FILES down --remove-orphans 2>/dev/null || true

# Remove lingering containers
sudo docker rm -f orienter-postgres-staging orienter-nginx-staging orienter-bot-whatsapp-staging orienter-opencode-staging orienter-dashboard-staging orienter-minio-staging 2>/dev/null || true

# Start staging services
log_info "Starting services (this takes ~30 seconds)..."
sudo docker compose --env-file "${DEPLOY_DIR}/.env" $COMPOSE_FILES up -d

log_success "Staging services started"
echo ""

# Wait for services to initialize
log_step "Step 8/8: Waiting for services to initialize..."

for i in {1..30}; do
    echo -n "."
    sleep 1
done
echo ""
echo ""

# Health checks
log_step "Verifying deployment..."
echo ""

HEALTHY=true

# Check Nginx
if curl -sf http://localhost:8080/health >/dev/null 2>&1; then
    log_success "Nginx (staging): healthy"
else
    log_error "Nginx (staging): unhealthy"
    HEALTHY=false
fi

# Check OpenCode
if curl -sf http://localhost:5099/global/health >/dev/null 2>&1; then
    log_success "OpenCode (staging): healthy"
else
    log_info "OpenCode (staging): still starting (this is normal)"
fi

# Check Dashboard
if curl -sf http://localhost:5098/health >/dev/null 2>&1; then
    log_success "Dashboard (staging): healthy"
else
    log_info "Dashboard (staging): still starting"
fi

# Check WhatsApp
if curl -sf http://localhost:5097/health >/dev/null 2>&1; then
    log_success "WhatsApp (staging): healthy"
else
    log_info "WhatsApp (staging): still starting"
fi

# Check PostgreSQL
if sudo docker exec orienter-postgres-staging pg_isready -U aibot -d whatsapp_bot_staging >/dev/null 2>&1; then
    log_success "PostgreSQL (staging): healthy"
else
    log_error "PostgreSQL (staging): unhealthy"
    HEALTHY=false
fi

echo ""

# Final status
if [[ "$HEALTHY" == "true" ]]; then
    echo -e "${GREEN}${BOLD}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}${BOLD}║                                                                ║${NC}"
    echo -e "${GREEN}${BOLD}║            ✓ STAGING DEPLOYMENT SUCCESSFUL!                    ║${NC}"
    echo -e "${GREEN}${BOLD}║                                                                ║${NC}"
    echo -e "${GREEN}${BOLD}╚════════════════════════════════════════════════════════════════╝${NC}"
else
    echo -e "${YELLOW}${BOLD}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}${BOLD}║                                                                ║${NC}"
    echo -e "${YELLOW}${BOLD}║        ⚠ STAGING DEPLOYED (some services still starting)      ║${NC}"
    echo -e "${YELLOW}${BOLD}║                                                                ║${NC}"
    echo -e "${YELLOW}${BOLD}╚════════════════════════════════════════════════════════════════╝${NC}"
fi

echo ""
echo -e "${CYAN}${BOLD}Access Staging:${NC}"
echo ""
echo -e "  ${BOLD}Direct Access (HTTP):${NC}"
echo "    Dashboard:    http://$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}'):8080/"
echo "    WhatsApp QR:  http://$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}'):8080/qr/"
echo ""
echo -e "  ${BOLD}After DNS + SSL Setup:${NC}"
echo "    Dashboard:    https://staging.example.com/"
echo "    WhatsApp QR:  https://staging.example.com/qr/"
echo "    OpenCode API: https://staging.example.com/opencode/"
echo ""
echo -e "${CYAN}${BOLD}View Logs:${NC}"
echo "    sudo docker compose -f docker-compose.v2.yml -f docker-compose.staging.yml logs -f"
echo ""
echo -e "${CYAN}${BOLD}Check Status:${NC}"
echo "    sudo docker compose -f docker-compose.v2.yml -f docker-compose.staging.yml ps"
echo ""
echo -e "${CYAN}${BOLD}Stop Staging:${NC}"
echo "    sudo docker compose -f docker-compose.v2.yml -f docker-compose.staging.yml down"
echo ""

# DNS/SSL reminder
if ! dig +short staging.example.com 2>/dev/null | grep -q "$(curl -s ifconfig.me 2>/dev/null)"; then
    echo -e "${YELLOW}${BOLD}⚠ DNS Not Configured${NC}"
    echo ""
    echo "To enable HTTPS access:"
    echo "  1. Add DNS A record: staging.example.com -> $(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
    echo "  2. Wait for DNS propagation (verify with: dig staging.example.com)"
    echo "  3. Get SSL certificate: sudo certbot certonly --standalone -d staging.example.com"
    echo "  4. Restart nginx: sudo docker restart orienter-nginx-staging"
    echo ""
fi

exit 0
