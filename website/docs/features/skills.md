---
sidebar_position: 5
---

# Skills & Plugins

Skills extend what Orient can do. They are modular capabilities that agents can use to perform specific tasks.

## What Are Skills?

A skill is a packaged set of instructions and tool configurations that teaches Orient how to handle a specific type of task. Think of skills as expertise areas:

- **Scheduling skill** — knows how to parse dates, check calendars, create events
- **Jira skill** — knows how to query tickets, update status, create issues
- **Mini-app skill** — knows how to generate and deploy lightweight web apps
- **Git skill** — knows how to summarize commits, create branches, review PRs

## Built-in Skills

Orient ships with several built-in skills:

| Skill          | Description                                                          |
| -------------- | -------------------------------------------------------------------- |
| **Scheduling** | Create and manage scheduled messages, reminders, and recurring tasks |
| **Mini-Apps**  | Generate custom web applications from natural language descriptions  |
| **Calendar**   | Read and manage Google Calendar events                               |
| **Jira**       | Query and update Jira tickets and sprints                            |
| **Email**      | Draft and send emails via Gmail                                      |
| **Documents**  | Create and edit Google Docs                                          |
| **Webhooks**   | Configure incoming webhook integrations                              |

## Creating Custom Skills

Custom skills are defined as part of agent configurations. To create a skill:

### 1. Define the Skill

Skills are configured through the Agent Registry in the dashboard. Each skill consists of:

- **Name** — identifier for the skill
- **Description** — what the skill does (used by the agent to decide when to use it)
- **System prompt additions** — instructions appended to the agent's prompt when the skill is active
- **Required tools** — which MCP tools the skill needs access to

### 2. Assign to an Agent

Navigate to **Dashboard → Agent Registry** and edit an agent's configuration to include your custom skill.

### 3. Configure Tool Access

Ensure the agent has access to any tools your skill requires. Tool permissions are managed at the agent level.

## Community Skills

Orient is designed to be extended by the community. Community skills can be shared as:

- Agent configuration exports
- MCP server packages
- Documentation and prompt templates

Visit the [GitHub repository](https://github.com/orient/orient) to browse and contribute skills.

## Skill Configuration

Skills can be configured per-agent and per-platform:

```
Agent: "Work Assistant"
├── Skills: scheduling, jira, calendar
├── Platform: Slack
└── Tools: schedule_*, jira_*, calendar_*

Agent: "Personal Assistant"
├── Skills: scheduling, mini-apps
├── Platform: WhatsApp
└── Tools: schedule_*, mini_app_*
```

This allows you to have different skill sets for different contexts — your work Slack agent knows about Jira, while your personal WhatsApp agent focuses on scheduling and quick apps.

## Extending with MCP Servers

Skills can leverage external MCP (Model Context Protocol) servers. This means you can:

1. Write a custom MCP server that exposes new tools
2. Connect it to Orient through the Integrations dashboard
3. Create a skill that uses those tools

See the [Integrations guide](/docs/features/integrations) for connecting MCP servers.
