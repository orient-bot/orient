#!/usr/bin/env bash
#
# Instance Environment Configuration
# Detects instance ID and configures environment variables for multi-instance support
#
# Database: SQLite (file-based, no external database server needed)
# WhatsApp: Integrated into Dashboard (unified server on DASHBOARD_PORT)
#

# Detect instance ID from environment or path
detect_instance_id() {
  # 1. Check explicit override
  if [ -n "$AI_INSTANCE_ID" ]; then
    echo "$AI_INSTANCE_ID"
    return
  fi

  # 2. Check if in worktree (claude-worktrees directory)
  local current_path="$(pwd)"
  if [[ "$current_path" == *"/claude-worktrees/"* ]]; then
    # Extract worktree name from path
    # Path format: .../claude-worktrees/repo-name/worktree-name/...
    local worktree_name=$(echo "$current_path" | grep -oE 'claude-worktrees/[^/]+/[^/]+' | cut -d'/' -f3)

    if [ -n "$worktree_name" ]; then
      # Hash worktree name to 1-9
      # Use cksum instead of sum for better cross-platform compatibility
      local hash=$(echo -n "$worktree_name" | cksum | cut -d' ' -f1)
      local instance_id=$(( (hash % 9) + 1 ))
      echo "$instance_id"
      return
    fi
  fi

  # 3. Default: main repo (instance 0)
  echo "0"
}

# Calculate port offset based on instance ID
# Formula: new_port = base_port + (instance_id * 1000)
calculate_port() {
  local base_port=$1
  local instance_id=$2
  echo $(( base_port + (instance_id * 1000) ))
}

# Main configuration
configure_instance() {
  # Detect instance ID (preserve if already set, else detect)
  export AI_INSTANCE_ID="${AI_INSTANCE_ID:-$(detect_instance_id)}"

  # Calculate port offsets
  local offset=$(( AI_INSTANCE_ID * 1000 ))

  # Service ports
  # Note: WhatsApp is now integrated into Dashboard (unified server on DASHBOARD_PORT)
  export DASHBOARD_PORT=$(calculate_port 4098 $AI_INSTANCE_ID)
  export OPENCODE_PORT=$(calculate_port 4099 $AI_INSTANCE_ID)
  export VITE_PORT=$(calculate_port 5173 $AI_INSTANCE_ID)

  # Infrastructure ports (MinIO for S3-compatible storage, Nginx for reverse proxy)
  export MINIO_API_PORT=$(calculate_port 9000 $AI_INSTANCE_ID)
  export MINIO_CONSOLE_PORT=$(calculate_port 9001 $AI_INSTANCE_ID)
  export NGINX_PORT=$(calculate_port 80 $AI_INSTANCE_ID)
  export NGINX_SSL_PORT=$(calculate_port 443 $AI_INSTANCE_ID)

  # Docker compose project name (for container isolation)
  export COMPOSE_PROJECT_NAME="orienter-instance-${AI_INSTANCE_ID}"

  # SQLite database configuration (file-based, instance-specific)
  local project_root="${PROJECT_ROOT:-$(pwd)}"
  export DATA_DIR="${project_root}/.dev-data/instance-${AI_INSTANCE_ID}"
  export SQLITE_DB_PATH="${DATA_DIR}/orient.db"
  export SQLITE_DATABASE="${SQLITE_DATABASE:-$SQLITE_DB_PATH}"

  # S3/MinIO configuration
  export S3_BUCKET="${S3_BUCKET:-orienter-data}-${AI_INSTANCE_ID}"
  export AWS_ENDPOINT_URL="http://localhost:${MINIO_API_PORT}"

  # Instance-specific directories
  export LOG_DIR="${project_root}/logs/instance-${AI_INSTANCE_ID}"
  export PID_DIR="${project_root}/.dev-pids/instance-${AI_INSTANCE_ID}"

  # WhatsApp enabled flag (disabled by default for non-zero instances)
  if [ "$AI_INSTANCE_ID" = "0" ]; then
    export WHATSAPP_ENABLED="${WHATSAPP_ENABLED:-true}"
  else
    export WHATSAPP_ENABLED="${WHATSAPP_ENABLED:-false}"
  fi

  # Configure OpenCode isolation if the script exists
  # This ensures OpenCode uses project-local data instead of global ~/.opencode/
  local script_dir="$(dirname "${BASH_SOURCE[0]}")"
  if [ -f "$script_dir/opencode-env.sh" ]; then
    source "$script_dir/opencode-env.sh"
    configure_opencode_isolation
  fi

  # Configure pnpm/corepack caches outside .opencode to avoid ENOSPC loops
  configure_node_package_env
}

# Keep node package caches out of .opencode (XDG isolation can redirect them)
configure_node_package_env() {
  local project_root="${PROJECT_ROOT:-$(pwd)}"
  local cache_root=""
  if [ -d "$HOME/Library/Caches" ]; then
    cache_root="$HOME/Library/Caches"
  else
    cache_root="$HOME/.cache"
  fi
  local pnpm_home_default="$cache_root/pnpm"
  local pnpm_store_default="$cache_root/pnpm-store"
  local npm_cache_default="$cache_root/npm"
  local corepack_home_default="$cache_root/corepack"

  export PNPM_HOME="${PNPM_HOME:-$pnpm_home_default}"
  export PNPM_STORE_PATH="${PNPM_STORE_PATH:-$pnpm_store_default}"
  export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-$npm_cache_default}"
  export COREPACK_HOME="${COREPACK_HOME:-$corepack_home_default}"

  mkdir -p "$PNPM_HOME" "$PNPM_STORE_PATH" "$NPM_CONFIG_CACHE" "$COREPACK_HOME" 2>/dev/null || true
}

# Display instance information
display_instance_info() {
  # Get git info
  local git_sha=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
  local git_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
  local git_msg=$(git log -1 --pretty=format:'%s' 2>/dev/null | head -c 50)
  local git_behind=$(git rev-list --count HEAD..@{upstream} 2>/dev/null || echo "?")

  echo "=========================================="
  echo "  Orient - Instance ${AI_INSTANCE_ID}"
  echo "=========================================="
  echo ""
  echo "Git Info:"
  echo "  Branch:           ${git_branch}"
  echo "  Commit:           ${git_sha} - ${git_msg}"
  if [ "$git_behind" != "0" ] && [ "$git_behind" != "?" ]; then
    echo "  ⚠️  Behind remote:  ${git_behind} commit(s) - run 'git pull' to update"
  fi
  echo ""
  echo "Instance Configuration:"
  echo "  Instance ID:      ${AI_INSTANCE_ID}"
  echo "  Compose Project:  ${COMPOSE_PROJECT_NAME}"
  echo "  Database:         SQLite (${SQLITE_DB_PATH})"
  echo "  S3 Bucket:        ${S3_BUCKET}"
  echo ""
  echo "Service Ports:"
  echo "  Dashboard:        http://localhost:${DASHBOARD_PORT} ($([ "$WHATSAPP_ENABLED" = "true" ] && echo "+WhatsApp" || echo "WhatsApp disabled"))"
  echo "  OpenCode:         http://localhost:${OPENCODE_PORT}"
  echo "  Vite Dev:         http://localhost:${VITE_PORT}"
  echo ""
  echo "Infrastructure Ports:"
  echo "  Nginx:            http://localhost:${NGINX_PORT}"
  echo "  Nginx SSL:        https://localhost:${NGINX_SSL_PORT}"
  echo "  MinIO Console:    http://localhost:${MINIO_CONSOLE_PORT}"
  echo "  MinIO API:        http://localhost:${MINIO_API_PORT}"
  echo ""
  echo "Instance Directories:"
  echo "  Data:             ${DATA_DIR}"
  echo "  Logs:             ${LOG_DIR}"
  echo "  PIDs:             ${PID_DIR}"
  echo "=========================================="
  echo ""
}

# Export instance detection function for use in other scripts
export -f detect_instance_id
export -f calculate_port

# Auto-configure if sourced (not executed)
if [ "${BASH_SOURCE[0]}" != "${0}" ]; then
  configure_instance
fi
