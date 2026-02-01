#!/usr/bin/env bash
# =============================================================================
# Orient - Installer Test Script
# =============================================================================
# Tests the Orient installer scripts in a clean environment.
# Can run locally or in Docker for a truly clean environment.
#
# Usage:
#   ./installer/tests/test-install.sh              # Run locally
#   ./installer/tests/test-install.sh --docker     # Run in Docker (clean env)
#   ./installer/tests/test-install.sh --verbose    # Verbose output
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed
# =============================================================================

set -e

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALLER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$INSTALLER_DIR/.." && pwd)"

USE_DOCKER=false
VERBOSE=false
KEEP_CONTAINER=false
IMAGE_NAME="orient-installer-test"
CONTAINER_NAME="orient-installer-test-$$"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

# =============================================================================
# Helper Functions
# =============================================================================

log() {
    echo -e "${BLUE}[test]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[test]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[test]${NC} $1"
}

log_error() {
    echo -e "${RED}[test]${NC} $1"
}

log_verbose() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${DIM}[test]${NC} $1"
    fi
}

die() {
    log_error "$1"
    cleanup
    exit 1
}

cleanup() {
    if [ "$USE_DOCKER" = true ] && [ "$KEEP_CONTAINER" = false ]; then
        log_verbose "Cleaning up container..."
        docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
    fi
}

trap cleanup EXIT

# Parse arguments
for arg in "$@"; do
    case "$arg" in
        --docker|-d)
            USE_DOCKER=true
            ;;
        --verbose|-v)
            VERBOSE=true
            ;;
        --keep-container)
            KEEP_CONTAINER=true
            ;;
        --help|-h)
            echo "Orient Installer Test Script"
            echo ""
            echo "Usage: ./test-install.sh [options]"
            echo ""
            echo "Options:"
            echo "  --docker, -d       Run tests in Docker (clean environment)"
            echo "  --verbose, -v      Show detailed output"
            echo "  --keep-container   Don't remove Docker container after test"
            echo "  --help, -h         Show this help"
            exit 0
            ;;
    esac
done

# =============================================================================
# Docker Functions
# =============================================================================

build_docker_image() {
    log "Building Docker test image..."

    local dockerfile="$SCRIPT_DIR/Dockerfile.macos-sim"

    if [ ! -f "$dockerfile" ]; then
        die "Dockerfile not found: $dockerfile"
    fi

    local build_args=""
    if [ "$VERBOSE" = false ]; then
        build_args="--quiet"
    fi

    if docker build $build_args -t "$IMAGE_NAME" -f "$dockerfile" "$SCRIPT_DIR"; then
        log_success "Docker image built successfully"
    else
        die "Failed to build Docker image"
    fi
}

run_docker_test() {
    log "Running test in Docker container..."

    # Create a temp directory for the source copy
    local temp_source="/tmp/orient-source-$$"

    log_verbose "Creating temporary source copy at $temp_source..."

    # Copy source to temp (excluding heavy directories)
    mkdir -p "$temp_source"
    rsync -a --exclude='node_modules' \
             --exclude='dist' \
             --exclude='.git' \
             --exclude='*.log' \
             "$PROJECT_ROOT/" "$temp_source/" 2>/dev/null || \
    cp -R "$PROJECT_ROOT/." "$temp_source/" 2>/dev/null

    # Remove unwanted directories if they got copied
    rm -rf "$temp_source/node_modules" 2>/dev/null || true
    rm -rf "$temp_source/dist" 2>/dev/null || true
    rm -rf "$temp_source/.git" 2>/dev/null || true

    log_verbose "Source copy created"

    # Run the container
    local docker_args="-i"
    if [ -t 0 ]; then
        docker_args="-it"
    fi

    local verbose_flag=""
    if [ "$VERBOSE" = true ]; then
        verbose_flag="--verbose"
    fi

    log "Starting Docker container..."

    # Run the installer and verification in the container
    if docker run $docker_args \
        --name "$CONTAINER_NAME" \
        --rm=$([[ "$KEEP_CONTAINER" = false ]] && echo "true" || echo "false") \
        -v "$temp_source:/home/developer/orient-source:ro" \
        -e VERBOSE="$VERBOSE" \
        "$IMAGE_NAME" \
        bash -c "
            set -e
            echo '=== Orient Installer Test (Docker) ==='
            echo ''
            echo 'Environment:'
            echo \"  Node: \$(node --version)\"
            echo \"  npm: \$(npm --version)\"
            echo \"  User: \$(whoami)\"
            echo \"  Home: \$HOME\"
            echo ''

            # Copy source to writable location
            echo 'Copying source files...'
            cp -R /home/developer/orient-source /home/developer/orient-local
            cd /home/developer/orient-local

            # Run the local installer
            echo ''
            echo '=== Running install-local.sh ==='
            ./installer/install-local.sh $verbose_flag

            # Run verification
            echo ''
            echo '=== Running verification ==='
            ./installer/tests/verify-install.sh $verbose_flag

            echo ''
            echo '=== Test Complete ==='
        "; then
        log_success "Docker test passed"

        # Cleanup temp source
        rm -rf "$temp_source"
        return 0
    else
        log_error "Docker test failed"

        # Cleanup temp source
        rm -rf "$temp_source"
        return 1
    fi
}

# =============================================================================
# Local Test Functions
# =============================================================================

run_local_test() {
    log "Running test locally..."

    # Create a temporary ORIENT_HOME for testing
    local temp_orient_home="/tmp/orient-test-$$"
    export ORIENT_HOME="$temp_orient_home"

    log_verbose "Using temporary ORIENT_HOME: $temp_orient_home"

    # Cleanup function
    cleanup_local() {
        if [ -d "$temp_orient_home" ]; then
            log_verbose "Cleaning up temporary installation..."
            rm -rf "$temp_orient_home"
        fi
    }
    trap cleanup_local EXIT

    # Run the local installer
    log "Running install-local.sh..."

    local verbose_flag=""
    if [ "$VERBOSE" = true ]; then
        verbose_flag="--verbose"
    fi

    if "$INSTALLER_DIR/install-local.sh" $verbose_flag; then
        log_success "Installation completed"
    else
        die "Installation failed"
    fi

    # Run verification
    log "Running verification..."

    if "$SCRIPT_DIR/verify-install.sh" $verbose_flag; then
        log_success "Verification passed"
    else
        die "Verification failed"
    fi

    log_success "Local test passed"
    cleanup_local
    return 0
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo ""
    echo -e "${BOLD}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  Orient - Installer Test                                      ║${NC}"
    echo -e "${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    if [ "$USE_DOCKER" = true ]; then
        log "Test mode: Docker (clean environment)"

        # Check Docker is available
        if ! command -v docker &> /dev/null; then
            die "Docker is not installed or not in PATH"
        fi

        if ! docker info &> /dev/null; then
            die "Docker daemon is not running"
        fi

        build_docker_image
        run_docker_test
    else
        log "Test mode: Local"
        log_warn "For a truly clean environment test, use --docker"
        echo ""
        run_local_test
    fi

    echo ""
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}All tests passed!${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

main
