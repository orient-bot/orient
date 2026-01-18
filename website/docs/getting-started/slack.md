---
sidebar_position: 2
---

# Connect via Slack

<div style={{textAlign: 'center', marginBottom: '2rem'}}>
  <img src="/img/mascot/ori-happy.png" alt="Ori happy" width="180" />
</div>

Add Orient to your Slack workspace for team-wide AI capabilities.

## Prerequisites

- Admin access to your Slack workspace (or permission to add apps)
- Access to the Orient dashboard

---

## Step 1: Create a Slack App from Manifest

The fastest way to set up Slack is using our pre-configured app manifest:

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App**
3. Choose **From an app manifest**
4. Select your workspace and click **Next**
5. Choose **YAML** format and paste the following manifest:

```yaml
display_information:
  name: Orient Bot
  description: AI assistant for your workspace
  background_color: '#7C3AED'

features:
  bot_user:
    display_name: Orient
    always_online: true
  app_home:
    home_tab_enabled: false
    messages_tab_enabled: true
    messages_tab_read_only_enabled: false

oauth_config:
  scopes:
    bot:
      - app_mentions:read
      - channels:history
      - channels:read
      - chat:write
      - groups:history
      - groups:read
      - im:history
      - im:read
      - im:write
      - users:read

settings:
  event_subscriptions:
    bot_events:
      - app_mention
      - message.channels
      - message.groups
      - message.im
  interactivity:
    is_enabled: false
  org_deploy_enabled: false
  socket_mode_enabled: true
  token_rotation_enabled: false
```

6. Click **Next**, review the permissions, and click **Create**

{/* TODO: Add screenshot - Slack Create from Manifest */}

## Step 2: Generate App-Level Token

After creating the app:

1. You'll be on the **Basic Information** page
2. Scroll down to **App-Level Tokens**
3. Click **Generate Token and Scopes**
4. Name it `socket-token` and add the `connections:write` scope
5. Click **Generate**
6. **Copy the token** (starts with `xapp-`) — this is your `SLACK_APP_TOKEN`

{/* TODO: Add screenshot - Slack App Token */}

## Step 3: Install to Workspace

1. In the left sidebar, go to **OAuth & Permissions**
2. Click **Install to Workspace**
3. Review the permissions and click **Allow**
4. **Copy the Bot User OAuth Token** (starts with `xoxb-`) — this is your `SLACK_BOT_TOKEN`

{/* TODO: Add screenshot - Slack Install App */}

## Step 4: Get Signing Secret

1. Go to **Basic Information** in the sidebar
2. Under **App Credentials**, find **Signing Secret**
3. Click **Show** and copy it — this is your `SLACK_SIGNING_SECRET`

{/* TODO: Add screenshot - Slack Signing Secret */}

## Step 5: Configure Orient

You now have 3 tokens to configure:

| Token                  | Prefix  | Where to find it                           |
| ---------------------- | ------- | ------------------------------------------ |
| `SLACK_BOT_TOKEN`      | `xoxb-` | OAuth & Permissions → Bot User OAuth Token |
| `SLACK_SIGNING_SECRET` | (none)  | Basic Information → App Credentials        |
| `SLACK_APP_TOKEN`      | `xapp-` | Basic Information → App-Level Tokens       |

### Option A: Dashboard (Recommended)

In the Dashboard, go to the Slack setup section and enter all three values, then click **Save Slack Configuration**.

{/* TODO: Add screenshot - Slack Dashboard Config */}

### Option B: Secrets Panel

1. Go to **Dashboard** → **Secrets** tab
2. Add each secret with the appropriate key name
3. The values are encrypted and stored securely

### Option C: Environment File

Add to your `.env` file:

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here
SLACK_APP_TOKEN=xapp-your-app-token-here
```

## Step 6: Restart and Verify

Restart Orient to pick up the new configuration:

```bash
./run.sh dev stop
./run.sh dev
```

The Slack bot should now be online in your workspace!

---

## Using Orient in Slack

### Direct Messages

Send a direct message to the Orient bot for private conversations:

1. Click on **Direct Messages** in Slack
2. Find **Orient** in your contacts
3. Start chatting!

### In Channels

When the bot is in a channel, mention it to get its attention:

```
@Orient what's the status of our sprint?
```

### Invite to Channels

To invite the bot to a channel:

```
/invite @Orient
```

### Slash Commands

Some features are available via slash commands:

| Command      | Description             |
| ------------ | ----------------------- |
| `/ai help`   | Show available commands |
| `/ai status` | Check bot status        |

---

## Features Available in Slack

- **Natural language chat** - Ask questions, get help
- **Scheduled messages** - Set up reminders and notifications
- **JIRA integration** - Query tickets, check blockers
- **Mini-apps** - Create and share interactive apps

:::info Formatting
Slack uses a different markdown format than standard. Orient automatically formats messages correctly for Slack.
:::

---

## Troubleshooting

| Problem                  | Solution                                                       |
| ------------------------ | -------------------------------------------------------------- |
| Bot not responding       | Check that Socket Mode is enabled and all 3 tokens are correct |
| "Invalid token" error    | Verify token prefixes: `xoxb-` (bot), `xapp-` (app)            |
| Missing permissions      | Reinstall the app to your workspace after adding scopes        |
| Can't see bot in channel | Invite the bot with `/invite @Orient`                          |

## Next Steps

- Learn about [chatting with the AI](../features/chatting)
- Set up [scheduled messages](../features/scheduling)
- Explore [mini-apps](../features/mini-apps)
- Configure [webhooks](./webhooks) for notifications
- Manage [secrets](./secrets) for API keys
