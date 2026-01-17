# Orient - Docker Deployment

This directory contains Docker configuration for deploying the Orient stack.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Docker Network                               │
│                                                                  │
│  ┌──────────────┐    HTTP    ┌──────────────────────────────┐   │
│  │ WhatsApp Bot │───────────▶│ OpenCode Server              │   │
│  │              │   :4099    │  └── MCP Server (sidecar)    │   │
│  └──────────────┘            └──────────────────────────────┘   │
│         │                              │                         │
│         ▼                              ▼                         │
│  ┌──────────────┐            ┌──────────────────────────────┐   │
│  │ WhatsApp Web │            │ External APIs                │   │
│  │ (Baileys)    │            │ - JIRA                       │   │
│  └──────────────┘            │ - Slack                      │   │
│                              │ - Google Slides              │   │
│                              │ - LLM Providers              │   │
│                              └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
           ┌───────────────┐
           │ S3 / Object   │
           │ Storage       │
           │ (persistence) │
           └───────────────┘
```

## Services

| Service        | Description                          | Port                              |
| -------------- | ------------------------------------ | --------------------------------- |
| `opencode`     | OpenCode AI server with MCP tools    | 4099 (API), 8765 (OAuth callback) |
| `whatsapp-bot` | WhatsApp bot using Baileys           | 4097 (QR), 4098 (Dashboard)       |
| `s3-sync`      | S3 synchronization daemon (optional) | -                                 |
| `slack-bot`    | Slack bot (optional)                 | -                                 |

## Local vs Production Configuration

### Local Development (HTTP)

For local development, use the local override file which uses HTTP-only nginx:

```bash
cd docker

# Option 1: Specify files explicitly
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d

# Option 2: Create a .env file with COMPOSE_FILE
echo "COMPOSE_FILE=docker-compose.yml:docker-compose.local.yml" > .env
docker compose up -d
```

This uses:

- `nginx.conf` - HTTP-only configuration (no SSL)
- No SSL certificate mounts required

Access via: http://localhost/qr/, http://localhost/dashboard/

### Production (HTTPS - Oracle Server)

For production deployment with SSL:

```bash
cd docker

# Uses docker-compose.yml directly (mounts SSL certs)
docker compose up -d

# Or with pre-built images
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

This uses:

- `nginx-ssl.conf` - HTTPS configuration with SSL
- SSL certificates from Let's Encrypt (`../certbot/conf/`)

Access via: https://app.example.com/ (Dashboard), https://app.example.com/qr, https://code.example.com/ (OpenCode)

### Configuration Files

| File                       | Purpose                                  |
| -------------------------- | ---------------------------------------- |
| `nginx.conf`               | HTTP-only for local development          |
| `nginx-ssl.conf`           | HTTPS for production                     |
| `docker-compose.yml`       | Base configuration (production defaults) |
| `docker-compose.local.yml` | Local development override (HTTP)        |
| `docker-compose.prod.yml`  | Production image override (ghcr.io)      |

## Quick Start

### 1. Prerequisites

- Docker and Docker Compose installed
- `.env` file configured (copy from `.env.example`)
- `.mcp.config.local.json` configured
- Google service account credentials in `credentials/`

### 2. Configure Environment

```bash
# From project root
cp .env.example .env
cp .mcp.config.local.json.example .mcp.config.local.json

# Edit with your credentials
nano .env
nano .mcp.config.local.json
```

### 3. Start Services

```bash
cd docker

# Start core services (OpenCode + WhatsApp)
docker compose up -d

# View logs
docker compose logs -f

# Start with S3 persistence
docker compose --profile s3 up -d

# Start with Slack bot
docker compose --profile slack up -d

# Start everything
docker compose --profile s3 --profile slack up -d
```

### 4. First-Time WhatsApp Setup

On first run, you need to scan a QR code:

```bash
# Watch WhatsApp bot logs for QR code
docker compose logs -f whatsapp-bot

# The QR code will appear in the terminal
# Scan it with your WhatsApp mobile app
```

## Oracle Cloud Free Tier Deployment

Oracle Cloud Free Tier offers ARM64 instances with:

- 4 ARM cores (Ampere A1)
- 24GB RAM
- 200GB storage
- Always free!

### Setup Steps

1. **Create Oracle Cloud Account**
   - Go to https://cloud.oracle.com/
   - Sign up for free tier

2. **Create Compute Instance**

   ```
   Shape: VM.Standard.A1.Flex
   OCPUs: 2-4 (free tier allows up to 4)
   Memory: 12-24GB
   Image: Ubuntu 22.04 (aarch64)
   ```

3. **Install Docker**

   ```bash
   # SSH to your instance
   ssh ubuntu@your-instance-ip

   # Install Docker
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER

   # Install Docker Compose
   sudo apt install docker-compose-plugin

   # Logout and login again
   ```

4. **Clone and Deploy**

   ```bash
   git clone https://github.com/your-org/orient.git
   cd orient

   # Configure
   cp .env.example .env
   nano .env

   # Build for ARM64
   cd docker
   docker compose build

   # Start
   docker compose up -d
   ```

### Cloudflare R2 Storage (Recommended for Production)

Cloudflare R2 provides S3-compatible storage with **zero egress fees**:

1. **Create Bucket**

   ```bash
   npx wrangler login
   npx wrangler r2 bucket create orient-data
   ```

2. **Generate API Token**
   - Go to Cloudflare Dashboard → R2 → Manage R2 API Tokens
   - Create token with "Object Read & Write" permission
   - Scope to `orient-data` bucket
   - Save Access Key ID and Secret Access Key

3. **Configure .env**

   ```bash
   # Cloudflare R2 Configuration
   R2_ACCOUNT_ID=your-cloudflare-account-id
   R2_ACCESS_KEY_ID=your-r2-access-key
   R2_SECRET_ACCESS_KEY=your-r2-secret-key
   S3_BUCKET=orient-data
   ```

4. **Deploy with R2**
   ```bash
   cd docker
   docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.r2.yml up -d
   ```

### Oracle Object Storage (Alternative)

Oracle Cloud provides S3-compatible object storage:

1. **Create Bucket**
   - Go to Storage > Object Storage > Buckets
   - Create bucket: `orient-data`

2. **Generate S3 Credentials**
   - Go to Identity > Users > Your User
   - Customer Secret Keys > Generate Secret Key
   - Save the Access Key and Secret Key

3. **Configure .env**

   ```bash
   S3_BUCKET=orient-data
   AWS_ACCESS_KEY_ID=your-oracle-access-key
   AWS_SECRET_ACCESS_KEY=your-oracle-secret-key
   AWS_REGION=us-ashburn-1

   # Oracle-specific endpoint (add to aws cli config if needed)
   # OCI_ENDPOINT=https://namespace.compat.objectstorage.region.oraclecloud.com
   ```

### Local Development with MinIO

For local development, the default docker-compose.yml includes MinIO:

```bash
# Start with local MinIO (default)
docker compose up -d

# MinIO Console available at http://localhost:9001
# Credentials come from `.env` (`MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`)
```

## Environment Variables

### Required

| Variable            | Description                             |
| ------------------- | --------------------------------------- |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key (or other LLM) |
| `JIRA_HOST`         | JIRA host (e.g., company.atlassian.net) |
| `JIRA_EMAIL`        | JIRA user email                         |
| `JIRA_API_TOKEN`    | JIRA API token                          |
| `SLACK_BOT_TOKEN`   | Slack bot token (if using Slack)        |

### Optional

| Variable                     | Description                 | Default        |
| ---------------------------- | --------------------------- | -------------- |
| `OPENCODE_PORT`              | OpenCode server port        | 4099           |
| `S3_BUCKET`                  | S3 bucket for persistence   | (none)         |
| `S3_SYNC_INTERVAL`           | Sync interval in seconds    | 300            |
| `TZ`                         | Timezone                    | Asia/Jerusalem |
| `ORIENT_APP_DOMAIN`          | Public dashboard domain     | (none)         |
| `ORIENT_CODE_DOMAIN`         | Public OpenCode domain      | (none)         |
| `ORIENT_STAGING_DOMAIN`      | Staging dashboard domain    | (none)         |
| `ORIENT_CODE_STAGING_DOMAIN` | Staging OpenCode domain     | (none)         |
| `ORIENT_SSL_DOMAINS`         | Comma-separated SSL domains | (none)         |

### Atlassian OAuth (for Atlassian MCP Server)

The Atlassian MCP server requires OAuth authentication. Configure these for production:

| Variable                  | Description                                  | Default   |
| ------------------------- | -------------------------------------------- | --------- |
| `OAUTH_CALLBACK_URL`      | Full callback URL (overrides other settings) | (none)    |
| `OAUTH_CALLBACK_HOST`     | Callback host/domain                         | localhost |
| `OAUTH_CALLBACK_PROTOCOL` | http or https                                | http      |
| `OAUTH_CALLBACK_PORT`     | Callback server port                         | 8765      |

**Production Example:**

```bash
# In .env for production
OAUTH_CALLBACK_URL=https://app.example.com/oauth/callback
```

**First-Time Atlassian OAuth Setup:**

1. Start the containers
2. The bot will trigger OAuth flow when first accessing Atlassian MCP
3. A browser will open (or display URL in logs) for Atlassian authorization
4. After authorization, tokens are saved to `data/oauth-tokens/`
5. Tokens are automatically refreshed and synced to S3

## Commands

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# View logs
docker compose logs -f [service-name]

# Rebuild after code changes
docker compose build --no-cache
docker compose up -d

# Shell into container
docker compose exec opencode sh
docker compose exec whatsapp-bot sh

# Check health (default port is 4099)
curl http://localhost:4099/global/health

# Manual S3 sync
docker compose exec s3-sync /usr/local/bin/s3-sync.sh push
```

## Troubleshooting

### WhatsApp QR Code Not Appearing

```bash
# Ensure interactive mode
docker compose up whatsapp-bot
# (not detached - watch for QR code)
```

### OpenCode Health Check Failing

```bash
# Check OpenCode logs
docker compose logs opencode

# Verify LLM API key is set
docker compose exec opencode env | grep -E "(ANTHROPIC|OPENAI|XAI)"
```

### S3 Sync Issues

```bash
# Check S3 sync logs
docker compose logs s3-sync

# Test S3 connectivity
docker compose exec s3-sync aws s3 ls s3://$S3_BUCKET/

# Manual sync
docker compose exec s3-sync /usr/local/bin/s3-sync.sh status
```

### Memory Issues (Small VPS)

If running on a small VPS (< 2GB RAM):

```bash
# Add swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## File Structure

```
docker/
├── Dockerfile              # Slack PM Bot
├── Dockerfile.whatsapp     # WhatsApp Bot
├── Dockerfile.opencode     # OpenCode + MCP Server
├── docker-compose.yml      # Service orchestration (includes MinIO for local dev)
├── docker-compose.prod.yml # Production image overrides (ghcr.io images)
├── docker-compose.r2.yml   # Cloudflare R2 storage override (disables MinIO)
├── opencode.json           # Docker-specific OpenCode config
├── opencode-entrypoint.sh  # OpenCode startup script
├── whatsapp-entrypoint.sh  # WhatsApp startup script
├── s3-sync.sh             # S3 synchronization script
└── README.md              # This file
```

## Security Notes

1. **Never commit `.env` or `.mcp.config.local.json`** - these contain secrets
2. **Use Docker secrets** for production deployments
3. **Firewall**: Only expose port 4099 if needed externally
4. **Updates**: Regularly update base images for security patches

## Support

For issues, check:

1. Container logs: `docker compose logs -f`
2. MCP server logs: `logs/mcp-*.log`
3. WhatsApp bot logs: `logs/whatsapp-bot.log`
