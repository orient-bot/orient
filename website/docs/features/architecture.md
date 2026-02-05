---
sidebar_position: 7
---

# Architecture Overview

Orient is a self-hosted AI agent platform. Everything runs on your infrastructure — no cloud dependency, no data leaving your control.

## System Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Your Machine                       │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  WhatsApp    │  │    Slack     │  │    CLI      │ │
│  │  Connector   │  │  Connector   │  │  Interface  │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘ │
│         │                 │                 │        │
│         └────────┬────────┴────────┬────────┘        │
│                  │                 │                  │
│           ┌──────▼───────┐  ┌─────▼──────┐          │
│           │  Message      │  │  Agent     │          │
│           │  Router       │  │  Engine    │          │
│           └──────┬───────┘  └─────┬──────┘          │
│                  │                │                   │
│           ┌──────▼────────────────▼──────┐           │
│           │        Tool Executor         │           │
│           │  (MCP Servers, Integrations) │           │
│           └──────────────┬───────────────┘           │
│                          │                           │
│           ┌──────────────▼───────────────┐           │
│           │     SQLite Database          │           │
│           │  (messages, config, state)   │           │
│           └──────────────────────────────┘           │
└──────────────────────────────────────────────────────┘
```

## Data Flow

1. **Message arrives** — from WhatsApp, Slack, CLI, or any connected platform
2. **Router dispatches** — identifies the user, platform, and conversation context
3. **Agent processes** — the configured agent picks up the message, loads relevant context (memory, integrations, previous conversations)
4. **Tools execute** — the agent calls tools as needed (calendar, Jira, file operations, MCP servers)
5. **Response sent** — the result flows back to the originating platform

## Key Components

### Message Connectors

Each platform has a dedicated connector that handles authentication, message format conversion, and delivery. Connectors are stateless — all state lives in the database.

- **WhatsApp** — uses the WhatsApp Web multi-device protocol
- **Slack** — uses the Slack Bolt framework with Socket Mode
- **CLI** — direct terminal interface for development and power users
- **MCP** — Model Context Protocol for IDE integration

### Agent Engine

The agent engine manages conversation flow, context windows, and tool calling. Each agent can be configured independently with:

- Custom system prompts
- Specific tool permissions
- Platform-specific behaviors
- Memory and context settings

### Tool Executor

Tools are organized as MCP (Model Context Protocol) servers. This means Orient's tools are compatible with any MCP client, and you can connect external MCP servers to extend functionality.

Built-in tool categories:

- **Scheduling** — create, update, delete scheduled messages and reminders
- **Calendar** — Google Calendar integration for events and availability
- **Jira** — ticket management, sprint queries, updates
- **Mini-Apps** — generate and host lightweight web applications
- **File operations** — read, write, and manage files
- **Webhooks** — receive and process external events

### Database

Orient uses SQLite for all persistent storage:

- Conversation history
- Agent configuration
- Scheduled messages
- Integration credentials (encrypted)
- Feature flags
- Webhook configurations

SQLite was chosen for simplicity — no external database server needed. The entire database is a single file on your machine.

## Self-Hosted Deployment

Orient can be installed with a single command:

```bash
curl -fsSL https://orient.bot/install.sh | bash
orient start
```

This starts:

- **Orient server** — the main application
- **Dashboard** — web UI at `localhost:4098`

For Docker-based deployments, see the `docker/` directory in the [repository](https://github.com/orient-bot/orient).

No external services are required. All AI inference uses your configured LLM provider (OpenAI, Anthropic, etc.) with your own API keys.

## No Cloud Dependency

Orient has zero cloud dependencies:

- No telemetry or analytics
- No license server
- No remote configuration
- No automatic updates
- All data stays on your machine

The only external calls are to your configured LLM provider, and those are made directly from your infrastructure.
