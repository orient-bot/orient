#!/bin/bash
#
# Seed database for worktree development (SQLite)
#
# Usage:
#   ./scripts/seed-worktree-db.sh              # Seed database using instance path
#   ISOLATED=true ./scripts/seed-worktree-db.sh # Create new isolated database file
#   DB_PATH=/custom/path.db ./scripts/seed-worktree-db.sh # Custom DB path
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source instance environment for correct SQLITE_DB_PATH
source "$SCRIPT_DIR/instance-env.sh"
configure_instance

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Options
ISOLATED="${ISOLATED:-false}"
DB_PATH="${DB_PATH:-$SQLITE_DB_PATH}"
FORCE="${FORCE:-false}"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Worktree Database Seeding Script     ║${NC}"
echo -e "${BLUE}║         (SQLite)                       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# If isolated mode, create a new database file
if [ "$ISOLATED" = "true" ]; then
  DB_NAME="${DB_NAME:-worktree_$(date +%s)}"
  DB_PATH="${DATA_DIR}/${DB_NAME}.db"
  echo -e "${YELLOW}→${NC} Isolated mode: creating new database '${DB_NAME}'..."
fi

# Ensure database directory exists
DB_DIR="$(dirname "$DB_PATH")"
mkdir -p "$DB_DIR"

echo -e "${BLUE}→${NC} Database path: $DB_PATH"
echo ""

# Set environment variables for database
export DATABASE_TYPE=sqlite
export SQLITE_DATABASE="$DB_PATH"

echo -e "${BLUE}Step 1/3: Creating database schema...${NC}"

# Run Drizzle push to create schema
cd "$PROJECT_ROOT"
if pnpm --filter @orient/database run db:push:sqlite 2>&1 | head -20; then
  echo -e "  ${GREEN}✓${NC} Schema created/updated"
else
  echo -e "  ${YELLOW}!${NC} Schema push may have had issues (continuing)"
fi

echo ""
echo -e "${BLUE}Step 2/3: Migrating secrets from .env...${NC}"

# Extract ORIENT_MASTER_KEY from .env if not already set
if [ -z "${ORIENT_MASTER_KEY:-}" ] && [ -f "$PROJECT_ROOT/.env" ]; then
  MASTER_KEY_LINE=$(grep "^ORIENT_MASTER_KEY=" "$PROJECT_ROOT/.env" | head -1)
  if [ -n "$MASTER_KEY_LINE" ]; then
    ORIENT_MASTER_KEY="${MASTER_KEY_LINE#ORIENT_MASTER_KEY=}"
    # Remove quotes if present
    ORIENT_MASTER_KEY="${ORIENT_MASTER_KEY#\"}"
    ORIENT_MASTER_KEY="${ORIENT_MASTER_KEY%\"}"
    export ORIENT_MASTER_KEY
  fi
fi

if [ -n "${ORIENT_MASTER_KEY:-}" ]; then
  # Run migration with SQLite environment
  DATABASE_TYPE=sqlite SQLITE_DATABASE="$DB_PATH" ORIENT_MASTER_KEY="$ORIENT_MASTER_KEY" \
    npx tsx scripts/migrate-secrets-to-db.ts 2>/dev/null && \
    echo -e "  ${GREEN}✓${NC} Secrets migrated" || \
    echo -e "  ${YELLOW}!${NC} Secret migration failed (continuing)"
else
  echo -e "  ${YELLOW}!${NC} ORIENT_MASTER_KEY not found, skipping secret migration"
fi

echo ""
echo -e "${BLUE}Step 3/3: Seeding data...${NC}"

# Build seed command
SEED_ARGS=""
if [ "$FORCE" = "true" ]; then
  SEED_ARGS="--force"
fi

# Run unified seeder with SQLite environment
DATABASE_TYPE=sqlite SQLITE_DATABASE="$DB_PATH" npx tsx data/seeds/index.ts $SEED_ARGS 2>/dev/null || \
  echo -e "  ${YELLOW}!${NC} Seeding may have had issues (continuing)"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║      Database seeding complete!        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "Database path: ${BLUE}${DB_PATH}${NC}"

# Show database size
if [ -f "$DB_PATH" ]; then
  DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
  echo -e "Database size: ${BLUE}${DB_SIZE}${NC}"
fi

echo ""
echo -e "Next steps:"
echo -e "  ${YELLOW}./run.sh dev${NC}          - Start development server"
echo -e "  ${YELLOW}pnpm db:studio${NC}        - Open Drizzle Studio to inspect data"
