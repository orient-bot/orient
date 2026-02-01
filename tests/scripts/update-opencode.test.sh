#!/usr/bin/env bash
#
# Tests for scripts/update-opencode.sh
#
# Run: ./tests/scripts/update-opencode.test.sh
# Or via npm: npm run test:update-opencode
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
UPDATE_SCRIPT="$REPO_ROOT/scripts/update-opencode.sh"
VENDOR_DIR="$REPO_ROOT/vendor/opencode"
MANIFEST_FILE="$VENDOR_DIR/manifest.json"

# Test state
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_test() { echo -e "${YELLOW}[TEST]${NC} $*"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $*"; ((TESTS_PASSED++)) || true; }
log_fail() { echo -e "${RED}[FAIL]${NC} $*"; ((TESTS_FAILED++)) || true; }

run_test() {
    local name="$1"
    local fn="$2"
    ((TESTS_RUN++)) || true
    log_test "$name"
    if $fn 2>&1; then
        log_pass "$name"
    else
        log_fail "$name"
    fi
}

# ============================================================================
# Test: Script exists and is executable
# ============================================================================
test_script_exists() {
    [[ -x "$UPDATE_SCRIPT" ]]
}

# ============================================================================
# Test: Help flag works
# ============================================================================
test_help_flag() {
    local output
    output=$("$UPDATE_SCRIPT" --help 2>&1)
    [[ "$output" == *"Usage:"* ]] && \
    [[ "$output" == *"anomalyco/opencode"* ]] && \
    [[ "$output" == *"--latest"* ]]
}

# ============================================================================
# Test: Current flag shows version
# ============================================================================
test_current_flag() {
    local output
    output=$("$UPDATE_SCRIPT" --current 2>&1)
    [[ "$output" == *"Current bundled version:"* ]]
}

# ============================================================================
# Test: Invalid version format rejected
# ============================================================================
test_invalid_version_format() {
    local output exit_code
    output=$("$UPDATE_SCRIPT" "invalid" 2>&1) && exit_code=0 || exit_code=$?
    [[ $exit_code -ne 0 ]] && [[ "$output" == *"Invalid version format"* ]]
}

# ============================================================================
# Test: Manifest file has required structure
# ============================================================================
test_manifest_structure() {
    [[ -f "$MANIFEST_FILE" ]] || return 1

    # Check required fields
    local version binaries
    version=$(jq -r '.version' "$MANIFEST_FILE")
    binaries=$(jq -r '.binaries | keys | length' "$MANIFEST_FILE")

    [[ -n "$version" ]] && [[ "$version" != "null" ]] && [[ "$binaries" -eq 4 ]]
}

# ============================================================================
# Test: All platform binaries exist
# ============================================================================
test_binaries_exist() {
    local platforms="darwin-arm64 darwin-x64 linux-arm64 linux-x64"
    for platform in $platforms; do
        local binary="$VENDOR_DIR/$platform/opencode"
        if [[ ! -f "$binary" ]]; then
            echo "Missing: $binary" >&2
            return 1
        fi
        if [[ ! -x "$binary" ]]; then
            echo "Not executable: $binary" >&2
            return 1
        fi
    done
    return 0
}

# ============================================================================
# Test: Checksums in manifest match actual binaries
# ============================================================================
test_checksums_match() {
    local platforms="darwin-arm64 darwin-x64 linux-arm64 linux-x64"
    for platform in $platforms; do
        local binary="$VENDOR_DIR/$platform/opencode"
        local expected actual

        expected=$(jq -r ".binaries[\"$platform\"].sha256" "$MANIFEST_FILE")

        if command -v sha256sum &> /dev/null; then
            actual=$(sha256sum "$binary" | cut -d' ' -f1)
        elif command -v shasum &> /dev/null; then
            actual=$(shasum -a 256 "$binary" | cut -d' ' -f1)
        else
            echo "No checksum command available" >&2
            return 1
        fi

        if [[ "$expected" != "$actual" ]]; then
            echo "Checksum mismatch for $platform:" >&2
            echo "  Expected: $expected" >&2
            echo "  Actual:   $actual" >&2
            return 1
        fi
    done
    return 0
}

# ============================================================================
# Test: Current platform binary executes
# ============================================================================
test_binary_executes() {
    local current_os current_arch current_platform binary

    current_os=$(uname -s | tr '[:upper:]' '[:lower:]')
    current_arch=$(uname -m)

    [[ "$current_arch" == "arm64" || "$current_arch" == "aarch64" ]] && current_arch="arm64"
    [[ "$current_arch" == "x86_64" ]] && current_arch="x64"

    current_platform="${current_os}-${current_arch}"
    binary="$VENDOR_DIR/$current_platform/opencode"

    if [[ ! -f "$binary" ]]; then
        echo "Binary not found for current platform: $current_platform" >&2
        return 1
    fi

    local version_output
    version_output=$("$binary" --version 2>&1 | tail -1) || return 1

    # Should output a version number
    [[ "$version_output" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

# ============================================================================
# Test: Binary version matches manifest version
# ============================================================================
test_binary_version_matches_manifest() {
    local current_os current_arch current_platform binary

    current_os=$(uname -s | tr '[:upper:]' '[:lower:]')
    current_arch=$(uname -m)

    [[ "$current_arch" == "arm64" || "$current_arch" == "aarch64" ]] && current_arch="arm64"
    [[ "$current_arch" == "x86_64" ]] && current_arch="x64"

    current_platform="${current_os}-${current_arch}"
    binary="$VENDOR_DIR/$current_platform/opencode"

    local binary_version manifest_version
    binary_version=$("$binary" --version 2>&1 | tail -1)
    manifest_version=$(jq -r '.version' "$MANIFEST_FILE")

    if [[ "$binary_version" != "$manifest_version" ]]; then
        echo "Version mismatch:" >&2
        echo "  Binary:   $binary_version" >&2
        echo "  Manifest: $manifest_version" >&2
        return 1
    fi
    return 0
}

# ============================================================================
# Test: Linux binaries are ELF format
# ============================================================================
test_linux_binary_format() {
    local binary="$VENDOR_DIR/linux-x64/opencode"

    if ! command -v file &> /dev/null; then
        echo "Skipping: 'file' command not available" >&2
        return 0
    fi

    local format
    format=$(file "$binary")

    [[ "$format" == *"ELF"* ]] && [[ "$format" == *"64-bit"* ]]
}

# ============================================================================
# Test: Darwin binaries are Mach-O format
# ============================================================================
test_darwin_binary_format() {
    local binary="$VENDOR_DIR/darwin-arm64/opencode"

    if ! command -v file &> /dev/null; then
        echo "Skipping: 'file' command not available" >&2
        return 0
    fi

    local format
    format=$(file "$binary")

    [[ "$format" == *"Mach-O"* ]]
}

# ============================================================================
# Test: Manifest has correct repo reference
# ============================================================================
test_manifest_repo_reference() {
    local repo
    repo=$(jq -r '.source.repo' "$MANIFEST_FILE")
    [[ "$repo" == "anomalyco/opencode" ]]
}

# ============================================================================
# Main test runner
# ============================================================================
main() {
    echo "============================================"
    echo "  Testing: scripts/update-opencode.sh"
    echo "============================================"
    echo ""

    # Script tests
    run_test "Script exists and is executable" test_script_exists
    run_test "Help flag works" test_help_flag
    run_test "Current flag shows version" test_current_flag
    run_test "Invalid version format rejected" test_invalid_version_format

    # Manifest tests
    run_test "Manifest has required structure" test_manifest_structure
    run_test "Manifest has correct repo reference" test_manifest_repo_reference

    # Binary tests
    run_test "All platform binaries exist" test_binaries_exist
    run_test "Checksums match manifest" test_checksums_match
    run_test "Current platform binary executes" test_binary_executes
    run_test "Binary version matches manifest" test_binary_version_matches_manifest

    # Format tests
    run_test "Linux binaries are ELF format" test_linux_binary_format
    run_test "Darwin binaries are Mach-O format" test_darwin_binary_format

    # Summary
    echo ""
    echo "============================================"
    echo "  Results: $TESTS_PASSED/$TESTS_RUN passed"
    if [[ $TESTS_FAILED -gt 0 ]]; then
        echo -e "  ${RED}$TESTS_FAILED tests failed${NC}"
        exit 1
    else
        echo -e "  ${GREEN}All tests passed!${NC}"
    fi
    echo "============================================"
}

main "$@"
