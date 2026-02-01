#!/usr/bin/env bash
# =============================================================================
# Orient - Public Installer
# =============================================================================
# One-line installer for Orient. Downloads and installs the latest version
# from GitHub.
#
# Usage:
#   curl -fsSL https://orient.bot/install.sh | bash
#   curl -fsSL https://orient.bot/install.sh | bash -s -- --verbose
#
# Prerequisites:
#   - Node.js 20+
#   - pnpm (will be installed if missing)
#   - git
# =============================================================================

set -e

# =============================================================================
# Configuration
# =============================================================================

ORIENT_HOME="${ORIENT_HOME:-$HOME/.orient}"
ORIENT_REPO="${ORIENT_REPO:-https://github.com/orient-bot/orient.git}"
ORIENT_BRANCH="${ORIENT_BRANCH:-main}"
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
        --branch=*)
            ORIENT_BRANCH="${arg#*=}"
            ;;
        --help|-h)
            echo "Orient Public Installer"
            echo ""
            echo "Usage: curl -fsSL https://orient.bot/install.sh | bash"
            echo "       curl -fsSL https://orient.bot/install.sh | bash -s -- [options]"
            echo ""
            echo "Options:"
            echo "  --verbose, -v       Show detailed output"
            echo "  --branch=<branch>   Install from specific branch (default: main)"
            echo "  --help, -h          Show this help"
            echo ""
            echo "Environment variables:"
            echo "  ORIENT_HOME     Installation directory (default: ~/.orient)"
            echo "  ORIENT_REPO     Git repository URL"
            echo "  ORIENT_BRANCH   Git branch to install"
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
        die "Node.js is not installed. Please install Node.js 20+ first.

Install Node.js:
  macOS:   brew install node@20
  Ubuntu:  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs
  Other:   https://nodejs.org/en/download/"
    fi

    local node_version=$(node --version | tr -d 'v')
    local node_major=$(echo "$node_version" | cut -d. -f1)

    if [ "$node_major" -lt 20 ]; then
        die "Node.js version $node_version is too old. Version 20+ is required.

Update Node.js:
  nvm:     nvm install 20 && nvm use 20
  macOS:   brew upgrade node
  Other:   https://nodejs.org/en/download/"
    fi

    log_verbose "Node.js v$node_version OK"

    # Check git
    if ! command -v git &> /dev/null; then
        die "Git is not installed. Please install Git first.

Install Git:
  macOS:   xcode-select --install
  Ubuntu:  sudo apt-get install git
  Other:   https://git-scm.com/downloads"
    fi

    local git_version=$(git --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    log_verbose "Git v$git_version OK"

    # Check pnpm (install if missing)
    if ! command -v pnpm &> /dev/null; then
        log_warn "pnpm is not installed. Installing..."
        npm install -g pnpm || die "Failed to install pnpm"
        log_success "pnpm installed successfully"
    fi

    local pnpm_version=$(pnpm --version)
    log_verbose "pnpm v$pnpm_version OK"

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

clone_repository() {
    log "Cloning Orient from GitHub..."

    local source_dir="$ORIENT_HOME/source"

    # Remove existing source if present
    if [ -d "$source_dir" ]; then
        log_warn "Existing installation found. Backing up..."
        mv "$source_dir" "$ORIENT_HOME/backups/source-$(date +%Y%m%d-%H%M%S)"
    fi

    if [ "$VERBOSE" = "true" ]; then
        git clone --branch "$ORIENT_BRANCH" --depth 1 "$ORIENT_REPO" "$source_dir" || \
            die "Failed to clone repository"
    else
        git clone --branch "$ORIENT_BRANCH" --depth 1 "$ORIENT_REPO" "$source_dir" 2>&1 | \
            grep -E '(fatal|error|Cloning)' || true
        if [ ! -d "$source_dir" ]; then
            die "Failed to clone repository. Run with --verbose for details."
        fi
    fi

    log_success "Repository cloned"
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
# Generated by install.sh on $(date)
# =============================================================================

# Environment
NODE_ENV=production

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
# Generated by install.sh

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
    status)
        if command -v pm2 &> /dev/null; then
            pm2 status
        else
            echo "PM2 not installed."
        fi
        ;;
    logs)
        if command -v pm2 &> /dev/null; then
            pm2 logs "\${@:2}"
        else
            echo "PM2 not installed."
        fi
        ;;
    update)
        echo "Updating Orient..."
        cd "\$ORIENT_HOME/source"
        git pull origin main
        pnpm install
        pnpm build:all
        echo "Update complete. Restart services with: orient restart"
        ;;
    restart)
        if command -v pm2 &> /dev/null; then
            pm2 restart ecosystem.config.js
        fi
        ;;
    version)
        echo "Orient CLI"
        if [ -f "\$ORIENT_HOME/source/package.json" ]; then
            node -e "console.log('Version:', require('./package.json').version)"
        fi
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
        echo "  restart   Restart Orient services"
        echo "  status    Show service status"
        echo "  logs      View service logs"
        echo "  update    Update to latest version"
        echo "  version   Show version"
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
    echo -e "${BOLD}║  Orient - Public Installer                                    ║${NC}"
    echo -e "${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    log "Installing Orient to $ORIENT_HOME"
    log "Repository: $ORIENT_REPO"
    log "Branch: $ORIENT_BRANCH"
    echo ""

    # Run installation steps
    check_prerequisites
    create_directory_structure
    clone_repository
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
    echo -e "  ${DIM}3. Start Orient: orient start${NC}"
    echo ""
    echo -e "For more information, see the documentation at:"
    echo -e "  ${CYAN}https://orient.bot/docs${NC}"
    echo ""
}

main
