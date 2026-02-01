#!/usr/bin/env bash
# =============================================================================
# Orient - Installation Verification Script
# =============================================================================
# Verifies that an Orient installation is complete and functional.
# Designed to run inside a Docker container or on a local machine.
#
# Usage:
#   ./installer/tests/verify-install.sh
#   ORIENT_HOME=/custom/path ./installer/tests/verify-install.sh
#   ./installer/tests/verify-install.sh --verbose
#
# Exit codes:
#   0 - All checks passed
#   1 - One or more checks failed
# =============================================================================

set -e

# =============================================================================
# Configuration
# =============================================================================

ORIENT_HOME="${ORIENT_HOME:-$HOME/.orient}"
VERBOSE="${VERBOSE:-false}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
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
        --orient-home=*)
            ORIENT_HOME="${arg#*=}"
            ;;
        --help|-h)
            echo "Orient Installation Verification"
            echo ""
            echo "Usage: ./verify-install.sh [options]"
            echo ""
            echo "Options:"
            echo "  --verbose, -v           Show detailed output"
            echo "  --orient-home=<path>    Specify ORIENT_HOME (default: ~/.orient)"
            echo "  --help, -h              Show this help"
            exit 0
            ;;
    esac
done

# =============================================================================
# Verification Checks
# =============================================================================

verify_directory_structure() {
    log "Checking directory structure..."

    local required_dirs=(
        "$ORIENT_HOME"
        "$ORIENT_HOME/data"
        "$ORIENT_HOME/logs"
        "$ORIENT_HOME/config"
        "$ORIENT_HOME/source"
        "$ORIENT_HOME/bin"
    )

    for dir in "${required_dirs[@]}"; do
        if [ -d "$dir" ]; then
            check_pass "Directory exists: ${dir#$ORIENT_HOME/}"
        else
            check_fail "Directory missing: ${dir#$ORIENT_HOME/}"
        fi
    done

    # Check optional directories
    if [ -d "$ORIENT_HOME/backups" ]; then
        check_pass "Directory exists: backups"
    else
        check_warn "Directory missing: backups (optional)"
    fi
}

verify_env_file() {
    log "Checking .env configuration..."

    local env_file="$ORIENT_HOME/source/.env"

    if [ ! -f "$env_file" ]; then
        check_fail ".env file does not exist" "$env_file"
        return
    fi

    check_pass ".env file exists"

    # Check required keys
    local required_keys=(
        "DATABASE_URL"
        "DASHBOARD_JWT_SECRET"
        "ORIENT_MASTER_KEY"
    )

    for key in "${required_keys[@]}"; do
        if grep -q "^${key}=" "$env_file" 2>/dev/null; then
            local value=$(grep "^${key}=" "$env_file" | cut -d'=' -f2-)
            if [ -n "$value" ]; then
                check_pass "$key is set"
                log_verbose "  $key = ${value:0:20}..."
            else
                check_fail "$key is empty"
            fi
        else
            check_fail "$key is not defined in .env"
        fi
    done

    # Check JWT secret length (should be at least 32 chars)
    local jwt_secret=$(grep "^DASHBOARD_JWT_SECRET=" "$env_file" 2>/dev/null | cut -d'=' -f2-)
    if [ -n "$jwt_secret" ]; then
        local jwt_len=${#jwt_secret}
        if [ "$jwt_len" -ge 32 ]; then
            check_pass "DASHBOARD_JWT_SECRET has valid length ($jwt_len chars)"
        else
            check_fail "DASHBOARD_JWT_SECRET is too short ($jwt_len chars, need 32+)"
        fi
    fi

    # Check master key length
    local master_key=$(grep "^ORIENT_MASTER_KEY=" "$env_file" 2>/dev/null | cut -d'=' -f2-)
    if [ -n "$master_key" ]; then
        local key_len=${#master_key}
        if [ "$key_len" -ge 32 ]; then
            check_pass "ORIENT_MASTER_KEY has valid length ($key_len chars)"
        else
            check_fail "ORIENT_MASTER_KEY is too short ($key_len chars, need 32+)"
        fi
    fi
}

verify_packages_installed() {
    log "Checking installed packages..."

    if [ ! -d "$ORIENT_HOME/source/node_modules" ]; then
        check_fail "node_modules directory does not exist"
        return
    fi

    check_pass "node_modules directory exists"

    # Check for key dependencies
    local key_packages=(
        "express"
        "typescript"
        "zod"
    )

    for pkg in "${key_packages[@]}"; do
        if [ -d "$ORIENT_HOME/source/node_modules/$pkg" ]; then
            check_pass "Package installed: $pkg"
        else
            check_warn "Package not found: $pkg (may be in workspace package)"
        fi
    done

    # Check workspace packages
    if [ -d "$ORIENT_HOME/source/packages" ]; then
        local pkg_count=$(find "$ORIENT_HOME/source/packages" -maxdepth 1 -type d | wc -l)
        pkg_count=$((pkg_count - 1))  # Subtract the packages dir itself
        if [ "$pkg_count" -gt 0 ]; then
            check_pass "Workspace packages found: $pkg_count"
        else
            check_warn "No workspace packages found"
        fi
    fi
}

verify_build_output() {
    log "Checking build output..."

    local dist_dir="$ORIENT_HOME/source/dist"

    if [ ! -d "$dist_dir" ]; then
        check_fail "dist directory does not exist"
        return
    fi

    check_pass "dist directory exists"

    # Check for key build outputs
    local key_outputs=(
        "packages"
    )

    for output in "${key_outputs[@]}"; do
        if [ -d "$dist_dir/$output" ] || [ -f "$dist_dir/$output" ]; then
            check_pass "Build output exists: $output"
        else
            check_warn "Build output missing: $output"
        fi
    done

    # Count .js files in dist
    local js_count=$(find "$dist_dir" -name "*.js" -type f 2>/dev/null | wc -l | tr -d ' ')
    if [ "$js_count" -gt 0 ]; then
        check_pass "JavaScript files in dist: $js_count"
    else
        check_fail "No JavaScript files found in dist"
    fi
}

verify_cli_wrapper() {
    log "Checking CLI wrapper..."

    local cli_script="$ORIENT_HOME/bin/orient"

    if [ ! -f "$cli_script" ]; then
        check_fail "CLI script does not exist" "$cli_script"
        return
    fi

    check_pass "CLI script exists"

    if [ -x "$cli_script" ]; then
        check_pass "CLI script is executable"
    else
        check_fail "CLI script is not executable"
    fi

    # Test CLI help output
    if "$cli_script" --help 2>&1 | grep -q "Usage:" 2>/dev/null || \
       "$cli_script" 2>&1 | grep -q "Usage:" 2>/dev/null; then
        check_pass "CLI responds to help command"
    else
        check_warn "CLI help output not as expected"
    fi

    # Check if orient is in PATH
    if command -v orient &> /dev/null; then
        check_pass "orient command is in PATH"
    else
        check_warn "orient command not in PATH (restart terminal or source shell config)"
    fi
}

verify_pm2_config() {
    log "Checking PM2 ecosystem config..."

    local ecosystem_file="$ORIENT_HOME/source/ecosystem.config.js"

    if [ ! -f "$ecosystem_file" ]; then
        check_fail "PM2 ecosystem config does not exist" "$ecosystem_file"
        return
    fi

    check_pass "PM2 ecosystem config exists"

    # Check if it's valid JavaScript
    if node -e "require('$ecosystem_file')" 2>/dev/null; then
        check_pass "PM2 ecosystem config is valid JavaScript"
    else
        check_fail "PM2 ecosystem config has syntax errors"
    fi

    # Check for expected app definitions
    if grep -q "orient-dashboard" "$ecosystem_file"; then
        check_pass "PM2 config includes orient-dashboard"
    else
        check_warn "PM2 config missing orient-dashboard definition"
    fi
}

verify_doctor_command() {
    log "Checking doctor command..."

    local doctor_script="$ORIENT_HOME/source/scripts/doctor.sh"

    if [ ! -f "$doctor_script" ]; then
        check_warn "doctor.sh script does not exist"
        return
    fi

    check_pass "doctor.sh script exists"

    if [ -x "$doctor_script" ]; then
        check_pass "doctor.sh is executable"
    else
        check_warn "doctor.sh is not executable"
    fi

    # Try running doctor (may fail due to missing optional deps)
    cd "$ORIENT_HOME/source"
    if timeout 30 "$doctor_script" --quiet 2>/dev/null; then
        check_pass "doctor command runs successfully"
    else
        local exit_code=$?
        if [ "$exit_code" -eq 2 ]; then
            check_warn "doctor command completed with warnings (exit code 2)"
        elif [ "$exit_code" -eq 124 ]; then
            check_warn "doctor command timed out"
        else
            check_warn "doctor command exited with code $exit_code (may be expected in test environment)"
        fi
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo ""
    echo -e "${BOLD}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  Orient - Installation Verification                          ║${NC}"
    echo -e "${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    log "Verifying installation at: $ORIENT_HOME"
    echo ""

    # Run all verification checks
    verify_directory_structure
    echo ""
    verify_env_file
    echo ""
    verify_packages_installed
    echo ""
    verify_build_output
    echo ""
    verify_cli_wrapper
    echo ""
    verify_pm2_config
    echo ""
    verify_doctor_command

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
        echo -e "All checks passed successfully!"
        exit 0
    fi
}

main
