# Changelog - v0.1.1

All notable changes in this release are documented below.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.1] - 2026-01-24

### Added

#### WhatsApp

- Onboarding improvements with syncing UI showing real-time pairing status
- Phone number pre-fill from existing configuration
- Sync state tests for pairing flow validation
- Enhanced WhatsAppPairingPanel with progress indicators

#### Dashboard

- Warning dialog for adding write permissions to multi-member WhatsApp groups
- Improved PermissionEditor with group member validation
- Authenticated API route tests for security enforcement
- Component tests for WhatsAppPairingPanel and PermissionEditor

#### Documentation

- Comprehensive CLI documentation in Help section
- Website Privacy Policy and Terms & Conditions pages
- Website-only deployment workflow documentation
- WhatsApp setup guide updates
- Feature Flags documentation
- Worktree merge conflict resolution guide
- SSH troubleshooting for production debugging

#### Integrations

- Discord integration with OAuth2 and API client support

#### Skills

- Website-content-deployment skill for docs and blog updates
- Compound engineering workflow skills
- Comprehensive worktree operations guide

#### Mini-Apps

- Simple todo app added to app gallery

#### Testing

- Enhanced testing-strategy skill with 377 additional lines of guidance
- Static analysis tests for authenticated API enforcement
- WhatsApp sync state comprehensive test suite
- PermissionEditor component tests with 338 test cases
- WhatsAppPairingPanel component tests with 418 test cases

### Changed

- Testing strategy documentation significantly expanded
- Dashboard API module refactored with 57 new lines
- PermissionEditor component enhanced with 190 additional lines
- WhatsAppPairingPanel improved with 166 additional lines

### Fixed

- YAML frontmatter added to skill files for proper parsing
- Nginx proxy rule for /dashboard/mascot/ static files
- Docker .env file mounting in dashboard container for setup wizard
- Nginx staging upstreams disabled when containers not running
- React Router basename correction when dashboard served at root path
- OpenCode Docker build removing non-existent directories
- SSH key mount to dashboard for production monitoring
- Feature flag tests updated for database-backed implementation

### Infrastructure

- Oracle Cloud deployment infrastructure improvements
- Docker compose configuration enhancements
- Production deployment troubleshooting guides

---

## Upgrade Notes

1. No database migrations required for this release
2. Review new WhatsApp onboarding UI improvements
3. Test group write permission warnings in dashboard
4. Update documentation site with new Privacy Policy and Terms pages
5. SSH access configured for production monitoring

## Test Coverage

This release includes significant test improvements:

- 337 new WhatsApp sync state tests
- 418 new WhatsAppPairingPanel component tests
- 338 new PermissionEditor component tests
- 41 new authenticated API enforcement tests
- Enhanced testing strategy documentation

Total new test cases: **1,134 tests added**
