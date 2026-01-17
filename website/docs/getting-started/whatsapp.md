---
sidebar_position: 1
---

# Connect via WhatsApp

<div style={{textAlign: 'center', marginBottom: '2rem'}}>
  <img src="/img/mascot/ori-attentive.png" alt="Ori ready to help" width="180" />
</div>

Get started with Orient on WhatsApp in just a few minutes.

## Prerequisites

- A smartphone with WhatsApp installed
- Access to the Orient dashboard

---

## Step 1: Create a Bot Group

Before pairing, create a dedicated WhatsApp group for the bot:

1. Open **WhatsApp** on your phone
2. Create a **new group** with only yourself
3. Name it something like **"Ori Bot"** or **"Orient Assistant"**
4. This group will be where you interact with the bot

:::info Why a dedicated group?
Orient uses a permission system where the bot can only send messages to explicitly approved chats. Having a dedicated group keeps bot interactions organized and separate from your regular chats.
:::

## Step 2: Open the Dashboard

Navigate to your Orient dashboard and locate the **Workspace Setup** panel.

{/_ TODO: Add screenshot - Dashboard WhatsApp Setup _/}

## Step 3: Choose Pairing Method

You have two options:

### Option A: Pairing Code (Recommended)

1. Enter your phone number with country code (e.g., `+1 555 123 4567`)
2. Click **Get Pairing Code**
3. You'll receive an 8-character code (e.g., `ABCD-1234`)

{/_ TODO: Add screenshot - WhatsApp Pairing Code _/}

### Option B: QR Code

1. Click **Show QR Code**
2. A QR code will be displayed on screen

{/_ TODO: Add screenshot - WhatsApp QR Code _/}

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

## Step 5: Verify Connection

Once linked, the dashboard will show **Connected** status.

{/_ TODO: Add screenshot - WhatsApp Connected _/}

## Step 6: Activate the Bot Group

Now you need to give the bot write permission to your group:

1. **Send a message** to your "Ori Bot" group. This registers the group in Orient's system
2. Open the **Dashboard**, then go to the **Chats** tab
3. Find your bot group in the list
4. Change the permission from **Read Only** to **Read and Write**
5. **Send another message** to the group

The bot is now live and will respond to your messages!

{/_ TODO: Add screenshot - WhatsApp Approve Permissions _/}

:::tip Permission Levels

- **Ignored**: Messages are not stored or processed
- **Read Only**: Messages are stored but bot does not respond
- **Read and Write**: Bot will respond to messages in this chat
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
