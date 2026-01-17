#!/usr/bin/env bash
# Tests for claude-worktree-manager/scripts/worktree.sh

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREE_SCRIPT="$SCRIPT_DIR/worktree.sh"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test helper functions
test_start() {
    ((TESTS_RUN++))
    echo -e "${YELLOW}[TEST $TESTS_RUN]${NC} $1"
}

test_pass() {
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓ PASS${NC} $1"
    echo ""
}

test_fail() {
    ((TESTS_FAILED++))
    echo -e "${RED}✗ FAIL${NC} $1"
    echo ""
}

assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="${3:-Expected '$expected' but got '$actual'}"

    if [[ "$expected" == "$actual" ]]; then
        return 0
    else
        echo "  $message"
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local message="${3:-Expected to find '$needle' in output}"

    if [[ "$haystack" == *"$needle"* ]]; then
        return 0
    else
        echo "  $message"
        return 1
    fi
}

assert_file_exists() {
    local file="$1"
    local message="${2:-Expected file '$file' to exist}"

    if [[ -f "$file" ]]; then
        return 0
    else
        echo "  $message"
        return 1
    fi
}

assert_dir_exists() {
    local dir="$1"
    local message="${2:-Expected directory '$dir' to exist}"

    if [[ -d "$dir" ]]; then
        return 0
    else
        echo "  $message"
        return 1
    fi
}

# Test 1: Script exists and is executable
test_script_executable() {
    test_start "Script exists and is executable"

    if [[ -f "$WORKTREE_SCRIPT" ]] && [[ -x "$WORKTREE_SCRIPT" ]]; then
        test_pass "Script is executable"
    else
        test_fail "Script not found or not executable at $WORKTREE_SCRIPT"
    fi
}

# Test 2: Help command works
test_help_command() {
    test_start "Help command displays usage"

    local output
    output=$("$WORKTREE_SCRIPT" help 2>&1 || true)

    if assert_contains "$output" "Claude Worktree Manager" && \
       assert_contains "$output" "create" && \
       assert_contains "$output" "list" && \
       assert_contains "$output" "cleanup"; then
        test_pass "Help command works"
    else
        test_fail "Help command missing expected content"
    fi
}

# Test 3: Unknown command shows error
test_unknown_command() {
    test_start "Unknown command shows error"

    local output
    output=$("$WORKTREE_SCRIPT" invalid-command 2>&1 || true)

    if assert_contains "$output" "Unknown command"; then
        test_pass "Unknown command handled correctly"
    else
        test_fail "Unknown command error not shown"
    fi
}

# Test 4: Create command requires name argument
test_create_requires_name() {
    test_start "Create command requires name argument"

    local output
    output=$("$WORKTREE_SCRIPT" create 2>&1 || true)

    if assert_contains "$output" "Missing worktree name"; then
        test_pass "Create command validates name argument"
    else
        test_fail "Create command should require name argument"
    fi
}

# Test 5: Cleanup command accepts days parameter
test_cleanup_days_parameter() {
    test_start "Cleanup command accepts --days parameter"

    # Just verify the command runs without error (may not clean anything)
    local output
    output=$("$WORKTREE_SCRIPT" cleanup --days 999 2>&1 || true)

    if assert_contains "$output" "Cleaning up worktrees older than 999 days" || \
       assert_contains "$output" "No worktrees directory found"; then
        test_pass "Cleanup accepts --days parameter"
    else
        test_fail "Cleanup --days parameter not working"
    fi
}

# Test 6: List command works (may be empty)
test_list_command() {
    test_start "List command executes"

    local output
    output=$("$WORKTREE_SCRIPT" list 2>&1 || true)

    if assert_contains "$output" "Worktrees for project:"; then
        test_pass "List command works"
    else
        test_fail "List command failed"
    fi
}

# Test 7: Script validates git repository
test_git_repo_validation() {
    test_start "Script validates git repository"

    # Verify script has git repo validation logic
    if grep -q "get_repo_root" "$WORKTREE_SCRIPT" && \
       grep -q "Not in a git repository" "$WORKTREE_SCRIPT"; then
        test_pass "Git repository validation logic present"
    else
        test_fail "Script missing git repository validation"
    fi
}

# Test 8: Name sanitization in create command
test_name_sanitization() {
    test_start "Name sanitization logic"

    # Verify the script has sanitization logic with proper patterns
    if grep -q "tr '\[:upper:\]' '\[:lower:\]'" "$WORKTREE_SCRIPT" && \
       grep -q "sanitized_name" "$WORKTREE_SCRIPT"; then
        test_pass "Script contains name sanitization logic"
    else
        test_fail "Script missing name sanitization"
    fi
}

# Test 9: Background pnpm install setup
test_background_install() {
    test_start "Background pnpm install setup"

    # Verify script has nohup and background process logic
    if grep -q "nohup pnpm install" "$WORKTREE_SCRIPT" && \
       grep -q ".pnpm-install.log" "$WORKTREE_SCRIPT"; then
        test_pass "Script has background pnpm install logic"
    else
        test_fail "Script missing background pnpm install setup"
    fi
}

# Test 10: .env file copying logic
test_env_copy_logic() {
    test_start ".env file copying logic"

    # Verify script checks for and copies .env
    if grep -q "\.env" "$WORKTREE_SCRIPT" && \
       grep -q "cp.*\.env" "$WORKTREE_SCRIPT"; then
        test_pass "Script has .env copying logic"
    else
        test_fail "Script missing .env copying logic"
    fi
}

# Test 13: Claude settings copying logic
test_claude_settings_copy() {
    test_start "Claude settings copying logic"

    # Verify script copies .claude/settings.local.json
    if grep -q "\.claude/settings\.local\.json" "$WORKTREE_SCRIPT" && \
       grep -q "Claude local settings" "$WORKTREE_SCRIPT"; then
        test_pass "Script has Claude settings copying logic"
    else
        test_fail "Script missing Claude settings copying logic"
    fi
}

# Test 11: Cleanup age calculation
test_cleanup_age_calculation() {
    test_start "Cleanup age calculation logic"

    # Verify script has age calculation for cleanup
    if grep -q "86400" "$WORKTREE_SCRIPT" && \
       grep -q "max_age_seconds" "$WORKTREE_SCRIPT"; then
        test_pass "Script has age calculation logic (seconds per day)"
    else
        test_fail "Script missing age calculation"
    fi
}

# Test 12: Error handling present
test_error_handling() {
    test_start "Error handling present"

    # Verify script has error handling
    if grep -q "set -euo pipefail" "$WORKTREE_SCRIPT" && \
       grep -q "log_error" "$WORKTREE_SCRIPT"; then
        test_pass "Script has error handling"
    else
        test_fail "Script missing error handling"
    fi
}

# Run all tests
echo "========================================"
echo "Testing claude-worktree-manager script"
echo "========================================"
echo ""

test_script_executable
test_help_command
test_unknown_command
test_create_requires_name
test_cleanup_days_parameter
test_list_command
test_git_repo_validation
test_name_sanitization
test_background_install
test_env_copy_logic
test_claude_settings_copy
test_cleanup_age_calculation
test_error_handling

# Summary
echo "========================================"
echo "Test Summary"
echo "========================================"
echo "Total:  $TESTS_RUN"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
