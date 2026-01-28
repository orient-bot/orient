---
name: personal-local-install-debugging
description: Debug local Orient installations running on macOS. Use this skill when asked to debug why chats aren't showing, investigate local server issues, check database state, review WhatsApp logs, troubleshoot fresh install problems, inspect SQLite databases, find which database the server is actually using, debug empty chat lists, investigate migration issues, or check local Orient service health. Covers database discovery, log analysis, SQLite inspection, common fresh-install bugs, and data flow tracing.
---

# Local Install Debugging

Debug Orient running locally (macOS dev or fresh npm install).

## Database Location Discovery

**Critical**: The running server may NOT use `./data/orient.db`. Discover the actual database:

```bash
# 1. Find the server process
lsof -i :4098

# 2. Use the PID to find open .db files
lsof -p <PID> 2>/dev/null | grep "\.db"
```

**Known database paths** (check in order):

1. `~/.orient/data/sqlite/orient.db` - npm global install / production-like local
2. `./data/orient.db` - local dev (from repo root)
3. `SQLITE_DATABASE` env var override

The `./data/messages.db` file is a legacy config default — if it exists and is 0 bytes, it's unused. The active database is determined by `SQLITE_DATABASE` env var, defaulting to `./data/orient.db` in dev, but global installs use `~/.orient/data/sqlite/orient.db`.

## Log Locations

Logs are at `<repo-root>/logs/` (NOT `data/logs/`):

| Log File Pattern                 | Content                             |
| -------------------------------- | ----------------------------------- |
| `whatsapp-debug-YYYY-MM-DD.log`  | WhatsApp bot activity, message flow |
| `whatsapp-error-YYYY-MM-DD.log`  | WhatsApp errors                     |
| `mcp-error-YYYY-MM-DD.log`       | MCP client/tool errors              |
| `mcp-debug-YYYY-MM-DD.log`       | MCP operations                      |
| `whatsapp-health-debug-*.log`    | Connection health checks            |
| `whatsapp-router-debug-*.log`    | Message routing                     |
| `whatsapp-cloud-api-debug-*.log` | Cloud API interactions              |
| `slack-bot-debug-*.log`          | Slack bot activity                  |

Logs are JSON lines format:

```bash
# Read today's WhatsApp errors
cat logs/whatsapp-error-$(date +%Y-%m-%d).log | jq .

# Search for specific errors
grep -i "error\|fail" logs/whatsapp-debug-$(date +%Y-%m-%d).log | jq .
```

## SQLite Database Inspection

```bash
DB_PATH="<discovered-path>/orient.db"

# List all tables
sqlite3 "$DB_PATH" ".tables"

# Check table schema
sqlite3 "$DB_PATH" "PRAGMA table_info(messages);"

# Row counts for key tables
sqlite3 "$DB_PATH" "
  SELECT 'messages' as tbl, COUNT(*) FROM messages
  UNION ALL SELECT 'groups', COUNT(*) FROM groups
  UNION ALL SELECT 'chat_permissions', COUNT(*) FROM chat_permissions
  UNION ALL SELECT 'slack_messages', COUNT(*) FROM slack_messages
  UNION ALL SELECT 'slack_channels', COUNT(*) FROM slack_channels;
"

# Sample messages
sqlite3 "$DB_PATH" "SELECT id, direction, phone, is_group, group_id, substr(text,1,50) FROM messages LIMIT 10;"

# Check groups
sqlite3 "$DB_PATH" "SELECT * FROM groups;"

# Check permissions
sqlite3 "$DB_PATH" "SELECT * FROM chat_permissions;"
```

## Key Tables

| Table              | Purpose                                           | Fresh Install State                    |
| ------------------ | ------------------------------------------------- | -------------------------------------- |
| `messages`         | All WhatsApp messages                             | Populated after first message received |
| `groups`           | Group metadata (name, subject, participant count) | Populated when group messages arrive   |
| `chat_permissions` | Per-chat read/write/ignored config                | Empty until user configures chats      |
| `slack_messages`   | Slack messages                                    | Empty until Slack connected            |
| `slack_channels`   | Slack channel metadata                            | Empty until Slack connected            |
| `agents`           | Agent registry (seeded on startup)                | Auto-seeded                            |
| `secrets`          | Encrypted secrets (AES-256-GCM)                   | Empty                                  |
| `dashboard_users`  | Dashboard login users                             | Created on first login                 |

## Common Fresh Install Issues

### 1. "No chats found" despite messages existing

**Symptoms**: Dashboard shows "UNCONFIGURED: N" but chat list is empty, "No chats found" displayed.

**Root cause**: `getAllChatsUnified()` in `messageDatabaseDrizzle.ts:1488` was only calling `getAllChatsWithPermissions()` which queries FROM `chat_permissions` table. On fresh install, this table is empty.

**Diagnosis**:

```bash
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM messages;"     # Has data
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM chat_permissions;"  # 0
```

**Fix applied**: `getAllChatsUnified()` now also calls `getChatsWithoutPermissions()` to include chats discovered from the messages table.

### 2. Write permission BLOCKED errors

**Log entry**: `Write permission BLOCKED - no write permission checker configured`

**Cause**: Race condition during startup — the WhatsApp bot tries to check write permissions before the permission checker is initialized. The next log line confirms it resolves: `Write permission checker set - outgoing messages now enforced`.

**Impact**: None — this is a transient startup ordering issue.

### 3. Server using wrong database

**Symptoms**: Dashboard shows data that doesn't match what you see in `./data/orient.db`.

**Diagnosis**:

```bash
# Find the actual database
lsof -p $(lsof -ti :4098) 2>/dev/null | grep "\.db"
```

Common cause: npm global install uses `~/.orient/data/sqlite/orient.db` while you're inspecting `./data/orient.db`.

### 4. Empty messages.db file (0 bytes)

**Cause**: Legacy config default in `packages/core/src/config/defaults.ts` sets `messageDatabase.dbPath` to `./data/messages.db`. The actual runtime uses `SQLITE_DATABASE` env var (defaults to `./data/orient.db`). The 0-byte file is created but never used.

**Action**: Ignore it. Check the database the process actually has open (see Discovery section above).

## Data Flow Reference

```
WhatsApp Message Received
  |
  v
bot-whatsapp/src/main.ts (Baileys socket)
  |-- messageDb.storeIncomingMessage()
  |-- messageDb.upsertGroup() (if group)
  |-- chatPermissionService.checkPermission()
  |
  v
database-services/src/services/messageDatabaseDrizzle.ts
  |-- Writes to: messages, groups tables
  |
  v
Dashboard Frontend (ChatList.tsx)
  |-- Calls: GET /chats/all
  |
  v
dashboard/src/server/routes.ts:466
  |-- db.getAllChatsUnified()
  |
  v
messageDatabaseDrizzle.ts:1488
  |-- getAllChatsWithPermissions()  -> FROM chat_permissions LEFT JOIN groups
  |-- getChatsWithoutPermissions() -> FROM messages LEFT JOIN groups WHERE no permission
  |
  v
Returns UnifiedChat[] with isConfigured flag
```

## Health Check Commands

```bash
# Check server is running
lsof -i :4098

# Check API health
curl -s http://localhost:4098/api/health | jq .

# Check WhatsApp stats
curl -s http://localhost:4098/api/stats -H "Authorization: Bearer <token>" | jq .

# Check database connectivity
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM messages;"
```

## Quick Debugging Checklist

1. Find PID: `lsof -i :4098`
2. Find actual DB: `lsof -p <PID> | grep .db`
3. Check tables: `sqlite3 <db> ".tables"`
4. Check row counts (see SQLite section)
5. Check logs: `cat logs/whatsapp-error-$(date +%Y-%m-%d).log`
6. Check WhatsApp debug: `cat logs/whatsapp-debug-$(date +%Y-%m-%d).log | jq .`

## Key Source Files

| File                                                                | Purpose                                        |
| ------------------------------------------------------------------- | ---------------------------------------------- |
| `packages/database/src/clients/types.ts:40`                         | Default SQLite path (`getDefaultSqlitePath()`) |
| `packages/database/src/clients/sqlite.ts`                           | SQLite connection init, WAL mode, pragmas      |
| `packages/database/src/schema/sqlite/index.ts`                      | All table definitions (Drizzle ORM)            |
| `packages/database-services/src/services/messageDatabaseDrizzle.ts` | All DB queries (1800+ lines)                   |
| `packages/dashboard/src/server/routes.ts:420-474`                   | Chat API endpoints                             |
| `packages/dashboard-frontend/src/components/ChatList.tsx`           | Chat list UI                                   |
| `packages/bot-whatsapp/src/main.ts`                                 | WhatsApp message handling                      |
| `packages/core/src/config/defaults.ts`                              | Config defaults (legacy messages.db path)      |
| `data/migrations/001-006_*.sql`                                     | SQL migration files                            |
