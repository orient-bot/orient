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
- `orient` CLI for start/stop/status/logs/doctor/config/upgrade/uninstall
- Auto-configures SQLite database and local media storage
- Interactive setup with API key prompts
- Clean uninstall with `orient uninstall`

#### npm Publishing Infrastructure

- All packages renamed from `@orient-bot/*` to `@orient-bot/*` scope
- Future npm-based installation: `npm install -g @orient-bot/cli`
- Changesets for version management and changelog generation
- Automated npm publishing via CI/CD workflow
- 15 publishable packages with proper publishConfig

#### CLI Improvements

- Cleaner output with checkmark indicators (✓)
- Silent PM2 operations for reduced noise
- Improved doctor command output
- Better error handling for start/restart failures
- Proper uninstall confirmation flow
- OpenCode installation isolated to `~/.orient/bin` (separate from system)
- Dashboard frontend bundled with installer (no separate build step)

#### Architecture

- SQLite as exclusive database backend (simpler, zero-config)
- Service consolidation: Dashboard + WhatsApp on single port 4098
- Local filesystem storage option (alternative to S3)

#### Intelligent Context Control

- **Context Analyzer** - Automatic detection of conversation state changes
  - Frustration detection: Identifies when users are frustrated and need help
  - Topic shift detection: Recognizes when conversations change direction
  - Automatic context reset suggestions based on conversation analysis
- Integration tests and eval cases for context analysis

#### Slack Improvements

- **Interactive Buttons** - Approve/Reject buttons for permission prompts instead of typing commands
- **Session Persistence** - Conversations continue across bot restarts
- **One-Time Onboarding** - First-time setup delivers:
  - Slack DM with Block Kit formatted quick-start guide
  - Dashboard notification banner with learn-more link
  - Graceful degradation (setup succeeds even if DM fails)

#### Mini-Apps

- **Backend Storage** - Key-value storage API for persistent data
  - Apps can now store data in database instead of localStorage only
  - Bridge API endpoints: `storage.set`, `storage.get`, `storage.delete`

#### OpenCode Version Management

- **Git LFS Bundled Binaries** - OpenCode binaries bundled in repo via Git LFS
  - Eliminates version drift between installations
  - Offline installation support
  - SHA256 checksum verification

#### Production Monitoring

- **SSH Dashboard Support** - Monitor production servers via SSH from dashboard
  - SSH client installed in Docker image
  - SSH key mounting from `docker/.ssh/`

#### Features

- Google OAuth proxy for external instances
- WhatsApp onboarding improvements (syncing UI, phone pre-fill)
- Group write permission warning in dashboard
- OAuth proxy session management
- Atlassian OAuth flow improvements with better token storage

### Changed

- **Package scope renamed**: `@orient-bot/*` → `@orient-bot/*` (all 15 packages)
- Database client: pg.Pool → better-sqlite3 + Drizzle ORM
- All 32 database tables migrated to SQLite schema
- Docker Compose simplified (no PostgreSQL container, no separate WhatsApp)
- Dashboard serves WhatsApp endpoints via apiRouter.ts
- Health checks consolidated to single endpoint
- Installer output improved with progress indicators
- OpenCode handlers now use shared `openCodeHandlerBase.ts` for common logic
- Slack permission prompts use interactive buttons instead of text commands
- Conversation context persists across bot restarts

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
