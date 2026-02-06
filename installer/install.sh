#!/bin/bash
#
# Orient One-Line Installer for macOS
#
# Usage: curl -fsSL https://orient.bot/install.sh | bash
#
# Options:
#   --source    Build from source (slower, for developers)
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

# Parse arguments
SOURCE_BUILD=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --source) SOURCE_BUILD=true; shift ;;
        --help|-h)
            echo "Orient Installer"
            echo ""
            echo "Usage: curl -fsSL https://orient.bot/install.sh | bash"
            echo "       curl -fsSL https://orient.bot/install.sh | bash -s -- --source"
            echo ""
            echo "Options:"
            echo "  --source    Build from source (slower, ~4 min vs ~30 sec)"
            echo "  --help      Show this help message"
            exit 0
            ;;
        *) shift ;;
    esac
done

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

# Check if running interactively
is_interactive() {
    [[ -t 0 ]]
}

# Prompt user before installing a package
prompt_install() {
    local package_name=$1
    local install_cmd=$2
    echo ""
    if ! is_interactive; then
        log "Installing $package_name automatically (non-interactive)..."
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

    # npm (should come with Node.js)
    if ! command -v npm &>/dev/null; then
        error "npm not found. Reinstall Node.js with: brew install node@20"
    fi
    log "npm $(npm -v) ✓"

    # pnpm - only required for source builds
    if [[ "$SOURCE_BUILD" == "true" ]]; then
        if ! command -v pnpm &>/dev/null; then
            prompt_install "pnpm" "npm install -g pnpm"
        fi
        log "pnpm $(pnpm -v) ✓"

        # git - only required for source builds
        if ! command -v git &>/dev/null; then
            error "git not found. Install with: brew install git"
        fi
        log "git ✓"
    fi
}

# ============================================
# OPENCODE INSTALLATION (Isolated to Orient)
# ============================================

install_opencode() {
    # For source builds, read from the repo; for npm, use fallback
    local required_version
    if [[ "$SOURCE_BUILD" == "true" ]] && [[ -f "$INSTALL_DIR/orient/installer/opencode-version.json" ]]; then
        required_version=$(cat "$INSTALL_DIR/orient/installer/opencode-version.json" | grep '"required"' | cut -d'"' -f4)
    fi
    required_version="${required_version:-1.1.48}"  # fallback for npm installs

    local opencode_bin="$INSTALL_DIR/bin/opencode"

    # Check if Orient's OpenCode is already installed and correct version
    if [[ -x "$opencode_bin" ]]; then
        local current_version=$("$opencode_bin" --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
        if [[ "$current_version" == "$required_version" ]]; then
            log "OpenCode $current_version ✓ (installed at $INSTALL_DIR/bin)"
            return 0
        else
            log "Updating OpenCode from $current_version to $required_version..."
        fi
    else
        log "Installing OpenCode $required_version to $INSTALL_DIR/bin..."
    fi

    # Detect platform
    local os=$(uname -s | tr '[:upper:]' '[:lower:]')
    local arch=$(uname -m)

    # Map architecture names to match GitHub release naming
    case "$arch" in
        x86_64) arch="x64" ;;
        aarch64|arm64) arch="arm64" ;;
        *) error "Unsupported architecture: $arch" ;;
    esac

    # Determine filename based on OS
    # macOS uses .zip, Linux uses .tar.gz
    local filename="opencode-${os}-${arch}"
    local extension
    if [[ "$os" == "darwin" ]]; then
        extension=".zip"
    else
        extension=".tar.gz"
    fi
    filename="${filename}${extension}"

    # Download from GitHub releases
    local download_url="https://github.com/anomalyco/opencode/releases/download/v${required_version}/${filename}"
    local tmp_dir=$(mktemp -d)

    log "Downloading OpenCode $required_version..."
    if ! curl -fsSL "$download_url" -o "$tmp_dir/$filename"; then
        rm -rf "$tmp_dir"
        error "Failed to download OpenCode from $download_url"
    fi

    # Extract based on file type
    log "Extracting..."
    if [[ "$extension" == ".zip" ]]; then
        unzip -q "$tmp_dir/$filename" -d "$tmp_dir"
    else
        tar -xzf "$tmp_dir/$filename" -C "$tmp_dir"
    fi

    # Install to Orient's bin directory
    mkdir -p "$INSTALL_DIR/bin"
    mv "$tmp_dir/opencode" "$opencode_bin"
    chmod 755 "$opencode_bin"

    # Cleanup
    rm -rf "$tmp_dir"

    # Verify installation
    local installed_version=$("$opencode_bin" --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
    if [[ "$installed_version" == "$required_version" ]]; then
        log "OpenCode $installed_version installed successfully ✓"
    else
        warn "OpenCode installed but version mismatch: expected $required_version, got $installed_version"
    fi
}

# ============================================
# INSTALLATION
# ============================================

# npm-based installation (default, ~30 seconds)
install_orient_npm() {
    log "Installing Orient from npm..."
    log "This takes about 30 seconds (pre-built packages)"

    # Create directory structure
    mkdir -p "$INSTALL_DIR"/{data/sqlite,data/media,data/whatsapp-auth,logs,bin,skills,apps}
    # Create OpenCode isolation directories for OAuth tokens and data
    mkdir -p "$INSTALL_DIR"/opencode/{data/opencode,config/opencode,cache/opencode,state/opencode}

    # Install from public npm
    log "Installing @orient-bot/cli and @orient-bot/dashboard..."
    npm install -g @orient-bot/cli @orient-bot/dashboard

    log "Orient packages installed ✓"
}

# Source-based installation (slower, ~4 minutes)
install_orient_source() {
    log "Installing Orient from source..."
    log "This takes about 4 minutes (git clone + build)"

    # Create directory structure
    mkdir -p "$INSTALL_DIR"/{data/sqlite,data/media,data/whatsapp-auth,logs,bin,skills,apps}
    # Create OpenCode isolation directories for OAuth tokens and data
    mkdir -p "$INSTALL_DIR"/opencode/{data/opencode,config/opencode,cache/opencode,state/opencode}

    # Clone or update repository
    if [[ -d "$INSTALL_DIR/orient" ]]; then
        log "Updating existing installation..."
        cd "$INSTALL_DIR/orient"
        git fetch origin
        git checkout main
        git reset --hard origin/main
    else
        log "Cloning Orient repository..."
        git clone --depth 1 https://github.com/orient-bot/orient.git "$INSTALL_DIR/orient"
    fi

    # Install dependencies
    cd "$INSTALL_DIR/orient"
    log "Installing dependencies..."
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
        if ! is_interactive; then
            log "Keeping existing configuration (non-interactive)"
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

# =============================================================================
# Google OAuth (via proxy - no client secret needed)
# =============================================================================
GOOGLE_OAUTH_PROXY_URL=https://app.orient.bot
EOF

    chmod 600 "$env_file"
    log "Configuration saved to $env_file"
}

# ============================================
# PM2 SETUP
# ============================================

# PM2 setup for npm-based installation
setup_pm2_npm() {
    # PM2 - PROMPT before install
    if ! command -v pm2 &>/dev/null; then
        prompt_install "PM2 (process manager)" "npm install -g pm2"
    fi
    log "PM2 $(pm2 -v) ✓"

    # Get npm global prefix for finding installed packages
    local npm_prefix=$(npm prefix -g)

    # Use Orient's isolated OpenCode installation
    local opencode_bin="$INSTALL_DIR/bin/opencode"
    if [[ -x "$opencode_bin" ]]; then
        local oc_version=$("$opencode_bin" --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
        log "Using Orient's OpenCode v$oc_version ✓"
    else
        error "OpenCode not found at $opencode_bin. Installation may have failed."
    fi

    # Create PM2 ecosystem configuration for npm-based install
    cat > "$INSTALL_DIR/ecosystem.config.cjs" << ECOSYSTEM
const path = require('path');
const fs = require('fs');
const ORIENT_HOME = process.env.ORIENT_HOME || \`\${process.env.HOME}/.orient\`;
const NPM_PREFIX = '${npm_prefix}';

// OpenCode binary location (detected during install)
const OPENCODE_BIN = '${opencode_bin}' || process.env.HOME + '/.opencode/bin/opencode';

// Load .env file into env object (PM2 does not support env_file natively)
function loadEnvFile(filePath) {
  const env = {};
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  } catch (e) { /* .env file may not exist yet */ }
  return env;
}

const dotenv = loadEnvFile(path.join(ORIENT_HOME, '.env'));

module.exports = {
  apps: [
    {
      name: 'orient',
      script: path.join(NPM_PREFIX, 'lib/node_modules/@orient-bot/dashboard/dist/main.js'),
      error_file: path.join(ORIENT_HOME, 'logs/orient-error.log'),
      out_file: path.join(ORIENT_HOME, 'logs/orient-out.log'),
      max_memory_restart: '750M',
      env: {
        ...dotenv,
        ORIENT_HOME: ORIENT_HOME,
      },
    },
    {
      name: 'orient-opencode',
      script: OPENCODE_BIN,
      args: 'serve --port 4099 --hostname 127.0.0.1',
      cwd: ORIENT_HOME,
      error_file: path.join(ORIENT_HOME, 'logs/opencode-error.log'),
      out_file: path.join(ORIENT_HOME, 'logs/opencode-out.log'),
      max_memory_restart: '500M',
      env: {
        ...dotenv,
        // OpenCode data isolation - store data under ~/.orient/opencode/
        XDG_DATA_HOME: path.join(ORIENT_HOME, 'opencode', 'data'),
        XDG_CONFIG_HOME: path.join(ORIENT_HOME, 'opencode', 'config'),
        XDG_CACHE_HOME: path.join(ORIENT_HOME, 'opencode', 'cache'),
        XDG_STATE_HOME: path.join(ORIENT_HOME, 'opencode', 'state'),
        OPENCODE_TEST_HOME: path.join(ORIENT_HOME, 'opencode'),
        ORIENT_HOME: ORIENT_HOME,
      },
    },
  ],
};
ECOSYSTEM

    log "PM2 ecosystem configuration created (Dashboard + OpenCode)"
}

# PM2 setup for source-based installation
setup_pm2_source() {
    # PM2 - PROMPT before install
    if ! command -v pm2 &>/dev/null; then
        prompt_install "PM2 (process manager)" "npm install -g pm2"
    fi
    log "PM2 $(pm2 -v) ✓"

    # Use Orient's isolated OpenCode installation
    local opencode_bin="$INSTALL_DIR/bin/opencode"
    if [[ -x "$opencode_bin" ]]; then
        local oc_version=$("$opencode_bin" --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
        log "Using Orient's OpenCode v$oc_version ✓"
    else
        error "OpenCode not found at $opencode_bin. Installation may have failed."
    fi

    # Create PM2 ecosystem configuration for source-based install
    cat > "$INSTALL_DIR/ecosystem.config.cjs" << ECOSYSTEM
const path = require('path');
const fs = require('fs');
const ORIENT_HOME = process.env.ORIENT_HOME || \`\${process.env.HOME}/.orient\`;

// OpenCode binary location (detected during install)
const OPENCODE_BIN = '${opencode_bin}' || process.env.HOME + '/.opencode/bin/opencode';

// Load .env file into env object (PM2 does not support env_file natively)
function loadEnvFile(filePath) {
  const env = {};
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  } catch (e) { /* .env file may not exist yet */ }
  return env;
}

const dotenv = loadEnvFile(path.join(ORIENT_HOME, '.env'));

module.exports = {
  apps: [
    {
      name: 'orient',
      cwd: path.join(ORIENT_HOME, 'orient'),
      script: 'packages/dashboard/dist/main.js',
      error_file: path.join(ORIENT_HOME, 'logs/orient-error.log'),
      out_file: path.join(ORIENT_HOME, 'logs/orient-out.log'),
      max_memory_restart: '750M',
      env: {
        ...dotenv,
        ORIENT_HOME: ORIENT_HOME,
      },
      // Unified server handles Dashboard + WhatsApp on port 4098
    },
    {
      name: 'orient-opencode',
      script: OPENCODE_BIN,
      args: 'serve --port 4099 --hostname 127.0.0.1',
      cwd: path.join(ORIENT_HOME, 'orient'),
      error_file: path.join(ORIENT_HOME, 'logs/opencode-error.log'),
      out_file: path.join(ORIENT_HOME, 'logs/opencode-out.log'),
      max_memory_restart: '500M',
      env: {
        ...dotenv,
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
      error_file: path.join(ORIENT_HOME, 'logs/slack-error.log'),
      out_file: path.join(ORIENT_HOME, 'logs/slack-out.log'),
      max_memory_restart: '500M',
      env: {
        ...dotenv,
        ORIENT_HOME: ORIENT_HOME,
      },
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
        git reset --hard origin/main
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

initialize_database_npm() {
    log "Initializing database..."

    # Source environment for database config
    set -a
    source "$INSTALL_DIR/.env"
    set +a

    if [[ "$DATABASE_TYPE" == "sqlite" ]]; then
        # Create SQLite database directory
        mkdir -p "$(dirname "$SQLITE_DATABASE")"

        # For npm install, use the orient CLI to initialize database
        log "Creating SQLite schema..."
        # The dashboard will auto-create the schema on first run
        log "Database will be initialized on first start ✓"
    else
        # PostgreSQL migration - for npm installs, schema is created on first run
        log "PostgreSQL schema will be initialized on first start ✓"
    fi
}

initialize_database_source() {
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
        pnpm --filter @orient-bot/database run db:push:sqlite 2>/dev/null || warn "Schema push skipped (may already exist)"
    else
        # PostgreSQL migration
        log "Running PostgreSQL migrations..."
        pnpm --filter @orient-bot/database run db:push 2>/dev/null || warn "Migration skipped (may already exist)"
    fi
}

# ============================================
# SHELL PATH SETUP
# ============================================

setup_shell_path() {
    local user_shell=$(basename "$SHELL")
    local shell_rc

    case "$user_shell" in
        zsh)  shell_rc="$HOME/.zshrc" ;;
        bash) shell_rc="${HOME}/.bash_profile"; [[ -f "$shell_rc" ]] || shell_rc="$HOME/.bashrc" ;;
        fish) shell_rc="$HOME/.config/fish/config.fish" ;;
        *)    shell_rc="$HOME/.profile" ;;
    esac

    # For npm installs, check if npm bin is in PATH
    if [[ "$SOURCE_BUILD" != "true" ]]; then
        local npm_bin="$(npm prefix -g)/bin"
        if [[ ":$PATH:" != *":$npm_bin:"* ]]; then
            echo ""
            info "To use the 'orient' command, ensure npm bin is in your PATH:"
            echo ""
            echo "    export PATH=\"\$(npm prefix -g)/bin:\$PATH\""
            echo ""

            if is_interactive; then
                read -p "$(echo -e "${YELLOW}[orient]${NC}") Add to $shell_rc automatically? [Y/n] " response
                if [[ "$response" != "n" && "$response" != "N" ]]; then
                    echo '' >> "$shell_rc"
                    echo '# Orient (npm global bin)' >> "$shell_rc"
                    echo 'export PATH="$(npm prefix -g)/bin:$PATH"' >> "$shell_rc"
                    echo 'export ORIENT_HOME="$HOME/.orient"' >> "$shell_rc"
                    log "Added to $shell_rc"
                fi
            fi
        fi
    fi

    # Always add ORIENT_HOME for source builds
    if [[ "$SOURCE_BUILD" == "true" ]]; then
        if ! grep -q "ORIENT_HOME" "$shell_rc" 2>/dev/null; then
            echo '' >> "$shell_rc"
            echo '# Orient' >> "$shell_rc"
            echo 'export ORIENT_HOME="$HOME/.orient"' >> "$shell_rc"
            echo 'export PATH="$ORIENT_HOME/bin:$PATH"' >> "$shell_rc"
            log "Added Orient to PATH in $shell_rc"
        fi
    fi

    echo ""
    warn "Run 'source $shell_rc' or restart your terminal to apply PATH changes."
}

# ============================================
# PRINT NEXT STEPS
# ============================================

print_next_steps() {
    local shell_rc
    local user_shell=$(basename "$SHELL")
    case "$user_shell" in
        zsh)  shell_rc="~/.zshrc" ;;
        bash) shell_rc="~/.bashrc" ;;
        *)    shell_rc="~/.profile" ;;
    esac

    echo ""
    echo "════════════════════════════════════════════════════════════════"
    log "Installation complete!"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "  ${GREEN}Next steps:${NC}"
    echo ""
    echo "  1. Apply PATH changes:"
    echo "     source $shell_rc   # or restart your terminal"
    echo ""
    echo "  2. Start Orient:"
    echo "     orient start"
    echo ""
    echo "     The dashboard will open automatically at http://localhost:4098"
    echo ""
    echo "  Other commands:"
    echo ""
    echo "    orient status      # Check service status"
    echo "    orient logs        # View logs"
    echo "    orient doctor      # Run diagnostics"
    echo "    orient config      # Edit configuration"
    echo ""
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

    if [[ "$SOURCE_BUILD" == "true" ]]; then
        info "Installing from source (this takes ~4 minutes)..."
    else
        info "Installing from npm (this takes ~30 seconds)..."
    fi
    echo ""

    check_prerequisites

    # Install Orient (npm or source)
    if [[ "$SOURCE_BUILD" == "true" ]]; then
        install_orient_source
    else
        install_orient_npm
    fi

    install_opencode
    configure_orient

    # Setup PM2 (npm or source)
    if [[ "$SOURCE_BUILD" == "true" ]]; then
        setup_pm2_source
        setup_cli
        initialize_database_source
    else
        setup_pm2_npm
        setup_shell_path
        initialize_database_npm
    fi

    # Save version and install type
    echo "$ORIENT_VERSION" > "$INSTALL_DIR/.orient-version"
    if [[ "$SOURCE_BUILD" == "true" ]]; then
        echo "source" > "$INSTALL_DIR/.install-type"
    else
        echo "npm" > "$INSTALL_DIR/.install-type"
    fi

    print_next_steps

    # Don't auto-start - let user run 'orient start' after PATH is set
    # This ensures the user applies PATH changes first
}

# Run main function
main "$@"
