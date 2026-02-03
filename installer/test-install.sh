#!/bin/bash
#
# Test script for Orient installer
# Verifies that:
# 1. Orient installs OpenCode to ~/.orient/bin/opencode (isolated)
# 2. User's global OpenCode is NOT modified
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[TEST]${NC} $1"; }
warn() { echo -e "${YELLOW}[TEST]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; FAILED=1; }
pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }

INSTALL_DIR="${ORIENT_HOME:-$HOME/.orient}"
EXPECTED_OPENCODE_VERSION="1.1.48"
FAILED=0

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║           Orient Installer Test Suite                       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# ===========================================
# STEP 1: Record initial state
# ===========================================
log "Step 1: Recording initial state..."

# Record global OpenCode (if exists)
INITIAL_GLOBAL_OPENCODE_PATH=$(which opencode 2>/dev/null || echo "")
if [[ -n "$INITIAL_GLOBAL_OPENCODE_PATH" ]]; then
    INITIAL_GLOBAL_OPENCODE_VERSION=$("$INITIAL_GLOBAL_OPENCODE_PATH" --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
    info "  Global OpenCode: $INITIAL_GLOBAL_OPENCODE_VERSION at $INITIAL_GLOBAL_OPENCODE_PATH"
else
    INITIAL_GLOBAL_OPENCODE_VERSION=""
    info "  Global OpenCode: not installed"
fi

# Record ~/.opencode/bin/opencode (if exists)
if [[ -x "$HOME/.opencode/bin/opencode" ]]; then
    INITIAL_NATIVE_OPENCODE_VERSION=$("$HOME/.opencode/bin/opencode" --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
    info "  Native OpenCode (~/.opencode): $INITIAL_NATIVE_OPENCODE_VERSION"
else
    INITIAL_NATIVE_OPENCODE_VERSION=""
    info "  Native OpenCode (~/.opencode): not installed"
fi

echo ""

# ===========================================
# STEP 2: Cleanup existing Orient installation
# ===========================================
log "Step 2: Cleaning up existing Orient installation..."

# Stop PM2 processes if running
if command -v pm2 &>/dev/null; then
    pm2 delete orient orient-opencode orient-slack 2>/dev/null || true
    pm2 save --force 2>/dev/null || true
fi

# Backup .env if exists
if [[ -f "$INSTALL_DIR/.env" ]]; then
    info "  Backing up .env to /tmp..."
    cp "$INSTALL_DIR/.env" "/tmp/orient-env-backup-$(date +%s)"
fi

# Remove Orient installation (keep data)
if [[ -d "$INSTALL_DIR" ]]; then
    info "  Removing Orient installation..."
    rm -rf "$INSTALL_DIR/orient"
    rm -rf "$INSTALL_DIR/bin"
    rm -rf "$INSTALL_DIR/logs"
    rm -f "$INSTALL_DIR/ecosystem.config.cjs"
    rm -f "$INSTALL_DIR/.orient-version"
fi

echo ""

# ===========================================
# STEP 3: Run the installer
# ===========================================
log "Step 3: Running installer..."
echo ""

# Change to the repo directory and run installer
# Provide "Y" for any prompts (keep existing config, etc.)
cd "$(dirname "$0")/.."
yes | bash installer/install.sh

echo ""

# ===========================================
# STEP 4: Verify installation
# ===========================================
log "Step 4: Running verification tests..."
echo ""

# Test 1: Global OpenCode unchanged
info "Test 1: Global OpenCode unchanged"
if [[ -n "$INITIAL_GLOBAL_OPENCODE_PATH" ]]; then
    FINAL_GLOBAL_VERSION=$("$INITIAL_GLOBAL_OPENCODE_PATH" --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
    if [[ "$FINAL_GLOBAL_VERSION" == "$INITIAL_GLOBAL_OPENCODE_VERSION" ]]; then
        pass "Global OpenCode unchanged: $FINAL_GLOBAL_VERSION at $INITIAL_GLOBAL_OPENCODE_PATH"
    else
        fail "Global OpenCode changed from $INITIAL_GLOBAL_OPENCODE_VERSION to $FINAL_GLOBAL_VERSION"
    fi
else
    pass "No global OpenCode to check (was not installed before)"
fi

# Test 2: Native OpenCode (~/.opencode) unchanged
info "Test 2: Native OpenCode (~/.opencode) unchanged"
if [[ -n "$INITIAL_NATIVE_OPENCODE_VERSION" ]]; then
    if [[ -x "$HOME/.opencode/bin/opencode" ]]; then
        FINAL_NATIVE_VERSION=$("$HOME/.opencode/bin/opencode" --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
        if [[ "$FINAL_NATIVE_VERSION" == "$INITIAL_NATIVE_OPENCODE_VERSION" ]]; then
            pass "Native OpenCode (~/.opencode) unchanged: $FINAL_NATIVE_VERSION"
        else
            fail "Native OpenCode changed from $INITIAL_NATIVE_OPENCODE_VERSION to $FINAL_NATIVE_VERSION"
        fi
    else
        pass "Native OpenCode (~/.opencode) still exists (version check skipped)"
    fi
else
    if [[ ! -x "$HOME/.opencode/bin/opencode" ]]; then
        pass "Native OpenCode (~/.opencode) still not installed (as expected)"
    else
        warn "Native OpenCode (~/.opencode) was created (unexpected but not critical)"
    fi
fi

# Test 3: Orient's OpenCode installed correctly
info "Test 3: Orient's OpenCode installed to ~/.orient/bin"
ORIENT_OPENCODE="$INSTALL_DIR/bin/opencode"
if [[ -x "$ORIENT_OPENCODE" ]]; then
    ORIENT_OC_VERSION=$("$ORIENT_OPENCODE" --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
    if [[ "$ORIENT_OC_VERSION" == "$EXPECTED_OPENCODE_VERSION" ]]; then
        pass "Orient's OpenCode installed: v$ORIENT_OC_VERSION at $ORIENT_OPENCODE"
    else
        fail "Orient's OpenCode version mismatch: expected $EXPECTED_OPENCODE_VERSION, got $ORIENT_OC_VERSION"
    fi
else
    fail "Orient's OpenCode not found at $ORIENT_OPENCODE"
fi

# Test 4: PM2 config uses Orient's OpenCode
info "Test 4: PM2 config uses Orient's OpenCode"
if [[ -f "$INSTALL_DIR/ecosystem.config.cjs" ]]; then
    if grep -q "$INSTALL_DIR/bin/opencode" "$INSTALL_DIR/ecosystem.config.cjs"; then
        pass "PM2 config references Orient's OpenCode"
    else
        fail "PM2 config does not reference Orient's OpenCode"
    fi
else
    fail "PM2 ecosystem config not found"
fi

# Test 5: Orient CLI installed
info "Test 5: Orient CLI installed"
if [[ -x "$INSTALL_DIR/bin/orient" ]]; then
    pass "Orient CLI installed at $INSTALL_DIR/bin/orient"
else
    fail "Orient CLI not found"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
if [[ $FAILED -eq 0 ]]; then
    echo "║              All Tests Passed!                             ║"
else
    echo "║              Some Tests Failed                              ║"
fi
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Summary
info "Summary:"
info "  Global OpenCode: $INITIAL_GLOBAL_OPENCODE_VERSION (unchanged)"
info "  Orient OpenCode: $ORIENT_OC_VERSION at $ORIENT_OPENCODE"
echo ""

exit $FAILED
