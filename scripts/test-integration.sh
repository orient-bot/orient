#!/usr/bin/env bash
#
# Integration tests for instance startup and isolation
#
# Database: SQLite (file-based, no external database server)
# WhatsApp: Integrated into Dashboard (unified server)
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

# Test helpers
assert_true() {
    local condition="$1"
    local test_name="$2"

    if eval "$condition"; then
        echo -e "${GREEN}✓${NC} $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} $test_name"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

echo "=================================="
echo "Integration Tests"
echo "=================================="
echo ""

# Source instance env
source "$PROJECT_ROOT/scripts/instance-env.sh"

echo -e "${BLUE}Current Instance Configuration:${NC}"
echo "  Instance ID: $AI_INSTANCE_ID"
echo "  Nginx Port: $NGINX_PORT"
echo "  Dashboard Port: $DASHBOARD_PORT"
echo "  Database: SQLite (${SQLITE_DB_PATH})"
echo ""

# Test 1: Environment setup
echo "Test Suite: Environment Setup"
echo "-----------------------------"

assert_true "[ -n '$AI_INSTANCE_ID' ]" "AI_INSTANCE_ID is set"
assert_true "[ -n '$NGINX_PORT' ]" "NGINX_PORT is set"
assert_true "[ -n '$DASHBOARD_PORT' ]" "DASHBOARD_PORT is set (unified with WhatsApp)"
assert_true "[ -n '$OPENCODE_PORT' ]" "OPENCODE_PORT is set"
assert_true "[ -n '$VITE_PORT' ]" "VITE_PORT is set"
assert_true "[ -n '$MINIO_API_PORT' ]" "MINIO_API_PORT is set"
assert_true "[ -n '$MINIO_CONSOLE_PORT' ]" "MINIO_CONSOLE_PORT is set"
assert_true "[ -n '$COMPOSE_PROJECT_NAME' ]" "COMPOSE_PROJECT_NAME is set"
assert_true "[ -n '$SQLITE_DB_PATH' ]" "SQLITE_DB_PATH is set"
assert_true "[ -n '$S3_BUCKET' ]" "S3_BUCKET is set"
assert_true "[ -n '$DATA_DIR' ]" "DATA_DIR is set"
assert_true "[ -n '$LOG_DIR' ]" "LOG_DIR is set"
assert_true "[ -n '$PID_DIR' ]" "PID_DIR is set"

echo ""

# Test 2: Port uniqueness
echo "Test Suite: Port Uniqueness"
echo "---------------------------"

# All ports should be unique (WhatsApp is unified with Dashboard, no PostgreSQL)
ALL_PORTS="$NGINX_PORT $DASHBOARD_PORT $OPENCODE_PORT $VITE_PORT $MINIO_API_PORT $MINIO_CONSOLE_PORT"
UNIQUE_PORTS=$(echo "$ALL_PORTS" | tr ' ' '\n' | sort -u | wc -l)
TOTAL_PORTS=$(echo "$ALL_PORTS" | wc -w)

if [ "$UNIQUE_PORTS" -eq "$TOTAL_PORTS" ]; then
    echo -e "${GREEN}✓${NC} All ports are unique ($UNIQUE_PORTS ports)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗${NC} Duplicate ports detected (unique: $UNIQUE_PORTS, total: $TOTAL_PORTS)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""

# Test 3: Port availability
echo "Test Suite: Port Availability"
echo "-----------------------------"

for port in $NGINX_PORT $DASHBOARD_PORT $OPENCODE_PORT $VITE_PORT $MINIO_API_PORT $MINIO_CONSOLE_PORT; do
    if ! lsof -ti ":$port" >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Port $port is available"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${YELLOW}⊗${NC} Port $port is already in use (may be from running instance)"
        # Don't fail the test - ports might be in use from a running instance
    fi
done

echo ""

# Test 4: Instance-specific resources
echo "Test Suite: Instance-Specific Resources"
echo "---------------------------------------"

assert_true "[[ '$COMPOSE_PROJECT_NAME' == *'$AI_INSTANCE_ID'* ]]" \
    "Compose project name includes instance ID"

assert_true "[[ '$SQLITE_DB_PATH' == *'instance-$AI_INSTANCE_ID'* ]]" \
    "SQLite database path is instance-specific"

assert_true "[[ '$S3_BUCKET' == *'$AI_INSTANCE_ID'* ]]" \
    "S3 bucket name includes instance ID"

assert_true "[[ '$DATA_DIR' == *'instance-$AI_INSTANCE_ID'* ]]" \
    "Data directory is instance-specific"

assert_true "[[ '$LOG_DIR' == *'instance-$AI_INSTANCE_ID'* ]]" \
    "Log directory is instance-specific"

assert_true "[[ '$PID_DIR' == *'instance-$AI_INSTANCE_ID'* ]]" \
    "PID directory is instance-specific"

echo ""

# Test 5: WhatsApp default behavior
echo "Test Suite: WhatsApp Configuration"
echo "----------------------------------"

if [ "$AI_INSTANCE_ID" = "0" ]; then
    assert_true "[ '$WHATSAPP_ENABLED' = 'true' ]" \
        "WhatsApp enabled by default in instance 0"
else
    assert_true "[ '$WHATSAPP_ENABLED' = 'false' ]" \
        "WhatsApp disabled by default in worktree (instance $AI_INSTANCE_ID)"
fi

echo ""

# Test 6: Docker Compose file accessibility
echo "Test Suite: File Accessibility"
echo "------------------------------"

assert_true "[ -f '$PROJECT_ROOT/docker/docker-compose.infra.yml' ]" \
    "Docker Compose file exists"

assert_true "[ -f '$PROJECT_ROOT/docker/nginx-local.template.conf' ]" \
    "Nginx template file exists"

assert_true "[ -f '$PROJECT_ROOT/scripts/instance-env.sh' ]" \
    "Instance env script exists"

assert_true "[ -x '$PROJECT_ROOT/scripts/instance-env.sh' ]" \
    "Instance env script is executable"

assert_true "[ -f '$PROJECT_ROOT/scripts/dev.sh' ]" \
    "Dev script exists"

assert_true "[ -x '$PROJECT_ROOT/scripts/dev.sh' ]" \
    "Dev script is executable"

echo ""

# Test 7: Run.sh commands
echo "Test Suite: Run Script Commands"
echo "-------------------------------"

assert_true "[ -f '$PROJECT_ROOT/run.sh' ]" \
    "run.sh exists"

assert_true "[ -x '$PROJECT_ROOT/run.sh' ]" \
    "run.sh is executable"

# Test instances command
if "$PROJECT_ROOT/run.sh" instances >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} ./run.sh instances command works"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗${NC} ./run.sh instances command failed"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""

# Test 8: Nginx config generation
echo "Test Suite: Nginx Config Generation"
echo "-----------------------------------"

# Generate nginx config (WhatsApp is unified with Dashboard)
TEMP_NGINX_CONF="/tmp/nginx-integration-test-$$.conf"
if envsubst '$VITE_PORT,$DASHBOARD_PORT,$OPENCODE_PORT' \
    < "$PROJECT_ROOT/docker/nginx-local.template.conf" > "$TEMP_NGINX_CONF" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Nginx config generation succeeds"
    TESTS_PASSED=$((TESTS_PASSED + 1))

    # Verify it's valid nginx config (basic check)
    if grep -q "upstream.*{" "$TEMP_NGINX_CONF" && grep -q "server {" "$TEMP_NGINX_CONF"; then
        echo -e "${GREEN}✓${NC} Generated Nginx config has valid structure"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} Generated Nginx config structure invalid"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
else
    echo -e "${RED}✗${NC} Nginx config generation failed"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

rm -f "$TEMP_NGINX_CONF"

echo ""

# Test 9: SQLite database path
echo "Test Suite: SQLite Database"
echo "--------------------------"

assert_true "[ -n '$SQLITE_DB_PATH' ]" "SQLITE_DB_PATH is set"

# Check that DATA_DIR exists or can be created
if mkdir -p "$(dirname "$SQLITE_DB_PATH")" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Database directory can be created"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗${NC} Cannot create database directory"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""

# Test 10: Container name conflicts
echo "Test Suite: Container Isolation"
echo "-------------------------------"

# Check for any existing containers with this instance ID (nginx and minio only - SQLite is file-based)
EXISTING_CONTAINERS=$(docker ps -a --filter "name=orienter-.*-$AI_INSTANCE_ID" --format "{{.Names}}" 2>/dev/null || true)

if [ -z "$EXISTING_CONTAINERS" ]; then
    echo -e "${GREEN}✓${NC} No existing containers for instance $AI_INSTANCE_ID"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${YELLOW}⊗${NC} Found existing containers for instance $AI_INSTANCE_ID:"
    echo "$EXISTING_CONTAINERS" | sed 's/^/    /'
    echo "  (This is OK if instance is currently running)"
fi

# Check for conflicting containers (same ports, different instance)
OTHER_NGINX=$(docker ps --filter "name=orienter-nginx-" --filter "expose=$NGINX_PORT" --format "{{.Names}}" 2>/dev/null | grep -v "orienter-nginx-$AI_INSTANCE_ID" || true)

if [ -z "$OTHER_NGINX" ]; then
    echo -e "${GREEN}✓${NC} No port conflicts with other instances"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${YELLOW}⊗${NC} Warning: Another instance may be using port $NGINX_PORT"
fi

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
    echo -e "${GREEN}All integration tests passed!${NC}"
    echo ""
    echo -e "${BLUE}Instance $AI_INSTANCE_ID is ready to run${NC}"
    echo "Start it with: ./run.sh dev"
    exit 0
fi
