#!/bin/bash
#
# Orient Local Installer (for testing)
#
# Usage: ./installer/install-local.sh
#
# This version copies from local source instead of cloning from GitHub.
#

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"

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

# ============================================
# PREREQUISITE CHECKS
# ============================================

check_prerequisites() {
    log "Checking prerequisites..."

    # macOS only
    if [[ "$(uname)" != "Darwin" ]]; then
        error "This installer is for macOS only."
    fi

    # Node.js 20+
    if ! command -v node &>/dev/null; then
        error "Node.js not found. Install with: brew install node@20"
    fi

    local node_version=$(node -v | cut -d. -f1 | tr -d 'v')
    if [[ "$node_version" -lt 20 ]]; then
        error "Node.js 20+ required (found: $(node -v))"
    fi
    log "Node.js $(node -v) ✓"

    # pnpm
    if ! command -v pnpm &>/dev/null; then
        error "pnpm not found. Install with: npm install -g pnpm"
    fi
    log "pnpm $(pnpm -v) ✓"

    # PM2
    if ! command -v pm2 &>/dev/null; then
        log "Installing PM2..."
        npm install -g pm2
    fi
    log "PM2 $(pm2 -v) ✓"

    # OpenCode CLI (for AI agent capabilities)
    if ! command -v opencode &>/dev/null; then
        # Check common installation locations
        if [[ -x "$HOME/.opencode/bin/opencode" ]]; then
            log "OpenCode found at ~/.opencode/bin/opencode ✓"
        else
            warn "OpenCode CLI not found. AI agent features will be disabled."
            warn "Install with: curl -fsSL https://opencode.ai/install.sh | bash"
        fi
    else
        log "OpenCode $(opencode --version 2>/dev/null || echo 'installed') ✓"
    fi
}

# ============================================
# INSTALLATION (LOCAL COPY)
# ============================================

install_orient() {
    log "Installing Orient from local source..."
    log "Source: $SOURCE_DIR"
    log "Target: $INSTALL_DIR"

    # Create directory structure
    mkdir -p "$INSTALL_DIR"/{data/sqlite,data/media,data/whatsapp-auth,logs,bin}
    # Create OpenCode isolation directories for OAuth tokens and data
    mkdir -p "$INSTALL_DIR"/opencode/{data/opencode,config/opencode,cache/opencode,state/opencode}

    # Clean and rebuild to ensure fresh builds with correct imports
    log "Cleaning previous builds..."
    cd "$SOURCE_DIR"
    # Remove all dist folders, tsbuildinfo files, and turbo cache to ensure clean build
    find packages -name "dist" -type d -maxdepth 2 -exec rm -rf {} + 2>/dev/null || true
    find packages -name "tsconfig.tsbuildinfo" -type f -delete 2>/dev/null || true
    rm -rf .turbo node_modules/.cache 2>/dev/null || true

    # Ensure workspace symlinks are set up before building
    log "Setting up workspace dependencies..."
    pnpm install --reporter=silent 2>/dev/null || pnpm install

    log "Building packages (this may take a moment)..."
    pnpm run build:all

    # Copy from local source (including dist, excluding node_modules)
    log "Copying source files..."
    rsync -a --delete \
        --exclude 'node_modules' \
        --exclude '.git' \
        --exclude '*.log' \
        "$SOURCE_DIR/" "$INSTALL_DIR/orient/"

    # Install dependencies (will link to existing dist folders)
    cd "$INSTALL_DIR/orient"
    log "Installing dependencies..."
    pnpm install --reporter=silent 2>/dev/null
    log "Dependencies installed ✓"
}

# ============================================
# CONFIGURATION
# ============================================

configure_orient() {
    local env_file="$INSTALL_DIR/.env"

    if [[ -f "$env_file" ]]; then
        log "Keeping existing configuration"
        return
    fi

    # Generate secrets
    local master_key=$(openssl rand -hex 32)
    local jwt_secret=$(openssl rand -hex 32)

    log "Creating configuration..."

    # Write configuration
    cat > "$env_file" << EOF
# Orient Configuration (Generated: $(date))

NODE_ENV=production
LOG_LEVEL=info

# Database (SQLite)
DATABASE_TYPE=sqlite
SQLITE_DATABASE=$INSTALL_DIR/data/sqlite/orient.db

# Storage
STORAGE_TYPE=local
STORAGE_PATH=$INSTALL_DIR/data/media

# Security
ORIENT_MASTER_KEY=$master_key
DASHBOARD_JWT_SECRET=$jwt_secret

# Dashboard
DASHBOARD_PORT=4098
BASE_URL=http://localhost:4098

# OpenCode (AI Agent Server)
OPENCODE_PORT=4099
EOF

    chmod 600 "$env_file"
    log "Configuration saved ✓"
}

# ============================================
# PM2 SETUP
# ============================================

setup_pm2() {
    # Find opencode binary path
    local opencode_bin=""
    if command -v opencode &>/dev/null; then
        opencode_bin=$(which opencode)
    elif [[ -x "$HOME/.opencode/bin/opencode" ]]; then
        opencode_bin="$HOME/.opencode/bin/opencode"
    fi

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
    },
    {
      name: 'orient-opencode',
      script: OPENCODE_BIN,
      args: 'serve --port 4099 --hostname 0.0.0.0',
      cwd: path.join(ORIENT_HOME, 'orient'),
      env_file: path.join(ORIENT_HOME, '.env'),
      error_file: path.join(ORIENT_HOME, 'logs/opencode-error.log'),
      out_file: path.join(ORIENT_HOME, 'logs/opencode-out.log'),
      max_memory_restart: '500M',
      env: {
        OPENCODE_CONFIG: path.join(ORIENT_HOME, 'orient', 'opencode.json'),
        // OpenCode data isolation - store data under ~/.orient/opencode/
        XDG_DATA_HOME: path.join(ORIENT_HOME, 'opencode', 'data'),
        XDG_CONFIG_HOME: path.join(ORIENT_HOME, 'opencode', 'config'),
        XDG_CACHE_HOME: path.join(ORIENT_HOME, 'opencode', 'cache'),
        XDG_STATE_HOME: path.join(ORIENT_HOME, 'opencode', 'state'),
        OPENCODE_TEST_HOME: path.join(ORIENT_HOME, 'opencode'),
        ORIENT_HOME: ORIENT_HOME,
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
      autorestart: false, // Don't auto-restart if not configured
      env: {
        OPENCODE_URL: 'http://localhost:4099',
      },
    },
  ],
};
ECOSYSTEM

    log "PM2 configuration created (Dashboard + OpenCode + Slack) ✓"
}

# ============================================
# CLI SETUP
# ============================================

setup_cli() {
    # Create CLI wrapper
    cat > "$INSTALL_DIR/bin/orient" << 'SCRIPT'
#!/bin/bash
ORIENT_HOME="${ORIENT_HOME:-$HOME/.orient}"

# Source environment
if [[ -f "$ORIENT_HOME/.env" ]]; then
    set -a
    source "$ORIENT_HOME/.env"
    set +a
fi

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

case "$1" in
    start)
        echo -e "${GREEN}Starting Orient...${NC}"
        pm2 start "$ORIENT_HOME/ecosystem.config.cjs" --silent
        pm2 save --silent
        sleep 3
        # Check if services are running using simpler pattern
        pm2_output=$(pm2 jlist 2>/dev/null)
        dashboard_online=$(echo "$pm2_output" | grep -c '"name":"orient",".*"status":"online"' || true)
        opencode_online=$(echo "$pm2_output" | grep -c '"name":"orient-opencode",".*"status":"online"' || true)
        opencode_exists=$(echo "$pm2_output" | grep -c '"name":"orient-opencode"' || true)

        echo ""
        if [[ "$dashboard_online" -gt 0 ]] || curl -s http://localhost:${DASHBOARD_PORT:-4098}/health &>/dev/null; then
            echo -e "${GREEN}✓ Dashboard is running${NC}"
        else
            echo -e "${RED}✗ Dashboard failed to start${NC}"
        fi

        if [[ "$opencode_online" -gt 0 ]] || curl -s http://localhost:${OPENCODE_PORT:-4099}/global/health &>/dev/null; then
            echo -e "${GREEN}✓ OpenCode is running${NC}"
        elif [[ "$opencode_exists" -eq 0 ]]; then
            echo -e "${YELLOW}○ OpenCode not configured${NC}"
        else
            echo -e "${RED}✗ OpenCode failed to start${NC}"
        fi

        echo ""
        echo "  Dashboard:  http://localhost:${DASHBOARD_PORT:-4098}/whatsapp/chats"
        echo "  WhatsApp:   http://localhost:${DASHBOARD_PORT:-4098}/whatsapp/chats"
        echo "  OpenCode:   http://localhost:${OPENCODE_PORT:-4099}"
        echo ""

        # Check if dashboard health endpoint works
        if ! curl -s http://localhost:${DASHBOARD_PORT:-4098}/health &>/dev/null; then
            echo "  Run 'orient logs' to see what went wrong"
        fi
        ;;
    stop)
        echo -e "${YELLOW}Stopping Orient...${NC}"
        pm2 stop orient --silent 2>/dev/null || true
        pm2 stop orient-opencode --silent 2>/dev/null || true
        echo -e "${GREEN}✓ Orient stopped${NC}"
        ;;
    restart)
        echo -e "${GREEN}Restarting Orient...${NC}"
        pm2 restart orient --silent 2>/dev/null
        pm2 restart orient-opencode --silent 2>/dev/null || true
        sleep 3
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
        if [[ "$2" == "opencode" ]]; then
            pm2 logs orient-opencode ${@:3}
        elif [[ "$2" == "dashboard" ]]; then
            pm2 logs orient ${@:3}
        else
            # Show all Orient logs by default
            pm2 logs orient orient-opencode ${@:2}
        fi
        ;;
    doctor)
        echo -e "${GREEN}Orient Diagnostics${NC}"
        echo ""
        echo "System:"
        echo "  Node.js: $(node -v)"
        echo "  pnpm: $(pnpm -v)"
        echo "  PM2: $(pm2 -v)"
        if command -v opencode &>/dev/null; then
            echo "  OpenCode: $(opencode --version 2>/dev/null || echo 'installed')"
        elif [[ -x "$HOME/.opencode/bin/opencode" ]]; then
            echo "  OpenCode: installed (at ~/.opencode/bin/opencode)"
        else
            echo "  OpenCode: not installed"
        fi
        echo ""
        echo "Configuration:"
        echo "  ORIENT_HOME: $ORIENT_HOME"
        echo "  Database: ${DATABASE_TYPE:-sqlite}"
        echo "  Dashboard: http://localhost:${DASHBOARD_PORT:-4098}/whatsapp/chats"
        echo "  OpenCode: http://localhost:${OPENCODE_PORT:-4099}"
        echo ""
        echo "Services:"
        pm2 jlist 2>/dev/null | node -e "
            const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
            const orientApps = data.filter(p => p.name.startsWith('orient'));
            if (orientApps.length === 0) {
                console.log('  No Orient services running');
            } else {
                orientApps.forEach(p => {
                    const status = p.pm2_env.status;
                    const color = status === 'online' ? '\\x1b[32m' : '\\x1b[31m';
                    console.log('  ' + p.name + ': ' + color + status + '\\x1b[0m');
                });
            }
        " 2>/dev/null || echo "  No services running"
        echo ""
        echo "Health checks:"
        if curl -s http://localhost:${DASHBOARD_PORT:-4098}/health &>/dev/null; then
            echo -e "  Dashboard: ${GREEN}healthy${NC}"
        else
            echo -e "  Dashboard: ${RED}not responding${NC}"
        fi
        if curl -s http://localhost:${OPENCODE_PORT:-4099}/global/health &>/dev/null; then
            echo -e "  OpenCode: ${GREEN}healthy${NC}"
        else
            echo -e "  OpenCode: ${RED}not responding${NC}"
        fi
        ;;
    config)
        ${EDITOR:-nano} "$ORIENT_HOME/.env"
        ;;
    version)
        cat "$ORIENT_HOME/.orient-version" 2>/dev/null || echo "Unknown"
        ;;
    uninstall)
        shift
        KEEP_DATA=false
        FORCE=false
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
        pm2 stop orient-opencode --silent 2>/dev/null || true
        pm2 delete orient --silent 2>/dev/null || true
        pm2 delete orient-opencode --silent 2>/dev/null || true

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
    *)
        echo ""
        echo -e "${GREEN}Orient CLI${NC} - AI Assistant Platform"
        echo ""
        echo "Usage: orient <command>"
        echo ""
        echo "Commands:"
        echo "  start       Start Orient services (Dashboard + OpenCode)"
        echo "  stop        Stop Orient services"
        echo "  restart     Restart Orient services"
        echo "  status      Show service status"
        echo "  logs        View all logs"
        echo "  logs dashboard  View Dashboard logs only"
        echo "  logs opencode   View OpenCode logs only"
        echo "  doctor      Run diagnostics"
        echo "  config      Edit configuration"
        echo "  version     Show installed version"
        echo "  uninstall   Remove Orient"
        echo "              --keep-data  Keep database and config"
        echo "              --force      Skip confirmation"
        echo ""
        echo "Services:"
        echo "  Dashboard:  http://localhost:4098/whatsapp/chats"
        echo "  OpenCode:   http://localhost:4099"
        echo ""
        ;;
esac
SCRIPT

    chmod +x "$INSTALL_DIR/bin/orient"

    # Add to PATH
    local shell_rc="$HOME/.zshrc"
    if ! grep -q "ORIENT_HOME" "$shell_rc" 2>/dev/null; then
        echo '' >> "$shell_rc"
        echo '# Orient' >> "$shell_rc"
        echo 'export ORIENT_HOME="$HOME/.orient"' >> "$shell_rc"
        echo 'export PATH="$ORIENT_HOME/bin:$PATH"' >> "$shell_rc"
        log "Added Orient to PATH"
    fi
}

# ============================================
# DATABASE INITIALIZATION
# ============================================

initialize_database() {
    log "Initializing database..."

    cd "$INSTALL_DIR/orient"

    # Source environment
    set -a
    source "$INSTALL_DIR/.env"
    set +a

    mkdir -p "$(dirname "$SQLITE_DATABASE")"

    # Push schema (suppress verbose output)
    pnpm --filter @orient-bot/database run db:push:sqlite >/dev/null 2>&1 || true

    log "Database initialized ✓"

    # Generate OpenCode server password
    log "Setting up OpenCode security..."
    npx tsx scripts/setup-opencode-password.ts >/dev/null 2>&1 || true
    log "OpenCode password configured ✓"
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
    echo "║              AI Assistant Platform v$ORIENT_VERSION               ║"
    echo "║                    (Local Install)                         ║"
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
    echo "  Quick start:"
    echo ""
    echo "    source ~/.zshrc     # Load Orient into PATH"
    echo "    orient start        # Start services"
    echo ""
    echo "  Or run directly:"
    echo ""
    echo "    $INSTALL_DIR/bin/orient start"
    echo ""
    echo "  Dashboard: http://localhost:4098/whatsapp/chats"
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
    open "http://localhost:4098/whatsapp/chats"
}

main "$@"
