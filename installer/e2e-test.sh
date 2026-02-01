#!/usr/bin/env bash
# =============================================================================
# Orient - Installer E2E Test
# =============================================================================
# End-to-end test for the Orient installer. By default runs locally using
# symlinks for fast iteration. Use --docker for a clean environment test.
#
# Usage:
#   ./installer/e2e-test.sh              # Run locally (fast, uses symlinks)
#   ./installer/e2e-test.sh --docker     # Run in Docker (clean environment)
#   ./installer/e2e-test.sh --verbose    # Verbose output
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Forward all arguments to the test script
exec "$SCRIPT_DIR/tests/test-install.sh" "$@"
