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
║  SETUP:                                                                   ║
║    ./run.sh doctor           Check environment prerequisites              ║
║    ./run.sh doctor --fix     Auto-fix issues where possible               ║
║                                                                           ║
║  DEVELOPMENT (hot-reload):                                                ║
║    ./run.sh dev              Start dev environment                        ║
║    ./run.sh dev stop         Stop all services                            ║
║    ./run.sh dev logs         View logs                                    ║
║    ./run.sh dev status       Show service status                          ║
║    ./run.sh instances        List all running instances                   ║
║                                                                           ║
║  TESTING (full Docker):                                                   ║
║    ./run.sh test             Start with local builds                      ║
║    ./run.sh test pull        Start with ghcr.io images                    ║
║    ./run.sh test stop        Stop containers                              ║
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

    # Check for running Docker containers
    local containers=$(docker ps --filter "name=orienter-" --format "{{.Names}}" 2>/dev/null | grep -E "orienter-(nginx|postgres|minio)-[0-9]+" | sed 's/.*-\([0-9]\+\)$/\1/' | sort -u)

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
        local whatsapp_port=$((4097 + offset))
        local opencode_port=$((4099 + offset))
        local postgres_port=$((5432 + offset))
        local minio_console_port=$((9001 + offset))

        echo -e "  ${YELLOW}Instance $instance_id${NC}"
        echo "    Dashboard:   http://localhost:$nginx_port"
        echo "    WhatsApp:    http://localhost:$whatsapp_port/health"
        echo "    OpenCode:    http://localhost:$opencode_port"
        echo "    MinIO:       http://localhost:$minio_console_port"
        echo "    PostgreSQL:  localhost:$postgres_port"

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

case "$1" in
    dev)
        # Hot-reload development mode
        exec "$SCRIPT_DIR/scripts/dev.sh" "${@:2}"
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




