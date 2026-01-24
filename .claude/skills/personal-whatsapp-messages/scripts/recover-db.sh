#!/bin/bash
# WhatsApp Messages Database Recovery Script
# Use this script when the database is corrupted

set -e

# Configuration
DB_PATH="${1:-data/messages.db}"
BACKUP_DIR="data/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "WhatsApp Messages Database Recovery"
echo "=========================================="
echo ""

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo -e "${RED}Error: Database not found at $DB_PATH${NC}"
    exit 1
fi

# Check database integrity
echo "Checking database integrity..."
INTEGRITY=$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>&1 | head -1)

if [ "$INTEGRITY" = "ok" ]; then
    echo -e "${GREEN}Database is healthy. No recovery needed.${NC}"
    exit 0
fi

echo -e "${YELLOW}Database corruption detected: $INTEGRITY${NC}"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup corrupted database
BACKUP_FILE="$BACKUP_DIR/messages_corrupted_$TIMESTAMP.db"
echo "Creating backup: $BACKUP_FILE"
cp "$DB_PATH" "$BACKUP_FILE"
cp "$DB_PATH-wal" "$BACKUP_DIR/messages_corrupted_$TIMESTAMP.db-wal" 2>/dev/null || true
cp "$DB_PATH-shm" "$BACKUP_DIR/messages_corrupted_$TIMESTAMP.db-shm" 2>/dev/null || true

# Try to recover using .recover command
RECOVER_SQL="$BACKUP_DIR/recover_$TIMESTAMP.sql"
echo "Attempting recovery with .recover..."
sqlite3 "$DB_PATH" ".recover" > "$RECOVER_SQL" 2>&1 || true

# Check if recovery got any data
LINES=$(wc -l < "$RECOVER_SQL")
echo "Recovered $LINES lines of SQL"

if [ "$LINES" -lt 10 ]; then
    echo -e "${RED}Recovery failed - not enough data recovered${NC}"
    echo "You may need to restore from a previous backup."
    exit 1
fi

# Create new database from recovered SQL
NEW_DB="$BACKUP_DIR/messages_recovered_$TIMESTAMP.db"
echo "Creating new database: $NEW_DB"
sqlite3 "$NEW_DB" < "$RECOVER_SQL" 2>&1 || true

# Check for lost_and_found table
LOST_COUNT=$(sqlite3 "$NEW_DB" "SELECT COUNT(*) FROM lost_and_found;" 2>/dev/null || echo "0")
echo "Found $LOST_COUNT rows in lost_and_found table"

if [ "$LOST_COUNT" -gt 0 ]; then
    echo "Restoring messages from lost_and_found..."
    sqlite3 "$NEW_DB" "
    INSERT OR IGNORE INTO messages 
      (message_id, direction, jid, phone, text, is_group, group_id, 
       timestamp, created_at, media_type, media_path, media_mime_type, 
       transcribed_text, transcribed_language)
    SELECT c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14
    FROM lost_and_found
    WHERE c2 IN ('incoming', 'outgoing')
      AND c1 IS NOT NULL
      AND c8 IS NOT NULL;
    "
fi

# Verify new database
NEW_INTEGRITY=$(sqlite3 "$NEW_DB" "PRAGMA integrity_check;" 2>&1 | head -1)
NEW_COUNT=$(sqlite3 "$NEW_DB" "SELECT COUNT(*) FROM messages;" 2>/dev/null || echo "0")

echo ""
echo "Recovery Results:"
echo "  New database integrity: $NEW_INTEGRITY"
echo "  Messages recovered: $NEW_COUNT"

if [ "$NEW_INTEGRITY" = "ok" ] && [ "$NEW_COUNT" -gt 0 ]; then
    echo ""
    echo -e "${GREEN}Recovery successful!${NC}"
    echo ""
    echo "To complete recovery, run:"
    echo "  rm -f $DB_PATH $DB_PATH-wal $DB_PATH-shm"
    echo "  mv $NEW_DB $DB_PATH"
    echo ""
    echo "Or to do it automatically, run this script with --apply:"
    
    if [ "${2:-}" = "--apply" ]; then
        echo ""
        echo "Applying recovery..."
        rm -f "$DB_PATH" "$DB_PATH-wal" "$DB_PATH-shm"
        mv "$NEW_DB" "$DB_PATH"
        echo -e "${GREEN}Done! Database has been replaced with recovered version.${NC}"
    fi
else
    echo ""
    echo -e "${RED}Recovery may be incomplete. Manual review recommended.${NC}"
    echo "Recovered database is at: $NEW_DB"
    echo "Recovery SQL is at: $RECOVER_SQL"
fi

echo ""
echo "Backup files are in: $BACKUP_DIR"




