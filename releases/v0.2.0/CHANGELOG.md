# Changelog - v0.2.0

All notable changes in this release are documented below.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] - TBD

### Breaking Changes

#### SQLite-Only Database

v0.2.0 removes PostgreSQL entirely. **This is a one-way migration.**

**Impact:**

- Existing PostgreSQL installations cannot upgrade in-place
- All historical data (messages, agents, secrets) will be lost
- Users must re-authenticate after upgrade
- Fresh install is required

**Environment Changes:**

```env
# Removed:
DATABASE_URL=postgres://...

# Added:
SQLITE_DATABASE=./data/sqlite/orient.db
DATABASE_TYPE=sqlite
STORAGE_TYPE=local
STORAGE_PATH=./data/media
```

**API Changes:**

```typescript
// Before (async):
const db = await getDatabase();

// After (sync):
const db = getDatabase();
```

#### Single Port Architecture

WhatsApp is now served from the Dashboard service on port 4098.

**Impact:**

- Port 4097 is no longer used
- WhatsApp endpoints moved: `localhost:4097/*` → `localhost:4098/*`
- QR code endpoint: `http://localhost:4098/qr/`
- Health check: `http://localhost:4098/health`

**Environment Changes:**

```env
# Removed:
WHATSAPP_PORT=4097

# Dashboard port serves everything:
DASHBOARD_PORT=4098
```

**Docker Compose Changes:**

- Removed separate `whatsapp-bot` service
- Dashboard container handles both Dashboard and WhatsApp

---

### Added

#### Mac Installer

- One-line installer: `curl -fsSL https://orient.bot/install.sh | bash`
- Installs to `~/.orient/` with PM2 process management
- `orient` CLI for start/stop/status/logs/doctor/config/upgrade
- Auto-configures SQLite database and local media storage
- Interactive setup with API key prompts

#### Architecture

- SQLite as exclusive database backend (simpler, zero-config)
- Service consolidation: Dashboard + WhatsApp on single port 4098
- Local filesystem storage option (alternative to S3)

#### Features

- Google OAuth proxy for external instances
- WhatsApp onboarding improvements (syncing UI, phone pre-fill)
- Group write permission warning in dashboard
- OAuth proxy session management

### Changed

- Database client: pg.Pool → better-sqlite3 + Drizzle ORM
- All 32 database tables migrated to SQLite schema
- Docker Compose simplified (no PostgreSQL container, no separate WhatsApp)
- Dashboard serves WhatsApp endpoints via apiRouter.ts
- Health checks consolidated to single endpoint

### Removed

- PostgreSQL support
- DATABASE_URL environment variable
- WHATSAPP_PORT environment variable
- Separate WhatsApp service (port 4097)
- SQL migration files (now using Drizzle ORM declarative schema)

### Migrations

- SQLite schema auto-creates on first run via Drizzle ORM
- No manual migration needed for fresh installs

---

## Upgrade Notes

**IMPORTANT: Fresh install required. No upgrade path from v0.1.x.**

1. Back up any critical data manually before upgrading
2. Perform fresh install using Mac installer or Docker
3. Reconfigure API keys and integrations
4. Re-authenticate WhatsApp and Slack connections
