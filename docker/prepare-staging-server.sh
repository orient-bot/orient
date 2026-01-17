#!/bin/bash
# =============================================================================
# Prepare Oracle Cloud Server for Staging Deployment
# =============================================================================
# This script fixes permission issues and prepares the server for staging.
# Run this ONCE on the server before the first staging deployment.
#
# Usage (on the server):
#   curl -fsSL https://raw.githubusercontent.com/orient-code/orient/staging/docker/prepare-staging-server.sh | bash
#
# Or manually:
#   chmod +x prepare-staging-server.sh
#   ./prepare-staging-server.sh
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
DEPLOY_DIR="${HOME}/orient"
DOCKER_DIR="${DEPLOY_DIR}/docker"
DATA_DIR="${DEPLOY_DIR}/data"
LOGS_DIR="${DEPLOY_DIR}/logs"

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  Preparing Server for Staging Deployment                      ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as non-root user
if [[ $EUID -eq 0 ]]; then
   echo -e "${RED}ERROR: This script should NOT be run as root${NC}"
   echo "Run it as your regular user (e.g., ubuntu)"
   exit 1
fi

# Step 1: Create staging directories
echo -e "${BLUE}[1/6]${NC} Creating staging directories..."
sudo mkdir -p "${LOGS_DIR}/staging" 2>/dev/null || true
sudo mkdir -p "${DATA_DIR}/staging/whatsapp-auth" 2>/dev/null || true
sudo mkdir -p "${DATA_DIR}/staging/media" 2>/dev/null || true
sudo mkdir -p "${DATA_DIR}/oauth-tokens-staging" 2>/dev/null || true
echo -e "${GREEN}✓${NC} Directories created"

# Step 2: Fix ownership of entire project directory
echo -e "${BLUE}[2/6]${NC} Fixing ownership of project directory..."
sudo chown -R $(whoami):$(whoami) "${DEPLOY_DIR}" 2>/dev/null || true
echo -e "${GREEN}✓${NC} Ownership fixed for $(whoami)"

# Step 3: Fix permissions for Docker container user (1001)
echo -e "${BLUE}[3/6]${NC} Setting permissions for container user (UID 1001)..."
sudo chown -R 1001:1001 "${DATA_DIR}/staging" 2>/dev/null || true
sudo chown -R 1001:1001 "${LOGS_DIR}/staging" 2>/dev/null || true
sudo chmod -R 755 "${DATA_DIR}/staging" 2>/dev/null || true
sudo chmod -R 755 "${LOGS_DIR}/staging" 2>/dev/null || true
echo -e "${GREEN}✓${NC} Container permissions set"

# Step 4: Ensure docker directory exists and is writable
echo -e "${BLUE}[4/6]${NC} Preparing Docker configuration directory..."
mkdir -p "${DOCKER_DIR}"
chmod 755 "${DOCKER_DIR}"
echo -e "${GREEN}✓${NC} Docker directory ready"

# Step 5: Check if PostgreSQL container exists
echo -e "${BLUE}[5/6]${NC} Checking PostgreSQL status..."
if sudo docker ps -a --format '{{.Names}}' | grep -q "^orienter-postgres$"; then
    echo -e "${GREEN}✓${NC} PostgreSQL container found"

    # Check if staging database exists
    POSTGRES_USER="${POSTGRES_USER:-orient}"
    if sudo docker exec orienter-postgres psql -U "${POSTGRES_USER}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='whatsapp_bot_staging'" 2>/dev/null | grep -q 1; then
        echo -e "${GREEN}✓${NC} Staging database already exists"
    else
        echo -e "${YELLOW}!${NC} Creating staging database..."
        sudo docker exec orienter-postgres psql -U "${POSTGRES_USER}" -d postgres -c "CREATE DATABASE whatsapp_bot_staging;" 2>/dev/null || true
        sudo docker exec orienter-postgres psql -U "${POSTGRES_USER}" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE whatsapp_bot_staging TO ${POSTGRES_USER};" 2>/dev/null || true
        echo -e "${GREEN}✓${NC} Staging database created"
    fi
else
    echo -e "${YELLOW}!${NC} PostgreSQL container not found (it will be created during deployment)"
fi

# Step 6: Verify setup
echo -e "${BLUE}[6/6]${NC} Verifying setup..."
ERRORS=0

# Check directories exist and are writable
for dir in "${LOGS_DIR}/staging" "${DATA_DIR}/staging/whatsapp-auth" "${DATA_DIR}/staging/media"; do
    if [[ ! -d "$dir" ]]; then
        echo -e "${RED}✗${NC} Directory missing: $dir"
        ERRORS=$((ERRORS + 1))
    elif [[ ! -w "$dir" ]]; then
        echo -e "${RED}✗${NC} Directory not writable: $dir"
        ERRORS=$((ERRORS + 1))
    fi
done

# Check Docker is accessible
if ! sudo docker info >/dev/null 2>&1; then
    echo -e "${RED}✗${NC} Cannot access Docker daemon"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✓${NC} Docker is accessible"
fi

# Summary
echo ""
if [[ $ERRORS -eq 0 ]]; then
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✓ Server Preparation Complete!                               ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}Directory Structure:${NC}"
    tree -L 3 -d "${DEPLOY_DIR}" 2>/dev/null || find "${DEPLOY_DIR}" -type d -maxdepth 3 | sed 's|^|  |'
    echo ""
    echo -e "${GREEN}Next Steps:${NC}"
    echo "  1. Configure DNS: staging.example.com -> $(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
    echo "  2. Set up SSL: sudo certbot certonly --standalone -d staging.example.com"
    echo "  3. Deploy staging: cd ${DOCKER_DIR} && ./deploy-staging.sh deploy"
    echo "  OR trigger GitHub Actions by pushing to staging branch"
    echo ""
else
    echo -e "${RED}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ✗ Server Preparation Failed ($ERRORS errors)                    ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Please fix the errors above and run this script again"
    exit 1
fi
