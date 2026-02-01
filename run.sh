#!/bin/bash
# =============================================================================
# Orient - Unified Run Script
# =============================================================================
# Single entry point for all operational modes.
#
# Usage:
#   ./run.sh dev [options]     # Development with hot-reload
#   ./run.sh test [options]    # Full Docker stack for testing
#   ./run.sh deploy [options]  # Production deployment
#   ./run.sh help              # Show this help
#
# Examples:
#   ./run.sh dev               # Start development environment
#   ./run.sh dev stop          # Stop development services
#   ./run.sh test              # Start full Docker stack
#   ./run.sh test pull         # Start with pre-built images
#   ./run.sh deploy            # Deploy to production
#   ./run.sh deploy --r2       # Deploy with Cloudflare R2
# =============================================================================

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

show_help() {
    cat << 'EOF'
╔═══════════════════════════════════════════════════════════════════════════╗
║  Orient - Unified Run Script                                     ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                           ║
║  UNIVERSAL COMMANDS:                                                      ║
║    ./run.sh stop             Stop current instance (worktree-aware)       ║
║    ./run.sh stop --all       Stop ALL instances everywhere                ║
║    ./run.sh stop --force     Force stop with kill -9                      ║
║    ./run.sh stop --clean     Stop and remove volumes (fresh start)        ║
║    ./run.sh status           Show what's running                          ║
║    ./run.sh instances        List all running instances                   ║
║                                                                           ║
║  SETUP:                                                                   ║
║    ./run.sh doctor           Check environment prerequisites              ║
║    ./run.sh doctor --fix     Auto-fix issues where possible               ║
║                                                                           ║
║  DEVELOPMENT (hot-reload):                                                ║
║    ./run.sh dev              Start dev environment (with Docker)          ║
║    ./run.sh dev stop         Stop dev services only                       ║
║    ./run.sh dev logs         View logs                                    ║
║    ./run.sh dev status       Show service status                          ║
║                                                                           ║
║  DEVELOPMENT (no Docker):                                                 ║
║    ./run.sh dev-local        Start dev without Docker (local storage)     ║
║    ./run.sh dev-local stop   Stop dev-local services                      ║
║    ./run.sh dev-local logs   View logs                                    ║
║    ./run.sh dev-local status Show service status                          ║
║                                                                           ║
║  TESTING (full Docker):                                                   ║
║    ./run.sh test             Start with local builds                      ║
║    ./run.sh test pull        Start with ghcr.io images                    ║
║    ./run.sh test stop        Stop test containers only                    ║
║    ./run.sh test logs        View container logs                          ║
║    ./run.sh test clean       Fresh start (remove volumes)                 ║
║                                                                           ║
║  STAGING (separate environment):                                          ║
║    ./run.sh staging          Start staging with local builds              ║
║    ./run.sh staging pull     Start with ghcr.io staging images            ║
║    ./run.sh staging stop     Stop staging containers                      ║
║    ./run.sh staging logs     View staging logs                            ║
║    ./run.sh staging clean    Fresh start (remove volumes)                 ║
║                                                                           ║
║  PRODUCTION:                                                              ║
║    ./run.sh deploy           Deploy with MinIO                            ║
║    ./run.sh deploy --r2      Deploy with Cloudflare R2                    ║
║    ./run.sh deploy update    Pull and restart                             ║
║    ./run.sh deploy stop      Stop production                              ║
║    ./run.sh deploy logs      View production logs                         ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
EOF
}

show_instances() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Orient - Running Instances${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo ""

    # Check for running Docker containers (nginx and minio only - SQLite is file-based)
    local containers=$(docker ps --filter "name=orienter-" --format "{{.Names}}" 2>/dev/null | grep -E "orienter-(nginx|minio)-[0-9]+" | sed 's/.*-\([0-9]\+\)$/\1/' | sort -u)

    if [ -z "$containers" ]; then
        echo "  No running instances found."
        echo ""
        return
    fi

    echo -e "${GREEN}Running Instances:${NC}"
    echo ""

    for instance_id in $containers; do
        local offset=$((instance_id * 1000))
        local nginx_port=$((80 + offset))
        local dashboard_port=$((4098 + offset))
        local opencode_port=$((4099 + offset))
        local minio_console_port=$((9001 + offset))

        echo -e "  ${YELLOW}Instance $instance_id${NC}"
        echo "    Dashboard:   http://localhost:$nginx_port"
        echo "    WhatsApp QR: http://localhost:$nginx_port/qr"
        echo "    OpenCode:    http://localhost:$opencode_port"
        echo "    MinIO:       http://localhost:$minio_console_port"
        echo "    Database:    SQLite (file-based)"

        # Check if containers are healthy
        local nginx_status=$(docker ps --filter "name=orienter-nginx-$instance_id" --format "{{.Status}}" 2>/dev/null)
        if [ -n "$nginx_status" ]; then
            echo "    Status:      $nginx_status"
        fi
        echo ""
    done

    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
}

show_status() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Orient - Service Status${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo ""

    # Show Docker compose projects
    echo -e "${YELLOW}Docker Compose Projects:${NC}"
    docker compose ls 2>/dev/null || echo "  No compose projects found"
    echo ""

    # Show running containers
    echo -e "${YELLOW}Running Containers:${NC}"
    local containers=$(docker ps --filter "name=orienter-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null)
    if [ -n "$containers" ]; then
        echo "$containers"
    else
        echo "  No orienter containers running"
    fi
    echo ""

    # Show key port usage
    echo -e "${YELLOW}Port Usage:${NC}"
    # Port 4098 is the unified server (Dashboard + WhatsApp)
    # Database: SQLite (no external port needed)
    local ports=(80 4098 4099 5173 9000 9001)
    for port in "${ports[@]}"; do
        local pid=$(lsof -ti ":$port" 2>/dev/null || true)
        if [ -n "$pid" ]; then
            local process=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
            echo -e "  Port $port: ${GREEN}in use${NC} (PID: $pid, $process)"
        fi
    done
    echo ""

    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
}

case "$1" in
    stop)
        # Universal stop - stops current instance by default, --all for everything
        exec "$SCRIPT_DIR/scripts/stop.sh" "${@:2}"
        ;;
    status)
        # Show what's currently running
        show_status
        exit 0
        ;;
    dev)
        # Hot-reload development mode
        exec "$SCRIPT_DIR/scripts/dev.sh" "${@:2}"
        ;;
    dev-local|dev:local)
        # No-Docker development mode (local storage, no nginx/minio)
        exec "$SCRIPT_DIR/scripts/dev-local.sh" "${@:2}"
        ;;
    test)
        # Full Docker testing mode
        exec "$SCRIPT_DIR/scripts/test.sh" "${@:2}"
        ;;
    staging)
        # Staging environment mode
        exec "$SCRIPT_DIR/scripts/staging.sh" "${@:2}"
        ;;
    deploy)
        # Production deployment mode
        exec "$SCRIPT_DIR/scripts/deploy.sh" "${@:2}"
        ;;
    instances)
        # Show all running instances
        show_instances
        exit 0
        ;;
    doctor)
        # Run environment diagnostics
        exec "$SCRIPT_DIR/scripts/doctor.sh" "${@:2}"
        ;;
    help|--help|-h)
        show_help
        exit 0
        ;;
    *)
        echo -e "${RED}Error: Unknown command '$1'${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac




