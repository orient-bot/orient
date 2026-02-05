---
sidebar_position: 1
---

# Welcome to Orient

<div style={{ textAlign: 'center', marginBottom: '2rem' }}>
  <img src="/img/mascot/ori-waving.png" alt="Ori - Your AI Assistant" width="200" />
</div>

Your private AI assistant that actually does things — schedule meetings, manage tickets, build mini-apps, draft documents — all through natural conversation. Self-hosted, open-source, fully yours.

## Why Orient?

|                      |                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Privacy-first**    | Runs on your machine. Zero telemetry, zero tracking. Your data never leaves your infrastructure.                                |
| **Actually useful**  | Not just a chatbot — Orient takes action. It schedules meetings, updates Jira tickets, creates mini-apps, and drafts documents. |
| **Works everywhere** | Same assistant across WhatsApp, Slack, your IDE, and the command line. Your context follows you.                                |

## Quick Start

Get Orient running with one command:

```bash
curl -fsSL https://orient.bot/install.sh | bash
```

Then start Orient:

```bash
orient start
```

Open the dashboard at `http://localhost:4098` and scan the QR code to connect WhatsApp.

Then connect your preferred platform:

- **[WhatsApp](./getting-started/whatsapp)** — Scan a QR code and start chatting
- **[Slack](./getting-started/slack)** — Add to your workspace in minutes
- **[Google](./getting-started/google)** — Connect Calendar, Gmail, and Docs

## What Can Orient Do?

- **Chat naturally** — ask questions, get summaries, brainstorm ideas ([learn more](./features/chatting))
- **Schedule messages & reminders** — one-time, recurring, or cron-based ([learn more](./features/scheduling))
- **Build mini-apps** — forms, dashboards, schedulers — generated on demand ([learn more](./features/mini-apps))
- **Manage integrations** — Jira, Google Workspace, GitHub, and custom MCP servers ([learn more](./features/integrations))
- **Configure agents** — specialized assistants with custom prompts and permissions ([learn more](./features/agents))
- **Extend with skills** — add new capabilities or create your own ([learn more](./features/skills))

## Dashboard Preview

<div style={{ textAlign: 'center', marginBottom: '2rem' }}>
  <img
    src="/img/screenshots/dashboard-main.png"
    alt="Orient Dashboard"
    style={{ maxWidth: '100%', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
  />
</div>

## Self-Hosting

Orient is open-source (MIT licensed) and designed to be self-hosted. No cloud dependency, no accounts to create. See our [Architecture Overview](./features/architecture) for how it works under the hood, and our [Security Model](./features/security) for how your data is protected.

## Need Help?

- [Tips & Tricks](./help/tips) — get the most out of Orient
- [FAQ](./help/faq) — common questions answered
- [Troubleshooting](./help/troubleshooting) — fix common issues
- [GitHub](https://github.com/orient-bot/orient) — report bugs, request features, contribute
