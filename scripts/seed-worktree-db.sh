#!/bin/bash
#
# Seed database for worktree development
#
# Usage:
#   ./scripts/seed-worktree-db.sh              # Seed existing database from .env
#   ISOLATED=true ./scripts/seed-worktree-db.sh # Create new isolated database
#   DB_NAME=my_test_db ISOLATED=true ./scripts/seed-worktree-db.sh # Custom DB name
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Options
ISOLATED="${ISOLATED:-false}"
DB_NAME="${DB_NAME:-worktree_$(date +%s)}"
FORCE="${FORCE:-false}"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Worktree Database Seeding Script     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Load DATABASE_URL from .env if not already set in environment
if [ -z "${DATABASE_URL:-}" ] && [ -f ".env" ]; then
  # Extract DATABASE_URL safely (avoid sourcing whole file due to cron expressions)
  DB_URL_LINE=$(grep "^DATABASE_URL=" .env | head -1)
  if [ -n "$DB_URL_LINE" ]; then
    # Extract value and strip surrounding quotes if present
    DB_URL_VALUE="${DB_URL_LINE#DATABASE_URL=}"
    # Remove leading/trailing quotes
    DB_URL_VALUE="${DB_URL_VALUE#\"}"
    DB_URL_VALUE="${DB_URL_VALUE%\"}"
    DB_URL_VALUE="${DB_URL_VALUE#\'}"
    DB_URL_VALUE="${DB_URL_VALUE%\'}"
    export DATABASE_URL="$DB_URL_VALUE"
    echo -e "${GREEN}✓${NC} Loaded DATABASE_URL from .env"
  fi
elif [ -n "${DATABASE_URL:-}" ]; then
  echo -e "${GREEN}✓${NC} Using DATABASE_URL from environment"
fi

# Use default if not set
if [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="postgresql://aibot:aibot123@localhost:5432/whatsapp_bot"
  echo -e "${YELLOW}!${NC} DATABASE_URL not in .env, using default: ${DATABASE_URL}"
fi

# If isolated mode, create a new database
if [ "$ISOLATED" = "true" ]; then
  echo -e "${YELLOW}→${NC} Isolated mode: creating new database '${DB_NAME}'..."

  # Extract connection details from DATABASE_URL or use defaults
  DB_HOST="${DB_HOST:-localhost}"
  DB_PORT="${DB_PORT:-5432}"
  DB_USER="${DB_USER:-aibot}"
  DB_PASSWORD="${DB_PASSWORD:-aibot123}"

  # Create the new database using psql (works with Docker)
  # First connect to 'postgres' db to create the new database
  PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
    -c "CREATE DATABASE ${DB_NAME};" 2>/dev/null && \
    echo -e "${GREEN}✓${NC} Created database: $DB_NAME" || \
    echo -e "${YELLOW}!${NC} Database may already exist, continuing..."

  # Update DATABASE_URL for this session and .env
  export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

  # Update .env file with new DATABASE_URL
  if [ -f ".env" ]; then
    # Check if DATABASE_URL line exists
    if grep -q "^DATABASE_URL=" .env; then
      # Use different sed syntax for macOS vs Linux
      if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=${DATABASE_URL}|" .env
      else
        sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${DATABASE_URL}|" .env
      fi
    else
      # Add DATABASE_URL if it doesn't exist
      echo "DATABASE_URL=${DATABASE_URL}" >> .env
    fi
    echo -e "${GREEN}✓${NC} Updated .env with new DATABASE_URL"
  fi

  echo -e "${BLUE}→${NC} DATABASE_URL: $DATABASE_URL"
fi

# Verify DATABASE_URL is set
if [ -z "${DATABASE_URL:-}" ]; then
  echo -e "${RED}✗${NC} DATABASE_URL not set. Please check your .env file."
  exit 1
fi

echo ""
echo -e "${BLUE}Step 1/3: Running migrations...${NC}"

# Run migrations
if [ -d "data/migrations" ]; then
  for migration in data/migrations/*.sql; do
    if [ -f "$migration" ]; then
      echo -e "  ${YELLOW}→${NC} Applying: $(basename "$migration")"
      psql "$DATABASE_URL" < "$migration" > /dev/null 2>&1 || {
        # Migration might fail if already applied, that's OK
        echo -e "    ${YELLOW}!${NC} Already applied or error (continuing)"
      }
    fi
  done
  echo -e "  ${GREEN}✓${NC} Migrations complete"
else
  echo -e "  ${YELLOW}!${NC} No migrations directory found, skipping"
fi

echo ""
echo -e "${BLUE}Step 2/3: Migrating secrets from .env...${NC}"

# Migrate secrets to database (requires ORIENT_MASTER_KEY)
# Extract ORIENT_MASTER_KEY from .env if not already set
if [ -z "${ORIENT_MASTER_KEY:-}" ] && [ -f ".env" ]; then
  MASTER_KEY_LINE=$(grep "^ORIENT_MASTER_KEY=" .env | head -1)
  if [ -n "$MASTER_KEY_LINE" ]; then
    ORIENT_MASTER_KEY="${MASTER_KEY_LINE#ORIENT_MASTER_KEY=}"
  fi
fi

if [ -n "${ORIENT_MASTER_KEY:-}" ]; then
  # Run migration with explicit DATABASE_URL to ensure correct database is used
  DATABASE_URL="$DATABASE_URL" ORIENT_MASTER_KEY="$ORIENT_MASTER_KEY" npx tsx scripts/migrate-secrets-to-db.ts && \
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

# Run unified seeder
npx tsx data/seeds/index.ts $SEED_ARGS

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║      Database seeding complete!        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "Database URL: ${BLUE}${DATABASE_URL}${NC}"
echo ""
echo -e "Next steps:"
echo -e "  ${YELLOW}npm run dev${NC}          - Start development server"
echo -e "  ${YELLOW}npm run db:studio${NC}    - Open Drizzle Studio to inspect data"
