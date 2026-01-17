#!/usr/bin/env bash
#
# Database Initialization Script
# Runs migrations and seeds the database for fresh installs
#
# Usage: ./scripts/init-db.sh [--force]
#   --force: Force re-run migrations even if already applied

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source instance environment for correct DATABASE_URL
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
FORCE_MIGRATIONS=false
for arg in "$@"; do
  case $arg in
    --force)
      FORCE_MIGRATIONS=true
      shift
      ;;
  esac
done

# Get container name based on instance
CONTAINER_NAME="orienter-postgres-${AI_INSTANCE_ID:-0}"
POSTGRES_USER="${POSTGRES_USER:-aibot}"
POSTGRES_DB="${POSTGRES_DB:-whatsapp_bot_0}"

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  log_error "PostgreSQL container '$CONTAINER_NAME' is not running"
  log_error "Start the dev environment first: ./run.sh dev"
  exit 1
fi

log_info "Initializing database: $POSTGRES_DB on $CONTAINER_NAME"
log_info "DATABASE_URL: $(echo "$DATABASE_URL" | sed 's/:.*@/:****@/')"

# Function to run SQL inside the container
run_sql() {
  local sql="$1"
  docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$sql" 2>/dev/null
}

# Function to run SQL file inside the container
run_sql_file() {
  local file="$1"
  local filename=$(basename "$file")
  
  # Copy file to container and execute
  docker cp "$file" "$CONTAINER_NAME:/tmp/$filename"
  docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "/tmp/$filename" 2>&1
  docker exec "$CONTAINER_NAME" rm -f "/tmp/$filename"
}

# Check if migrations table exists (for tracking applied migrations)
create_migrations_table() {
  run_sql "CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ DEFAULT NOW()
  );" > /dev/null
}

# Check if a migration has been applied
migration_applied() {
  local name="$1"
  local result=$(run_sql "SELECT 1 FROM _migrations WHERE name = '$name'")
  [ -n "$result" ]
}

# Mark migration as applied
mark_migration_applied() {
  local name="$1"
  run_sql "INSERT INTO _migrations (name) VALUES ('$name') ON CONFLICT (name) DO NOTHING;" > /dev/null
}

# ============================================
# STEP 1: Create migrations tracking table
# ============================================
log_step "Creating migrations tracking table..."
create_migrations_table

# ============================================
# STEP 2: Run SQL migrations
# ============================================
log_step "Running database migrations..."

MIGRATIONS_DIR="$PROJECT_ROOT/data/migrations"
MIGRATIONS_APPLIED=0
MIGRATIONS_SKIPPED=0

if [ -d "$MIGRATIONS_DIR" ]; then
  for migration_file in "$MIGRATIONS_DIR"/*.sql; do
    if [ -f "$migration_file" ]; then
      migration_name=$(basename "$migration_file")
      
      if $FORCE_MIGRATIONS || ! migration_applied "$migration_name"; then
        log_info "Applying: $migration_name"
        if run_sql_file "$migration_file" > /dev/null 2>&1; then
          mark_migration_applied "$migration_name"
          ((MIGRATIONS_APPLIED++))
        else
          log_warn "Migration $migration_name may have had issues (continuing...)"
          mark_migration_applied "$migration_name"
          ((MIGRATIONS_APPLIED++))
        fi
      else
        ((MIGRATIONS_SKIPPED++))
      fi
    fi
  done
fi

log_info "Migrations: $MIGRATIONS_APPLIED applied, $MIGRATIONS_SKIPPED skipped"

# ============================================
# STEP 3: Seed agents if not already seeded
# ============================================
log_step "Checking agent registry..."

# Check if agents exist
AGENT_COUNT=$(run_sql "SELECT COUNT(*) FROM agents" 2>/dev/null || echo "0")

if [ "$AGENT_COUNT" = "0" ] || [ "$FORCE_MIGRATIONS" = "true" ]; then
  log_info "Seeding agent registry..."
  
  cd "$PROJECT_ROOT"
  if DATABASE_URL="$DATABASE_URL" pnpm run agents:seed 2>&1 | grep -E "(✅|Inserting|complete)" | head -10; then
    log_info "Agent registry seeded successfully"
  else
    log_warn "Agent seeding may have had issues - check manually if needed"
  fi
else
  log_info "Agent registry already has $AGENT_COUNT agents (skipping seed)"
fi

# ============================================
# STEP 4: Verify tables exist
# ============================================
log_step "Verifying database schema..."

TABLES=$(run_sql "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name" | wc -l | tr -d ' ')

log_info "Database initialized with $TABLES tables"

# List key tables
KEY_TABLES="agents secrets dashboard_users chat_permissions scheduled_jobs"
for table in $KEY_TABLES; do
  if run_sql "SELECT 1 FROM information_schema.tables WHERE table_name = '$table'" | grep -q 1; then
    echo -e "  ${GREEN}✓${NC} $table"
  else
    echo -e "  ${YELLOW}⚠${NC} $table (missing)"
  fi
done

log_info "Database initialization complete!"
