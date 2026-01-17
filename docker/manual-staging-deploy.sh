#!/bin/bash
# Manual Staging Deployment Script
# Use this to deploy staging environment directly on OCI server
# bypassing GitHub Actions infrastructure issues

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "  Orient - Manual Staging Deployment"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Configuration
SERVER="ubuntu@152.70.172.33"
DEPLOY_DIR="/home/ubuntu/orienter"
DATA_DIR="${DEPLOY_DIR}/data"

echo "📦 Step 1: Pull latest staging branch on server"
ssh ${SERVER} << 'EOF'
  cd /home/ubuntu/orienter
  git fetch origin
  git checkout staging
  git pull origin staging
  echo "✓ Latest staging code pulled"
EOF

echo ""
echo "🔧 Step 2: Prepare directories with correct permissions"
ssh ${SERVER} << EOF
  # Create directories with sudo
  sudo mkdir -p ${DATA_DIR}/staging/whatsapp-auth
  sudo mkdir -p ${DATA_DIR}/staging/media
  sudo mkdir -p ${DEPLOY_DIR}/logs/staging

  # Fix ownership for container user (UID 1001)
  sudo chown -R 1001:1001 ${DATA_DIR}/staging
  sudo chown -R 1001:1001 ${DEPLOY_DIR}/logs/staging

  # Allow ubuntu user to manage deployment
  sudo chown -R ubuntu:ubuntu ${DEPLOY_DIR}

  echo "✓ Directories prepared"
EOF

echo ""
echo "🗄️  Step 3: Initialize staging database"
ssh ${SERVER} << 'EOF'
  cd /home/ubuntu/orienter/docker

  # Start only PostgreSQL first
  docker compose -f docker-compose.v2.yml -f docker-compose.staging.yml up -d postgres

  # Wait for PostgreSQL to be ready
  echo "Waiting for PostgreSQL to be healthy..."
  sleep 10

  # Check if database exists
  DB_EXISTS=$(docker compose -f docker-compose.v2.yml -f docker-compose.staging.yml exec -T postgres psql -U aibot -lqt | cut -d \| -f 1 | grep -w whatsapp_bot_staging | wc -l)

  if [ "$DB_EXISTS" -eq "0" ]; then
    echo "Creating staging database..."
    docker compose -f docker-compose.v2.yml -f docker-compose.staging.yml exec -T postgres psql -U aibot -c "CREATE DATABASE whatsapp_bot_staging;"
    echo "✓ Staging database created"
  else
    echo "✓ Staging database already exists"
  fi
EOF

echo ""
echo "🔑 Step 4: Configure environment variables"
ssh ${SERVER} << 'EOF'
  cd /home/ubuntu/orienter/docker

  # Check if JWT secret exists
  if ! grep -q "DASHBOARD_JWT_SECRET_STAGING" /home/ubuntu/orienter/.env 2>/dev/null; then
    echo "Adding DASHBOARD_JWT_SECRET_STAGING..."

    # Generate secure random secret
    JWT_SECRET=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)

    # Add to .env
    echo "" >> /home/ubuntu/orienter/.env
    echo "# Staging Dashboard JWT Secret (added $(date))" >> /home/ubuntu/orienter/.env
    echo "DASHBOARD_JWT_SECRET_STAGING=${JWT_SECRET}" >> /home/ubuntu/orienter/.env

    echo "✓ JWT secret added"
  else
    echo "✓ JWT secret already configured"
  fi
EOF

echo ""
echo "🐳 Step 5: Build Docker images (with no cache)"
ssh ${SERVER} << 'EOF'
  cd /home/ubuntu/orienter/docker

  echo "Building dashboard image..."
  docker compose -f docker-compose.v2.yml -f docker-compose.staging.yml build --no-cache dashboard

  echo "Building OpenCode image..."
  docker compose -f docker-compose.v2.yml -f docker-compose.staging.yml build --no-cache opencode

  echo "Building WhatsApp bot image..."
  docker compose -f docker-compose.v2.yml -f docker-compose.staging.yml build --no-cache bot-whatsapp

  echo "✓ All images built"
EOF

echo ""
echo "🚀 Step 6: Deploy staging services"
ssh ${SERVER} << 'EOF'
  cd /home/ubuntu/orienter/docker

  # Deploy all services
  docker compose -f docker-compose.v2.yml -f docker-compose.staging.yml up -d

  echo "✓ Staging services deployed"
EOF

echo ""
echo "⏳ Step 7: Wait for services to be healthy"
ssh ${SERVER} << 'EOF'
  cd /home/ubuntu/orienter/docker

  echo "Waiting 30 seconds for services to initialize..."
  sleep 30

  echo ""
  echo "Container status:"
  docker ps --filter "name=staging" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
EOF

echo ""
echo "🔍 Step 8: Verify deployment"
ssh ${SERVER} << 'EOF'
  cd /home/ubuntu/orienter/docker

  echo ""
  echo "Checking container health:"

  # Check each service
  for service in postgres minio dashboard opencode bot-whatsapp; do
    container="orienter-${service}-staging"
    if docker ps --filter "name=${container}" --filter "status=running" | grep -q ${container}; then
      echo "  ✓ ${service} is running"
    else
      echo "  ✗ ${service} is NOT running"
      echo "    Logs:"
      docker logs ${container} --tail 20
    fi
  done

  echo ""
  echo "Testing health endpoints:"

  # Test dashboard health
  if curl -f http://localhost:5098/health > /dev/null 2>&1; then
    echo "  ✓ Dashboard health check passed"
  else
    echo "  ✗ Dashboard health check failed"
  fi

  # Test OpenCode health
  if curl -f http://localhost:5099/global/health > /dev/null 2>&1; then
    echo "  ✓ OpenCode health check passed"
  else
    echo "  ✗ OpenCode health check failed"
  fi
EOF

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Deployment Complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📊 To check logs:"
echo "  ssh ${SERVER}"
echo "  cd /home/ubuntu/orienter/docker"
echo "  docker logs orienter-dashboard-staging --tail 50"
echo ""
echo "🌐 Access URLs (once DNS/SSL configured):"
echo "  Dashboard: https://staging.example.com"
echo "  OpenCode: https://staging.example.com/code"
echo ""
echo "🔧 To restart a service:"
echo "  docker compose -f docker-compose.v2.yml -f docker-compose.staging.yml restart <service>"
echo ""
