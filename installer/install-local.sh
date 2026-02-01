#!/usr/bin/env bash
# =============================================================================
# Orient - Local Development Installer
# =============================================================================
# Installs Orient from local source directory for development/testing.
# Same flow as install.sh but copies from local source instead of cloning.
#
# Usage:
#   ./installer/install-local.sh                    # Install to ~/.orient
#   ORIENT_HOME=/custom/path ./installer/install-local.sh  # Custom location
#   ./installer/install-local.sh --verbose          # Verbose output
#
# Prerequisites:
#   - Node.js 20+
#   - pnpm (will be installed if missing)
#   - git (for version detection)
# =============================================================================

set -e

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ORIENT_HOME="${ORIENT_HOME:-$HOME/.orient}"
VERBOSE="${VERBOSE:-false}"

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
    echo -e "${BLUE}[orient]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[orient]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[orient]${NC} $1"
}

log_error() {
    echo -e "${RED}[orient]${NC} $1"
}

log_verbose() {
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${DIM}[orient]${NC} $1"
    fi
}

die() {
    log_error "$1"
    exit 1
}

# Parse arguments
for arg in "$@"; do
    case "$arg" in
        --verbose|-v)
            VERBOSE=true
            ;;
        --help|-h)
            echo "Orient Local Installer"
            echo ""
            echo "Usage: ./installer/install-local.sh [options]"
            echo ""
            echo "Options:"
            echo "  --verbose, -v   Show detailed output"
            echo "  --help, -h      Show this help"
            echo ""
            echo "Environment variables:"
            echo "  ORIENT_HOME     Installation directory (default: ~/.orient)"
            exit 0
            ;;
    esac
done

# =============================================================================
# Prerequisite Checks
# =============================================================================

check_prerequisites() {
    log "Checking prerequisites..."

    # Check Node.js
    if ! command -v node &> /dev/null; then
        die "Node.js is not installed. Please install Node.js 20+ first."
    fi

    local node_version=$(node --version | tr -d 'v')
    local node_major=$(echo "$node_version" | cut -d. -f1)

    if [ "$node_major" -lt 20 ]; then
        die "Node.js version $node_version is too old. Version 20+ is required."
    fi

    log_verbose "Node.js v$node_version OK"

    # Check pnpm (install if missing)
    if ! command -v pnpm &> /dev/null; then
        log_warn "pnpm is not installed. Installing..."
        npm install -g pnpm || die "Failed to install pnpm"
        log_success "pnpm installed successfully"
    fi

    local pnpm_version=$(pnpm --version)
    log_verbose "pnpm v$pnpm_version OK"

    # Check git (optional but useful for version info)
    if command -v git &> /dev/null; then
        local git_version=$(git --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        log_verbose "Git v$git_version OK"
    else
        log_warn "Git is not installed. Some features may not work."
    fi

    log_success "Prerequisites check passed"
}

# =============================================================================
# Installation
# =============================================================================

create_directory_structure() {
    log "Creating directory structure at $ORIENT_HOME..."

    mkdir -p "$ORIENT_HOME"
    mkdir -p "$ORIENT_HOME/data"
    mkdir -p "$ORIENT_HOME/logs"
    mkdir -p "$ORIENT_HOME/config"
    mkdir -p "$ORIENT_HOME/backups"

    log_verbose "Created directories:"
    log_verbose "  $ORIENT_HOME/data"
    log_verbose "  $ORIENT_HOME/logs"
    log_verbose "  $ORIENT_HOME/config"
    log_verbose "  $ORIENT_HOME/backups"

    log_success "Directory structure created"
}

copy_source() {
    log "Copying source from $SOURCE_ROOT..."

    # Create source directory
    mkdir -p "$ORIENT_HOME/source"

    # Copy source files (excluding node_modules, dist, etc.)
    rsync -a --exclude='node_modules' \
             --exclude='dist' \
             --exclude='.git' \
             --exclude='*.log' \
             --exclude='.env' \
             --exclude='data/*.db' \
             --exclude='data/*.sqlite' \
             "$SOURCE_ROOT/" "$ORIENT_HOME/source/" 2>/dev/null || \
    cp -R "$SOURCE_ROOT/." "$ORIENT_HOME/source/" 2>/dev/null || \
    die "Failed to copy source files"

    # Remove unwanted files if they got copied
    rm -rf "$ORIENT_HOME/source/node_modules" 2>/dev/null || true
    rm -rf "$ORIENT_HOME/source/dist" 2>/dev/null || true
    rm -rf "$ORIENT_HOME/source/.git" 2>/dev/null || true

    log_success "Source files copied"
}

install_dependencies() {
    log "Installing dependencies..."

    cd "$ORIENT_HOME/source"

    if [ "$VERBOSE" = "true" ]; then
        pnpm install || die "Failed to install dependencies"
    else
        pnpm install --reporter=silent 2>&1 | grep -E '(ERR!|error|Error)' || true
        if [ "${PIPESTATUS[0]}" -ne 0 ]; then
            die "Failed to install dependencies. Run with --verbose for details."
        fi
    fi

    log_success "Dependencies installed"
}

build_project() {
    log "Building project..."

    cd "$ORIENT_HOME/source"

    if [ "$VERBOSE" = "true" ]; then
        pnpm build:all || die "Failed to build project"
    else
        pnpm build:all 2>&1 | grep -E '(ERR!|error|Error|failed)' || true
        if [ "${PIPESTATUS[0]}" -ne 0 ]; then
            die "Failed to build project. Run with --verbose for details."
        fi
    fi

    log_success "Project built successfully"
}

generate_config() {
    log "Generating configuration..."

    local config_file="$ORIENT_HOME/source/.env"

    # Generate secure secrets
    local jwt_secret=$(openssl rand -base64 48 | tr -d '\n')
    local master_key=$(openssl rand -base64 48 | tr -d '\n')

    # Create .env file with SQLite + local storage configuration
    cat > "$config_file" << EOF
# =============================================================================
# Orient Configuration
# Generated by install-local.sh on $(date)
# =============================================================================

# Environment
NODE_ENV=development

# Database (SQLite - local storage)
DATABASE_TYPE=sqlite
DATABASE_URL=file:$ORIENT_HOME/data/orient.db

# Storage (Local filesystem)
STORAGE_TYPE=local
STORAGE_PATH=$ORIENT_HOME/data/storage

# Security
DASHBOARD_JWT_SECRET=$jwt_secret
ORIENT_MASTER_KEY=$master_key

# Server
PORT=4098
HOST=localhost

# Logging
LOG_LEVEL=info
LOG_DIR=$ORIENT_HOME/logs

# Paths
ORIENT_HOME=$ORIENT_HOME
EOF

    log_verbose "Configuration written to $config_file"
    log_success "Configuration generated"
}

create_pm2_ecosystem() {
    log "Creating PM2 ecosystem configuration..."

    local ecosystem_file="$ORIENT_HOME/source/ecosystem.config.js"

    cat > "$ecosystem_file" << 'EOF'
module.exports = {
  apps: [
    {
      name: 'orient-dashboard',
      script: 'dist/packages/dashboard-backend/src/main.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'orient-slack',
      script: 'dist/packages/bot-slack/src/main.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'orient-whatsapp',
      script: 'dist/packages/bot-whatsapp/src/main.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
EOF

    log_verbose "PM2 ecosystem config written to $ecosystem_file"
    log_success "PM2 ecosystem configuration created"
}

create_cli_wrapper() {
    log "Creating CLI wrapper..."

    local cli_script="$ORIENT_HOME/bin/orient"
    mkdir -p "$ORIENT_HOME/bin"

    cat > "$cli_script" << EOF
#!/usr/bin/env bash
# Orient CLI wrapper
# Generated by install-local.sh

ORIENT_HOME="$ORIENT_HOME"
export ORIENT_HOME

cd "\$ORIENT_HOME/source"

# Load environment
if [ -f "\$ORIENT_HOME/source/.env" ]; then
    set -a
    source "\$ORIENT_HOME/source/.env"
    set +a
fi

# Run the command
case "\$1" in
    doctor)
        ./scripts/doctor.sh "\${@:2}"
        ;;
    start)
        echo "Starting Orient services..."
        if command -v pm2 &> /dev/null; then
            pm2 start ecosystem.config.js
        else
            echo "PM2 not installed. Run: npm install -g pm2"
            exit 1
        fi
        ;;
    stop)
        echo "Stopping Orient services..."
        if command -v pm2 &> /dev/null; then
            pm2 stop ecosystem.config.js
        fi
        ;;
    dev)
        ./run.sh dev
        ;;
    *)
        echo "Orient CLI"
        echo ""
        echo "Usage: orient <command>"
        echo ""
        echo "Commands:"
        echo "  doctor    Check system health"
        echo "  start     Start Orient services (requires PM2)"
        echo "  stop      Stop Orient services"
        echo "  dev       Run in development mode"
        echo ""
        ;;
esac
EOF

    chmod +x "$cli_script"

    log_verbose "CLI wrapper created at $cli_script"
    log_success "CLI wrapper created"
}

add_to_path() {
    log "Configuring PATH..."

    local shell_rc=""
    local bin_path="$ORIENT_HOME/bin"

    # Detect shell config file
    if [ -n "$ZSH_VERSION" ] || [ -f "$HOME/.zshrc" ]; then
        shell_rc="$HOME/.zshrc"
    elif [ -n "$BASH_VERSION" ] || [ -f "$HOME/.bashrc" ]; then
        shell_rc="$HOME/.bashrc"
    elif [ -f "$HOME/.profile" ]; then
        shell_rc="$HOME/.profile"
    fi

    if [ -n "$shell_rc" ]; then
        # Check if already added
        if ! grep -q "ORIENT_HOME" "$shell_rc" 2>/dev/null; then
            echo "" >> "$shell_rc"
            echo "# Orient" >> "$shell_rc"
            echo "export ORIENT_HOME=\"$ORIENT_HOME\"" >> "$shell_rc"
            echo "export PATH=\"\$ORIENT_HOME/bin:\$PATH\"" >> "$shell_rc"
            log_verbose "Added Orient to $shell_rc"
        else
            log_verbose "Orient already in $shell_rc"
        fi
    fi

    # Also add to current session
    export ORIENT_HOME="$ORIENT_HOME"
    export PATH="$ORIENT_HOME/bin:$PATH"

    log_success "PATH configured"
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo ""
    echo -e "${BOLD}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  Orient - Local Development Installer                         ║${NC}"
    echo -e "${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    log "Installing Orient to $ORIENT_HOME"
    log "Source: $SOURCE_ROOT"
    echo ""

    # Run installation steps
    check_prerequisites
    create_directory_structure
    copy_source
    install_dependencies
    build_project
    generate_config
    create_pm2_ecosystem
    create_cli_wrapper
    add_to_path

    # Final summary
    echo ""
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}Installation Complete!${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "Orient has been installed to: ${CYAN}$ORIENT_HOME${NC}"
    echo ""
    echo -e "To get started:"
    echo -e "  ${DIM}1. Restart your terminal or run: source ~/.bashrc (or ~/.zshrc)${NC}"
    echo -e "  ${DIM}2. Check your installation: orient doctor${NC}"
    echo -e "  ${DIM}3. Start development: orient dev${NC}"
    echo ""
    echo -e "For more information, see the documentation in:"
    echo -e "  ${CYAN}$ORIENT_HOME/source/docs/${NC}"
    echo ""
}

main
