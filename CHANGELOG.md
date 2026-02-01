# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2025-01-20

### Added

#### Slack Integration

- Onboarding flow with interactive DM when user first joins workspace
- Interactive button components for rich message interactions
- Session persistence for maintaining conversation state across messages

#### Dashboard

- Version notification system with dismiss/remind later options
- Storage tab for viewing and managing persistent data
- Operations consolidation - combined tools and operations into single tab
- Integration credential modal for managing API keys and tokens

#### WhatsApp

- Improved fresh install and initial pairing experience
- Better startup timing and health endpoint reliability

#### Mini-Apps

- Share link generation for created mini-apps
- Link button on app cards for quick access
- Missing integrations badge showing required but unconfigured integrations

#### CI/CD

- Database migration support in deployment pipeline
- Staging deployment workflow with nginx consolidation
- Dynamic database credentials in migration scripts

#### Developer Experience

- Work-item-tracker skill for status line updates
- Claude worktree manager improvements for isolated development

### Changed

- Dashboard sidebar reorganized for better navigation
- System prompts restructured to platform-specific sections (WhatsApp, Slack, etc.)
- Integration loader uses lazy imports for better performance

### Fixed

- 401 reload loop causing infinite refresh on auth failures
- React Router basename issue when served at root path
- TypeScript build errors from Slack onboarding merge
- MCP environment variables not being passed correctly
- WhatsApp startup timing issues causing health check failures
- Progressive responder sendReaction callback not being invoked

### Migrations

New database migrations included in this release:

- `004_add_onboarding_tracking.sql` - Tracks user onboarding state for Slack
- `005_add_user_version_preferences.sql` - Stores version notification preferences

---

## Upgrade Notes

1. Run database migrations before deploying: `pnpm db:migrate`
2. Review new environment variables for staging deployment
3. Clear browser cache after upgrade for dashboard changes

[Unreleased]: https://github.com/orient/orient/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/orient/orient/releases/tag/v0.1.0
