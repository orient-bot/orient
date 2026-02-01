## FAQ

### Where do I configure API keys and secrets?

Use the **Secrets** tab in the dashboard (`/secrets`). Secrets are stored securely in the database and used by all services. For local development, you can also use `.env` but database secrets take priority.

### Where do MCP credentials live?

Copy `.mcp.config.example.json` to `.mcp.config.local.json` for local dev, or configure MCP servers in the Integrations tab.

### How do I connect WhatsApp?

1. Go to the WhatsApp tab in the dashboard
2. Enter your phone number in international format (e.g., +1234567890)
3. Click "Generate QR Code" or "Get Pairing Code"
4. Scan/enter the code with your WhatsApp app

### How do I connect Slack?

1. Create a Slack app at https://api.slack.com/apps
2. Add required OAuth scopes (channels:read, chat:write, etc.)
3. Install the app to your workspace
4. Add the Bot Token to the Secrets tab (`SLACK_BOT_TOKEN`)
5. Configure channels in the Slack tab

### How do I connect Atlassian (Jira/Confluence)?

1. Go to the Integrations tab in the dashboard
2. Find **Atlassian (JIRA & Confluence)** and click **Connect**
3. Complete the OAuth flow (OpenCode will handle the MCP OAuth callback)
4. Once connected, Atlassian tools will appear in MCP-enabled clients

### Why is nothing responding?

Check that:

1. The OpenCode server is running (port 4099)
2. Chat permissions are set to read/write in the WhatsApp tab
3. Required API keys are configured in the Secrets tab
