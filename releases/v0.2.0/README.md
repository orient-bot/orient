# Orient v0.2.0 Release Archive

Official release documentation for Orient v0.2.0

**Release Date**: TBD
**Git Tag**: `v0.2.0`

---

## What's in This Archive

This directory contains the official documentation for the Orient v0.2.0 release:

- **[CHANGELOG.md](./CHANGELOG.md)** - Complete list of features, changes, and breaking changes
- **[TESTING.md](./TESTING.md)** - Testing procedures and fresh install validation guide

---

## Highlights

Orient v0.2.0 is a major architecture update:

- **Mac Installer** - One-line install with `orient` CLI
- **npm Packages** - `@orientbot/*` scope on npm (future: `npm install -g @orientbot/cli`)
- **SQLite-Only** - Zero database setup required
- **Single Port** - All services on port 4098

**IMPORTANT**: This is a breaking release. Fresh install required - no upgrade path from v0.1.x.

---

## Installation

### Mac Installer (Recommended)

```bash
# One-line install
curl -fsSL https://orient.bot/install.sh | bash

# Then:
orient start
open http://localhost:4098
```

The installer:

- Installs to `~/.orient/`
- Sets up PM2 for process management
- Auto-configures SQLite database
- Provides `orient` CLI for management

### CLI Commands

```bash
orient start     # Start Orient
orient stop      # Stop Orient
orient status    # Check status
orient logs      # View logs
orient doctor    # Run diagnostics
orient config    # Configure settings
orient upgrade   # Upgrade to latest
orient uninstall # Remove Orient completely
```

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/orient-bot/orient.git
cd orient

# Checkout the v0.2.0 release tag
git checkout v0.2.0

# Run setup
./run.sh doctor --fix

# Build packages
pnpm build:packages

# Start development environment
./run.sh dev start
```

---

## Docker Images

Docker images for this release are available on GitHub Container Registry:

### Dashboard (includes WhatsApp)

```bash
ghcr.io/orient-bot/orient/dashboard:v0.2.0
```

### OpenCode Service

```bash
ghcr.io/orient-bot/orient/opencode:v0.2.0
```

### Using Docker

```bash
# Pull images for v0.2.0
docker pull ghcr.io/orient-bot/orient/dashboard:v0.2.0
docker pull ghcr.io/orient-bot/orient/opencode:v0.2.0

# Or use docker-compose
docker compose up -d
```

**Note**: v0.2.0 no longer has a separate `whatsapp-bot` image. WhatsApp is now served from the Dashboard container.

---

## Requirements

- **Node.js**: >= 20.0.0
- **pnpm**: >= 9.0.0
- **macOS**: For one-line installer
- **Docker**: Latest stable version (optional)

---

## Architecture Changes

### SQLite-Only Database

v0.2.0 uses SQLite exclusively. No PostgreSQL setup required.

```env
# New configuration
SQLITE_DATABASE=./data/sqlite/orient.db
DATABASE_TYPE=sqlite
STORAGE_TYPE=local
STORAGE_PATH=./data/media
```

### Single Port (4098)

All services now run on a single port:

| Endpoint                       | Description      |
| ------------------------------ | ---------------- |
| `http://localhost:4098/`       | Dashboard        |
| `http://localhost:4098/health` | Health check     |
| `http://localhost:4098/qr/`    | WhatsApp QR code |
| `http://localhost:4098/api/*`  | API endpoints    |

---

## Testing

See **[TESTING.md](./TESTING.md)** for complete testing procedures.

### Quick Test Verification

```bash
# Start services
./run.sh dev start

# Run test suite (~286 tests expected)
pnpm test:unit                               # ~243 tests
INTEGRATION_TESTS=true pnpm test:integration # ~43 tests
```

---

## Upgrade Warning

**v0.2.0 requires a fresh install. There is no upgrade path from v0.1.x.**

If upgrading from v0.1.x:

1. Back up any critical data manually
2. Remove existing installation
3. Perform fresh install
4. Reconfigure all settings and credentials

---

## Documentation

- **Full Changelog**: [CHANGELOG.md](./CHANGELOG.md)
- **Testing Guide**: [TESTING.md](./TESTING.md)
- **Main Repository**: https://github.com/orient-bot/orient
- **Issues**: https://github.com/orient-bot/orient/issues

---

## Support

For issues or questions about this release:

1. Check the [CHANGELOG.md](./CHANGELOG.md) for known issues
2. Review the [TESTING.md](./TESTING.md) for troubleshooting
3. Open an issue on [GitHub](https://github.com/orient-bot/orient/issues)

---

## License

See the main repository for license information.
