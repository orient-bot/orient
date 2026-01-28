---
sidebar_position: 9
---

# Integrations

Orient connects to external services through integrations. Each integration gives agents access to new tools and data sources.

## Supported Integrations

### Google Workspace

| Service             | Capabilities                                                   |
| ------------------- | -------------------------------------------------------------- |
| **Google Calendar** | Read events, create events, check availability, manage invites |
| **Gmail**           | Read emails, draft messages, send replies                      |
| **Google Docs**     | Create documents, read content, edit text                      |
| **Google Drive**    | List files, search, organize                                   |

Setup: See [Google integration guide](/docs/getting-started/google)

### Jira

| Capability            | Description                                 |
| --------------------- | ------------------------------------------- |
| **Query tickets**     | Search by project, status, assignee, sprint |
| **Update tickets**    | Change status, add comments, update fields  |
| **Create tickets**    | New issues with type, priority, assignee    |
| **Sprint management** | View sprint progress, backlog items         |

### GitHub

| Capability          | Description                               |
| ------------------- | ----------------------------------------- |
| **Webhooks**        | Receive push, PR, and issue notifications |
| **Repository info** | Query repos, branches, commits            |

Setup: See [Webhooks guide](/docs/getting-started/webhooks)

### MCP Servers

Orient supports any MCP (Model Context Protocol) compatible server, which means you can connect:

- Custom-built tools
- Third-party MCP servers
- Community MCP packages

## Connecting Integrations

### Via Dashboard

1. Navigate to **Dashboard → Integrations**
2. Select the integration you want to add
3. Follow the OAuth flow or enter API credentials
4. Configure which agents have access

### Via Secrets

Some integrations require API keys stored as secrets:

```bash
# Set API keys through the Secrets management
# Dashboard → Settings → Secrets
```

See [Secrets guide](/docs/getting-started/secrets) for details.

## Building Custom Integrations

Orient's integration system is built on MCP (Model Context Protocol). To create a custom integration:

### 1. Create an MCP Server

An MCP server exposes tools that Orient agents can call. The server can be written in any language that supports the MCP protocol.

Example structure:

```
my-integration/
├── src/
│   └── index.ts      # MCP server entry point
├── package.json
└── README.md
```

### 2. Define Tools

Each tool has a name, description, and input schema. The agent uses the description to decide when to call the tool.

### 3. Connect to Orient

Register your MCP server in the dashboard under **Integrations → MCP Servers**. Provide:

- Server command (how to start it)
- Environment variables it needs
- Tool descriptions

### 4. Assign to Agents

Give specific agents access to your integration's tools through the Agent Registry.

## Integration Best Practices

1. **Use OAuth when available** — more secure than API keys
2. **Limit scopes** — request only the permissions you need
3. **Monitor usage** — check the audit log for integration activity
4. **Rotate credentials** — periodically update API keys and tokens
5. **Test in CLI first** — verify integrations work before deploying to messaging platforms
