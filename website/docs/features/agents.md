---
sidebar_position: 6
---

# Agent Configuration

Orient uses an agent registry system that lets you create and manage specialized AI agents, each with their own personality, skills, and tool permissions.

## Agent Registry

The Agent Registry is accessible from the dashboard at **Settings → Agent Registry**. Each agent is a configuration that defines:

- **Name** — display name for the agent
- **System prompt** — instructions that shape the agent's behavior
- **Platform** — which platform(s) this agent serves (WhatsApp, Slack, all)
- **Tools** — which tools and integrations the agent can access
- **Model** — which LLM to use (if you have multiple configured)

## Default Agents

Orient ships with default agents for each platform:

- **WhatsApp Agent** — optimized for mobile messaging, concise responses
- **Slack Agent** — formatted for Slack markdown, channel-aware
- **CLI Agent** — developer-focused, verbose output

## Creating a Custom Agent

1. Navigate to **Dashboard → Agent Registry**
2. Click **Add Agent**
3. Configure the agent:

### System Prompt

The system prompt defines how the agent behaves. Example:

```
You are a project management assistant. You help the team track sprint progress,
update Jira tickets, and summarize daily standups.

When asked about sprint status, always check Jira first.
When asked to update a ticket, confirm the changes before applying.
Keep responses concise and use bullet points.
```

### Tool Permissions

Select which tools the agent can access:

- **Scheduling tools** — create/manage scheduled messages
- **Calendar tools** — read/write Google Calendar
- **Jira tools** — query/update Jira tickets
- **Mini-app tools** — create mini applications
- **File tools** — read/write files
- **Webhook tools** — manage webhooks

### Platform Assignment

Assign the agent to specific platforms. An agent assigned to "WhatsApp" will handle all WhatsApp conversations. You can also set different agents for different Slack channels.

## Agent Behavior

### Context Awareness

Agents maintain context across conversations. They remember:

- Previous messages in the current conversation
- User preferences (configured through the system prompt)
- Integration state (connected services, recent actions)

### Proactive Actions

Agents can be configured to take proactive actions:

- Send morning briefings
- Alert on schedule conflicts
- Remind about upcoming deadlines
- Summarize daily activity

Configure proactive behaviors through scheduled messages tied to the agent.

### Multi-Agent Setup

You can run multiple agents simultaneously:

```
WhatsApp → "Personal Assistant" (scheduling, reminders)
Slack #general → "Team Bot" (announcements, questions)
Slack #engineering → "Dev Assistant" (Jira, Git, deploys)
CLI → "Power User" (all tools, verbose mode)
```

## Agent Customization Tips

1. **Be specific in system prompts** — vague instructions lead to inconsistent behavior
2. **Limit tool access** — only give agents the tools they need
3. **Test on CLI first** — the CLI agent is the easiest to iterate on
4. **Use platform-specific formatting** — WhatsApp and Slack have different formatting capabilities
5. **Set boundaries** — tell the agent what it should NOT do as well as what it should do
