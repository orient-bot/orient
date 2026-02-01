# Orient Installer

Scripts for installing Orient on a developer machine.

## Quick Start

### Public Installation (from GitHub)

```bash
curl -fsSL https://orient.bot/install.sh | bash
```

### Local Development Installation

```bash
./installer/install-local.sh
```

## Installer Scripts

| Script             | Description                                     |
| ------------------ | ----------------------------------------------- |
| `install.sh`       | Public one-line installer - clones from GitHub  |
| `install-local.sh` | Local installer - copies from current directory |
| `e2e-test.sh`      | E2E test runner (wrapper for tests/)            |

## Testing

### Run Installer Tests

```bash
# Run tests locally (fast, uses current environment)
pnpm test:installer

# Run tests in Docker (clean environment, recommended)
pnpm test:installer:docker

# Verbose output
pnpm test:installer:verbose

# Test public installer (requires repo on GitHub)
pnpm test:installer:public
```

### Test Scripts

| Script                         | Description                             |
| ------------------------------ | --------------------------------------- |
| `tests/test-install.sh`        | Main test runner                        |
| `tests/test-install-public.sh` | Tests public `curl \| bash` flow        |
| `tests/verify-install.sh`      | Verification script (runs in container) |
| `tests/Dockerfile.macos-sim`   | Docker image for clean test environment |

### Docker Test Environment

The Docker image (`Dockerfile.macos-sim`) simulates a clean macOS-like environment:

- **Base**: `node:20-alpine` (lightweight, has Node 20)
- **Installed**: git, bash, curl, openssl
- **NOT installed**: pnpm (installer should handle this)
- **User**: Non-root `developer` user

### Test Flow

```
┌─────────────────┐
│  Build Docker   │
│     Image       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Copy Source    │
│  Into Container │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Run install-    │
│  local.sh       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Verify       │
│ Installation    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Report Pass/   │
│     Fail        │
└─────────────────┘
```

## What Gets Installed

The installer creates the following structure:

```
~/.orient/
├── bin/
│   └── orient          # CLI wrapper script
├── config/             # User configuration
├── data/
│   ├── orient.db       # SQLite database
│   └── storage/        # File storage
├── logs/               # Application logs
├── backups/            # Backup files
└── source/             # Application source code
    ├── .env            # Generated configuration
    ├── ecosystem.config.js  # PM2 configuration
    ├── node_modules/
    └── dist/           # Built JavaScript
```

## Configuration

The installer generates a `.env` file with:

- SQLite database configuration
- Local file storage
- Secure random secrets (JWT, master key)
- Logging configuration

## CLI Commands

After installation, the `orient` command is available:

```bash
orient doctor   # Check system health
orient start    # Start services (requires PM2)
orient stop     # Stop services
orient status   # Show service status
orient logs     # View service logs
orient update   # Update to latest version
orient version  # Show version
```

## Verification Checklist

The tests verify:

- [x] Node.js version check works
- [x] pnpm gets installed if missing
- [x] Directory structure created
- [x] `.env` file generated with required keys
- [x] `pnpm install` completes successfully
- [x] `pnpm build:all` completes successfully
- [x] PM2 ecosystem config created
- [x] CLI wrapper created and executable
- [x] `orient doctor` command runs

## CI/CD

The installer is tested automatically via GitHub Actions:

- **Trigger**: Manual (`workflow_dispatch`) or changes to `installer/**`
- **Runners**: Ubuntu (Docker) + macOS (native)
- **Artifacts**: Logs uploaded on failure

See `.github/workflows/test-installer.yml` for details.

## Expected Performance

| Step           | Time             |
| -------------- | ---------------- |
| Docker build   | 30s (cached: 5s) |
| pnpm install   | 2-3 min          |
| pnpm build:all | 1-2 min          |
| Verification   | 10s              |
| **Total**      | **4-6 min**      |

## Limitations

- Docker tests run in Alpine Linux, not actual macOS
- Public installer test requires repo to be on GitHub
- PM2 service startup not tested (requires interactive process)
