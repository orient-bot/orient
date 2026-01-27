#!/usr/bin/env bash
#
# Unit tests for instance-env.sh
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
assert_equals() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"

    if [ "$expected" = "$actual" ]; then
        echo -e "${GREEN}✓${NC} $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} $test_name"
        echo "  Expected: $expected"
        echo "  Actual:   $actual"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

assert_not_empty() {
    local value="$1"
    local test_name="$2"

    if [ -n "$value" ]; then
        echo -e "${GREEN}✓${NC} $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} $test_name (value is empty)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

echo "=================================="
echo "Testing instance-env.sh"
echo "=================================="
echo ""

# Source the script to load functions
source "$PROJECT_ROOT/scripts/instance-env.sh"

# Test 1: Port calculation
echo "Test Suite: Port Calculation"
echo "----------------------------"

result=$(calculate_port 4097 0)
assert_equals "4097" "$result" "calculate_port(4097, 0) = 4097"

result=$(calculate_port 4097 1)
assert_equals "5097" "$result" "calculate_port(4097, 1) = 5097"

result=$(calculate_port 80 2)
assert_equals "2080" "$result" "calculate_port(80, 2) = 2080"

result=$(calculate_port 5432 3)
assert_equals "8432" "$result" "calculate_port(5432, 3) = 8432"

echo ""

# Test 2: Instance detection in worktree
echo "Test Suite: Instance Detection"
echo "------------------------------"

# Should detect worktree (we're in one)
current_path="$(pwd)"
if [[ "$current_path" == *"/claude-worktrees/"* ]]; then
    instance_id=$(detect_instance_id)
    assert_not_empty "$instance_id" "detect_instance_id returns value in worktree"

    # Should be between 1-9
    if [ "$instance_id" -ge 1 ] && [ "$instance_id" -le 9 ]; then
        echo -e "${GREEN}✓${NC} Instance ID in valid range (1-9): $instance_id"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} Instance ID out of range: $instance_id"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
else
    echo -e "${YELLOW}⊘${NC} Skipping worktree detection test (not in worktree)"
fi

# Test with explicit AI_INSTANCE_ID
export AI_INSTANCE_ID=5
result=$(detect_instance_id)
assert_equals "5" "$result" "detect_instance_id honors AI_INSTANCE_ID env var"
unset AI_INSTANCE_ID

echo ""

# Test 3: Configuration generation
echo "Test Suite: Configuration Generation"
echo "------------------------------------"

# Save current env
OLD_AI_INSTANCE_ID=$AI_INSTANCE_ID

# Test instance 0 configuration
unset AI_INSTANCE_ID
configure_instance

assert_equals "0" "$AI_INSTANCE_ID" "Instance 0: AI_INSTANCE_ID"
assert_equals "80" "$NGINX_PORT" "Instance 0: NGINX_PORT"
assert_equals "4097" "$WHATSAPP_PORT" "Instance 0: WHATSAPP_PORT"
assert_equals "4098" "$DASHBOARD_PORT" "Instance 0: DASHBOARD_PORT"
assert_equals "5432" "$POSTGRES_PORT" "Instance 0: POSTGRES_PORT"
assert_equals "orienter-instance-0" "$COMPOSE_PROJECT_NAME" "Instance 0: COMPOSE_PROJECT_NAME"
assert_equals "true" "$WHATSAPP_ENABLED" "Instance 0: WHATSAPP_ENABLED (should be true)"

# Check database name contains instance ID
if [[ "$POSTGRES_DB" == *"_0" ]]; then
    echo -e "${GREEN}✓${NC} Instance 0: POSTGRES_DB contains instance ID"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗${NC} Instance 0: POSTGRES_DB does not contain instance ID: $POSTGRES_DB"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""

# Test instance 1 configuration
export AI_INSTANCE_ID=1
configure_instance

assert_equals "1" "$AI_INSTANCE_ID" "Instance 1: AI_INSTANCE_ID"
assert_equals "1080" "$NGINX_PORT" "Instance 1: NGINX_PORT"
assert_equals "5097" "$WHATSAPP_PORT" "Instance 1: WHATSAPP_PORT"
assert_equals "5098" "$DASHBOARD_PORT" "Instance 1: DASHBOARD_PORT"
assert_equals "6432" "$POSTGRES_PORT" "Instance 1: POSTGRES_PORT"
assert_equals "orienter-instance-1" "$COMPOSE_PROJECT_NAME" "Instance 1: COMPOSE_PROJECT_NAME"
assert_equals "false" "$WHATSAPP_ENABLED" "Instance 1: WHATSAPP_ENABLED (should be false)"

# Check database name contains instance ID
if [[ "$POSTGRES_DB" == *"_1" ]]; then
    echo -e "${GREEN}✓${NC} Instance 1: POSTGRES_DB contains instance ID"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗${NC} Instance 1: POSTGRES_DB does not contain instance ID: $POSTGRES_DB"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Check S3 bucket name
if [[ "$S3_BUCKET" == *"-1" ]]; then
    echo -e "${GREEN}✓${NC} Instance 1: S3_BUCKET contains instance ID"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗${NC} Instance 1: S3_BUCKET does not contain instance ID: $S3_BUCKET"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Check instance directories
if [[ "$DATA_DIR" == *"instance-1"* ]]; then
    echo -e "${GREEN}✓${NC} Instance 1: DATA_DIR is instance-specific"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗${NC} Instance 1: DATA_DIR is not instance-specific: $DATA_DIR"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

if [[ "$LOG_DIR" == *"instance-1"* ]]; then
    echo -e "${GREEN}✓${NC} Instance 1: LOG_DIR is instance-specific"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗${NC} Instance 1: LOG_DIR is not instance-specific: $LOG_DIR"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Restore env
if [ -n "$OLD_AI_INSTANCE_ID" ]; then
    export AI_INSTANCE_ID=$OLD_AI_INSTANCE_ID
else
    unset AI_INSTANCE_ID
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
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi
