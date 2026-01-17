---
sidebar_position: 4
---

# Webhooks

<div style={{textAlign: 'center', marginBottom: '2rem'}}>
  <img src="/img/mascot/ori-attentive.png" alt="Ori attentive" width="180" />
</div>

Configure webhooks to receive notifications from external services like GitHub, JIRA, and Google Calendar.

## What are Webhooks?

Webhooks allow external services to send real-time notifications to Orient. When something happens (like a new PR, a calendar event, or a JIRA ticket update), Orient receives the notification and can forward it to WhatsApp or Slack.

---

## Supported Sources

| Source              | Events                                  |
| ------------------- | --------------------------------------- |
| **GitHub**          | Pull requests, issues, pushes, releases |
| **JIRA**            | Issue created, updated, commented       |
| **Google Calendar** | Event reminders, new events             |
| **Custom**          | Any JSON payload                        |

---

## Creating a Webhook

### Step 1: Open the Dashboard

Navigate to **Dashboard**, then the **Webhooks** tab.

{/_ TODO: Add screenshot - Webhooks Dashboard _/}

### Step 2: Create New Webhook

1. Click **Create Webhook**
2. Fill in the configuration:

| Field            | Description                                     |
| ---------------- | ----------------------------------------------- |
| **Name**         | Unique identifier (e.g., `github-prs`)          |
| **Description**  | What this webhook does                          |
| **Source Type**  | GitHub, JIRA, Calendar, or Custom               |
| **Provider**     | Where to send notifications (WhatsApp or Slack) |
| **Target**       | Phone number/group or Slack channel             |
| **Event Filter** | Which events to listen for (optional)           |

{/_ TODO: Add screenshot - Create Webhook Form _/}

### Step 3: Copy the Webhook URL

After creating, you will receive a webhook URL like:

```
https://your-domain.com/api/webhooks/github-prs
```

And a secret token for verification.

---

## Configuring GitHub Webhooks

1. Go to your GitHub repository
2. Navigate to **Settings**, then **Webhooks**
3. Click **Add webhook**
4. Configure:
   - **Payload URL**: Your Orient webhook URL
   - **Content type**: `application/json`
   - **Secret**: The token from Orient
   - **Events**: Choose which events to send

{/_ TODO: Add screenshot - GitHub Webhook Config _/}

### Recommended GitHub Events

- `pull_request` - New PRs, reviews, merges
- `issues` - New issues, comments
- `push` - Code pushes (use sparingly)
- `release` - New releases

---

## Configuring JIRA Webhooks

1. Go to JIRA Settings
2. Navigate to **System**, then **Webhooks**
3. Click **Create a WebHook**
4. Configure:
   - **URL**: Your Orient webhook URL
   - **Events**: Issue created, updated, etc.

{/_ TODO: Add screenshot - JIRA Webhook Config _/}

---

## Message Templates

Customize how webhook notifications appear using Handlebars templates:

```handlebars
New PR:
{{pull_request.title}}
Author:
{{pull_request.user.login}}
URL:
{{pull_request.html_url}}
```

### Available Variables

Variables depend on the source. Common ones include:

**GitHub PR:**

- `{{pull_request.title}}`
- `{{pull_request.user.login}}`
- `{{pull_request.html_url}}`
- `{{action}}` (opened, closed, merged)

**JIRA Issue:**

- `{{issue.key}}`
- `{{issue.fields.summary}}`
- `{{issue.fields.assignee.displayName}}`

---

## Webhook Events

View recent webhook events in the Dashboard:

1. Go to **Webhooks** tab
2. Click on a webhook to see its event history
3. View payload, status, and any errors

{/_ TODO: Add screenshot - Webhook Events _/}

---

## Security

### Signature Verification

Orient verifies webhook signatures to ensure requests are authentic:

- **GitHub**: Uses `X-Hub-Signature-256` header with HMAC-SHA256
- **JIRA**: Uses custom header verification
- **Custom**: Configure your own signature header

### Best Practices

1. Always use HTTPS in production
2. Keep webhook tokens secret
3. Use event filters to reduce noise
4. Monitor webhook events for failures

---

## Troubleshooting

| Problem                       | Solution                                                 |
| ----------------------------- | -------------------------------------------------------- |
| Webhook not receiving events  | Check the URL is correct and publicly accessible         |
| Signature verification failed | Ensure the secret token matches                          |
| Events filtered out           | Check your event filter configuration                    |
| Messages not sending          | Verify the target WhatsApp/Slack channel has permissions |

## Next Steps

- Configure [secrets](./secrets) for API keys
- Set up [scheduled messages](../features/scheduling)
- Learn about [chatting with the AI](../features/chatting)
