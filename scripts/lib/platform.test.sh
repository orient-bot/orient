#!/usr/bin/env bash
# =============================================================================
# Orient - Platform Utilities Test Suite
# =============================================================================
# Tests for scripts/lib/platform.sh utility functions.
#
# Usage:
#   ./scripts/lib/platform.test.sh           # Run all tests
#   ./scripts/lib/platform.test.sh --verbose # Show detailed output
#
# Exit codes:
#   0 - All tests passed
#   1 - Some tests failed
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/platform.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

VERBOSE=false
[[ "$1" == "--verbose" ]] && VERBOSE=true

# =============================================================================
# Test Helpers
# =============================================================================

test_start() {
  TESTS_RUN=$((TESTS_RUN + 1))
  if $VERBOSE; then
    echo -e "${CYAN}Running:${NC} $1"
  fi
}

test_pass() {
  TESTS_PASSED=$((TESTS_PASSED + 1))
  echo -e "  ${GREEN}✓${NC} $1"
}

test_fail() {
  TESTS_FAILED=$((TESTS_FAILED + 1))
  echo -e "  ${RED}✗${NC} $1"
  if [ -n "$2" ]; then
    echo -e "    ${RED}Expected:${NC} $2"
  fi
  if [ -n "$3" ]; then
    echo -e "    ${RED}Got:${NC} $3"
  fi
}

assert_equals() {
  local expected="$1"
  local actual="$2"
  local message="$3"

  test_start "$message"
  if [ "$expected" = "$actual" ]; then
    test_pass "$message"
    return 0
  else
    test_fail "$message" "$expected" "$actual"
    return 1
  fi
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local message="$3"

  test_start "$message"
  if [[ "$haystack" == *"$needle"* ]]; then
    test_pass "$message"
    return 0
  else
    test_fail "$message" "contains '$needle'" "'$haystack'"
    return 1
  fi
}

assert_not_empty() {
  local value="$1"
  local message="$2"

  test_start "$message"
  if [ -n "$value" ]; then
    test_pass "$message"
    return 0
  else
    test_fail "$message" "non-empty value" "(empty)"
    return 1
  fi
}

assert_file_contains() {
  local file="$1"
  local expected="$2"
  local message="$3"

  test_start "$message"
  if grep -q "$expected" "$file" 2>/dev/null; then
    test_pass "$message"
    return 0
  else
    test_fail "$message" "file contains '$expected'" "$(cat "$file" 2>/dev/null || echo '(file not found)')"
    return 1
  fi
}

# =============================================================================
# Test: detect_os
# =============================================================================

test_detect_os() {
  echo ""
  echo -e "${YELLOW}Testing detect_os()${NC}"
  echo "─────────────────────────────────"

  local os=$(detect_os)

  # Test that detect_os returns a valid value
  assert_not_empty "$os" "detect_os returns a value"

  # Test that the value is one of the expected options
  case "$os" in
    macos|linux|wsl|unknown)
      test_pass "detect_os returns valid OS type: $os"
      ;;
    *)
      test_fail "detect_os returns valid OS type" "macos|linux|wsl|unknown" "$os"
      ;;
  esac

  # On macOS, verify it detects correctly
  if [[ "$(uname -s)" == "Darwin"* ]]; then
    assert_equals "macos" "$os" "detect_os returns 'macos' on Darwin"
  fi

  # On Linux, verify it detects correctly (not WSL)
  if [[ "$(uname -s)" == "Linux"* ]] && ! grep -qi microsoft /proc/version 2>/dev/null; then
    assert_equals "linux" "$os" "detect_os returns 'linux' on Linux (non-WSL)"
  fi
}

# =============================================================================
# Test: detect_package_manager
# =============================================================================

test_detect_package_manager() {
  echo ""
  echo -e "${YELLOW}Testing detect_package_manager()${NC}"
  echo "─────────────────────────────────"

  local pm=$(detect_package_manager)

  # Test that it returns a value
  assert_not_empty "$pm" "detect_package_manager returns a value"

  # Test that the value is one of the expected options
  case "$pm" in
    apt|brew|dnf|pacman|unknown)
      test_pass "detect_package_manager returns valid type: $pm"
      ;;
    *)
      test_fail "detect_package_manager returns valid type" "apt|brew|dnf|pacman|unknown" "$pm"
      ;;
  esac

  # On macOS with Homebrew, verify it detects brew
  if [[ "$(detect_os)" == "macos" ]] && command -v brew &>/dev/null; then
    assert_equals "brew" "$pm" "detect_package_manager returns 'brew' on macOS with Homebrew"
  fi

  # On Debian/Ubuntu, verify it detects apt
  if command -v apt &>/dev/null; then
    assert_equals "apt" "$pm" "detect_package_manager returns 'apt' when apt is available"
  fi
}

# =============================================================================
# Test: get_install_hint
# =============================================================================

test_get_install_hint() {
  echo ""
  echo -e "${YELLOW}Testing get_install_hint()${NC}"
  echo "─────────────────────────────────"

  local pm=$(detect_package_manager)

  # Test common packages
  local packages=("jq" "lsof" "curl" "git" "envsubst")

  for pkg in "${packages[@]}"; do
    local hint=$(get_install_hint "$pkg")

    if [ "$pm" != "unknown" ]; then
      assert_not_empty "$hint" "get_install_hint returns hint for '$pkg' on $pm"
    else
      # On unknown package manager, hint may be empty
      test_pass "get_install_hint handles '$pkg' on unknown package manager"
    fi
  done

  # Test apt-specific hints
  if [ "$pm" = "apt" ]; then
    local jq_hint=$(get_install_hint "jq")
    assert_contains "$jq_hint" "apt" "apt hint for jq contains 'apt'"

    local envsubst_hint=$(get_install_hint "envsubst")
    assert_contains "$envsubst_hint" "gettext" "apt hint for envsubst mentions gettext"
  fi

  # Test brew-specific hints
  if [ "$pm" = "brew" ]; then
    local jq_hint=$(get_install_hint "jq")
    assert_contains "$jq_hint" "brew" "brew hint for jq contains 'brew'"
  fi

  # Test node/docker special cases
  local node_hint=$(get_install_hint "node")
  if [ -n "$node_hint" ]; then
    assert_contains "$node_hint" "nvm" "node hint mentions nvm"
  fi

  local docker_hint=$(get_install_hint "docker")
  if [ -n "$docker_hint" ] && [ "$pm" = "apt" ]; then
    assert_contains "$docker_hint" "docker" "docker hint mentions docker"
  fi
}

# =============================================================================
# Test: sed_inplace
# =============================================================================

test_sed_inplace() {
  echo ""
  echo -e "${YELLOW}Testing sed_inplace()${NC}"
  echo "─────────────────────────────────"

  # Create a temporary file for testing
  local test_file=$(mktemp)
  echo "Hello World" > "$test_file"

  # Test basic replacement
  sed_inplace "$test_file" "s/World/Universe/"
  assert_file_contains "$test_file" "Hello Universe" "sed_inplace performs basic replacement"

  # Test multiple replacements
  echo -e "line1\nline2\nline3" > "$test_file"
  sed_inplace "$test_file" "s/line/row/g"
  assert_file_contains "$test_file" "row1" "sed_inplace with global flag works (row1)"
  assert_file_contains "$test_file" "row2" "sed_inplace with global flag works (row2)"
  assert_file_contains "$test_file" "row3" "sed_inplace with global flag works (row3)"

  # Test with special characters
  echo "key=value" > "$test_file"
  sed_inplace "$test_file" "s|key=value|key=newvalue|"
  assert_file_contains "$test_file" "key=newvalue" "sed_inplace handles special delimiter"

  # Test preserving file (no match)
  echo "original content" > "$test_file"
  sed_inplace "$test_file" "s/nonexistent/replacement/"
  assert_file_contains "$test_file" "original content" "sed_inplace preserves content when no match"

  # Test with regex patterns
  echo "VERSION=1.2.3" > "$test_file"
  sed_inplace "$test_file" "s/VERSION=.*/VERSION=2.0.0/"
  assert_file_contains "$test_file" "VERSION=2.0.0" "sed_inplace handles regex patterns"

  # Cleanup
  rm -f "$test_file"
  test_pass "Temporary test file cleaned up"
}

# =============================================================================
# Test: Cross-platform behavior
# =============================================================================

test_cross_platform() {
  echo ""
  echo -e "${YELLOW}Testing Cross-Platform Behavior${NC}"
  echo "─────────────────────────────────"

  local os=$(detect_os)

  # Test that sed_inplace works regardless of platform
  local test_file=$(mktemp)
  echo "platform test" > "$test_file"

  if sed_inplace "$test_file" "s/test/success/"; then
    assert_file_contains "$test_file" "platform success" "sed_inplace works on $os"
  else
    test_fail "sed_inplace executes without error on $os"
  fi

  rm -f "$test_file"

  # Test that platform detection is consistent
  local os1=$(detect_os)
  local os2=$(detect_os)
  assert_equals "$os1" "$os2" "detect_os returns consistent results"

  # Test that package manager detection is consistent
  local pm1=$(detect_package_manager)
  local pm2=$(detect_package_manager)
  assert_equals "$pm1" "$pm2" "detect_package_manager returns consistent results"
}

# =============================================================================
# Test: Linux-specific behavior (runs on Linux/Docker)
# =============================================================================

test_linux_specific() {
  echo ""
  echo -e "${YELLOW}Testing Linux-Specific Behavior${NC}"
  echo "─────────────────────────────────"

  local os=$(detect_os)

  # These tests only run on Linux
  if [[ "$os" != "linux" && "$os" != "wsl" ]]; then
    test_pass "Skipping Linux tests (running on $os)"
    return
  fi

  # Test that Linux is detected correctly
  if [[ "$(uname -s)" == "Linux"* ]]; then
    if [[ "$os" == "linux" || "$os" == "wsl" ]]; then
      test_pass "detect_os correctly identifies Linux kernel"
    else
      test_fail "detect_os identifies Linux kernel" "linux or wsl" "$os"
    fi
  fi

  # Test apt detection on Debian/Ubuntu
  if command -v apt &>/dev/null; then
    local pm=$(detect_package_manager)
    assert_equals "apt" "$pm" "detect_package_manager returns 'apt' on Debian/Ubuntu"

    # Test apt-specific install hints
    local jq_hint=$(get_install_hint "jq")
    assert_contains "$jq_hint" "sudo apt" "apt hint for jq includes 'sudo apt'"

    local lsof_hint=$(get_install_hint "lsof")
    assert_contains "$lsof_hint" "sudo apt" "apt hint for lsof includes 'sudo apt'"

    local envsubst_hint=$(get_install_hint "envsubst")
    assert_contains "$envsubst_hint" "gettext-base" "apt hint for envsubst mentions gettext-base"

    local docker_hint=$(get_install_hint "docker")
    assert_contains "$docker_hint" "get.docker.com" "apt hint for docker mentions get.docker.com"

    local node_hint=$(get_install_hint "node")
    assert_contains "$node_hint" "nvm" "apt hint for node mentions nvm"
  fi

  # Test sed_inplace uses Linux sed syntax (no '' argument)
  local test_file=$(mktemp)
  echo "linux-sed-test" > "$test_file"

  # This should work on Linux without the macOS '' argument
  sed_inplace "$test_file" "s/linux-sed-test/linux-sed-passed/"
  assert_file_contains "$test_file" "linux-sed-passed" "sed_inplace uses correct Linux syntax"

  rm -f "$test_file"
}

# =============================================================================
# Test: WSL-specific behavior
# =============================================================================

test_wsl_specific() {
  echo ""
  echo -e "${YELLOW}Testing WSL-Specific Behavior${NC}"
  echo "─────────────────────────────────"

  local os=$(detect_os)

  # Check if we're running in WSL
  if [[ "$os" != "wsl" ]]; then
    test_pass "Skipping WSL tests (running on $os)"
    return
  fi

  # Verify WSL detection logic
  if grep -qi microsoft /proc/version 2>/dev/null; then
    assert_equals "wsl" "$os" "detect_os returns 'wsl' when /proc/version contains 'microsoft'"
  fi

  # WSL should still detect apt on Ubuntu
  if command -v apt &>/dev/null; then
    local pm=$(detect_package_manager)
    assert_equals "apt" "$pm" "detect_package_manager returns 'apt' on WSL Ubuntu"
  fi

  # sed_inplace should work the same as Linux
  local test_file=$(mktemp)
  echo "wsl-sed-test" > "$test_file"
  sed_inplace "$test_file" "s/wsl-sed-test/wsl-sed-passed/"
  assert_file_contains "$test_file" "wsl-sed-passed" "sed_inplace works correctly on WSL"
  rm -f "$test_file"
}

# =============================================================================
# Test: macOS-specific behavior
# =============================================================================

test_macos_specific() {
  echo ""
  echo -e "${YELLOW}Testing macOS-Specific Behavior${NC}"
  echo "─────────────────────────────────"

  local os=$(detect_os)

  # These tests only run on macOS
  if [[ "$os" != "macos" ]]; then
    test_pass "Skipping macOS tests (running on $os)"
    return
  fi

  # Verify macOS detection
  if [[ "$(uname -s)" == "Darwin"* ]]; then
    assert_equals "macos" "$os" "detect_os returns 'macos' on Darwin"
  fi

  # Test brew detection
  if command -v brew &>/dev/null; then
    local pm=$(detect_package_manager)
    assert_equals "brew" "$pm" "detect_package_manager returns 'brew' on macOS"

    # Test brew-specific install hints
    local jq_hint=$(get_install_hint "jq")
    assert_contains "$jq_hint" "brew install" "brew hint for jq includes 'brew install'"

    local envsubst_hint=$(get_install_hint "envsubst")
    assert_contains "$envsubst_hint" "gettext" "brew hint for envsubst mentions gettext"
  fi

  # Test sed_inplace uses macOS sed syntax (with '' argument)
  local test_file=$(mktemp)
  echo "macos-sed-test" > "$test_file"

  # This should work on macOS with the '' argument for in-place editing
  sed_inplace "$test_file" "s/macos-sed-test/macos-sed-passed/"
  assert_file_contains "$test_file" "macos-sed-passed" "sed_inplace uses correct macOS syntax"

  rm -f "$test_file"
}

# =============================================================================
# Test: Edge cases
# =============================================================================

test_edge_cases() {
  echo ""
  echo -e "${YELLOW}Testing Edge Cases${NC}"
  echo "─────────────────────────────────"

  # Test get_install_hint with unknown package
  local hint=$(get_install_hint "some_unknown_package_xyz")
  local pm=$(detect_package_manager)

  if [ "$pm" != "unknown" ]; then
    # Should return a generic install command
    assert_not_empty "$hint" "get_install_hint handles unknown packages"
  else
    test_pass "get_install_hint handles unknown package on unknown PM"
  fi

  # Test sed_inplace with empty pattern
  local test_file=$(mktemp)
  echo "content" > "$test_file"

  # Empty replacement (delete match)
  sed_inplace "$test_file" "s/content//"
  local content=$(cat "$test_file")
  if [ -z "$(cat "$test_file" | tr -d '\n')" ]; then
    test_pass "sed_inplace handles empty replacement"
  else
    test_fail "sed_inplace handles empty replacement" "(empty)" "$content"
  fi

  rm -f "$test_file"

  # Test sed_inplace with file containing spaces in path
  local test_dir=$(mktemp -d)
  local test_file_spaces="$test_dir/file with spaces.txt"
  echo "test content" > "$test_file_spaces"

  sed_inplace "$test_file_spaces" "s/test/verified/"
  assert_file_contains "$test_file_spaces" "verified content" "sed_inplace handles file paths with spaces"

  rm -rf "$test_dir"
}

# =============================================================================
# Main
# =============================================================================

main() {
  echo ""
  echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║  Orient - Platform Utilities Test Suite                       ║${NC}"
  echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"

  echo ""
  echo -e "Platform: $(detect_os)"
  echo -e "Package Manager: $(detect_package_manager)"

  # Run all test suites
  test_detect_os
  test_detect_package_manager
  test_get_install_hint
  test_sed_inplace
  test_cross_platform
  test_linux_specific
  test_wsl_specific
  test_macos_specific
  test_edge_cases

  # Summary
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}Test Summary${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  Tests run:    $TESTS_RUN"
  echo -e "  ${GREEN}Passed:${NC}       $TESTS_PASSED"
  echo -e "  ${RED}Failed:${NC}       $TESTS_FAILED"
  echo ""

  if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
  else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
  fi
}

main "$@"
