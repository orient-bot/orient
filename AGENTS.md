# AGENTS

This project uses **dynamic agent configuration** via the Agent Registry.

<skills_system priority="1">

## Discovering Your Capabilities

At session start, discover your assigned role and capabilities:

1. Call `ai_first_get_agent_context` to see your agent role, skills, and tool permissions
2. Call `discover_tools` to find all available MCP tools

Your capabilities vary based on:

- **Platform**: WhatsApp, Slack, OpenCode, Cursor
- **Environment**: local, prod
- **Context**: specific chat or channel overrides

## Available Skills

Skills are stored in `.claude/skills/` (the single source of truth) and loaded dynamically from the Agent Registry. The `ai_first_get_agent_context` tool returns your enabled skills.

**Skills location:** `.claude/skills/<skill-name>/SKILL.md`

To invoke a skill: `Bash("openskills read <skill-name>")`

## MCP Tools

Use `discover_tools` with mode "list_categories" to see available tool domains.

</skills_system>

## Agent Registry

Agent configurations are stored in the database and managed via the dashboard:

- **Agents Tab**: Create, edit, enable/disable agents
- **Skills**: Assign skills to each agent
- **Tools**: Configure allow/deny patterns for MCP tools
- **Context Rules**: Set default agents per platform, environment overrides

### Tool Permissions

Agents can define tool pattern lists with three levels:

- **allow**: tools the agent can use freely
- **ask**: tools that require explicit user confirmation before use
- **deny**: tools the agent must not use

### Agent Mentions

When chatting via Slack or WhatsApp, you can override the default agent by prefixing
your message with `@agent-id` (for example, `@explorer find the auth config`).

### CLI Commands

```bash
# Sync agent config to filesystem (for OpenCode)
npm run agents:sync

# Seed default agents
npm run agents:seed

# Force re-seed (overwrites existing)
npm run agents:seed:force

# Run database migration
npm run db:migrate
```

### Default Agents

| Agent        | Mode        | Description                                                      |
| ------------ | ----------- | ---------------------------------------------------------------- |
| pm-assistant | primary     | JIRA, meetings, workflows, project management                    |
| communicator | specialized | Slack/WhatsApp messaging with proper formatting                  |
| scheduler    | specialized | Calendar management, reminders, time-based tasks                 |
| explorer     | specialized | Fast codebase exploration, documentation lookup                  |
| app-builder  | specialized | Create Mini-Apps (forms, schedulers, dashboards) via PR workflow |

### Mini-Apps Architecture

When asked to create an app, form, scheduler, or dashboard, use the **app-builder** agent or the mini-apps tools directly. **NEVER** write React code directly to the project.

**Available tools:**

- `ai_first_create_app` - Generate a new app from a prompt
- `ai_first_list_apps` - List existing apps
- `ai_first_get_app` - Get app details
- `ai_first_update_app` - Update an existing app
- `ai_first_share_app` - Generate a shareable link

See the `mini-apps` skill for detailed usage instructions.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Dashboard UI                          │
│               (Agents Tab - CRUD operations)                │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    Agent Registry                           │
│         (packages/agents/src/registry/)                     │
│  - Context resolution (platform, chat, environment)        │
│  - Skills/tools assignment                                  │
│  - Filesystem sync for OpenCode                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                      PostgreSQL                             │
│   agents | agent_skills | agent_tools | context_rules       │
└─────────────────────────────────────────────────────────────┘
```

### Monorepo Package Structure

```
packages/
├── core/              # @orientbot/core - Config, logger, types, utils
├── database/          # @orientbot/database - Drizzle ORM schema
├── database-services/ # @orientbot/database-services - DB service implementations
├── integrations/      # @orientbot/integrations - JIRA, Google services
├── agents/            # @orientbot/agents - Agent services and registry
├── apps/              # @orientbot/apps - Mini-apps system
├── mcp-tools/         # @orientbot/mcp-tools - MCP tool implementations
├── mcp-servers/       # @orientbot/mcp-servers - MCP server implementations
├── bot-slack/         # @orientbot/bot-slack - Slack bot
├── bot-whatsapp/      # @orientbot/bot-whatsapp - WhatsApp bot
├── dashboard/         # @orientbot/dashboard - Dashboard server + frontend
├── api-gateway/       # @orientbot/api-gateway - API gateway
└── test-utils/        # @orientbot/test-utils - Test helpers
```
