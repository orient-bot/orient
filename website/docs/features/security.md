---
sidebar_position: 8
---

# Security Model

Orient is built with a privacy-first architecture. Your data never leaves your infrastructure.

## Privacy by Design

Orient's security model starts with a simple principle: **your data stays on your machine**. There is no Orient cloud, no telemetry endpoint, no analytics service. The software runs entirely within your infrastructure.

### No Telemetry

Orient sends zero data to any external service. There are:

- No usage analytics
- No error reporting to external services
- No feature flags fetched from remote servers
- No update checks phoning home
- No behavioral tracking

### Self-Hosted Only

Orient does not offer a hosted version. Every deployment runs on the user's own infrastructure:

- Local machine (development)
- Private server (production)
- Cloud VM you control (VPS, EC2, etc.)

## Data Isolation

### Database

All data is stored in a local SQLite database file. This includes:

- Conversation history
- Agent configurations
- Scheduled messages
- Integration metadata

The database file is owned by the Orient process and uses standard filesystem permissions.

### Credential Management

Sensitive credentials (API keys, OAuth tokens) are managed through the **Secrets Service**:

- Secrets are stored encrypted using AES-256-GCM
- Encryption keys are derived from a user-set master password
- Secrets are decrypted in memory only when needed
- No plaintext credentials are written to disk or logs

To manage secrets:

```bash
# Add a secret through the dashboard
# Navigate to Settings → Secrets

# Or via the CLI
orient secrets set OPENAI_API_KEY sk-...
```

See the [Secrets guide](/docs/getting-started/secrets) for details.

### Message Privacy

- Messages are stored locally in the SQLite database
- Messages sent to LLM providers use your own API keys
- No message content is shared with Orient maintainers
- Conversation data is not used for training

## Access Control

### Dashboard Authentication

The Orient dashboard requires authentication. On first setup, you create a password that protects the web interface.

### Tool Permissions

Each agent can be configured with specific tool permissions:

- Which integrations it can access
- What actions it can perform
- Rate limits on tool calls

This means you can create a "read-only" agent that can query data but not modify anything.

### Platform Isolation

Agents can be configured per-platform, so your WhatsApp agent may have different permissions than your Slack agent.

## Audit Logging

Orient logs all actions taken by agents:

- Tool calls (what tool, what arguments, what result)
- Integration accesses
- Configuration changes
- Authentication events

Logs are stored locally and can be reviewed through the dashboard or directly in the log files.

## Open Source

Orient is MIT licensed. The entire codebase is available at [github.com/orient/orient](https://github.com/orient/orient).

- Every line of code is auditable
- No obfuscated modules
- No binary blobs
- Community-reviewed security practices

## Best Practices

1. **Use strong secrets** — set a strong master password for the secrets service
2. **Restrict network access** — run Orient behind a firewall, only expose the dashboard on localhost or a VPN
3. **Review agent permissions** — give each agent only the tools it needs
4. **Keep updated** — pull the latest version for security patches
5. **Backup your database** — the SQLite file contains all your configuration and history
