#!/usr/bin/env bash
#
# Database Initialization Script (SQLite)
# Creates database directory and seeds the database for fresh installs
#
# Usage: ./scripts/init-db.sh [--force]
#   --force: Force re-run seeding even if already done

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source instance environment for correct SQLITE_DB_PATH
source "$SCRIPT_DIR/instance-env.sh"
configure_instance

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[DB-INIT]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[DB-INIT]${NC} $1"; }
log_error() { echo -e "${RED}[DB-INIT]${NC} $1"; }
log_step() { echo -e "${BLUE}[DB-INIT]${NC} $1"; }

# Parse arguments
FORCE_SEED=false
for arg in "$@"; do
  case $arg in
    --force)
      FORCE_SEED=true
      shift
      ;;
  esac
done

# Get database path
DB_PATH="${SQLITE_DB_PATH:-$DATA_DIR/orient.db}"
DB_DIR="$(dirname "$DB_PATH")"

log_info "Initializing SQLite database"
log_info "Database path: $DB_PATH"

# ============================================
# STEP 1: Create database directory
# ============================================
log_step "Creating database directory..."

if [ ! -d "$DB_DIR" ]; then
  mkdir -p "$DB_DIR"
  log_info "Created: $DB_DIR"
else
  log_info "Directory exists: $DB_DIR"
fi

# ============================================
# STEP 2: Check if database exists
# ============================================
log_step "Checking database..."

if [ -f "$DB_PATH" ]; then
  DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
  log_info "Database exists: $DB_PATH ($DB_SIZE)"

  if [ "$FORCE_SEED" = "false" ]; then
    log_info "Database already exists. Use --force to re-initialize."
  fi
else
  log_info "Database will be created on first access"
fi

# ============================================
# STEP 3: Run Drizzle push to create schema
# ============================================
log_step "Pushing database schema with Drizzle..."

cd "$PROJECT_ROOT"

# Set environment variables for Drizzle
export DATABASE_TYPE=sqlite
export SQLITE_DATABASE="$DB_PATH"

if pnpm --filter @orientbot/database run db:push:sqlite 2>&1 | head -20; then
  log_info "Schema pushed successfully"
else
  log_warn "Schema push may have had issues - check manually if needed"
fi

# ============================================
# STEP 4: Seed agents if needed
# ============================================
log_step "Checking agent registry..."

# Check if we should seed
SHOULD_SEED=false
if [ "$FORCE_SEED" = "true" ]; then
  SHOULD_SEED=true
  log_info "Force seeding enabled"
elif [ ! -f "$DB_PATH" ]; then
  SHOULD_SEED=true
  log_info "New database - will seed"
else
  # Check if agents table has data using sqlite3 if available
  if command -v sqlite3 &>/dev/null; then
    AGENT_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM agents;" 2>/dev/null || echo "0")
    if [ "$AGENT_COUNT" = "0" ]; then
      SHOULD_SEED=true
      log_info "No agents found - will seed"
    else
      log_info "Found $AGENT_COUNT agents - skipping seed"
    fi
  else
    log_warn "sqlite3 not available - skipping agent count check"
    SHOULD_SEED=true
  fi
fi

if [ "$SHOULD_SEED" = "true" ]; then
  log_info "Seeding agent registry..."

  if DATABASE_TYPE=sqlite SQLITE_DATABASE="$DB_PATH" pnpm run agents:seed 2>&1 | grep -E "(✅|Inserting|complete)" | head -10; then
    log_info "Agent registry seeded successfully"
  else
    log_warn "Agent seeding may have had issues - check manually if needed"
  fi
fi

# ============================================
# STEP 5: Verify database
# ============================================
log_step "Verifying database..."

if [ -f "$DB_PATH" ]; then
  DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
  log_info "Database size: $DB_SIZE"

  # List tables if sqlite3 is available
  if command -v sqlite3 &>/dev/null; then
    TABLES=$(sqlite3 "$DB_PATH" ".tables" 2>/dev/null | wc -w | tr -d ' ')
    log_info "Database has $TABLES tables"

    # Check key tables
    KEY_TABLES="agents secrets dashboard_users chat_permissions scheduled_jobs"
    for table in $KEY_TABLES; do
      if sqlite3 "$DB_PATH" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='$table';" 2>/dev/null | grep -q 1; then
        echo -e "  ${GREEN}✓${NC} $table"
      else
        echo -e "  ${YELLOW}⚠${NC} $table (missing)"
      fi
    done
  fi
else
  log_warn "Database file not yet created - will be created on first application access"
fi

log_info "Database initialization complete!"
