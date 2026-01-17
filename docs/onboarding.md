# Integration Onboarding Guide

This guide walks you through setting up WhatsApp, Slack, and Google integrations for Orient.

## Prerequisites

Before starting, make sure you have:

1. Orient running locally (`./run.sh dev`)
2. Access to the Dashboard at http://localhost:80

---

## WhatsApp Setup

Orient uses personal WhatsApp Web pairing, so you'll connect your existing WhatsApp account.

### Step 1: Create a Bot Group (Before Connecting)

Before pairing, create a dedicated WhatsApp group for the bot:

1. Open **WhatsApp** on your phone
2. Create a **new group** with only yourself
3. Name it something like **"Ori Bot"** or **"Orient Assistant"**
4. This group will be where you interact with the bot

> **Why a dedicated group?** Orient uses a permission system where the bot can only send messages to explicitly approved chats. Having a dedicated group keeps bot interactions organized and separate from your regular chats.

![WhatsApp Create Bot Group](./images/onboarding/whatsapp-create-group.png)

### Step 2: Open the Dashboard

Navigate to http://localhost:80 and locate the **Workspace Setup** panel.

![Dashboard WhatsApp Setup](./images/onboarding/whatsapp-dashboard-setup.png)

### Step 3: Choose Pairing Method

You have two options:

#### Option A: Pairing Code (Recommended)

1. Enter your phone number with country code (e.g., `+1 555 123 4567`)
2. Click **Get Pairing Code**
3. You'll receive an 8-character code (e.g., `ABCD-1234`)

![WhatsApp Pairing Code](./images/onboarding/whatsapp-pairing-code.png)

#### Option B: QR Code

1. Click **Show QR Code**
2. A QR code will be displayed on screen

![WhatsApp QR Code](./images/onboarding/whatsapp-qr-code.png)

### Step 4: Link Your Phone

On your phone:

1. Open **WhatsApp**
2. Go to **Settings** → **Linked Devices**
3. Tap **Link a Device**
4. Choose your method:
   - **Pairing Code**: Tap **Link with phone number instead** and enter the code
   - **QR Code**: Scan the QR code displayed on the dashboard

![WhatsApp Phone Linking](./images/onboarding/whatsapp-phone-link.png)

### Step 5: Verify Connection

Once linked, the dashboard will show **Connected** status.

![WhatsApp Connected](./images/onboarding/whatsapp-connected.png)

### Step 6: Activate the Bot Group

Now you need to give the bot write permission to your group:

1. **Send a message** to your "Ori Bot" group
   - This registers the group in Orient's system
2. Open the **Dashboard** → **Chats** tab
3. Find your bot group in the list
4. Change the permission from **Read Only** to **Read & Write**
5. **Send another message** to the group

The bot is now live and will respond to your messages!

![WhatsApp Approve Permissions](./images/onboarding/whatsapp-approve-permissions.png)

> **Permission Levels:**
>
> - **Ignored**: Messages are not stored or processed
> - **Read Only**: Messages are stored but bot doesn't respond
> - **Read & Write**: Bot will respond to messages in this chat

---

## Slack Setup

Slack requires creating a Slack App in your own workspace.

### Step 1: Create a Slack App from Manifest

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

![Slack Create from Manifest](./images/onboarding/slack-create-manifest.png)

### Step 2: Generate App-Level Token

After creating the app:

1. You'll be on the **Basic Information** page
2. Scroll down to **App-Level Tokens**
3. Click **Generate Token and Scopes**
4. Name it `socket-token` and add the `connections:write` scope
5. Click **Generate**
6. **Copy the token** (starts with `xapp-`) – this is your `SLACK_APP_TOKEN`

![Slack App Token](./images/onboarding/slack-app-token.png)

### Step 3: Install to Workspace

1. In the left sidebar, go to **OAuth & Permissions**
2. Click **Install to Workspace**
3. Review the permissions and click **Allow**
4. **Copy the Bot User OAuth Token** (starts with `xoxb-`) – this is your `SLACK_BOT_TOKEN`

![Slack Install App](./images/onboarding/slack-install-app.png)

### Step 4: Get Signing Secret

1. Go to **Basic Information** in the sidebar
2. Under **App Credentials**, find **Signing Secret**
3. Click **Show** and copy it – this is your `SLACK_SIGNING_SECRET`

![Slack Signing Secret](./images/onboarding/slack-signing-secret.png)

### Step 5: Configure Orient

You now have 3 tokens to configure:

| Token                  | Prefix  | Where to find it                           |
| ---------------------- | ------- | ------------------------------------------ |
| `SLACK_BOT_TOKEN`      | `xoxb-` | OAuth & Permissions → Bot User OAuth Token |
| `SLACK_SIGNING_SECRET` | (none)  | Basic Information → App Credentials        |
| `SLACK_APP_TOKEN`      | `xapp-` | Basic Information → App-Level Tokens       |

**Option A: Dashboard (Recommended)**

In the Dashboard, go to the Slack setup section and enter all three values, then click **Save Slack Configuration**.

![Slack Dashboard Config](./images/onboarding/slack-dashboard-config.png)

**Option B: Environment File**

Add to your `.env` file:

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here
SLACK_APP_TOKEN=xapp-your-app-token-here
```

### Step 6: Restart and Verify

Restart Orient to pick up the new configuration:

```bash
./run.sh dev stop
./run.sh dev
```

The Slack bot should now be online in your workspace! Mention it with `@Orient` in any channel to start chatting.

> **📚 Detailed Documentation:** For more advanced configuration options, see the [Slack Integration Guide](integrations/slack.md).

---

## Google Workspace Setup

Google integration enables Calendar, Gmail, Tasks, and more.

### Step 1: Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown at the top and select **New Project**
3. Enter a project name (e.g., "Orient Integration")
4. Click **Create**

![Google Cloud New Project](./images/onboarding/google-new-project.png)

### Step 2: Enable APIs

1. Go to **APIs & Services** → **Library**
2. Search for and enable each of these APIs:
   - **Gmail API**
   - **Google Calendar API**
   - **Google Tasks API**
   - **Google Sheets API** (optional)
   - **Google Slides API** (optional)

![Google Enable APIs](./images/onboarding/google-enable-apis.png)

### Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** (or Internal if using Workspace)
3. Fill in the required fields:
   - **App name**: Orient
   - **User support email**: your email
   - **Developer contact**: your email
4. Click **Save and Continue**
5. On the **Scopes** screen, click **Add or Remove Scopes** and add:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/tasks`
6. Click **Save and Continue** through the remaining steps

![Google OAuth Consent](./images/onboarding/google-oauth-consent.png)

### Step 4: Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Choose **Web application**
4. Set the name (e.g., "Orient Dashboard")
5. Under **Authorized redirect URIs**, add:
   - `http://localhost:8766/oauth/callback` (for local development)
6. Click **Create**
7. **Copy the Client ID and Client Secret**

![Google OAuth Credentials](./images/onboarding/google-oauth-credentials.png)

### Step 5: Configure Orient

In your `.env` file or via the Dashboard Secrets panel:

```bash
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
```

### Step 6: Connect Your Account

1. Go to the Dashboard → **Integrations** tab
2. Find **Google** in the catalog
3. Click **Connect**
4. A popup will open for Google OAuth
5. Sign in with your Google account and grant permissions

![Google Connect Integration](./images/onboarding/google-connect.png)

Once connected, Orient can access your Calendar, Gmail, and Tasks!

---

## Troubleshooting

### WhatsApp Issues

| Problem              | Solution                                                                |
| -------------------- | ----------------------------------------------------------------------- |
| QR code not loading  | Restart the WhatsApp bot: `./run.sh dev stop && ./run.sh dev`           |
| Pairing code expired | Request a new code (they expire in ~60 seconds)                         |
| Connection lost      | Re-pair using the same process                                          |
| Bot not responding   | Make sure the chat has **Read & Write** permission in Dashboard → Chats |
| Group not appearing  | Send a message to the group first, then refresh the Chats tab           |

### Slack Issues

| Problem                  | Solution                                                       |
| ------------------------ | -------------------------------------------------------------- |
| Bot not responding       | Check that Socket Mode is enabled and all 3 tokens are correct |
| "Invalid token" error    | Verify token prefixes: `xoxb-` (bot), `xapp-` (app)            |
| Missing permissions      | Reinstall the app to your workspace after adding scopes        |
| Can't see bot in channel | Invite the bot to the channel with `/invite @Orient`           |

### Google Issues

| Problem               | Solution                                                            |
| --------------------- | ------------------------------------------------------------------- |
| OAuth popup blocked   | Allow popups for localhost in your browser                          |
| "Access denied"       | Add your email as a test user in OAuth consent screen               |
| Redirect URI mismatch | Ensure `http://localhost:8766/oauth/callback` is in authorized URIs |

---

## Next Steps

Once your integrations are connected:

- **WhatsApp**: Send messages to your "Ori Bot" group to interact with the assistant
- **Slack**: Mention the bot (`@Orient`) in any channel or send a direct message
- **Google**: Use calendar, email, and task tools through the AI assistant

See [Skills](skills.md) to explore what capabilities are available with your new integrations.

---

## Quick Reference: Required Tokens

| Integration  | Required Tokens                                              |
| ------------ | ------------------------------------------------------------ |
| **WhatsApp** | None (uses QR/pairing code)                                  |
| **Slack**    | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN` |
| **Google**   | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`       |
