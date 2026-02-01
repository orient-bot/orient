<p align="center">
  <img src="docs/images/ori.png" alt="Ori - the Orient mascot" width="180" />
</p>

<h1 align="center">Orient</h1>

<p align="center">
  <strong>Ask Ori. It acts.</strong><br/>
  An open-source AI agent that runs on your infrastructure and takes action for you.
</p>

<p align="center">
  <a href="https://github.com/orient/orient/releases"><img src="https://img.shields.io/github/v/release/orient/orient" alt="Release"></a>
  <a href="https://github.com/orient/orient/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://github.com/orient/orient"><img src="https://img.shields.io/github/stars/orient/orient?style=social" alt="GitHub Stars"></a>
  <a href="https://orient.bot"><img src="https://img.shields.io/badge/website-orient.bot-blue" alt="Website"></a>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-documentation">Documentation</a> •
  <a href="#-platforms">Platforms</a> •
  <a href="#-contributing">Contributing</a>
</p>

> **⚠️ Status: Beta (v0.1.x)** — This project is experimental and under active development. Expect breaking changes.

---

<p align="center">
  <img src="website/static/img/screenshots/dashboard-main.png" alt="Orient Dashboard" width="800" />
</p>

## ✨ Features

- **🤖 AI Agent** — Not just a chatbot. Ori understands context and takes action: scheduling meetings, updating Jira tickets, drafting docs.
- **📱 WhatsApp & Slack** — Chat naturally on your favorite messaging platforms with configurable permissions.
- **🔧 MCP Integration** — Access Orient's tools from your IDE via the Model Context Protocol.
- **📦 Mini-Apps Builder** — Create and host lightweight apps through conversation.
- **📅 Scheduler** — Set up recurring jobs and one-off tasks with natural language.
- **🔒 Self-Hosted** — Runs entirely on your infrastructure. Your data never leaves your control.

## 📋 Project Status

Orient is in **early beta** (v0.1.x). We're actively developing new features and improving stability, but you should expect:

- **Breaking changes** between minor versions
- **Rough edges** in documentation and setup
- **Evolving APIs** that may change without notice

This is a self-hosted project—you're responsible for your own deployment, security, and backups. We recommend starting with the demo mode to explore before committing to a production setup.

## 📖 How to Use This Project

**Local Development / Personal Use**
Clone the repo, configure your environment, and run it on your own machine or server. Great for trying things out or personal productivity.

**Production / Team Deployment**
We recommend forking the repository so you can customize configurations and maintain control over updates. Pull upstream changes when you're ready.

**Contributing Back**
Found a bug? Built something cool? PRs are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 🚀 Quick Start

### Demo Mode (Fastest)

```bash
# Clone the repository
git clone https://github.com/orient/orient.git
cd orient

# Start the demo
docker compose -f docker/docker-compose.demo.yml up -d
```

Open the QR UI at `http://localhost:4097/qr` and the dashboard at `http://localhost:4098`.

### Development Mode

```bash
# Check prerequisites and auto-fix issues
./run.sh doctor --fix

# Install dependencies and build packages
pnpm install
pnpm build:packages

# Start development (auto-creates .env from .env.example)
./run.sh dev
```

The development environment auto-configures on first run:

- `.env` is created from `.env.example` if missing
- Default credentials work with Docker infrastructure
- Setup wizard (at http://localhost:80) handles remaining configuration

Access points:

- **Dashboard**: http://localhost:80
- **WhatsApp QR**: http://localhost:80/qr/
- **OpenCode**: http://localhost:4099

### Production

```bash
cd docker
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

See [Production Deployment](docs/deployment/production.md) for details.

## 📖 Documentation

| Topic                                                  | Description                           |
| ------------------------------------------------------ | ------------------------------------- |
| [Getting Started (Demo)](docs/getting-started-demo.md) | Quick demo with Docker                |
| [Getting Started (Dev)](docs/getting-started.md)       | Full development setup                |
| [LLM Onboarding](.claude/README.LLM.md)                | Guide for AI agents setting up Orient |
| [Configuration](docs/configuration.md)                 | All configuration options             |
| [Skills](docs/skills.md)                               | Create custom skills                  |
| [Permissions](docs/permissions.md)                     | Chat permission system                |

### Integrations

| Integration      | Docs                                                                           |
| ---------------- | ------------------------------------------------------------------------------ |
| Slack            | [docs/integrations/slack.md](docs/integrations/slack.md)                       |
| WhatsApp         | [docs/integrations/whatsapp.md](docs/integrations/whatsapp.md)                 |
| Jira             | [docs/integrations/jira.md](docs/integrations/jira.md)                         |
| Google Workspace | [docs/integrations/google-workspace.md](docs/integrations/google-workspace.md) |

## 📱 Platforms

<table>
  <tr>
    <td align="center" width="25%">
      <strong>WhatsApp</strong><br/>
      Chat naturally from your phone
    </td>
    <td align="center" width="25%">
      <strong>Slack</strong><br/>
      Built into your team's workflow
    </td>
    <td align="center" width="25%">
      <strong>IDE / MCP</strong><br/>
      Access tools from your editor
    </td>
    <td align="center" width="25%">
      <strong>CLI</strong><br/>
      Terminal-native for power users
    </td>
  </tr>
</table>

## 🛠️ Available Commands

| Command                 | Description                       |
| ----------------------- | --------------------------------- |
| `./run.sh doctor`       | Check environment prerequisites   |
| `./run.sh doctor --fix` | Auto-fix issues where possible    |
| `./run.sh dev`          | Start development environment     |
| `./run.sh dev stop`     | Stop development services         |
| `./run.sh dev status`   | Show service status               |
| `./run.sh test`         | Run full Docker stack for testing |
| `./run.sh deploy`       | Deploy to production              |
| `./run.sh instances`    | List all running instances        |
| `./run.sh help`         | Show all available commands       |

## 💻 Command-Line Interface (CLI)

For power users who prefer terminal access, Orient includes a CLI for managing schedulers, webhooks, and agents.

### Installation

```bash
# Build the CLI
cd packages/cli
pnpm install
pnpm build

# Link globally (optional)
npm link
```

### Quick Examples

```bash
# List scheduled jobs
orient scheduler list

# Create a daily reminder
orient scheduler create \
  --name "daily-standup" \
  --type cron \
  --cron "0 9 * * 1-5" \
  --provider slack \
  --target "#standup" \
  --message "Daily standup in 10 minutes!"

# Manage webhooks
orient webhook list
orient webhook create --name "github-prs" --source github
```

See the full [CLI documentation](packages/cli/README.md) for all commands and options.

## 🔒 Privacy & Security

- **Open-source** — MIT licensed, audit the code yourself
- **Self-hosted** — Deploy on your own servers
- **No telemetry** — We don't phone home
- **Full control** — Configure exactly what Orient can access

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Run tests
pnpm test

# Run linting
pnpm lint
```

## ⚠️ Disclaimer

This software is provided "as is", without warranty of any kind. Use at your own risk. The authors are not responsible for any damages, data loss, or other issues arising from its use. By using Orient, you accept full responsibility for your deployment, security, and compliance with applicable laws.

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Built with ❤️ by the Orient community</strong><br/>
  <a href="https://orient.bot">orient.bot</a> •
  <a href="https://github.com/orient/orient">GitHub</a>
</p>
