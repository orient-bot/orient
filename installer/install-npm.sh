#!/bin/bash
#
# Orient One-Line Installer for macOS (npm-based)
#
# Usage: curl -fsSL https://orient.bot/install.sh | bash
#
# This script installs Orient via npm with:
# - Pre-built packages from npm (no compilation needed)
# - SQLite as the default database (PostgreSQL optional)
# - Local filesystem for media storage
# - PM2 for process management
#
# Installation time: ~30 seconds (vs 3-4 minutes for source build)
#

set -e

# Version - matches @orient-bot/cli version
ORIENT_VERSION="0.2.1"

# Installation directory
INSTALL_DIR="${ORIENT_HOME:-$HOME/.orient}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${GREEN}[orient]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[orient]${NC} $1"
}

error() {
    echo -e "${RED}[orient]${NC} $1"
    exit 1
}

info() {
    echo -e "${BLUE}[orient]${NC} $1"
}

is_interactive() {
    [[ -t 0 && -z "${ORIENT_NONINTERACTIVE:-}" ]]
}

# Prompt user before installing a package
prompt_install() {
    local package_name=$1
    local install_cmd=$2
    echo ""
    if ! is_interactive; then
        warn "Non-interactive mode: installing $package_name automatically"
        eval "$install_cmd"
        return
    fi
    read -p "$(echo -e "${YELLOW}[orient]${NC}") $package_name is required. Install it? [Y/n] " response
    case "$response" in
        [nN])
            error "Cannot proceed without $package_name"
            ;;
        *)
            eval "$install_cmd"
            ;;
    esac
}

# ============================================
# PREREQUISITE CHECKS
# ============================================

check_prerequisites() {
    log "Checking prerequisites..."

    # macOS only
    if [[ "$(uname)" != "Darwin" ]]; then
        error "This installer is for macOS only. For other platforms, please see the documentation."
    fi

    # Node.js 20+
    if ! command -v node &>/dev/null; then
        error "Node.js not found. Install with: brew install node@20"
    fi

    local node_version=$(node -v | cut -d. -f1 | tr -d 'v')
    if [[ "$node_version" -lt 20 ]]; then
        error "Node.js 20+ required (found: $(node -v)). Upgrade with: brew install node@20"
    fi
    log "Node.js $(node -v) ✓"
}

# ============================================
# OPENCODE CHECK
# ============================================

check_opencode() {
    if [[ "${ORIENT_SKIP_OPENCODE_CHECK:-}" == "1" ]]; then
        warn "Skipping OpenCode check (ORIENT_SKIP_OPENCODE_CHECK=1)"
        return
    fi

    local required_version="1.1.27"

    if command -v opencode &>/dev/null; then
        local current_version=$(opencode --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')

        if [[ "$current_version" == "$required_version" ]]; then
            log "OpenCode $current_version ✓"
        else
            warn "OpenCode version mismatch: have $current_version, need $required_version"
            echo ""
            read -p "$(echo -e "${YELLOW}[orient]${NC}") Update OpenCode to $required_version? [Y/n] " response
            if [[ "$response" != "n" && "$response" != "N" ]]; then
                curl -fsSL https://opencode.ai/install.sh | bash
            else
                error "Orient requires OpenCode $required_version. Cannot proceed."
            fi
        fi
    else
        warn "OpenCode is not installed (required for AI features)"
        echo ""
        read -p "$(echo -e "${YELLOW}[orient]${NC}") Install OpenCode $required_version? (Required) [Y/n] " response
        if [[ "$response" != "n" && "$response" != "N" ]]; then
            curl -fsSL https://opencode.ai/install.sh | bash
        else
            error "Orient requires OpenCode. Cannot proceed."
        fi
    fi
}

# ============================================
# INSTALLATION (npm-based)
# ============================================

install_orient() {
    log "Installing Orient CLI from npm..."

    # Create directory structure
    mkdir -p "$INSTALL_DIR"/{data/sqlite,data/media,data/whatsapp-auth,logs,bin}

    # Install @orient-bot/cli and dashboard globally from npm
    # This installs pre-built packages - no compilation needed!
    log "Installing @orient-bot/cli and @orient-bot/dashboard (this only takes a few seconds)..."
    REGISTRY="${NPM_REGISTRY:-https://registry.npmjs.org}"
    npm install -g @orient-bot/cli @orient-bot/dashboard --registry "$REGISTRY"

    log "Orient CLI installed ✓"
}

# ============================================
# CONFIGURATION
# ============================================

configure_orient() {
    local env_file="$INSTALL_DIR/.env"

    if [[ -f "$env_file" ]]; then
        log "Existing configuration found at $env_file"
        if ! is_interactive; then
            log "Non-interactive mode: keeping existing configuration"
            return
        fi
        read -p "Do you want to keep existing configuration? [Y/n] " keep_config
        if [[ "$keep_config" != "n" && "$keep_config" != "N" ]]; then
            log "Keeping existing configuration"
            return
        fi
    fi

    # Generate secrets
    local master_key=$(openssl rand -hex 32)
    local jwt_secret=$(openssl rand -hex 32)

    echo ""
    log "Let's configure Orient..."
    echo ""

    # Write configuration
    cat > "$env_file" << EOF
# =============================================================================
# Orient Configuration
# Generated: $(date)
# =============================================================================

# Environment
NODE_ENV=production
LOG_LEVEL=info

# =============================================================================
# Database (SQLite - default for local installation)
# =============================================================================
DATABASE_TYPE=sqlite
SQLITE_DATABASE=$INSTALL_DIR/data/sqlite/orient.db

# To use PostgreSQL instead, uncomment and configure:
# DATABASE_TYPE=postgres
# DATABASE_URL=postgresql://user:pass@localhost:5432/orient

# =============================================================================
# Storage (Local filesystem)
# =============================================================================
STORAGE_TYPE=local
STORAGE_PATH=$INSTALL_DIR/data/media

# To use S3/MinIO instead, uncomment and configure:
# STORAGE_TYPE=s3
# S3_BUCKET=your-bucket
# S3_ENDPOINT=https://s3.amazonaws.com
# S3_ACCESS_KEY=your-access-key
# S3_SECRET_KEY=your-secret-key

# =============================================================================
# Security
# =============================================================================
ORIENT_MASTER_KEY=$master_key
DASHBOARD_JWT_SECRET=$jwt_secret

# =============================================================================
# Dashboard
# =============================================================================
DASHBOARD_PORT=4098
BASE_URL=http://localhost:4098

# =============================================================================
# AI Provider (Configure via dashboard)
# =============================================================================
# ANTHROPIC_API_KEY=

# =============================================================================
# WhatsApp (optional)
# =============================================================================
# WHATSAPP_ADMIN_PHONE=+15551234567

# =============================================================================
# Slack (optional)
# =============================================================================
# SLACK_BOT_TOKEN=xoxb-your-bot-token
# SLACK_SIGNING_SECRET=your-signing-secret
# SLACK_APP_TOKEN=xapp-your-app-token
EOF

    chmod 600 "$env_file"
    log "Configuration saved to $env_file"
}

# ============================================
# PM2 SETUP
# ============================================

setup_pm2() {
    # PM2 - PROMPT before install
    if ! command -v pm2 &>/dev/null; then
        prompt_install "PM2 (process manager)" "npm install -g pm2"
    fi
    log "PM2 $(pm2 -v) ✓"

    # Get the global npm prefix to find installed packages
    local npm_prefix=$(npm prefix -g)

    # Create PM2 ecosystem configuration
    cat > "$INSTALL_DIR/ecosystem.config.cjs" << ECOSYSTEM
const path = require('path');
const ORIENT_HOME = process.env.ORIENT_HOME || \`\${process.env.HOME}/.orient\`;
const NPM_PREFIX = '$npm_prefix';

module.exports = {
  apps: [
    {
      name: 'orient',
      script: path.join(NPM_PREFIX, 'lib/node_modules/@orient-bot/dashboard/dist/main.js'),
      env_file: path.join(ORIENT_HOME, '.env'),
      error_file: path.join(ORIENT_HOME, 'logs/orient-error.log'),
      out_file: path.join(ORIENT_HOME, 'logs/orient-out.log'),
      max_memory_restart: '750M',
      // Unified server handles Dashboard + WhatsApp on port 4098
    },
  ],
};
ECOSYSTEM

    log "PM2 ecosystem configuration created"
}

# ============================================
# SHELL PROFILE SETUP
# ============================================

setup_shell_profile() {
    # Add ORIENT_HOME to shell profile
    local shell_rc
    if [[ -f "$HOME/.zshrc" ]]; then
        shell_rc="$HOME/.zshrc"
    elif [[ -f "$HOME/.bashrc" ]]; then
        shell_rc="$HOME/.bashrc"
    else
        shell_rc="$HOME/.profile"
    fi

    if ! grep -q "ORIENT_HOME" "$shell_rc" 2>/dev/null; then
        echo '' >> "$shell_rc"
        echo '# Orient' >> "$shell_rc"
        echo 'export ORIENT_HOME="$HOME/.orient"' >> "$shell_rc"
        log "Added ORIENT_HOME to $shell_rc"
    fi

    local npm_bin="$(npm prefix -g)/bin"
    if [[ ":$PATH:" != *":$npm_bin:"* ]]; then
        export PATH="$npm_bin:$PATH"
    fi

    if ! grep -q "npm prefix -g" "$shell_rc" 2>/dev/null; then
        echo 'export PATH="$(npm prefix -g)/bin:$PATH"' >> "$shell_rc"
        log "Added npm global bin to PATH in $shell_rc"
    fi
}

# ============================================
# DATABASE INITIALIZATION
# ============================================

initialize_database() {
    log "Initializing database..."

    # Source environment for database config
    set -a
    source "$INSTALL_DIR/.env"
    set +a

    if [[ "$DATABASE_TYPE" == "sqlite" ]]; then
        # Create SQLite database directory
        mkdir -p "$(dirname "$SQLITE_DATABASE")"

        # Initialize database using CLI
        log "Creating SQLite schema..."
        orient db:init 2>/dev/null || warn "Schema initialization skipped (may already exist)"
    fi
}

# ============================================
# MAIN
# ============================================

main() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║                                                            ║"
    echo "║     ██████╗ ██████╗ ██╗███████╗███╗   ██╗████████╗        ║"
    echo "║    ██╔═══██╗██╔══██╗██║██╔════╝████╗  ██║╚══██╔══╝        ║"
    echo "║    ██║   ██║██████╔╝██║█████╗  ██╔██╗ ██║   ██║           ║"
    echo "║    ██║   ██║██╔══██╗██║██╔══╝  ██║╚██╗██║   ██║           ║"
    echo "║    ╚██████╔╝██║  ██║██║███████╗██║ ╚████║   ██║           ║"
    echo "║     ╚═════╝ ╚═╝  ╚═╝╚═╝╚══════╝╚═╝  ╚═══╝   ╚═╝           ║"
    echo "║                                                            ║"
    echo "║           AI Assistant Installer v$ORIENT_VERSION                 ║"
    echo "║                  (npm pre-built packages)                  ║"
    echo "║                                                            ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""

    check_prerequisites
    install_orient
    check_opencode
    configure_orient
    setup_pm2
    setup_shell_profile
    initialize_database

    # Save version
    echo "$ORIENT_VERSION" > "$INSTALL_DIR/.orient-version"

    echo ""
    echo "════════════════════════════════════════════════════════════════"
    log "Installation complete!"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "  To get started, run:"
    echo ""
    echo "    orient start       # Start all services"
    echo ""
    echo "  Then open:"
    echo ""
    echo "    Dashboard:  http://localhost:4098/dashboard/"
    echo "    WhatsApp:   http://localhost:4098/qr (scan QR to connect)"
    echo ""
    echo "  Other commands:"
    echo ""
    echo "    orient status      # Check service status"
    echo "    orient logs        # View logs"
    echo "    orient doctor      # Run diagnostics"
    echo "    orient config      # Edit configuration"
    echo ""

    # Export ORIENT_HOME for this session
    export ORIENT_HOME="$INSTALL_DIR"

    # Start services
    log "Starting Orient services..."
    pm2 start "$INSTALL_DIR/ecosystem.config.cjs"
    pm2 save

    # Wait for server to be ready
    log "Waiting for dashboard to start..."
    sleep 3

    # Auto-open browser
    log "Opening browser for configuration..."
    if [[ -n "${ORIENT_NO_BROWSER:-}" || ! -t 0 ]]; then
        warn "Skipping browser auto-open (ORIENT_NO_BROWSER set or non-interactive)"
    elif command -v open &>/dev/null; then
        open "http://localhost:4098/dashboard/"
    elif command -v xdg-open &>/dev/null; then
        xdg-open "http://localhost:4098/dashboard/"
    fi
}

# Run main function
main "$@"
