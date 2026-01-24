---
sidebar_position: 1
---

# Connect via WhatsApp

<div style={{ textAlign: 'center', marginBottom: '2rem' }}>
  <img src="/img/mascot/ori-attentive.png" alt="Ori ready to help" width="180" />
</div>

Get started with Orient on WhatsApp in just a few minutes.

## Prerequisites

- A smartphone with WhatsApp installed
- Access to the Orient dashboard

---

## Step 1: Create a Bot Group

Before pairing, create a dedicated WhatsApp group for the bot. This needs to be a **single-person group** (just you):

1. Open **WhatsApp** on your phone
2. Tap **New Group**
3. Add any contact temporarily (you'll remove them in step 5)
4. Name the group **"Orient"** or **"Ori Bot"** and create it
5. Open the group info and **remove the other person** — you should be the only member
6. This private group will be where you interact with the bot

:::info Why a single-person group?
Orient uses a permission system where the bot only responds in explicitly approved chats. By creating a single-person group, you ensure the bot only responds to you. If you enable write access on a multi-member group, the bot will respond to everyone — which may not be what you want.
:::

## Step 2: Open the Dashboard

Navigate to your Orient dashboard and locate the **Workspace Setup** panel.

<div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
  <img
    src="/img/screenshots/getting-started/whatsapp-dashboard-setup.png"
    alt="WhatsApp Dashboard Setup"
    style={{ maxWidth: '100%', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
  />
</div>

## Step 3: Choose Pairing Method

You have two options:

### Option A: Pairing Code (Recommended)

1. Select your **country code** from the dropdown (e.g., 🇺🇸 +1, 🇮🇱 +972)
2. Enter your **phone number** without the country code
3. Click **Get Pairing Code**
4. You'll receive an 8-character code (e.g., `ABCD-1234`)

<div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
  <img
    src="/img/screenshots/getting-started/whatsapp-pairing-code.png"
    alt="WhatsApp Pairing Code"
    style={{ maxWidth: '100%', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
  />
</div>

### Option B: QR Code

1. Click **Show QR Code**
2. A QR code will be displayed on screen

<div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
  <img
    src="/img/screenshots/getting-started/whatsapp-qr-code.png"
    alt="WhatsApp QR Code"
    style={{ maxWidth: '100%', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
  />
</div>

:::tip
The QR code refreshes every 60 seconds. If it expires, simply click to refresh it.
:::

## Step 4: Link Your Phone

On your phone:

1. Open **WhatsApp**
2. Go to **Settings**, then **Linked Devices**
3. Tap **Link a Device**
4. Choose your method:
   - **Pairing Code**: Tap **Link with phone number instead** and enter the code
   - **QR Code**: Scan the QR code displayed on the dashboard

## Step 5: Wait for Sync

After scanning the QR code or entering the pairing code:

1. **Syncing**: You'll see a "Syncing WhatsApp Data" message with a progress indicator
2. **Keep the page open** and don't close WhatsApp on your phone until sync completes
3. For accounts with many chats, this may take a moment

## Step 6: Verify Connection

Once sync completes, the dashboard will show **Connected** status. Your phone number will be automatically detected and saved.

## Step 7: Activate the Bot Group

Now you need to give the bot write permission to your group:

1. **Send a message** to your "Ori Bot" group. This registers the group in Orient's system
2. Open the **Dashboard**, then go to the **Chats** tab
3. Find your bot group in the list
4. Change the permission from **Read Only** to **Read and Write**
5. **Send another message** to the group

The bot is now live and will respond to your messages!

<div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
  <img
    src="/img/screenshots/getting-started/whatsapp-chats-permissions.png"
    alt="WhatsApp Chat Permissions"
    style={{ maxWidth: '100%', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
  />
</div>

:::tip Permission Levels

- **Ignored**: Messages are not stored or processed
- **Read Only**: Messages are stored but bot does not respond
- **Read and Write**: Bot will respond to messages in this chat
  :::

:::warning Multi-Member Group Warning
If you try to enable **Read and Write** on a group with multiple members, you'll see a warning dialog. Orient will respond to **anyone** who sends a message to that group — not just you. For private bot conversations, use a single-person group.
:::

---

## Using Orient on WhatsApp

### Starting a Conversation

Simply send a message to your bot group:

```
Hi! What can you help me with?
```

The AI Assistant will respond with information about its capabilities.

### Features Available

- **Natural language chat** - Ask questions, get help with tasks
- **Scheduled messages** - Set up reminders and notifications
- **JIRA integration** - Query tickets, check blockers
- **Mini-apps** - Create and share interactive apps
- **Calendar access** - Check your schedule (with Google integration)

---

## Troubleshooting

| Problem              | Solution                                                                     |
| -------------------- | ---------------------------------------------------------------------------- |
| QR code not loading  | Restart Orient: `./run.sh dev stop` then `./run.sh dev`                      |
| Pairing code expired | Request a new code (they expire in about 60 seconds)                         |
| Connection drops     | Re-scan the QR code to reconnect                                             |
| Bot not responding   | Make sure the chat has **Read and Write** permission in Dashboard, Chats tab |
| Group not appearing  | Send a message to the group first, then refresh the Chats tab                |

## Next Steps

- Learn about [chatting with the AI](../features/chatting)
- Set up [scheduled messages](../features/scheduling)
- Explore [mini-apps](../features/mini-apps)
- Configure [webhooks](./webhooks) for notifications
