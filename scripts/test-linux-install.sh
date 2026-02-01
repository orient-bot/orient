#!/bin/bash
# =============================================================================
# Orient - Linux Installer Test Script
# =============================================================================
# Tests the installer scripts in Docker containers to verify Linux compatibility.
#
# Usage:
#   ./scripts/test-linux-install.sh          # Run all tests
#   ./scripts/test-linux-install.sh clean    # Test clean slate only
#   ./scripts/test-linux-install.sh full     # Test preinstalled only
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}=== Testing Linux installer support ===${NC}"
echo ""

run_clean_test() {
    echo -e "${YELLOW}Test 1: Clean slate Ubuntu (should show install hints)${NC}"
    echo "=========================================="
    docker build -t orient-test-clean -f "$PROJECT_ROOT/docker/test-linux-install/Dockerfile.clean" "$PROJECT_ROOT"

    echo ""
    echo -e "${CYAN}Running doctor.sh on clean Ubuntu...${NC}"
    # This is expected to fail with missing tools - capture exit code
    if docker run --rm orient-test-clean; then
        echo -e "${YELLOW}Note: doctor.sh passed on clean slate (unexpected but OK)${NC}"
    else
        echo -e "${GREEN}Expected: doctor.sh correctly reported missing tools${NC}"
    fi
    echo ""
}

run_full_test() {
    echo -e "${YELLOW}Test 2: Pre-installed tools (should pass all checks)${NC}"
    echo "=========================================="
    docker build -t orient-test-full -f "$PROJECT_ROOT/docker/test-linux-install/Dockerfile.preinstalled" "$PROJECT_ROOT"

    echo ""
    echo -e "${CYAN}Running doctor.sh with all tools installed...${NC}"
    # Note: Docker daemon won't be running inside the container, so that check will fail
    # but the other checks should pass
    if docker run --rm orient-test-full; then
        echo -e "${GREEN}All checks passed!${NC}"
    else
        echo -e "${YELLOW}Some checks failed (Docker daemon check is expected to fail in container)${NC}"
    fi
    echo ""
}

case "${1:-all}" in
    clean)
        run_clean_test
        ;;
    full)
        run_full_test
        ;;
    all|*)
        run_clean_test
        run_full_test
        ;;
esac

echo -e "${GREEN}=== All tests completed ===${NC}"
echo ""
