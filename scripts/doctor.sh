#!/usr/bin/env bash
# =============================================================================
# Orient - Doctor Script
# =============================================================================
# Diagnoses the development environment to ensure all required tools and
# configurations are present.
#
# Usage:
#   ./scripts/doctor.sh          # Run all checks
#   ./scripts/doctor.sh --fix    # Attempt to fix issues where possible
#   ./scripts/doctor.sh --quiet  # Only show errors
#
# Exit codes:
#   0 - All checks passed
#   1 - Required checks failed (cannot run the project)
#   2 - Optional checks failed (some features may not work)
# =============================================================================

set -e

# Get the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load cross-platform utilities
source "$SCRIPT_DIR/lib/platform.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Counters
PASSED=0
WARNINGS=0
ERRORS=0

# Options
FIX_MODE=false
QUIET_MODE=false

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    --fix)
      FIX_MODE=true
      ;;
    --quiet|-q)
      QUIET_MODE=true
      ;;
    --help|-h)
      echo "Usage: ./scripts/doctor.sh [options]"
      echo ""
      echo "Options:"
      echo "  --fix     Attempt to fix issues where possible"
      echo "  --quiet   Only show errors"
      echo "  --help    Show this help"
      exit 0
      ;;
  esac
done

# =============================================================================
# Helper Functions
# =============================================================================

print_header() {
  if [ "$QUIET_MODE" = false ]; then
    echo ""
    echo -e "${BLUE}${BOLD}$1${NC}"
    echo -e "${DIM}$(printf '%.0s─' {1..60})${NC}"
  fi
}

check_pass() {
  PASSED=$((PASSED + 1))
  if [ "$QUIET_MODE" = false ]; then
    echo -e "  ${GREEN}✓${NC} $1"
  fi
}

check_warn() {
  WARNINGS=$((WARNINGS + 1))
  echo -e "  ${YELLOW}⚠${NC} $1"
  if [ -n "$2" ]; then
    echo -e "    ${DIM}$2${NC}"
  fi
}

check_fail() {
  ERRORS=$((ERRORS + 1))
  echo -e "  ${RED}✗${NC} $1"
  if [ -n "$2" ]; then
    echo -e "    ${DIM}$2${NC}"
  fi
}

check_info() {
  if [ "$QUIET_MODE" = false ]; then
    echo -e "  ${CYAN}ℹ${NC} $1"
  fi
}

version_gte() {
  # Returns 0 if $1 >= $2 using version comparison
  printf '%s\n%s\n' "$2" "$1" | sort -V -C
}

get_major_version() {
  echo "$1" | cut -d. -f1 | tr -d 'v'
}

# =============================================================================
# Checks
# =============================================================================

check_platform() {
  print_header "Platform"

  local os=$(detect_os)
  local pm=$(detect_package_manager)

  case "$os" in
    macos)
      check_pass "Platform: macOS"
      ;;
    linux)
      check_pass "Platform: Linux"
      if [ "$pm" = "apt" ]; then
        check_info "Package manager: apt (Debian/Ubuntu)"
      elif [ "$pm" != "unknown" ]; then
        check_info "Package manager: $pm"
      fi
      ;;
    wsl)
      check_pass "Platform: WSL2 (Windows Subsystem for Linux)"
      check_info "Ensure Docker Desktop WSL2 backend is enabled"
      if [ "$pm" = "apt" ]; then
        check_info "Package manager: apt (Debian/Ubuntu)"
      fi
      ;;
    *)
      check_warn "Platform: Unknown ($(uname -s))" "Some features may not work correctly"
      ;;
  esac
}

check_node() {
  print_header "Node.js"
  
  if ! command -v node &> /dev/null; then
    check_fail "Node.js is not installed" "Install from https://nodejs.org or use nvm"
    return
  fi
  
  local node_version=$(node --version | tr -d 'v')
  local node_major=$(get_major_version "$node_version")
  
  if [ "$node_major" -ge 20 ]; then
    check_pass "Node.js v$node_version (>=20 required)"
  else
    check_fail "Node.js v$node_version is too old" "Version 20+ is required. Run: nvm install 20"
  fi
  
  # Check npm (comes with Node.js)
  if command -v npm &> /dev/null; then
    local npm_version=$(npm --version)
    check_pass "npm v$npm_version"
  fi
}

check_pnpm() {
  print_header "pnpm"
  
  if ! command -v pnpm &> /dev/null; then
    check_fail "pnpm is not installed" "Install: npm install -g pnpm"
    
    if [ "$FIX_MODE" = true ]; then
      echo -e "    ${CYAN}→ Attempting to install pnpm...${NC}"
      if npm install -g pnpm; then
        check_pass "pnpm installed successfully"
      fi
    fi
    return
  fi
  
  local pnpm_version=$(pnpm --version)
  local pnpm_major=$(get_major_version "$pnpm_version")
  
  if [ "$pnpm_major" -ge 9 ]; then
    check_pass "pnpm v$pnpm_version (>=9 required)"
  else
    check_fail "pnpm v$pnpm_version is too old" "Version 9+ required. Run: npm install -g pnpm@latest"
  fi
}

check_docker() {
  print_header "Docker"
  
  if ! command -v docker &> /dev/null; then
    check_fail "Docker is not installed" "Install from https://docs.docker.com/get-docker/"
    return
  fi
  
  local docker_version=$(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  check_pass "Docker v$docker_version"
  
  # Check if Docker daemon is running
  if docker info &> /dev/null; then
    check_pass "Docker daemon is running"
  else
    check_fail "Docker daemon is not running" "Start Docker Desktop or run: sudo systemctl start docker"
    return
  fi
  
  # Check docker compose
  if docker compose version &> /dev/null; then
    local compose_version=$(docker compose version --short 2>/dev/null || docker compose version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    check_pass "Docker Compose v$compose_version"
  else
    check_warn "Docker Compose (plugin) not found" "Install: docker compose plugin or docker-compose standalone"
  fi
}

check_git() {
  print_header "Git"
  
  if ! command -v git &> /dev/null; then
    check_fail "Git is not installed" "Install from https://git-scm.com/"
    return
  fi
  
  local git_version=$(git --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  check_pass "Git v$git_version"
  
  # Check if we're in a git repo
  if git -C "$PROJECT_ROOT" rev-parse --git-dir &> /dev/null; then
    check_pass "Project is a Git repository"
  else
    check_warn "Project is not a Git repository"
  fi
}

check_opencode_isolation() {
  print_header "OpenCode Isolation"

  # Check if opencode-env.sh exists
  if [ ! -f "$PROJECT_ROOT/scripts/opencode-env.sh" ]; then
    check_fail "opencode-env.sh not found" "Required for OpenCode isolation"
    return
  fi

  check_pass "opencode-env.sh exists"

  # Source and configure isolation
  source "$PROJECT_ROOT/scripts/opencode-env.sh"

  # Save current env
  local old_test_home="$OPENCODE_TEST_HOME"
  local old_xdg_data="$XDG_DATA_HOME"

  # Clear and reconfigure
  unset OPENCODE_TEST_HOME XDG_DATA_HOME XDG_CONFIG_HOME XDG_CACHE_HOME XDG_STATE_HOME
  export PROJECT_ROOT="$PROJECT_ROOT"
  configure_opencode_isolation

  # Check isolation is configured correctly
  local expected_home="$PROJECT_ROOT/.opencode"

  if [ "$OPENCODE_TEST_HOME" = "$expected_home" ]; then
    check_pass "OPENCODE_TEST_HOME configured correctly"
  else
    check_fail "OPENCODE_TEST_HOME not configured" "Expected: $expected_home"
  fi

  if [ "$XDG_DATA_HOME" = "$expected_home/data" ]; then
    check_pass "XDG_DATA_HOME configured correctly"
  else
    check_fail "XDG_DATA_HOME not configured" "Expected: $expected_home/data"
  fi

  # Check that .opencode directory structure exists
  if [ -d "$PROJECT_ROOT/.opencode" ]; then
    check_pass ".opencode directory exists"
  else
    check_warn ".opencode directory does not exist" "Will be created on first run"
  fi

  # Verify isolation doesn't point to user home
  if [[ "$OPENCODE_TEST_HOME" != "$HOME"* ]] || [[ "$OPENCODE_TEST_HOME" == "$expected_home"* ]]; then
    check_pass "Isolation prevents use of global ~/.opencode/"
  else
    check_fail "Isolation may use global config" "OPENCODE_TEST_HOME points to home directory"
  fi

  # Restore env
  if [ -n "$old_test_home" ]; then
    export OPENCODE_TEST_HOME="$old_test_home"
  fi
  if [ -n "$old_xdg_data" ]; then
    export XDG_DATA_HOME="$old_xdg_data"
  fi
}

check_optional_tools() {
  print_header "Optional Tools"

  # OpenCode (for MCP servers)
  if command -v opencode &> /dev/null; then
    local opencode_version=$(opencode --version 2>/dev/null || echo "unknown")
    check_pass "OpenCode: $opencode_version"
  else
    check_warn "OpenCode is not installed" "Required for MCP servers. Install from https://opencode.ai"
  fi

  # curl (for health checks)
  if command -v curl &> /dev/null; then
    check_pass "curl is available"
  else
    local hint=$(get_install_hint "curl")
    check_warn "curl is not installed" "Required for health checks. ${hint:-Install curl}"
    try_install_tool "curl"
  fi

  # sqlite3 (for database debugging)
  if command -v sqlite3 &> /dev/null; then
    check_pass "sqlite3 is available (useful for debugging)"
  else
    check_info "sqlite3 not installed (optional, for database debugging)"
  fi

  # lsof (for port checking)
  if command -v lsof &> /dev/null; then
    check_pass "lsof is available"
  else
    local hint=$(get_install_hint "lsof")
    check_warn "lsof is not installed" "Required for port conflict detection. ${hint:-Install lsof}"
    try_install_tool "lsof"
  fi

  # jq (for JSON parsing)
  if command -v jq &> /dev/null; then
    check_pass "jq is available"
  else
    local hint=$(get_install_hint "jq")
    check_info "jq not installed (optional, for JSON debugging). ${hint:-Install jq}"
    try_install_tool "jq"
  fi

  # envsubst (for config templating)
  if command -v envsubst &> /dev/null; then
    check_pass "envsubst is available"
  else
    local hint=$(get_install_hint "envsubst")
    check_warn "envsubst is not installed" "Required for nginx config. ${hint:-Install gettext package}"
    try_install_tool "envsubst"
  fi
}

# Helper to prompt for tool installation in fix mode (apt-based systems only)
try_install_tool() {
  local tool="$1"
  if [ "$FIX_MODE" = true ]; then
    local pm=$(detect_package_manager)
    if [ "$pm" = "apt" ]; then
      local pkg="$tool"
      # Map tool names to package names
      case "$tool" in
        envsubst) pkg="gettext-base" ;;
      esac
      echo -e "    ${CYAN}Install $pkg? [y/N]${NC}"
      read -r response
      if [[ "$response" =~ ^[Yy]$ ]]; then
        if sudo apt install -y "$pkg"; then
          check_pass "$tool installed successfully"
        else
          check_fail "Failed to install $tool"
        fi
      fi
    fi
  fi
}

check_config_files() {
  print_header "Configuration Files"
  
  # .env file
  if [ -f "$PROJECT_ROOT/.env" ]; then
    check_pass ".env file exists"
    
    # Check for required environment variables (SQLite - no database credentials needed)
    local required_vars=("MINIO_ROOT_USER" "MINIO_ROOT_PASSWORD" "DASHBOARD_JWT_SECRET" "ORIENT_MASTER_KEY")
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
      if ! grep -q "^${var}=" "$PROJECT_ROOT/.env" 2>/dev/null; then
        missing_vars+=("$var")
      fi
    done
    
    if [ ${#missing_vars[@]} -eq 0 ]; then
      check_pass "Required environment variables are set"
    else
      check_warn "Missing environment variables: ${missing_vars[*]}" "Add these to your .env file"
    fi
    
    # Check JWT secret length (must be at least 32 characters)
    local jwt_secret=$(grep "^DASHBOARD_JWT_SECRET=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2-)
    if [ -n "$jwt_secret" ]; then
      local jwt_len=${#jwt_secret}
      if [ "$jwt_len" -ge 32 ]; then
        check_pass "DASHBOARD_JWT_SECRET is valid ($jwt_len chars)"
      else
        check_fail "DASHBOARD_JWT_SECRET is too short ($jwt_len chars, need 32+)" "Generate with: openssl rand -base64 48"
        
        if [ "$FIX_MODE" = true ]; then
          echo -e "    ${CYAN}→ Generating secure JWT secret...${NC}"
          local new_secret=$(openssl rand -base64 48 | tr -d '\n')
          if [ -n "$new_secret" ]; then
            sed_inplace "$PROJECT_ROOT/.env" "s|^DASHBOARD_JWT_SECRET=.*|DASHBOARD_JWT_SECRET=${new_secret}|"
            check_pass "DASHBOARD_JWT_SECRET regenerated (${#new_secret} chars)"
          fi
        fi
      fi
    fi
    
    # Check ORIENT_MASTER_KEY (must be at least 32 characters for production encryption)
    local master_key=$(grep "^ORIENT_MASTER_KEY=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2-)
    if [ -n "$master_key" ]; then
      local key_len=${#master_key}
      if [ "$key_len" -ge 32 ]; then
        check_pass "ORIENT_MASTER_KEY is valid ($key_len chars)"
      else
        check_fail "ORIENT_MASTER_KEY is too short ($key_len chars, need 32+)" "Generate with: openssl rand -base64 48"
        
        if [ "$FIX_MODE" = true ]; then
          echo -e "    ${CYAN}→ Generating secure master key...${NC}"
          local new_key=$(openssl rand -base64 48 | tr -d '\n')
          if [ -n "$new_key" ]; then
            sed_inplace "$PROJECT_ROOT/.env" "s|^ORIENT_MASTER_KEY=.*|ORIENT_MASTER_KEY=${new_key}|"
            check_pass "ORIENT_MASTER_KEY regenerated (${#new_key} chars)"
          fi
        fi
      fi
    else
      check_fail "ORIENT_MASTER_KEY is not set" "Required for secret encryption. Generate with: openssl rand -base64 48"

      if [ "$FIX_MODE" = true ]; then
        echo -e "    ${CYAN}→ Generating secure master key...${NC}"
        local new_key=$(openssl rand -base64 48 | tr -d '\n')
        if [ -n "$new_key" ]; then
          echo "ORIENT_MASTER_KEY=${new_key}" >> "$PROJECT_ROOT/.env"
          check_pass "ORIENT_MASTER_KEY added to .env (${#new_key} chars)"
        fi
      fi
    fi

    # Check for placeholder values that won't work
    if grep -q "your-secure-password\|your-dashboard-jwt-secret\|your-master-key" "$PROJECT_ROOT/.env" 2>/dev/null; then
      check_warn "Found placeholder values in .env" "Replace 'your-secure-password' and similar placeholders"

      if [ "$FIX_MODE" = true ]; then
        echo -e "    ${CYAN}→ Replacing placeholder values with defaults...${NC}"
        # Replace placeholder passwords with working defaults (SQLite - no database password)
        sed_inplace "$PROJECT_ROOT/.env" "s|MINIO_ROOT_PASSWORD=your-secure-password|MINIO_ROOT_PASSWORD=minioadmin123|g"
        local new_jwt=$(openssl rand -base64 48 | tr -d '\n')
        sed_inplace "$PROJECT_ROOT/.env" "s|DASHBOARD_JWT_SECRET=your-dashboard-jwt-secret|DASHBOARD_JWT_SECRET=${new_jwt}|g"
        local new_master=$(openssl rand -base64 48 | tr -d '\n')
        sed_inplace "$PROJECT_ROOT/.env" "s|ORIENT_MASTER_KEY=your-master-key|ORIENT_MASTER_KEY=${new_master}|g"
        check_pass "Placeholder values replaced with working defaults"
      fi
    fi
    
    # SQLite database - no credentials needed
    check_info "Database: SQLite (file-based, no credentials required)"
  else
    check_fail ".env file does not exist" "Copy from template: cp .env.example .env"
    
    if [ "$FIX_MODE" = true ] && [ -f "$PROJECT_ROOT/.env.example" ]; then
      echo -e "    ${CYAN}→ Copying .env.example to .env...${NC}"
      cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
      check_pass ".env file created from template"
      
      # Verify the created .env has valid values
      local jwt_secret=$(grep "^DASHBOARD_JWT_SECRET=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2-)
      if [ -n "$jwt_secret" ] && [ ${#jwt_secret} -lt 32 ]; then
        echo -e "    ${CYAN}→ Generating secure JWT secret...${NC}"
        local new_secret=$(openssl rand -base64 48 | tr -d '\n')
        sed_inplace "$PROJECT_ROOT/.env" "s|^DASHBOARD_JWT_SECRET=.*|DASHBOARD_JWT_SECRET=${new_secret}|"
        check_pass "DASHBOARD_JWT_SECRET generated"
      fi
    fi
  fi
  
  # .env.example as reference
  if [ -f "$PROJECT_ROOT/.env.example" ]; then
    check_pass ".env.example template exists"
  else
    check_warn ".env.example template is missing"
  fi
  
  # MCP config
  if [ -f "$PROJECT_ROOT/.mcp.config.local.json" ]; then
    check_pass ".mcp.config.local.json exists"
  elif [ -f "$PROJECT_ROOT/.mcp.config.example.json" ]; then
    check_warn ".mcp.config.local.json does not exist" "Copy: cp .mcp.config.example.json .mcp.config.local.json"
    
    if [ "$FIX_MODE" = true ]; then
      echo -e "    ${CYAN}→ Copying MCP config template...${NC}"
      cp "$PROJECT_ROOT/.mcp.config.example.json" "$PROJECT_ROOT/.mcp.config.local.json"
      check_pass "MCP config created from template"
    fi
  else
    check_info "No MCP config template found (optional)"
  fi
  
  # OpenCode config
  if [ -f "$PROJECT_ROOT/opencode.json" ]; then
    check_pass "opencode.json exists"
  else
    check_warn "opencode.json does not exist" "Required for MCP server configuration"
  fi
}

check_dependencies() {
  print_header "Project Dependencies"
  
  if [ -d "$PROJECT_ROOT/node_modules" ]; then
    check_pass "node_modules exists"
    
    # Check if dependencies are up to date
    if [ -f "$PROJECT_ROOT/pnpm-lock.yaml" ]; then
      local lock_time modules_time
      if [[ "$(detect_os)" == "macos" ]]; then
        lock_time=$(stat -f %m "$PROJECT_ROOT/pnpm-lock.yaml" 2>/dev/null)
        modules_time=$(stat -f %m "$PROJECT_ROOT/node_modules" 2>/dev/null)
      else
        lock_time=$(stat -c %Y "$PROJECT_ROOT/pnpm-lock.yaml" 2>/dev/null)
        modules_time=$(stat -c %Y "$PROJECT_ROOT/node_modules" 2>/dev/null)
      fi

      if [ -n "$lock_time" ] && [ -n "$modules_time" ]; then
        if [ "$lock_time" -gt "$modules_time" ]; then
          check_warn "Dependencies may be out of date" "Run: pnpm install"
        else
          check_pass "Dependencies appear up to date"
        fi
      fi
    fi
  else
    check_fail "node_modules does not exist" "Run: pnpm install"
    
    if [ "$FIX_MODE" = true ]; then
      echo -e "    ${CYAN}→ Installing dependencies...${NC}"
      cd "$PROJECT_ROOT" && pnpm install
      check_pass "Dependencies installed"
    fi
  fi
  
  # Check monorepo packages
  if [ -d "$PROJECT_ROOT/packages" ]; then
    local package_count=$(find "$PROJECT_ROOT/packages" -maxdepth 1 -type d | wc -l)
    check_pass "Monorepo packages directory exists ($((package_count - 1)) packages)"
  fi
}

check_ports() {
  print_header "Port Availability"
  
  # Default development ports (WhatsApp is now integrated into Dashboard)
  local ports=("80:Nginx" "4098:Dashboard" "4099:OpenCode" "5173:Vite" "9000:MinIO API" "9001:MinIO Console")
  
  for port_info in "${ports[@]}"; do
    local port="${port_info%%:*}"
    local service="${port_info##*:}"
    
    if command -v lsof &> /dev/null; then
      if lsof -i ":$port" &> /dev/null; then
        local process=$(lsof -i ":$port" -t 2>/dev/null | head -1)
        local process_name=$(ps -p "$process" -o comm= 2>/dev/null || echo "unknown")
        check_warn "Port $port ($service) is in use by $process_name (PID: $process)"
      else
        check_pass "Port $port ($service) is available"
      fi
    else
      check_info "Port $port ($service) - cannot check (lsof not available)"
    fi
  done
}

check_docker_images() {
  print_header "Docker Images"
  
  if ! docker info &> /dev/null; then
    check_warn "Skipping Docker image checks (daemon not running)"
    return
  fi
  
  local images=("nginx:alpine" "minio/minio:latest" "minio/mc:latest")
  
  for image in "${images[@]}"; do
    if docker image inspect "$image" &> /dev/null; then
      check_pass "$image is cached"
    else
      check_info "$image not cached (will be pulled on first run)"
      
      if [ "$FIX_MODE" = true ]; then
        echo -e "    ${CYAN}→ Pulling $image...${NC}"
        docker pull "$image" &> /dev/null && check_pass "$image pulled"
      fi
    fi
  done
}

check_typescript() {
  print_header "TypeScript"
  
  if [ -f "$PROJECT_ROOT/tsconfig.json" ]; then
    check_pass "tsconfig.json exists"
  else
    check_fail "tsconfig.json is missing"
  fi
  
  # Check if TypeScript compiles
  if command -v npx &> /dev/null && [ -d "$PROJECT_ROOT/node_modules" ]; then
    if npx tsc --noEmit --skipLibCheck 2>/dev/null; then
      check_pass "TypeScript compiles without errors"
    else
      check_warn "TypeScript has compilation errors" "Run: npm run typecheck"
    fi
  else
    check_info "Skipping TypeScript check (dependencies not installed)"
  fi
}

# =============================================================================
# Main
# =============================================================================

main() {
  echo ""
  echo -e "${BOLD}╔═══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║  Orient - Development Environment Doctor                      ║${NC}"
  echo -e "${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}"
  
  if [ "$FIX_MODE" = true ]; then
    echo -e "${CYAN}Running in fix mode - will attempt to resolve issues${NC}"
  fi

  # Run all checks
  check_platform
  check_node
  check_pnpm
  check_docker
  check_git
  check_optional_tools
  check_opencode_isolation
  check_config_files
  check_dependencies
  check_ports
  check_docker_images
  check_typescript
  
  # Summary
  echo ""
  echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}Summary${NC}"
  echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  
  echo -e "  ${GREEN}✓ Passed:${NC}   $PASSED"
  echo -e "  ${YELLOW}⚠ Warnings:${NC} $WARNINGS"
  echo -e "  ${RED}✗ Errors:${NC}   $ERRORS"
  echo ""
  
  if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}${BOLD}Some required checks failed.${NC}"
    echo -e "Please fix the errors above before running the project."
    echo ""
    echo -e "Quick fixes:"
    echo -e "  ${DIM}• Install Node.js 20+: nvm install 20${NC}"
    echo -e "  ${DIM}• Install pnpm: npm install -g pnpm${NC}"
    echo -e "  ${DIM}• Install Docker: https://docs.docker.com/get-docker/${NC}"
    echo -e "  ${DIM}• Create .env: cp .env.example .env${NC}"
    echo -e "  ${DIM}• Install deps: pnpm install${NC}"
    echo ""
    echo -e "Or run with --fix to attempt automatic fixes:"
    echo -e "  ${CYAN}./scripts/doctor.sh --fix${NC}"
    exit 1
  elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}${BOLD}All required checks passed, but there are warnings.${NC}"
    echo -e "Some optional features may not work correctly."
    echo ""
    echo -e "To start development anyway:"
    echo -e "  ${CYAN}./run.sh dev${NC}"
    exit 2
  else
    echo -e "${GREEN}${BOLD}All checks passed! Your environment is ready.${NC}"
    echo ""
    echo -e "To start development:"
    echo -e "  ${CYAN}./run.sh dev${NC}"
    echo ""
    echo -e "For more information:"
    echo -e "  ${DIM}• Documentation: docs/getting-started.md${NC}"
    echo -e "  ${DIM}• Configuration: docs/configuration.md${NC}"
    exit 0
  fi
}

main
