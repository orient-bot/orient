# Integration Configuration Reference

Detailed environment variable requirements for each integration.

## Table of Contents

- [Google OAuth](#google-oauth)
- [Slack](#slack)
- [WhatsApp](#whatsapp)
- [JIRA](#jira)
- [Database](#database)
- [Storage (MinIO/R2)](#storage-minior2)
- [OpenCode](#opencode)

---

## Google OAuth

Enables Gmail, Calendar, Tasks, Sheets, and Slides access via personal Google accounts.

### Required Variables

```bash
GOOGLE_OAUTH_CLIENT_ID=807260522878-xxxxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-xxxxx
```

### Optional Variables

```bash
GOOGLE_OAUTH_CALLBACK_PORT=8766  # Default port for OAuth callback
GOOGLE_OAUTH_CALLBACK_URL=https://ai.proph.bet/oauth/callback  # Production only
```

### Callback URLs (Register in Google Cloud Console)

| Environment | URL                                           |
| ----------- | --------------------------------------------- |
| Local       | `http://127.0.0.1:8766/oauth/google/callback` |
| Production  | `https://ai.proph.bet/oauth/callback`         |

### Google Cloud Console Setup

1. Go to [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID (Desktop or Web App)
3. Add authorized redirect URIs (both local and production)
4. Enable required APIs:
   - Gmail API
   - Google Calendar API
   - Google Tasks API
   - Google Sheets API
   - Google Slides API
   - Google Drive API (for sharing)

### Token Storage

- Local: `data/oauth-tokens/google-oauth.json`
- Production: `/home/opc/orienter/data/oauth-tokens/google-oauth.json`

---

## Slack

We have **two Slack apps** - one for production and one for local development/testing.

### Slack Apps

| App               | App ID      | Environment | Commands                           |
| ----------------- | ----------- | ----------- | ---------------------------------- |
| **orienter**      | A0A2CCF4EEA | Production  | `/ai`, `/health`, `/standup`, etc. |
| **orienter-test** | A0A7JQ1KXLJ | Local Dev   | `/ai-test`, `/health-test`, etc.   |

### Required Variables

```bash
SLACK_BOT_TOKEN=xoxb-...      # Bot token
SLACK_SIGNING_SECRET=...       # Signing secret
SLACK_APP_TOKEN=xapp-...       # App-level token (for Socket Mode)
SLACK_USER_TOKEN=xoxp-...      # User token (for user-level operations)
```

### Environment Files

- **`.env`** → Uses orienter-test app (local development)
- **`.env.production`** → Uses orienter app (production)

### Bot Token Scopes (both apps)

- `app_mentions:read` - Receive @mentions
- `channels:history`, `groups:history`, `im:history`, `mpim:history` - Read history
- `channels:read`, `groups:read`, `im:read`, `mpim:read` - List channels
- `chat:write` - Send messages
- `commands` - Slash commands
- `im:write`, `mpim:write` - DM capabilities
- `reactions:read`, `reactions:write` - Typing indicators
- `users:read` - User info

### User Token Scopes (both apps)

- `channels:history`, `groups:history`, `im:history`, `mpim:history`
- `channels:read`, `im:read`, `mpim:read`
- `chat:write`, `im:write`, `mpim:write`
- `reactions:read`, `reactions:write`
- `reminders:read`, `reminders:write`
- `emoji:read`, `identify`

### Slack App Management URLs

- Production app: https://api.slack.com/apps/A0A2CCF4EEA
- Test app: https://api.slack.com/apps/A0A7JQ1KXLJ

---

## WhatsApp

### Baileys Mode (Personal WhatsApp - Local Dev)

```bash
WHATSAPP_CLOUD_API_ENABLED=false
WHATSAPP_ADMIN_PHONE=+972501234567  # Admin phone for notifications
```

### Cloud API Mode (Business - Production)

```bash
WHATSAPP_CLOUD_API_ENABLED=true
WHATSAPP_CLOUD_API_PHONE_NUMBER_ID=123456789012345
WHATSAPP_CLOUD_API_ACCESS_TOKEN=EAAxxxxx...
WHATSAPP_CLOUD_API_WEBHOOK_VERIFY_TOKEN=your-verify-token
```

### Session Storage

- Local: `data/whatsapp-auth/`
- Production: `/home/opc/orienter/data/whatsapp-auth/`

---

## JIRA

### Required Variables

```bash
JIRA_HOST=your-site.atlassian.net
JIRA_EMAIL=your-email@domain.com
JIRA_API_TOKEN=ATATT3xFfGF0...  # Generate at id.atlassian.com/manage-profile/security/api-tokens
```

### Project Configuration

```bash
JIRA_PROJECT_KEY=YOUR_PROJECT  # Project key (e.g., PROJ for your Jira)
JIRA_COMPONENT=YOUR_COMPONENT  # Component filter
```

### Setup Steps

1. Go to [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Create API token
3. Use your Atlassian email + API token for authentication

---

## Database

### PostgreSQL

```bash
DATABASE_URL=postgresql://aibot:aibot123@localhost:5432/whatsapp_bot
```

### Production Values

```bash
# Production uses Docker network
DATABASE_URL=postgresql://aibot:password@orienter-postgres:5432/whatsapp_bot
```

---

## Storage (MinIO/R2)

### Local Development (MinIO)

```bash
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=orienter-media
S3_REGION=us-east-1
```

### Production (Cloudflare R2)

```bash
S3_ENDPOINT=https://account-id.r2.cloudflarestorage.com
S3_ACCESS_KEY=your-r2-access-key
S3_SECRET_KEY=your-r2-secret-key
S3_BUCKET=orienter-media
R2_ACCOUNT_ID=your-account-id
```

---

## OpenCode

### Server Configuration

```bash
OPENCODE_SERVER_URL=http://localhost:4099  # Local
OPENCODE_SERVER_URL=http://orienter-opencode:4099  # Production (Docker network)
```

### Model Configuration

```bash
OPENCODE_DEFAULT_MODEL=openai/gpt-4o-mini
```

---

## Adding a New Integration

When adding a new integration:

1. **Define required variables** - Document in this file
2. **Add to local `.env`** - Test locally first
3. **Add to production `.env`** - Via SSH
4. **Update docker-compose.yml** - If container needs the vars
5. **Update config.example.json** - For documentation
6. **Recreate containers** - To pick up new vars

### Checklist Template

```
[ ] Variables defined in references/integrations.md
[ ] Added to local .env
[ ] Added to production ~/orienter/.env
[ ] Added to docker-compose.yml environment section (if needed)
[ ] Updated templates/organization/config.example.json
[ ] Containers recreated on production
[ ] Tested locally
[ ] Tested on production
```
