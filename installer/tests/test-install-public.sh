#!/usr/bin/env bash
# =============================================================================
# Orient - Public Installer Test Script
# =============================================================================
# Tests the public installer (curl | bash) in a clean Docker environment.
# Requires the repository to be pushed to GitHub or a mock server.
#
# Usage:
#   ./installer/tests/test-install-public.sh              # Test from GitHub
#   ./installer/tests/test-install-public.sh --mock       # Use local mock server
#   ./installer/tests/test-install-public.sh --branch=dev # Test specific branch
#
# Prerequisites:
#   - Docker
#   - Repository pushed to GitHub (unless using --mock)
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

VERBOSE=false
USE_MOCK=false
KEEP_CONTAINER=false
ORIENT_BRANCH="${ORIENT_BRANCH:-main}"
ORIENT_REPO="${ORIENT_REPO:-https://github.com/orient-bot/orient.git}"
IMAGE_NAME="orient-installer-test"
CONTAINER_NAME="orient-installer-public-test-$$"
MOCK_SERVER_PORT=8080

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
    log_verbose "Cleaning up..."
    docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

    if [ "$USE_MOCK" = true ]; then
        # Kill mock server if running
        if [ -n "$MOCK_SERVER_PID" ]; then
            kill "$MOCK_SERVER_PID" 2>/dev/null || true
        fi
    fi
}

trap cleanup EXIT

# Parse arguments
for arg in "$@"; do
    case "$arg" in
        --mock|-m)
            USE_MOCK=true
            ;;
        --verbose|-v)
            VERBOSE=true
            ;;
        --keep-container)
            KEEP_CONTAINER=true
            ;;
        --branch=*)
            ORIENT_BRANCH="${arg#*=}"
            ;;
        --repo=*)
            ORIENT_REPO="${arg#*=}"
            ;;
        --help|-h)
            echo "Orient Public Installer Test Script"
            echo ""
            echo "Usage: ./test-install-public.sh [options]"
            echo ""
            echo "Options:"
            echo "  --mock, -m         Use local mock server instead of GitHub"
            echo "  --verbose, -v      Show detailed output"
            echo "  --keep-container   Don't remove Docker container after test"
            echo "  --branch=<branch>  Test specific branch (default: main)"
            echo "  --repo=<url>       Use custom repository URL"
            echo "  --help, -h         Show this help"
            echo ""
            echo "Environment variables:"
            echo "  ORIENT_REPO        Git repository URL"
            echo "  ORIENT_BRANCH      Git branch to test"
            exit 0
            ;;
    esac
done

# =============================================================================
# Pre-flight Checks
# =============================================================================

check_prerequisites() {
    log "Checking prerequisites..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        die "Docker is not installed or not in PATH"
    fi

    if ! docker info &> /dev/null; then
        die "Docker daemon is not running"
    fi

    log_success "Docker is available"

    # Check if repository is accessible (unless using mock)
    if [ "$USE_MOCK" = false ]; then
        log "Checking repository accessibility..."
        if git ls-remote "$ORIENT_REPO" &> /dev/null; then
            log_success "Repository is accessible: $ORIENT_REPO"
        else
            log_error "Repository is not accessible: $ORIENT_REPO"
            log_warn "You can use --mock to test with a local mock server instead"
            die "Repository check failed"
        fi

        # Check if branch exists
        if git ls-remote --heads "$ORIENT_REPO" "$ORIENT_BRANCH" | grep -q "$ORIENT_BRANCH"; then
            log_success "Branch exists: $ORIENT_BRANCH"
        else
            die "Branch not found: $ORIENT_BRANCH"
        fi
    fi
}

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

# =============================================================================
# Mock Server
# =============================================================================

start_mock_server() {
    log "Starting mock server..."

    # Create a simple HTTP server that serves the install script
    local mock_dir="/tmp/orient-mock-$$"
    mkdir -p "$mock_dir"

    # Copy the install script
    cp "$INSTALLER_DIR/install.sh" "$mock_dir/install.sh"

    # Start Python HTTP server in background
    cd "$mock_dir"
    python3 -m http.server "$MOCK_SERVER_PORT" &> /dev/null &
    MOCK_SERVER_PID=$!

    # Wait for server to start
    sleep 2

    if kill -0 "$MOCK_SERVER_PID" 2>/dev/null; then
        log_success "Mock server started on port $MOCK_SERVER_PORT (PID: $MOCK_SERVER_PID)"
    else
        die "Failed to start mock server"
    fi

    cd - > /dev/null
}

# =============================================================================
# Test Execution
# =============================================================================

run_public_installer_test() {
    log "Running public installer test in Docker..."

    local install_url
    local docker_network_args=""

    if [ "$USE_MOCK" = true ]; then
        # Get host IP for Docker container to access
        local host_ip
        if [[ "$(uname)" == "Darwin" ]]; then
            # macOS: use host.docker.internal
            host_ip="host.docker.internal"
        else
            # Linux: get the docker0 bridge IP
            host_ip=$(docker network inspect bridge --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}')
        fi
        install_url="http://${host_ip}:${MOCK_SERVER_PORT}/install.sh"
        docker_network_args="--add-host=host.docker.internal:host-gateway"
    else
        # Use the actual public URL (would be orient.bot in production)
        # For testing, we use a GitHub raw URL
        install_url="https://raw.githubusercontent.com/orient-bot/orient/${ORIENT_BRANCH}/installer/install.sh"
    fi

    local verbose_flag=""
    if [ "$VERBOSE" = true ]; then
        verbose_flag="--verbose"
    fi

    local docker_args="-i"
    if [ -t 0 ]; then
        docker_args="-it"
    fi

    log "Install URL: $install_url"
    log "Branch: $ORIENT_BRANCH"

    # Copy verification script to container
    local verify_script_content=$(cat "$SCRIPT_DIR/verify-install.sh")

    if docker run $docker_args \
        --name "$CONTAINER_NAME" \
        $docker_network_args \
        --rm=$([[ "$KEEP_CONTAINER" = false ]] && echo "true" || echo "false") \
        -e VERBOSE="$VERBOSE" \
        -e ORIENT_BRANCH="$ORIENT_BRANCH" \
        -e ORIENT_REPO="$ORIENT_REPO" \
        "$IMAGE_NAME" \
        bash -c "
            set -e
            echo '=== Orient Public Installer Test (Docker) ==='
            echo ''
            echo 'Environment:'
            echo \"  Node: \$(node --version)\"
            echo \"  npm: \$(npm --version)\"
            echo \"  User: \$(whoami)\"
            echo \"  Home: \$HOME\"
            echo ''
            echo 'Install URL: $install_url'
            echo 'Branch: $ORIENT_BRANCH'
            echo ''

            # Download and run the public installer
            echo '=== Running public installer (curl | bash) ==='
            curl -fsSL '$install_url' | bash -s -- $verbose_flag --branch=$ORIENT_BRANCH

            # Create verification script
            cat > /tmp/verify-install.sh << 'VERIFY_EOF'
$verify_script_content
VERIFY_EOF
            chmod +x /tmp/verify-install.sh

            # Run verification
            echo ''
            echo '=== Running verification ==='
            /tmp/verify-install.sh $verbose_flag

            echo ''
            echo '=== Test Complete ==='
        "; then
        log_success "Public installer test passed"
        return 0
    else
        log_error "Public installer test failed"
        return 1
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo ""
    echo -e "${BOLD}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  Orient - Public Installer Test                               ║${NC}"
    echo -e "${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    if [ "$USE_MOCK" = true ]; then
        log "Test mode: Mock server (local)"
    else
        log "Test mode: GitHub repository"
        log "Repository: $ORIENT_REPO"
        log "Branch: $ORIENT_BRANCH"
    fi
    echo ""

    check_prerequisites
    build_docker_image

    if [ "$USE_MOCK" = true ]; then
        start_mock_server
    fi

    run_public_installer_test

    echo ""
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}Public installer test passed!${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

main
