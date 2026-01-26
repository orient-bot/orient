#!/bin/bash
#
# Orient One-Line Installer for macOS
#
# Usage: curl -fsSL https://orient.bot/install.sh | bash
#
# This script installs Orient with:
# - SQLite as the default database (PostgreSQL optional)
# - Local filesystem for media storage
# - PM2 for process management
# - Full stack: WhatsApp, Slack, Dashboard, API Gateway
#

set -e

# Version
ORIENT_VERSION="0.1.1"

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

    # pnpm
    if ! command -v pnpm &>/dev/null; then
        warn "pnpm not found. Installing..."
        npm install -g pnpm
    fi
    log "pnpm $(pnpm -v) ✓"

    # git
    if ! command -v git &>/dev/null; then
        error "git not found. Install with: brew install git"
    fi
    log "git ✓"
}

# ============================================
# INSTALLATION
# ============================================

install_orient() {
    log "Installing Orient to $INSTALL_DIR..."

    # Create directory structure
    mkdir -p "$INSTALL_DIR"/{data/sqlite,data/media,data/whatsapp-auth,logs,bin}

    # Clone or update repository
    if [[ -d "$INSTALL_DIR/orient" ]]; then
        log "Updating existing installation..."
        cd "$INSTALL_DIR/orient"
        git fetch origin
        git checkout main
        git pull origin main
    else
        log "Cloning Orient repository..."
        git clone --depth 1 https://github.com/orient-bot/orient.git "$INSTALL_DIR/orient"
    fi

    # Install dependencies
    cd "$INSTALL_DIR/orient"
    log "Installing dependencies (this may take a few minutes)..."
    pnpm install --frozen-lockfile

    # Build packages
    log "Building packages..."
    pnpm run build

    # Build dashboard frontend
    log "Building dashboard..."
    pnpm run dashboard:build
}

# ============================================
# CONFIGURATION
# ============================================

configure_orient() {
    local env_file="$INSTALL_DIR/.env"

    if [[ -f "$env_file" ]]; then
        log "Existing configuration found at $env_file"
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

    # Prompt for Anthropic API key
    read -p "Anthropic API key (required for AI features): " anthropic_key
    if [[ -z "$anthropic_key" ]]; then
        warn "No API key provided - AI features will not work until you add one"
    fi

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
# AI Provider
# =============================================================================
ANTHROPIC_API_KEY=$anthropic_key

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
    # Install PM2 if not present
    if ! command -v pm2 &>/dev/null; then
        log "Installing PM2..."
        npm install -g pm2
    fi
    log "PM2 $(pm2 -v) ✓"

    # Create PM2 ecosystem configuration
    # Unified server: Dashboard handles both Dashboard API and WhatsApp endpoints
    cat > "$INSTALL_DIR/ecosystem.config.cjs" << 'ECOSYSTEM'
const path = require('path');
const ORIENT_HOME = process.env.ORIENT_HOME || `${process.env.HOME}/.orient`;

module.exports = {
  apps: [
    {
      name: 'orient',
      cwd: path.join(ORIENT_HOME, 'orient'),
      script: 'dist/packages/dashboard/src/main.js',
      env_file: path.join(ORIENT_HOME, '.env'),
      error_file: path.join(ORIENT_HOME, 'logs/orient-error.log'),
      out_file: path.join(ORIENT_HOME, 'logs/orient-out.log'),
      max_memory_restart: '750M',
      node_args: '--experimental-specifier-resolution=node',
      // Unified server handles Dashboard + WhatsApp on port 4098
    },
    {
      name: 'orient-slack',
      cwd: path.join(ORIENT_HOME, 'orient'),
      script: 'dist/packages/bot-slack/src/main.js',
      env_file: path.join(ORIENT_HOME, '.env'),
      error_file: path.join(ORIENT_HOME, 'logs/slack-error.log'),
      out_file: path.join(ORIENT_HOME, 'logs/slack-out.log'),
      max_memory_restart: '500M',
      node_args: '--experimental-specifier-resolution=node',
      autorestart: false,  // Don't auto-restart Slack bot (optional service)
    },
  ],
};
ECOSYSTEM

    log "PM2 ecosystem configuration created"
}

# ============================================
# CLI SETUP
# ============================================

setup_cli() {
    # Create the CLI wrapper script
    cat > "$INSTALL_DIR/bin/orient" << 'SCRIPT'
#!/bin/bash
#
# Orient CLI - Manage your Orient installation
#

ORIENT_HOME="${ORIENT_HOME:-$HOME/.orient}"

# Source environment if it exists
if [[ -f "$ORIENT_HOME/.env" ]]; then
    set -a
    source "$ORIENT_HOME/.env"
    set +a
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

case "$1" in
    start)
        echo -e "${GREEN}Starting Orient services...${NC}"
        pm2 start "$ORIENT_HOME/ecosystem.config.cjs"
        pm2 save
        ;;
    stop)
        echo -e "${YELLOW}Stopping Orient services...${NC}"
        pm2 stop all
        ;;
    restart)
        echo -e "${GREEN}Restarting Orient services...${NC}"
        pm2 restart all
        ;;
    status)
        pm2 status
        ;;
    logs)
        if [[ -n "$2" ]]; then
            pm2 logs "$2"
        else
            pm2 logs
        fi
        ;;
    doctor)
        echo -e "${GREEN}Running Orient diagnostics...${NC}"
        echo ""

        # Check Node.js
        echo -n "Node.js: "
        if command -v node &>/dev/null; then
            echo -e "${GREEN}$(node -v)${NC}"
        else
            echo -e "${RED}Not found${NC}"
        fi

        # Check pnpm
        echo -n "pnpm: "
        if command -v pnpm &>/dev/null; then
            echo -e "${GREEN}$(pnpm -v)${NC}"
        else
            echo -e "${RED}Not found${NC}"
        fi

        # Check PM2
        echo -n "PM2: "
        if command -v pm2 &>/dev/null; then
            echo -e "${GREEN}$(pm2 -v)${NC}"
        else
            echo -e "${RED}Not found${NC}"
        fi

        # Check database
        echo -n "Database: "
        if [[ "$DATABASE_TYPE" == "sqlite" ]]; then
            if [[ -f "$SQLITE_DATABASE" ]]; then
                echo -e "${GREEN}SQLite ($SQLITE_DATABASE)${NC}"
            else
                echo -e "${YELLOW}SQLite (not initialized)${NC}"
            fi
        else
            echo -e "${GREEN}PostgreSQL${NC}"
        fi

        # Check ports
        echo ""
        echo "Port availability:"
        # Unified server: Only port 4098 needed (Dashboard + WhatsApp)
        for port in 4098; do
            echo -n "  Port $port (Orient): "
            if lsof -i :$port &>/dev/null; then
                echo -e "${YELLOW}In use${NC}"
            else
                echo -e "${GREEN}Available${NC}"
            fi
        done

        # Check environment
        echo ""
        echo "Configuration:"
        echo -n "  .env file: "
        if [[ -f "$ORIENT_HOME/.env" ]]; then
            echo -e "${GREEN}Found${NC}"
        else
            echo -e "${RED}Missing${NC}"
        fi

        echo -n "  API key: "
        if [[ -n "$ANTHROPIC_API_KEY" ]]; then
            echo -e "${GREEN}Configured${NC}"
        else
            echo -e "${YELLOW}Not set${NC}"
        fi
        ;;
    config)
        ${EDITOR:-nano} "$ORIENT_HOME/.env"
        ;;
    upgrade)
        echo -e "${GREEN}Upgrading Orient...${NC}"
        cd "$ORIENT_HOME/orient"
        git fetch origin
        git checkout main
        git pull origin main
        pnpm install --frozen-lockfile
        pnpm run build
        pnpm run dashboard:build
        echo -e "${GREEN}Upgrade complete. Run 'orient restart' to apply changes.${NC}"
        ;;
    uninstall)
        echo -e "${RED}This will remove Orient and all data. Are you sure?${NC}"
        read -p "Type 'yes' to confirm: " confirm
        if [[ "$confirm" == "yes" ]]; then
            pm2 stop all 2>/dev/null || true
            pm2 delete all 2>/dev/null || true
            rm -rf "$ORIENT_HOME"
            echo -e "${GREEN}Orient has been uninstalled.${NC}"
        else
            echo "Uninstall cancelled."
        fi
        ;;
    version)
        if [[ -f "$ORIENT_HOME/.orient-version" ]]; then
            cat "$ORIENT_HOME/.orient-version"
        else
            echo "Unknown"
        fi
        ;;
    *)
        echo "Orient CLI - Manage your Orient installation"
        echo ""
        echo "Usage: orient <command>"
        echo ""
        echo "Commands:"
        echo "  start      Start all Orient services"
        echo "  stop       Stop all Orient services"
        echo "  restart    Restart all Orient services"
        echo "  status     Show service status"
        echo "  logs       View logs (orient logs [service])"
        echo "  doctor     Run diagnostics"
        echo "  config     Edit configuration"
        echo "  upgrade    Update to latest version"
        echo "  uninstall  Remove Orient installation"
        echo "  version    Show installed version"
        echo ""
        echo "Services:"
        echo "  orient       - Main server (http://localhost:4098)"
        echo "               Dashboard + WhatsApp QR at /qr"
        echo "  orient-slack - Slack bot (optional)"
        ;;
esac
SCRIPT

    chmod +x "$INSTALL_DIR/bin/orient"

    # Add to PATH in shell profile
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
        echo 'export PATH="$ORIENT_HOME/bin:$PATH"' >> "$shell_rc"
        log "Added Orient to PATH in $shell_rc"
    fi
}

# ============================================
# DATABASE INITIALIZATION
# ============================================

initialize_database() {
    log "Initializing database..."

    cd "$INSTALL_DIR/orient"

    # Source environment for database config
    set -a
    source "$INSTALL_DIR/.env"
    set +a

    if [[ "$DATABASE_TYPE" == "sqlite" ]]; then
        # Create SQLite database directory
        mkdir -p "$(dirname "$SQLITE_DATABASE")"

        # Push schema to SQLite
        log "Creating SQLite schema..."
        pnpm --filter @orient/database run db:push:sqlite 2>/dev/null || warn "Schema push skipped (may already exist)"
    else
        # PostgreSQL migration
        log "Running PostgreSQL migrations..."
        pnpm --filter @orient/database run db:push 2>/dev/null || warn "Migration skipped (may already exist)"
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
    echo "║                                                            ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""

    check_prerequisites
    install_orient
    configure_orient
    setup_pm2
    setup_cli
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
    echo "    source ~/.zshrc    # (or restart your terminal)"
    echo "    orient start       # Start all services"
    echo ""
    echo "  Then open:"
    echo ""
    echo "    Dashboard:  http://localhost:4098"
    echo "    WhatsApp:   http://localhost:4098/qr (scan QR to connect)"
    echo ""
    echo "  Other commands:"
    echo ""
    echo "    orient status      # Check service status"
    echo "    orient logs        # View logs"
    echo "    orient doctor      # Run diagnostics"
    echo "    orient config      # Edit configuration"
    echo ""
}

# Run main function
main "$@"
