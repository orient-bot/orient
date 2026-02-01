# Orient v0.1.0 Release Archive

Official release documentation for Orient v0.1.0

**Release Date**: 2025-01-20
**Git Tag**: `v0.1.0`

---

## What's in This Archive

This directory contains the official documentation for the Orient v0.1.0 release:

- **[CHANGELOG.md](./CHANGELOG.md)** - Complete list of features, changes, and fixes in this release
- **[TESTING.md](./TESTING.md)** - Testing procedures and fresh install validation guide

---

## Docker Images

Docker images for this release are available on GitHub Container Registry:

### OpenCode Service

```bash
ghcr.io/orient/orient/opencode:v0.1.0
```

### WhatsApp Bot

```bash
ghcr.io/orient/orient/whatsapp-bot:v0.1.0
```

### Dashboard

```bash
ghcr.io/orient/orient/dashboard:v0.1.0
```

---

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/orient/orient.git
cd orient

# Checkout the v0.1.0 release tag
git checkout v0.1.0

# Run setup
./run.sh doctor --fix

# Build packages
pnpm build:packages

# Start development environment
./run.sh dev start
```

### Using Docker Images

```bash
# Pull images for v0.1.0
docker pull ghcr.io/orient/orient/opencode:v0.1.0
docker pull ghcr.io/orient/orient/whatsapp-bot:v0.1.0
docker pull ghcr.io/orient/orient/dashboard:v0.1.0

# Or use docker-compose with the v0.1.0 tag
docker compose up -d
```

---

## Requirements

- **Node.js**: >= 20.0.0
- **pnpm**: >= 9.0.0
- **Docker**: Latest stable version
- **Docker Compose**: v2.0.0+

---

## Highlights

Orient v0.1.0 is the first official release and includes:

### Major Features

- **Slack Integration** - Full Slack bot with interactive components and onboarding flow
- **WhatsApp Bot** - Improved pairing experience and startup reliability
- **Dashboard** - Version notifications, storage tab, operations consolidation
- **Mini-Apps** - Share links and missing integrations badges
- **CI/CD** - Database migrations in deployment pipeline

### Database Migrations

This release includes 2 new database migrations:

- `004_add_onboarding_tracking.sql` - Tracks user onboarding state for Slack
- `005_add_user_version_preferences.sql` - Stores version notification preferences

**Important**: Run `pnpm db:migrate` before deploying to apply migrations.

---

## Testing

See **[TESTING.md](./TESTING.md)** for complete testing procedures.

### Quick Test Verification

```bash
# Start services
./run.sh dev start --no-whatsapp --no-slack

# Run test suite (~438 tests expected)
pnpm test:unit                               # ~246 tests
INTEGRATION_TESTS=true pnpm test:integration # ~43 tests
E2E_TESTS=true pnpm test:e2e                 # ~34 tests
pnpm vitest run tests/contracts/             # ~62 tests
pnpm vitest run tests/config/                # ~22 tests
pnpm vitest run tests/services/              # ~22 tests
```

---

## Upgrade Notes

If upgrading from a previous version:

1. **Run Database Migrations**: `pnpm db:migrate`
2. **Review Environment Variables**: Check for new variables in `.env.example`
3. **Clear Browser Cache**: Dashboard changes require cache clear
4. **Rebuild Packages**: `pnpm build:packages`

---

## Documentation

- **Full Changelog**: [CHANGELOG.md](./CHANGELOG.md)
- **Testing Guide**: [TESTING.md](./TESTING.md)
- **Main Repository**: https://github.com/orient/orient
- **Issues**: https://github.com/orient/orient/issues

---

## Support

For issues or questions about this release:

1. Check the [CHANGELOG.md](./CHANGELOG.md) for known issues
2. Review the [TESTING.md](./TESTING.md) for troubleshooting
3. Open an issue on [GitHub](https://github.com/orient/orient/issues)

---

## License

See the main repository for license information.
