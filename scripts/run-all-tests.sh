#!/usr/bin/env bash
#
# Test runner for all multi-instance tests
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║          Multi-Instance Support - Test Suite                  ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Source instance env
source "$PROJECT_ROOT/scripts/instance-env.sh"

echo -e "${BLUE}Testing in Instance $AI_INSTANCE_ID${NC}"
echo ""

TOTAL_PASSED=0
TOTAL_FAILED=0
SUITE_COUNT=0

run_test_suite() {
    local script_name="$1"
    local suite_name="$2"

    ((SUITE_COUNT++))
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}Test Suite $SUITE_COUNT: $suite_name${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""

    if "$script_name"; then
        echo ""
        echo -e "${GREEN}✓ $suite_name: PASSED${NC}"
        return 0
    else
        echo ""
        echo -e "${RED}✗ $suite_name: FAILED${NC}"
        return 1
    fi
}

# Run test suites
if run_test_suite "$SCRIPT_DIR/test-config-templates.sh" "Configuration Templates"; then
    ((TOTAL_PASSED++))
else
    ((TOTAL_FAILED++))
fi

echo ""

if run_test_suite "$SCRIPT_DIR/test-integration.sh" "Integration Tests"; then
    ((TOTAL_PASSED++))
else
    ((TOTAL_FAILED++))
fi

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                    Final Test Results                         ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Test Suites Passed: ${GREEN}$TOTAL_PASSED${NC}"
if [ $TOTAL_FAILED -gt 0 ]; then
    echo -e "  Test Suites Failed: ${RED}$TOTAL_FAILED${NC}"
else
    echo -e "  Test Suites Failed: $TOTAL_FAILED"
fi
echo ""

if [ $TOTAL_FAILED -eq 0 ]; then
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✓ All Tests Passed - Instance $AI_INSTANCE_ID is Ready!          ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}You can now start the development environment:${NC}"
    echo -e "  ${CYAN}./run.sh dev${NC}"
    echo ""
    echo -e "${BLUE}Access points:${NC}"
    echo -e "  Dashboard:   http://localhost:$NGINX_PORT"
    echo -e "  OpenCode:    http://localhost:$OPENCODE_PORT"
    echo -e "  MinIO:       http://localhost:$MINIO_CONSOLE_PORT"
    echo ""
    exit 0
else
    echo -e "${RED}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ✗ Some Tests Failed - Please Review Errors Above            ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    exit 1
fi
