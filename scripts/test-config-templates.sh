#!/usr/bin/env bash
#
# Tests for Docker Compose and Nginx configuration templatization
#
# Database: SQLite (file-based, no Docker container)
# WhatsApp: Integrated into Dashboard (unified server)
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

# Test helpers
assert_contains() {
    local haystack="$1"
    local needle="$2"
    local test_name="$3"

    if [[ "$haystack" == *"$needle"* ]]; then
        echo -e "${GREEN}✓${NC} $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} $test_name"
        echo "  Expected to contain: $needle"
        echo "  In: ${haystack:0:100}..."
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

assert_file_contains() {
    local file="$1"
    local pattern="$2"
    local test_name="$3"

    if grep -q "$pattern" "$file" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} $test_name"
        echo "  File: $file"
        echo "  Expected pattern: $pattern"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

assert_file_not_contains() {
    local file="$1"
    local pattern="$2"
    local test_name="$3"

    if ! grep -q "$pattern" "$file" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} $test_name"
        echo "  File: $file"
        echo "  Should NOT contain pattern: $pattern"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

echo "=================================="
echo "Testing Configuration Templates"
echo "=================================="
echo ""

# Test 1: Docker Compose templatization
echo "Test Suite: Docker Compose Template"
echo "-----------------------------------"

COMPOSE_FILE="$PROJECT_ROOT/docker/docker-compose.infra.yml"

assert_file_contains "$COMPOSE_FILE" 'orienter-nginx-${AI_INSTANCE_ID:-0}' \
    "Docker Compose: Nginx container uses instance ID"

assert_file_contains "$COMPOSE_FILE" '${NGINX_PORT:-80}:80' \
    "Docker Compose: Nginx port uses env var"

assert_file_contains "$COMPOSE_FILE" 'orienter-minio-${AI_INSTANCE_ID:-0}' \
    "Docker Compose: MinIO container uses instance ID"

assert_file_contains "$COMPOSE_FILE" '${MINIO_API_PORT:-9000}:9000' \
    "Docker Compose: MinIO API port uses env var"

assert_file_contains "$COMPOSE_FILE" '${MINIO_CONSOLE_PORT:-9001}:9001' \
    "Docker Compose: MinIO console port uses env var"

# Verify no PostgreSQL in infrastructure (SQLite is file-based)
assert_file_not_contains "$COMPOSE_FILE" 'postgres' \
    "Docker Compose: No PostgreSQL service (SQLite is file-based)"

# Verify MinIO bucket setup uses instance-specific bucket name
assert_file_contains "$COMPOSE_FILE" 'S3_BUCKET=${S3_BUCKET:-orienter-data-0}' \
    "Docker Compose: MinIO setup uses S3_BUCKET env var"

echo ""

# Test 2: Nginx template
echo "Test Suite: Nginx Template"
echo "--------------------------"

NGINX_TEMPLATE="$PROJECT_ROOT/docker/nginx-local.template.conf"

assert_file_contains "$NGINX_TEMPLATE" 'host.docker.internal:${VITE_PORT}' \
    "Nginx template: Vite upstream uses env var"

# Note: WhatsApp is now unified with Dashboard (no separate upstream)
assert_file_contains "$NGINX_TEMPLATE" 'host.docker.internal:${DASHBOARD_PORT}' \
    "Nginx template: Dashboard upstream uses env var (includes WhatsApp)"

assert_file_contains "$NGINX_TEMPLATE" 'host.docker.internal:${OPENCODE_PORT}' \
    "Nginx template: OpenCode upstream uses env var"

# Verify no separate WhatsApp upstream
assert_file_not_contains "$NGINX_TEMPLATE" 'WHATSAPP_PORT' \
    "Nginx template: No separate WHATSAPP_PORT (unified with Dashboard)"

echo ""

# Test 3: Nginx config generation
echo "Test Suite: Nginx Config Generation"
echo "-----------------------------------"

# Source instance env to set variables
source "$PROJECT_ROOT/scripts/instance-env.sh"

# Generate nginx config (WhatsApp is now unified with Dashboard)
TEMP_NGINX_CONF="/tmp/nginx-test-$$.conf"
envsubst '$VITE_PORT,$DASHBOARD_PORT,$OPENCODE_PORT' \
    < "$NGINX_TEMPLATE" > "$TEMP_NGINX_CONF"

# Check generated config has actual port numbers
if grep -q "host.docker.internal:[0-9]" "$TEMP_NGINX_CONF"; then
    echo -e "${GREEN}✓${NC} Generated Nginx config contains port numbers"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗${NC} Generated Nginx config missing port numbers"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Should not contain the specific template variables we substituted
if ! grep -q '\${VITE_PORT}' "$TEMP_NGINX_CONF" && \
   ! grep -q '\${DASHBOARD_PORT}' "$TEMP_NGINX_CONF" && \
   ! grep -q '\${OPENCODE_PORT}' "$TEMP_NGINX_CONF"; then
    echo -e "${GREEN}✓${NC} Generated Nginx config has no unsubstituted variables"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗${NC} Generated Nginx config still has unsubstituted variables"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Verify specific ports based on instance ID
if grep -q "host.docker.internal:$VITE_PORT" "$TEMP_NGINX_CONF"; then
    echo -e "${GREEN}✓${NC} Generated Nginx config uses correct VITE_PORT ($VITE_PORT)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗${NC} Generated Nginx config missing correct VITE_PORT"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

if grep -q "host.docker.internal:$DASHBOARD_PORT" "$TEMP_NGINX_CONF"; then
    echo -e "${GREEN}✓${NC} Generated Nginx config uses correct DASHBOARD_PORT ($DASHBOARD_PORT)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗${NC} Generated Nginx config missing correct DASHBOARD_PORT"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Cleanup
rm -f "$TEMP_NGINX_CONF"

echo ""

# Test 4: Vite config
echo "Test Suite: Vite Configuration"
echo "------------------------------"

VITE_CONFIG="$PROJECT_ROOT/packages/dashboard-frontend/vite.config.ts"

assert_file_contains "$VITE_CONFIG" 'process.env.VITE_PORT' \
    "Vite config: Uses VITE_PORT env var"

assert_file_contains "$VITE_CONFIG" 'process.env.DASHBOARD_PORT' \
    "Vite config: Uses DASHBOARD_PORT env var"

echo ""
echo "=================================="
echo "Test Results"
echo "=================================="
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
    exit 1
else
    echo "Failed: 0"
    echo ""
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi
