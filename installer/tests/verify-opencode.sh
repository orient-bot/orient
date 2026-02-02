#!/usr/bin/env bash
# =============================================================================
# Orient - OpenCode Binary Verification Script
# =============================================================================
# Verifies that the OpenCode binary is correctly installed.
# Used by test-install.sh to verify install-local.sh.
#
# Usage:
#   ./installer/tests/verify-opencode.sh
#   ./installer/tests/verify-opencode.sh --verbose
#
# Exit codes:
#   0 - All checks passed
#   1 - One or more checks failed
# =============================================================================

set -e

# =============================================================================
# Configuration
# =============================================================================

OPENCODE_BIN="${HOME}/.opencode/bin/opencode"
VERBOSE="${VERBOSE:-false}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# =============================================================================
# Helper Functions
# =============================================================================

log() {
    echo -e "${BLUE}[verify]${NC} $1"
}

log_verbose() {
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${DIM}[verify]${NC} $1"
    fi
}

check_pass() {
    PASSED=$((PASSED + 1))
    echo -e "  ${GREEN}✓${NC} $1"
}

check_fail() {
    FAILED=$((FAILED + 1))
    echo -e "  ${RED}✗${NC} $1"
    if [ -n "$2" ]; then
        echo -e "    ${DIM}$2${NC}"
    fi
}

check_warn() {
    WARNINGS=$((WARNINGS + 1))
    echo -e "  ${YELLOW}⚠${NC} $1"
    if [ -n "$2" ]; then
        echo -e "    ${DIM}$2${NC}"
    fi
}

# Parse arguments
for arg in "$@"; do
    case "$arg" in
        --verbose|-v)
            VERBOSE=true
            ;;
        --help|-h)
            echo "OpenCode Binary Verification"
            echo ""
            echo "Usage: ./verify-opencode.sh [options]"
            echo ""
            echo "Options:"
            echo "  --verbose, -v    Show detailed output"
            echo "  --help, -h       Show this help"
            exit 0
            ;;
    esac
done

# =============================================================================
# Verification Checks
# =============================================================================

verify_binary_exists() {
    log "Checking OpenCode binary..."

    if [ -f "$OPENCODE_BIN" ]; then
        check_pass "Binary exists: $OPENCODE_BIN"
    else
        check_fail "Binary not found" "$OPENCODE_BIN"
        return
    fi

    if [ -x "$OPENCODE_BIN" ]; then
        check_pass "Binary is executable"
    else
        check_fail "Binary is not executable"
    fi

    # Check file size (should be > 1MB for actual binary)
    local size
    if [[ "$(uname)" == "Darwin" ]]; then
        size=$(stat -f%z "$OPENCODE_BIN" 2>/dev/null)
    else
        size=$(stat -c%s "$OPENCODE_BIN" 2>/dev/null)
    fi

    if [ -n "$size" ] && [ "$size" -gt 1000000 ]; then
        local size_mb=$((size / 1024 / 1024))
        check_pass "Binary size is valid (${size_mb}MB)"
    else
        check_fail "Binary appears to be an LFS pointer or corrupted"
    fi
}

verify_binary_runs() {
    log "Checking OpenCode execution..."

    # Try to get version
    local version_output
    if version_output=$("$OPENCODE_BIN" --version 2>&1); then
        check_pass "Binary executes successfully"
        log_verbose "Version output: $version_output"

        # Check version format
        if echo "$version_output" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+'; then
            check_pass "Version format is valid: $version_output"
        else
            check_warn "Unexpected version format: $version_output"
        fi
    else
        check_fail "Binary failed to execute"
    fi
}

verify_install_dir() {
    log "Checking install directory..."

    local install_dir="${HOME}/.opencode/bin"

    if [ -d "$install_dir" ]; then
        check_pass "Install directory exists"
    else
        check_fail "Install directory not found" "$install_dir"
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo ""
    echo -e "${BOLD}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  OpenCode Binary Verification                                 ║${NC}"
    echo -e "${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    log "Verifying OpenCode installation"
    echo ""

    # Run all verification checks
    verify_install_dir
    echo ""
    verify_binary_exists
    echo ""
    verify_binary_runs

    # Summary
    echo ""
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}Verification Summary${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${GREEN}✓ Passed:${NC}   $PASSED"
    echo -e "  ${YELLOW}⚠ Warnings:${NC} $WARNINGS"
    echo -e "  ${RED}✗ Failed:${NC}   $FAILED"
    echo ""

    if [ "$FAILED" -gt 0 ]; then
        echo -e "${RED}${BOLD}Verification FAILED${NC}"
        echo -e "One or more required checks did not pass."
        exit 1
    elif [ "$WARNINGS" -gt 0 ]; then
        echo -e "${YELLOW}${BOLD}Verification PASSED with warnings${NC}"
        echo -e "All required checks passed, but some optional features may not work."
        exit 0
    else
        echo -e "${GREEN}${BOLD}Verification PASSED${NC}"
        echo -e "OpenCode is correctly installed!"
        exit 0
    fi
}

main
