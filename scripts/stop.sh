#!/bin/bash
# =============================================================================
# Orient - Universal Stop Script
# =============================================================================
# Stops Orient services. By default, stops only the current instance.
# Use --all to stop everything across all instances.
#
# Usage:
#   ./run.sh stop           # Stop current instance only (worktree-aware)
#   ./run.sh stop --all     # Stop ALL instances and projects
#   ./run.sh stop --force   # Force stop (kill -9) if graceful fails
#   ./run.sh stop --clean   # Stop and remove volumes (fresh start)
#
# Examples:
#   ./run.sh stop                    # In worktree: stops only that instance
#   ./run.sh stop --all              # Stops everything everywhere
#   ./run.sh stop --all --clean      # Nuclear option: stop all + remove volumes
# =============================================================================

set -e

# Get the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source instance environment to detect current instance
source "$SCRIPT_DIR/instance-env.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Options
FORCE_STOP=false
CLEAN_VOLUMES=false
STOP_ALL=false

log_info() {
    echo -e "${GREEN}[STOP]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[STOP]${NC} $1"
}

log_error() {
    echo -e "${RED}[STOP]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STOP]${NC} $1"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --force|-f)
            FORCE_STOP=true
            shift
            ;;
        --clean|-c)
            CLEAN_VOLUMES=true
            shift
            ;;
        --all|-a)
            STOP_ALL=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# =============================================================================
# Stop Single Instance (Current Worktree)
# =============================================================================

stop_current_instance() {
    local instance_id="$AI_INSTANCE_ID"
    local project_name="$COMPOSE_PROJECT_NAME"

    log_step "Stopping instance $instance_id (project: $project_name)..."

    cd "$PROJECT_ROOT/docker"

    # Stop the instance-specific compose project
    if [ "$CLEAN_VOLUMES" = true ]; then
        docker compose -p "$project_name" -f docker-compose.infra.yml --env-file "$PROJECT_ROOT/.env" down --remove-orphans -v 2>/dev/null || true
    else
        docker compose -p "$project_name" -f docker-compose.infra.yml --env-file "$PROJECT_ROOT/.env" down --remove-orphans 2>/dev/null || true
    fi

    # Also try the v2 stack if instance 0 (main repo often uses 'docker' project)
    if [ "$instance_id" = "0" ]; then
        log_info "Also checking 'docker' project (v2 stack)..."
        if [ "$CLEAN_VOLUMES" = true ]; then
            docker compose -f docker-compose.v2.yml -f docker-compose.local.yml --env-file "$PROJECT_ROOT/.env" down --remove-orphans -v 2>/dev/null || true
        else
            docker compose -f docker-compose.v2.yml -f docker-compose.local.yml --env-file "$PROJECT_ROOT/.env" down --remove-orphans 2>/dev/null || true
        fi
    fi

    cd "$PROJECT_ROOT"

    # Stop containers matching this instance
    stop_instance_containers "$instance_id"

    # Kill native processes for this instance
    stop_instance_native_processes "$instance_id"

    # Clean up PID files for this instance
    cleanup_instance_pid_files "$instance_id"
}

stop_instance_containers() {
    local instance_id="$1"
    local suffix=""

    # Instance 0 has no suffix, others have -N suffix
    if [ "$instance_id" != "0" ]; then
        suffix="-$instance_id"
    fi

    log_step "Stopping containers for instance $instance_id..."

    # Get containers for this instance
    local containers
    if [ "$instance_id" = "0" ]; then
        # Instance 0: match containers without instance suffix (orienter-nginx, not orienter-nginx-1)
        containers=$(docker ps -a --filter "name=orienter-" --format "{{.Names}}" 2>/dev/null | grep -E "^orienter-[a-z]+-?$" | grep -v -- "-[0-9]$" || true)
    else
        # Other instances: match containers with specific suffix
        containers=$(docker ps -a --filter "name=orienter-" --format "{{.Names}}" 2>/dev/null | grep -- "-${instance_id}$" || true)
    fi

    if [ -z "$containers" ]; then
        log_info "No containers found for instance $instance_id"
        return
    fi

    # Stop running containers
    local running=$(echo "$containers" | while read name; do
        if docker ps --format "{{.Names}}" 2>/dev/null | grep -q "^${name}$"; then
            echo "$name"
        fi
    done)

    if [ -n "$running" ]; then
        log_info "Stopping: $(echo $running | tr '\n' ' ')"
        if [ "$FORCE_STOP" = true ]; then
            echo "$running" | xargs docker kill 2>/dev/null || true
        else
            echo "$running" | xargs docker stop -t 10 2>/dev/null || true
        fi
    fi

    # Remove containers
    log_info "Removing containers..."
    echo "$containers" | xargs docker rm -f 2>/dev/null || true
}

stop_instance_native_processes() {
    local instance_id="$1"
    local offset=$((instance_id * 1000))

    log_step "Stopping native processes for instance $instance_id..."

    # Calculate ports for this instance
    local whatsapp_port=$((4097 + offset))
    local dashboard_port=$((4098 + offset))
    local opencode_port=$((4099 + offset))
    local vite_port=$((5173 + offset))
    local nginx_port=$((80 + offset))
    local postgres_port=$((5432 + offset))
    local minio_api_port=$((9000 + offset))
    local minio_console_port=$((9001 + offset))

    # Kill processes on instance ports
    for port in $whatsapp_port $dashboard_port $opencode_port $vite_port $nginx_port $postgres_port $minio_api_port $minio_console_port; do
        kill_port "$port"
    done

    # Kill tsx/node processes (only if they match this instance's paths/ports)
    if [ "$instance_id" = "0" ]; then
        # Main repo processes
        kill_by_pattern "tsx.*watch.*packages/bot-whatsapp" "WhatsApp tsx"
        kill_by_pattern "tsx.*watch.*packages/bot-slack" "Slack tsx"
        kill_by_pattern "pnpm.*@orient/dashboard.*dev" "Dashboard"
        kill_by_pattern "vite.*dashboard-frontend" "Vite"
        kill_by_pattern "opencode.*serve.*--port.*4099" "OpenCode"
    fi
}

cleanup_instance_pid_files() {
    local instance_id="$1"
    local pid_dir="$PROJECT_ROOT/.dev-pids/instance-$instance_id"

    if [ -d "$pid_dir" ]; then
        log_info "Cleaning PID files for instance $instance_id..."
        rm -f "$pid_dir"/*.pid 2>/dev/null || true
    fi
}

# =============================================================================
# Stop ALL Instances (Nuclear Option)
# =============================================================================

stop_all_instances() {
    log_step "Stopping ALL Docker Compose projects..."

    cd "$PROJECT_ROOT/docker"

    # List of known compose file combinations to try
    local compose_configs=(
        "docker-compose.v2.yml:docker-compose.local.yml"
        "docker-compose.infra.yml"
        "docker-compose.staging.yml"
        "docker-compose.prod.yml"
        "docker-compose.prod-secure.yml"
        "docker-compose.r2.yml"
    )

    # Try to stop each compose configuration
    for config in "${compose_configs[@]}"; do
        local compose_files=""
        IFS=':' read -ra FILES <<< "$config"
        for file in "${FILES[@]}"; do
            if [ -f "$file" ]; then
                compose_files="$compose_files -f $file"
            fi
        done

        if [ -n "$compose_files" ]; then
            log_info "Stopping: $config"
            if [ "$CLEAN_VOLUMES" = true ]; then
                docker compose $compose_files --env-file "$PROJECT_ROOT/.env" down --remove-orphans -v 2>/dev/null || true
            else
                docker compose $compose_files --env-file "$PROJECT_ROOT/.env" down --remove-orphans 2>/dev/null || true
            fi
        fi
    done

    # Stop all instance-specific projects (0-9)
    for i in {0..9}; do
        local project_name="orienter-instance-$i"
        if docker compose -p "$project_name" ps -q 2>/dev/null | grep -q .; then
            log_info "Stopping project: $project_name"
            if [ "$CLEAN_VOLUMES" = true ]; then
                docker compose -p "$project_name" -f docker-compose.infra.yml --env-file "$PROJECT_ROOT/.env" down --remove-orphans -v 2>/dev/null || true
            else
                docker compose -p "$project_name" -f docker-compose.infra.yml --env-file "$PROJECT_ROOT/.env" down --remove-orphans 2>/dev/null || true
            fi
        fi
    done

    # Stop 'docker' project
    if docker compose -p "docker" ps -q 2>/dev/null | grep -q .; then
        log_info "Stopping project: docker"
        if [ "$CLEAN_VOLUMES" = true ]; then
            docker compose -p "docker" down --remove-orphans -v 2>/dev/null || true
        else
            docker compose -p "docker" down --remove-orphans 2>/dev/null || true
        fi
    fi

    cd "$PROJECT_ROOT"

    # Stop ALL orienter containers
    stop_all_containers

    # Kill ALL native processes
    stop_all_native_processes

    # Clean ALL PID files
    cleanup_all_pid_files

    # Clean Docker resources if requested
    if [ "$CLEAN_VOLUMES" = true ]; then
        clean_docker_resources
    fi
}

stop_all_containers() {
    log_step "Stopping all orienter-* containers..."

    local containers=$(docker ps -a --filter "name=orienter-" --format "{{.Names}}" 2>/dev/null)

    if [ -z "$containers" ]; then
        log_info "No orienter containers found"
        return
    fi

    local running=$(docker ps --filter "name=orienter-" --format "{{.Names}}" 2>/dev/null)
    if [ -n "$running" ]; then
        log_info "Stopping: $(echo $running | tr '\n' ' ')"
        if [ "$FORCE_STOP" = true ]; then
            echo "$running" | xargs docker kill 2>/dev/null || true
        else
            echo "$running" | xargs docker stop -t 10 2>/dev/null || true
        fi
    fi

    log_info "Removing containers..."
    echo "$containers" | xargs docker rm -f 2>/dev/null || true
}

stop_all_native_processes() {
    log_step "Stopping all native processes..."

    # Kill processes by pattern
    kill_by_pattern "tsx.*watch.*whatsapp" "WhatsApp tsx"
    kill_by_pattern "tsx.*watch.*slack" "Slack tsx"
    kill_by_pattern "tsx.*packages/dashboard" "Dashboard tsx"
    kill_by_pattern "tsx.*bot-whatsapp" "WhatsApp bot"
    kill_by_pattern "tsx.*bot-slack" "Slack bot"
    kill_by_pattern "node.*whatsapp-bot" "WhatsApp node"
    kill_by_pattern "node.*slack-bot" "Slack node"
    kill_by_pattern "vite.*dashboard-frontend" "Vite"
    kill_by_pattern "opencode.*serve" "OpenCode"
    kill_by_pattern "pnpm.*@orient" "pnpm orient"

    # Kill processes on all possible instance ports (0-9)
    local base_ports=(4097 4098 4099 5173 80 5432 9000 9001)
    for base_port in "${base_ports[@]}"; do
        for i in {0..9}; do
            local port=$((base_port + i * 1000))
            kill_port "$port"
        done
    done

    # Common dev ports
    kill_port 3000
    kill_port 3001
    kill_port 8080
}

cleanup_all_pid_files() {
    log_step "Cleaning up all PID files..."

    for i in {0..9}; do
        local pid_dir="$PROJECT_ROOT/.dev-pids/instance-$i"
        if [ -d "$pid_dir" ]; then
            rm -f "$pid_dir"/*.pid 2>/dev/null || true
        fi
    done

    rm -f "$PROJECT_ROOT/.dev-pids"/*.pid 2>/dev/null || true
    log_info "PID files cleaned"
}

clean_docker_resources() {
    log_step "Cleaning Docker volumes..."

    local volumes=$(docker volume ls -q 2>/dev/null | grep -E "orienter|docker_postgres|docker_minio|docker_opencode" || true)
    if [ -n "$volumes" ]; then
        log_info "Removing volumes: $(echo $volumes | tr '\n' ' ')"
        echo "$volumes" | xargs docker volume rm -f 2>/dev/null || true
    fi

    log_info "Pruning unused networks..."
    docker network prune -f 2>/dev/null || true
}

# =============================================================================
# Helper Functions
# =============================================================================

kill_port() {
    local port="$1"
    local pids=$(lsof -ti ":$port" 2>/dev/null || true)

    if [ -n "$pids" ]; then
        log_warn "Killing process(es) on port $port: $pids"
        if [ "$FORCE_STOP" = true ]; then
            echo "$pids" | xargs kill -9 2>/dev/null || true
        else
            echo "$pids" | xargs kill -TERM 2>/dev/null || true
            sleep 0.3
            local remaining=$(lsof -ti ":$port" 2>/dev/null || true)
            if [ -n "$remaining" ]; then
                echo "$remaining" | xargs kill -9 2>/dev/null || true
            fi
        fi
    fi
}

kill_by_pattern() {
    local pattern="$1"
    local name="$2"
    local pids=$(pgrep -f "$pattern" 2>/dev/null || true)

    if [ -n "$pids" ]; then
        log_info "Killing $name processes..."
        if [ "$FORCE_STOP" = true ]; then
            echo "$pids" | xargs kill -9 2>/dev/null || true
        else
            echo "$pids" | xargs kill -TERM 2>/dev/null || true
            sleep 0.3
            local remaining=$(pgrep -f "$pattern" 2>/dev/null || true)
            if [ -n "$remaining" ]; then
                echo "$remaining" | xargs kill -9 2>/dev/null || true
            fi
        fi
    fi
}

# =============================================================================
# Verify Cleanup
# =============================================================================

verify_stopped() {
    log_step "Verifying cleanup..."

    local issues=false

    if [ "$STOP_ALL" = true ]; then
        # Check for any running containers
        local running=$(docker ps --filter "name=orienter-" --format "{{.Names}}" 2>/dev/null)
        if [ -n "$running" ]; then
            log_error "Still running containers: $running"
            issues=true
        fi

        # Check all key ports
        local ports_to_check=(80 4097 4098 4099 5173 5432 9000 9001)
        for port in "${ports_to_check[@]}"; do
            if lsof -ti ":$port" >/dev/null 2>&1; then
                local pid=$(lsof -ti ":$port" 2>/dev/null)
                log_warn "Port $port still in use (PID: $pid)"
                issues=true
            fi
        done
    else
        # Check only current instance ports
        local offset=$((AI_INSTANCE_ID * 1000))
        local ports_to_check=($((80 + offset)) $((4097 + offset)) $((4098 + offset)) $((4099 + offset)) $((5173 + offset)) $((5432 + offset)) $((9000 + offset)) $((9001 + offset)))

        for port in "${ports_to_check[@]}"; do
            if lsof -ti ":$port" >/dev/null 2>&1; then
                local pid=$(lsof -ti ":$port" 2>/dev/null)
                log_warn "Port $port still in use (PID: $pid)"
                issues=true
            fi
        done
    fi

    if [ "$issues" = true ]; then
        log_warn "Some resources may still be in use. Try: ./run.sh stop --force"
    else
        log_info "Stop completed successfully"
    fi
}

# =============================================================================
# Main
# =============================================================================

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
if [ "$STOP_ALL" = true ]; then
    echo -e "${BLUE}  Orient - Stop All Instances${NC}"
else
    echo -e "${BLUE}  Orient - Stop Instance $AI_INSTANCE_ID${NC}"
fi
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

if [ "$FORCE_STOP" = true ]; then
    log_warn "Force mode enabled - will use kill -9"
fi

if [ "$CLEAN_VOLUMES" = true ]; then
    log_warn "Clean mode enabled - will remove Docker volumes"
fi

# Execute appropriate stop sequence
if [ "$STOP_ALL" = true ]; then
    stop_all_instances
else
    stop_current_instance
fi

verify_stopped

echo ""
log_info "Stop complete!"
echo ""
