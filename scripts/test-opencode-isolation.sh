#!/usr/bin/env bash
#
# Unit tests for opencode-env.sh (OpenCode Isolation)
#
# Tests that OpenCode uses project-local data and does NOT load configuration
# from the user's global ~/.opencode/ or ~/.config/opencode/ directories.
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

assert_starts_with() {
    local expected_prefix="$1"
    local actual="$2"
    local test_name="$3"

    if [[ "$actual" == "$expected_prefix"* ]]; then
        echo -e "${GREEN}✓${NC} $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} $test_name"
        echo "  Expected to start with: $expected_prefix"
        echo "  Actual:                 $actual"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

assert_not_starts_with() {
    local unexpected_prefix="$1"
    local actual="$2"
    local test_name="$3"

    if [[ "$actual" != "$unexpected_prefix"* ]]; then
        echo -e "${GREEN}✓${NC} $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} $test_name"
        echo "  Should NOT start with: $unexpected_prefix"
        echo "  Actual:                $actual"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

assert_directory_exists() {
    local dir="$1"
    local test_name="$2"

    if [ -d "$dir" ]; then
        echo -e "${GREEN}✓${NC} $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} $test_name"
        echo "  Directory does not exist: $dir"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

echo "=================================="
echo "Testing opencode-env.sh"
echo "(OpenCode Isolation)"
echo "=================================="
echo ""

# Source the script to load functions
source "$PROJECT_ROOT/scripts/opencode-env.sh"

# Save original environment
OLD_OPENCODE_TEST_HOME="$OPENCODE_TEST_HOME"
OLD_XDG_DATA_HOME="$XDG_DATA_HOME"
OLD_XDG_CONFIG_HOME="$XDG_CONFIG_HOME"
OLD_XDG_CACHE_HOME="$XDG_CACHE_HOME"
OLD_XDG_STATE_HOME="$XDG_STATE_HOME"
OLD_OPENCODE_CONFIG="$OPENCODE_CONFIG"
OLD_OPENCODE_USE_GLOBAL_CONFIG="$OPENCODE_USE_GLOBAL_CONFIG"

# =============================================================================
# Test Suite 1: Isolation Configuration
# =============================================================================
echo "Test Suite: Isolation Configuration"
echo "------------------------------------"

# Clear any existing environment variables
unset OPENCODE_TEST_HOME XDG_DATA_HOME XDG_CONFIG_HOME XDG_CACHE_HOME XDG_STATE_HOME OPENCODE_CONFIG OPENCODE_USE_GLOBAL_CONFIG

# Run isolation configuration
export PROJECT_ROOT="$PROJECT_ROOT"
configure_opencode_isolation

# Test 1.1: OPENCODE_TEST_HOME is set correctly
expected_opencode_home="$PROJECT_ROOT/.opencode"
assert_equals "$expected_opencode_home" "$OPENCODE_TEST_HOME" "OPENCODE_TEST_HOME points to project .opencode"

# Test 1.2: XDG_DATA_HOME is set correctly
assert_equals "$expected_opencode_home/data" "$XDG_DATA_HOME" "XDG_DATA_HOME points to .opencode/data"

# Test 1.3: XDG_CONFIG_HOME is set correctly
assert_equals "$expected_opencode_home/config" "$XDG_CONFIG_HOME" "XDG_CONFIG_HOME points to .opencode/config"

# Test 1.4: XDG_CACHE_HOME is set correctly
assert_equals "$expected_opencode_home/cache" "$XDG_CACHE_HOME" "XDG_CACHE_HOME points to .opencode/cache"

# Test 1.5: XDG_STATE_HOME is set correctly
assert_equals "$expected_opencode_home/state" "$XDG_STATE_HOME" "XDG_STATE_HOME points to .opencode/state"

# Test 1.6: OPENCODE_CONFIG is set (should point to project config)
assert_not_empty "$OPENCODE_CONFIG" "OPENCODE_CONFIG is set"

echo ""

# =============================================================================
# Test Suite 2: XDG Variables Don't Point to Home Directory
# =============================================================================
echo "Test Suite: XDG Variables Not in Home Directory"
echo "------------------------------------------------"

# Test 2.1-2.5: XDG variables should NOT point to user's home directory
# unless they're inside the project's .opencode directory
for var in OPENCODE_TEST_HOME XDG_DATA_HOME XDG_CONFIG_HOME XDG_CACHE_HOME XDG_STATE_HOME; do
    value=""
    eval "value=\$$var"

    if [[ "$value" == "$HOME"* ]] && [[ "$value" != "$expected_opencode_home"* ]]; then
        echo -e "${RED}✗${NC} $var does NOT point to user home"
        echo "  Actual: $value (points to home directory!)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    else
        echo -e "${GREEN}✓${NC} $var does NOT point to user home"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    fi
done

echo ""

# =============================================================================
# Test Suite 3: Directory Structure Creation
# =============================================================================
echo "Test Suite: Directory Structure"
echo "-------------------------------"

# Test 3.1: Main .opencode directory exists
assert_directory_exists "$PROJECT_ROOT/.opencode" ".opencode directory exists"

# Test 3.2-3.5: Subdirectories exist
assert_directory_exists "$PROJECT_ROOT/.opencode/data/opencode/storage" ".opencode/data/opencode/storage exists"
assert_directory_exists "$PROJECT_ROOT/.opencode/config/opencode" ".opencode/config/opencode exists"
assert_directory_exists "$PROJECT_ROOT/.opencode/cache/opencode" ".opencode/cache/opencode exists"
assert_directory_exists "$PROJECT_ROOT/.opencode/state/opencode" ".opencode/state/opencode exists"

echo ""

# =============================================================================
# Test Suite 4: Opt-In for Global Config
# =============================================================================
echo "Test Suite: Global Config Opt-In"
echo "---------------------------------"

# Reset environment
unset OPENCODE_TEST_HOME XDG_DATA_HOME XDG_CONFIG_HOME XDG_CACHE_HOME XDG_STATE_HOME OPENCODE_CONFIG

# Test 4.1: With OPENCODE_USE_GLOBAL_CONFIG=true, isolation is skipped
export OPENCODE_USE_GLOBAL_CONFIG=true
configure_opencode_isolation

if [ -z "$OPENCODE_TEST_HOME" ]; then
    echo -e "${GREEN}✓${NC} With OPENCODE_USE_GLOBAL_CONFIG=true, OPENCODE_TEST_HOME is not set"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗${NC} With OPENCODE_USE_GLOBAL_CONFIG=true, OPENCODE_TEST_HOME should be empty"
    echo "  Actual: $OPENCODE_TEST_HOME"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

if [ -z "$XDG_DATA_HOME" ]; then
    echo -e "${GREEN}✓${NC} With OPENCODE_USE_GLOBAL_CONFIG=true, XDG_DATA_HOME is not set"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗${NC} With OPENCODE_USE_GLOBAL_CONFIG=true, XDG_DATA_HOME should be empty"
    echo "  Actual: $XDG_DATA_HOME"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

unset OPENCODE_USE_GLOBAL_CONFIG

echo ""

# =============================================================================
# Test Suite 5: Verification Function
# =============================================================================
echo "Test Suite: Verification Function"
echo "----------------------------------"

# Reset and configure isolation
unset OPENCODE_TEST_HOME XDG_DATA_HOME XDG_CONFIG_HOME XDG_CACHE_HOME XDG_STATE_HOME OPENCODE_CONFIG
configure_opencode_isolation

# Test 5.1: verify_opencode_isolation should pass when properly configured
if verify_opencode_isolation > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} verify_opencode_isolation passes after configure"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗${NC} verify_opencode_isolation should pass after configure"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Test 5.2: verify_opencode_isolation should fail when OPENCODE_TEST_HOME is wrong
export OPENCODE_TEST_HOME="/wrong/path"
if verify_opencode_isolation > /dev/null 2>&1; then
    echo -e "${RED}✗${NC} verify_opencode_isolation should fail with wrong OPENCODE_TEST_HOME"
    TESTS_FAILED=$((TESTS_FAILED + 1))
else
    echo -e "${GREEN}✓${NC} verify_opencode_isolation correctly detects wrong OPENCODE_TEST_HOME"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi

echo ""

# =============================================================================
# Test Suite 6: Integration with instance-env.sh
# =============================================================================
echo "Test Suite: Integration with instance-env.sh"
echo "---------------------------------------------"

# Reset environment
unset OPENCODE_TEST_HOME XDG_DATA_HOME XDG_CONFIG_HOME XDG_CACHE_HOME XDG_STATE_HOME OPENCODE_CONFIG AI_INSTANCE_ID

# Source instance-env.sh (which should call configure_opencode_isolation)
source "$PROJECT_ROOT/scripts/instance-env.sh"

# Test 6.1: After sourcing instance-env.sh, isolation should be configured
if [ -n "$OPENCODE_TEST_HOME" ]; then
    echo -e "${GREEN}✓${NC} instance-env.sh configures OPENCODE_TEST_HOME"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗${NC} instance-env.sh should configure OPENCODE_TEST_HOME"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Test 6.2: Check that isolation path matches project root
assert_starts_with "$PROJECT_ROOT" "$OPENCODE_TEST_HOME" "OPENCODE_TEST_HOME is under PROJECT_ROOT"

echo ""

# =============================================================================
# Cleanup and Results
# =============================================================================

# Restore original environment
if [ -n "$OLD_OPENCODE_TEST_HOME" ]; then export OPENCODE_TEST_HOME="$OLD_OPENCODE_TEST_HOME"; else unset OPENCODE_TEST_HOME; fi
if [ -n "$OLD_XDG_DATA_HOME" ]; then export XDG_DATA_HOME="$OLD_XDG_DATA_HOME"; else unset XDG_DATA_HOME; fi
if [ -n "$OLD_XDG_CONFIG_HOME" ]; then export XDG_CONFIG_HOME="$OLD_XDG_CONFIG_HOME"; else unset XDG_CONFIG_HOME; fi
if [ -n "$OLD_XDG_CACHE_HOME" ]; then export XDG_CACHE_HOME="$OLD_XDG_CACHE_HOME"; else unset XDG_CACHE_HOME; fi
if [ -n "$OLD_XDG_STATE_HOME" ]; then export XDG_STATE_HOME="$OLD_XDG_STATE_HOME"; else unset XDG_STATE_HOME; fi
if [ -n "$OLD_OPENCODE_CONFIG" ]; then export OPENCODE_CONFIG="$OLD_OPENCODE_CONFIG"; else unset OPENCODE_CONFIG; fi
if [ -n "$OLD_OPENCODE_USE_GLOBAL_CONFIG" ]; then export OPENCODE_USE_GLOBAL_CONFIG="$OLD_OPENCODE_USE_GLOBAL_CONFIG"; else unset OPENCODE_USE_GLOBAL_CONFIG; fi

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
