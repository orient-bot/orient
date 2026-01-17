---
sidebar_position: 3
---

# Connect Google Workspace

<div style={{textAlign: 'center', marginBottom: '2rem'}}>
  <img src="/img/mascot/ori-attentive.png" alt="Ori attentive" width="180" />
</div>

Connect Google to enable Calendar, Gmail, Tasks, and more.

## Prerequisites

- A Google account
- Access to Google Cloud Console (for creating OAuth credentials)

---

## Step 1: Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown at the top and select **New Project**
3. Enter a project name (e.g., "Orient Integration")
4. Click **Create**

{/_ TODO: Add screenshot - Google Cloud New Project _/}

## Step 2: Enable APIs

1. Go to **APIs and Services**, then **Library**
2. Search for and enable each of these APIs:
   - **Gmail API**
   - **Google Calendar API**
   - **Google Tasks API**
   - **Google Sheets API** (optional)
   - **Google Slides API** (optional)

{/_ TODO: Add screenshot - Google Enable APIs _/}

## Step 3: Configure OAuth Consent Screen

1. Go to **APIs and Services**, then **OAuth consent screen**
2. Choose **External** (or Internal if using Google Workspace)
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

{/_ TODO: Add screenshot - Google OAuth Consent _/}

:::warning Test Mode
If you chose "External", your app will be in test mode. You need to add your email as a test user under **OAuth consent screen**, then **Test users**.
:::

## Step 4: Create OAuth Credentials

1. Go to **APIs and Services**, then **Credentials**
2. Click **Create Credentials**, then **OAuth client ID**
3. Choose **Web application**
4. Set the name (e.g., "Orient Dashboard")
5. Under **Authorized redirect URIs**, add:
   - `http://localhost:8766/oauth/callback` (for local development)
   - Your production callback URL if deploying
6. Click **Create**
7. **Copy the Client ID and Client Secret**

{/_ TODO: Add screenshot - Google OAuth Credentials _/}

## Step 5: Configure Orient

Add the credentials to Orient via the Dashboard Secrets panel or your `.env` file:

```bash
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
```

## Step 6: Connect Your Account

1. Go to the Dashboard, then the **Integrations** tab
2. Find **Google** in the catalog
3. Click **Connect**
4. A popup will open for Google OAuth
5. Sign in with your Google account and grant permissions

{/_ TODO: Add screenshot - Google Connect Integration _/}

Once connected, Orient can access your Calendar, Gmail, and Tasks!

---

## Features Available with Google

- **Calendar**: View upcoming events, create meetings
- **Gmail**: Read emails, send messages
- **Tasks**: View and manage your task lists

---

## Troubleshooting

| Problem                    | Solution                                                            |
| -------------------------- | ------------------------------------------------------------------- |
| OAuth popup blocked        | Allow popups for localhost in your browser                          |
| "Access denied"            | Add your email as a test user in OAuth consent screen               |
| Redirect URI mismatch      | Ensure `http://localhost:8766/oauth/callback` is in authorized URIs |
| "App not verified" warning | Click "Advanced", then "Go to Orient (unsafe)" during testing       |

## Next Steps

- Learn about [chatting with the AI](../features/chatting)
- Set up [scheduled messages](../features/scheduling)
- Configure [webhooks](./webhooks) for notifications
