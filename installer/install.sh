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
ORIENT_VERSION="0.2.0"

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

# Prompt user before installing a package
prompt_install() {
    local package_name=$1
    local install_cmd=$2
    echo ""
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

    # pnpm - PROMPT before install
    if ! command -v pnpm &>/dev/null; then
        prompt_install "pnpm" "npm install -g pnpm"
    fi
    log "pnpm $(pnpm -v) ✓"

    # git
    if ! command -v git &>/dev/null; then
        error "git not found. Install with: brew install git"
    fi
    log "git ✓"
}

# ============================================
# OPENCODE CHECK
# ============================================

check_opencode() {
    local required_version=$(cat "$INSTALL_DIR/orient/installer/opencode-version.json" 2>/dev/null | grep '"required"' | cut -d'"' -f4)
    required_version="${required_version:-1.1.27}"  # fallback

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
# INSTALLATION
# ============================================

install_orient() {
    log "Installing Orient to $INSTALL_DIR..."

    # Create directory structure
    mkdir -p "$INSTALL_DIR"/{data/sqlite,data/media,data/whatsapp-auth,logs,bin,skills,apps}

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
    pnpm run build:all
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

    # Check for OpenCode CLI
    local opencode_bin=""
    if command -v opencode &>/dev/null; then
        opencode_bin=$(which opencode)
        log "OpenCode CLI found ✓"
    elif [[ -x "$HOME/.opencode/bin/opencode" ]]; then
        opencode_bin="$HOME/.opencode/bin/opencode"
        log "OpenCode CLI found at ~/.opencode/bin ✓"
    else
        warn "OpenCode CLI not found. AI agent features will be disabled."
        warn "Install with: curl -fsSL https://opencode.ai/install.sh | bash"
    fi

    # Create PM2 ecosystem configuration
    # Unified server: Dashboard handles both Dashboard API and WhatsApp endpoints
    cat > "$INSTALL_DIR/ecosystem.config.cjs" << ECOSYSTEM
const path = require('path');
const ORIENT_HOME = process.env.ORIENT_HOME || \`\${process.env.HOME}/.orient\`;

// OpenCode binary location (detected during install)
const OPENCODE_BIN = '${opencode_bin}' || process.env.HOME + '/.opencode/bin/opencode';

module.exports = {
  apps: [
    {
      name: 'orient',
      cwd: path.join(ORIENT_HOME, 'orient'),
      script: 'packages/dashboard/dist/main.js',
      env_file: path.join(ORIENT_HOME, '.env'),
      error_file: path.join(ORIENT_HOME, 'logs/orient-error.log'),
      out_file: path.join(ORIENT_HOME, 'logs/orient-out.log'),
      max_memory_restart: '750M',
      // Unified server handles Dashboard + WhatsApp on port 4098
    },
    {
      name: 'orient-opencode',
      script: OPENCODE_BIN,
      args: 'serve --port 4099 --hostname 127.0.0.1',
      cwd: path.join(ORIENT_HOME, 'orient'),
      env_file: path.join(ORIENT_HOME, '.env'),
      error_file: path.join(ORIENT_HOME, 'logs/opencode-error.log'),
      out_file: path.join(ORIENT_HOME, 'logs/opencode-out.log'),
      max_memory_restart: '500M',
      env: {
        OPENCODE_CONFIG: path.join(ORIENT_HOME, 'orient', 'opencode.json'),
      },
    },
    {
      name: 'orient-slack',
      cwd: path.join(ORIENT_HOME, 'orient'),
      script: 'packages/bot-slack/dist/main.js',
      env_file: path.join(ORIENT_HOME, '.env'),
      error_file: path.join(ORIENT_HOME, 'logs/slack-error.log'),
      out_file: path.join(ORIENT_HOME, 'logs/slack-out.log'),
      max_memory_restart: '500M',
      autorestart: false,  // Don't auto-restart Slack bot (optional service)
    },
  ],
};
ECOSYSTEM

    log "PM2 ecosystem configuration created (Dashboard + OpenCode + Slack)"
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
        echo -e "${GREEN}Starting Orient...${NC}"
        pm2 start "$ORIENT_HOME/ecosystem.config.cjs" --silent
        pm2 save --silent
        sleep 2
        if pm2 jlist 2>/dev/null | grep -q '"status":"online"'; then
            echo ""
            echo -e "${GREEN}✓ Orient is running${NC}"
            echo ""
            echo "  Dashboard:  http://localhost:4098"
            echo "  WhatsApp:   http://localhost:4098/qr"
            echo ""
        else
            echo -e "${RED}✗ Orient failed to start${NC}"
            echo "  Run 'orient logs' to see what went wrong"
        fi
        ;;
    stop)
        echo -e "${YELLOW}Stopping Orient...${NC}"
        pm2 stop orient --silent 2>/dev/null || true
        echo -e "${GREEN}✓ Orient stopped${NC}"
        ;;
    restart)
        echo -e "${GREEN}Restarting Orient...${NC}"
        pm2 restart orient --silent 2>/dev/null
        sleep 2
        if pm2 jlist 2>/dev/null | grep -q '"status":"online"'; then
            echo -e "${GREEN}✓ Orient restarted${NC}"
        else
            echo -e "${RED}✗ Orient failed to restart${NC}"
            echo "  Run 'orient logs' to see what went wrong"
        fi
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
        echo -e "${GREEN}Orient Diagnostics${NC}"
        echo ""
        echo "System:"
        echo "  Node.js: $(node -v 2>/dev/null || echo 'Not found')"
        echo "  pnpm: $(pnpm -v 2>/dev/null || echo 'Not found')"
        echo "  PM2: $(pm2 -v 2>/dev/null || echo 'Not found')"
        echo ""
        echo "Configuration:"
        echo "  ORIENT_HOME: $ORIENT_HOME"
        echo "  Database: ${DATABASE_TYPE:-sqlite}"
        echo "  Dashboard: http://localhost:${DASHBOARD_PORT:-4098}"
        echo ""
        echo "Services:"
        pm2 jlist 2>/dev/null | node -e "
            const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
            data.forEach(p => {
                const status = p.pm2_env.status;
                const color = status === 'online' ? '\\x1b[32m' : '\\x1b[31m';
                console.log('  ' + p.name + ': ' + color + status + '\\x1b[0m');
            });
        " 2>/dev/null || echo "  No services running"
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
        pnpm run build:all
        echo -e "${GREEN}Upgrade complete. Run 'orient restart' to apply changes.${NC}"
        ;;
    uninstall)
        KEEP_DATA=false
        FORCE=false
        shift
        while [[ $# -gt 0 ]]; do
            case "$1" in
                --keep-data) KEEP_DATA=true ;;
                --force) FORCE=true ;;
            esac
            shift
        done

        if [[ "$FORCE" != "true" ]]; then
            echo ""
            if [[ "$KEEP_DATA" == "true" ]]; then
                echo -e "${YELLOW}This will remove Orient but keep your data.${NC}"
            else
                echo -e "${RED}This will completely remove Orient including all data.${NC}"
            fi
            echo ""
            read -p "Type 'yes' to confirm: " confirm
            if [[ "$confirm" != "yes" ]]; then
                echo "Uninstall cancelled."
                exit 0
            fi
        fi

        echo ""
        echo -e "${YELLOW}Stopping services...${NC}"
        pm2 stop orient --silent 2>/dev/null || true
        pm2 delete orient --silent 2>/dev/null || true

        if [[ "$KEEP_DATA" == "true" ]]; then
            echo -e "${YELLOW}Removing Orient (keeping data)...${NC}"
            rm -rf "$ORIENT_HOME/orient"
            rm -rf "$ORIENT_HOME/bin"
            rm -rf "$ORIENT_HOME/logs"
            rm -f "$ORIENT_HOME/ecosystem.config.cjs"
            rm -f "$ORIENT_HOME/.orient-version"
            echo ""
            echo -e "${GREEN}Orient has been uninstalled.${NC}"
            echo "Your data is preserved in: $ORIENT_HOME/data"
            echo "Your config is preserved in: $ORIENT_HOME/.env"
        else
            echo -e "${YELLOW}Removing Orient completely...${NC}"
            rm -rf "$ORIENT_HOME"
            echo ""
            echo -e "${GREEN}Orient has been completely uninstalled.${NC}"
        fi

        # Clean shell profile
        for rc_file in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.profile"; do
            if [[ -f "$rc_file" ]]; then
                sed -i '' '/# Orient/d' "$rc_file" 2>/dev/null || true
                sed -i '' '/ORIENT_HOME/d' "$rc_file" 2>/dev/null || true
            fi
        done
        echo ""
        echo "Note: Run 'source ~/.zshrc' or restart your terminal to update PATH."
        ;;
    version)
        if [[ -f "$ORIENT_HOME/.orient-version" ]]; then
            cat "$ORIENT_HOME/.orient-version"
        else
            echo "Unknown"
        fi
        ;;
    *)
        echo ""
        echo -e "${GREEN}Orient CLI${NC} - AI Assistant Platform"
        echo ""
        echo "Usage: orient <command>"
        echo ""
        echo "Commands:"
        echo "  start       Start Orient services"
        echo "  stop        Stop Orient services"
        echo "  restart     Restart Orient services"
        echo "  status      Show service status"
        echo "  logs        View logs"
        echo "  doctor      Run diagnostics"
        echo "  config      Edit configuration"
        echo "  upgrade     Update to latest version"
        echo "  version     Show installed version"
        echo "  uninstall   Remove Orient"
        echo "              --keep-data  Keep database and config"
        echo "              --force      Skip confirmation"
        echo ""
        echo "Dashboard: http://localhost:4098"
        echo ""
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
        pnpm --filter @orientbot/database run db:push:sqlite 2>/dev/null || warn "Schema push skipped (may already exist)"
    else
        # PostgreSQL migration
        log "Running PostgreSQL migrations..."
        pnpm --filter @orientbot/database run db:push 2>/dev/null || warn "Migration skipped (may already exist)"
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
    check_opencode
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

    # Make orient available in current session
    export PATH="$INSTALL_DIR/bin:$PATH"
    export ORIENT_HOME="$INSTALL_DIR"

    # Start services
    "$INSTALL_DIR/bin/orient" start

    # Wait for server to be ready
    for i in {1..10}; do
        if curl -s http://localhost:4098/health &>/dev/null; then
            break
        fi
        sleep 1
    done

    # Open browser
    log "Opening dashboard..."
    if command -v open &>/dev/null; then
        open "http://localhost:4098"
    elif command -v xdg-open &>/dev/null; then
        xdg-open "http://localhost:4098"
    fi
}

# Run main function
main "$@"
