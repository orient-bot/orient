---
'@orient-bot/cli': minor
'@orient-bot/dashboard': patch
'@orient-bot/core': patch
'@orient-bot/database': patch
'@orient-bot/database-services': patch
'@orient-bot/integrations': patch
'@orient-bot/agents': patch
'@orient-bot/apps': patch
'@orient-bot/mcp-tools': patch
'@orient-bot/mcp-servers': patch
'@orient-bot/api-gateway': patch
'@orient-bot/bot-whatsapp': patch
'@orient-bot/bot-slack': patch
---

Switch to npm-based installation with auto-open dashboard

- All packages now publish to public npm registry (registry.npmjs.org)
- CLI: Add --no-browser option to `orient start` with auto-open dashboard
- Installer: Default to npm install (~30s) with --source flag for developers
