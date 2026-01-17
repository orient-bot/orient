#!/bin/bash
# =============================================================================
# Fix Staging Environment Variables
# =============================================================================
# This script adds missing staging environment variables to the .env file
# Run this on the Oracle Cloud server before deploying staging
#
# Usage:
#   ssh ubuntu@152.70.172.33
#   cd ~/orienter/docker
#   chmod +x fix-staging-env.sh
#   ./fix-staging-env.sh
# =============================================================================

set -e

ENV_FILE="/home/ubuntu/orienter/.env"

echo "=============================================================="
echo "  Fixing Staging Environment Variables"
echo "=============================================================="

# Backup existing .env
if [ -f "$ENV_FILE" ]; then
    cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
    echo "✓ Backed up existing .env file"
fi

# Check if DASHBOARD_JWT_SECRET_STAGING exists
if grep -q "DASHBOARD_JWT_SECRET_STAGING=" "$ENV_FILE" 2>/dev/null; then
    echo "✓ DASHBOARD_JWT_SECRET_STAGING already exists"
else
    echo "Adding DASHBOARD_JWT_SECRET_STAGING..."

    # Generate a secure random JWT secret (32 characters)
    JWT_SECRET=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)

    # Add to .env file
    echo "" >> "$ENV_FILE"
    echo "# Staging Dashboard JWT Secret (added $(date))" >> "$ENV_FILE"
    echo "DASHBOARD_JWT_SECRET_STAGING=${JWT_SECRET}" >> "$ENV_FILE"

    echo "✓ Added DASHBOARD_JWT_SECRET_STAGING to .env"
fi

echo ""
echo "=============================================================="
echo "  Environment Variable Summary"
echo "=============================================================="
grep "DASHBOARD_JWT_SECRET" "$ENV_FILE" || echo "No DASHBOARD_JWT_SECRET variables found"

echo ""
echo "=============================================================="
echo "  Next Steps"
echo "=============================================================="
echo "1. Restart the dashboard container:"
echo "   docker compose -f docker-compose.v2.yml -f docker-compose.staging.yml restart dashboard"
echo ""
echo "2. Check dashboard logs:"
echo "   docker logs orienter-dashboard-staging --tail 50"
echo ""
echo "3. Verify health:"
echo "   docker ps | grep dashboard"
echo "=============================================================="
