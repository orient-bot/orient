---
name: mini-apps
description: Create standalone React mini-apps via the Mini-Apps toolchain. Use when asked to build apps, forms, schedulers, dashboards, or shareable web components. Do not write app code directly to the repo.
---

# Mini-Apps Creation Skill

Create standalone React applications using the Mini-Apps architecture. Use this skill when asked to create apps, forms, schedulers, dashboards, or any shareable web component.

## Trigger Phrases

Use this skill when the user says:

- "Create an app to..."
- "Build a form for..."
- "Make a scheduling app like Calendly"
- "Create a poll/survey"
- "Build a dashboard to show..."
- "Generate an artifact"
- "Create a mini-app"

## CRITICAL: What NOT to Do

**NEVER** do the following when asked to create an app:

1. ❌ Write code directly to project files using `write` or `edit` tools
2. ❌ Use `bash` to create files or run npm commands
3. ❌ Modify `src/`, `apps/`, or any project source files directly
4. ❌ Create new TypeScript/React files manually

**ALWAYS** use the Mini-Apps tools instead:

1. ✅ Use `ai_first_create_app` to generate new apps
2. ✅ Use `ai_first_update_app` to modify existing apps
3. ✅ Apps are created via PR for review, not direct commits

## Available Tools

| Tool                  | Purpose                        |
| --------------------- | ------------------------------ |
| `ai_first_create_app` | Create a new app from a prompt |
| `ai_first_list_apps`  | List all available apps        |
| `ai_first_get_app`    | Get details of a specific app  |
| `ai_first_share_app`  | Generate a shareable link      |
| `ai_first_update_app` | Update an existing app         |

## Workflow

### Creating a New App

1. **Understand the request**: Ask clarifying questions if needed
2. **Craft a detailed prompt**: Include functionality, UI elements, integrations
3. **Call the tool**:

```
ai_first_create_app({
  prompt: "Create a meeting scheduler app that shows a calendar with available time slots. Users can select a date and time, enter their name and email, and confirm the booking. The app should integrate with Google Calendar to check availability.",
  name: "meeting-scheduler"  // optional
})
```

4. **Share results**: The tool returns:
   - `prUrl`: Link to the PR for review
   - `previewUrl`: Where the app will be hosted
   - `explanation`: What the AI generated

### Updating an Existing App

```
ai_first_update_app({
  name: "meeting-scheduler",
  updateRequest: "Add a dropdown to select meeting duration (15, 30, 45, or 60 minutes)"
})
```

## Writing Good Prompts

The quality of the generated app depends on the prompt. Include:

1. **Core functionality**: What should the app do?
2. **UI elements**: Calendar, forms, buttons, lists, etc.
3. **Integrations**: Calendar, Slack, email, etc.
4. **User flow**: Step-by-step what happens when user interacts

### Example Prompts

**Meeting Scheduler:**

```
Create a meeting scheduler app similar to Calendly. Features:
- Calendar view showing the next 2 weeks
- Time slots in 30-minute increments
- Form to collect: name, email, meeting topic
- Confirmation message after booking
- Integration with Google Calendar for availability
```

**Feedback Form:**

```
Build a feedback collection form with:
- 5-star rating for different categories (quality, speed, communication)
- Text area for detailed comments
- Optional name/email fields
- Submit button that sends results to Slack
- Thank you message after submission
```

**Team Poll:**

```
Create a poll app for team decisions:
- Question text at the top
- Multiple choice options (2-6)
- Show results as percentage bars after voting
- Allow changing vote before closing
- Results visible to all participants
```

## Architecture Notes

Mini-Apps are:

- Standalone React applications in the `apps/` directory
- Built with Vite and shared UI components
- Have their own `APP.yaml` manifest defining permissions
- Can access calendar, Slack, scheduler via a runtime bridge
- Shared via secret links with optional expiry

The `ai_first_create_app` tool:

1. Uses Claude to generate React code
2. Creates the app in a git worktree
3. Commits and pushes to a feature branch
4. Opens a PR for review
5. Returns the PR URL

This ensures:

- ✅ Code review before deployment
- ✅ No direct changes to production
- ✅ Proper git history
- ✅ Design system compliance

## Bridge Capabilities Reference

Mini-apps access backend services through the `useBridge()` hook. The bridge provides five capability domains:

### Import and Initialize

```typescript
import { useBridge } from '../../_shared/hooks';

function MyApp() {
  const { bridge, isReady, isPreviewMode } = useBridge();

  if (!isReady) return <div>Loading...</div>;

  // Use bridge.calendar, bridge.scheduler, etc.
}
```

### 1. Calendar Integration (Google Calendar)

**Permission required in APP.yaml:**

```yaml
permissions:
  calendar:
    read: true # For listEvents
    write: true # For createEvent, updateEvent, deleteEvent
```

**Available methods:**

| Method                                    | Description              | Parameters                                            |
| ----------------------------------------- | ------------------------ | ----------------------------------------------------- |
| `bridge.calendar.listEvents(start, end)`  | Get events in date range | `start: Date, end: Date`                              |
| `bridge.calendar.createEvent(params)`     | Create a calendar event  | See below                                             |
| `bridge.calendar.updateEvent(id, params)` | Update existing event    | `eventId: string, params: Partial<CreateEventParams>` |
| `bridge.calendar.deleteEvent(id)`         | Delete an event          | `eventId: string`                                     |

**CreateEventParams:**

```typescript
{
  summary: string;          // Event title
  description?: string;     // Event description
  start: Date;              // Start time
  duration: number;         // Duration in minutes
  attendees?: string[];     // Email addresses
  location?: string;        // Location or video link
  createMeetLink?: boolean; // Auto-create Google Meet
}
```

**Example - Create a meeting:**

```typescript
const event = await bridge.calendar.createEvent({
  summary: 'Team Standup',
  description: 'Daily sync meeting',
  start: new Date('2026-01-20T10:00:00'),
  duration: 30,
  attendees: ['alice@company.com', 'bob@company.com'],
  createMeetLink: true,
});
console.log('Created event:', event.id, 'Meet link:', event.meetLink);
```

**Example - Check availability:**

```typescript
const events = await bridge.calendar.listEvents(
  new Date(), // Start of range
  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days ahead
);
const busyTimes = events.map((e) => ({ start: e.start, end: e.end }));
```

### 2. Scheduler (Built-in Capability)

Schedule messages to be sent via WhatsApp or Slack at specific times.

**Permission required in APP.yaml:**

```yaml
capabilities:
  scheduler:
    enabled: true
    max_jobs: 10 # Maximum concurrent scheduled jobs
```

**Available methods:**

| Method                               | Description             | Parameters      |
| ------------------------------------ | ----------------------- | --------------- |
| `bridge.scheduler.createJob(params)` | Schedule a message      | See below       |
| `bridge.scheduler.listJobs()`        | List all scheduled jobs | None            |
| `bridge.scheduler.cancelJob(id)`     | Cancel a scheduled job  | `jobId: number` |

**CreateJobParams:**

```typescript
{
  name: string;                              // Unique job name
  scheduleType: 'once' | 'recurring' | 'cron';
  runAt?: Date;                              // For 'once' type
  cronExpression?: string;                   // For 'cron' type (e.g., "0 9 * * 1-5")
  intervalMinutes?: number;                  // For 'recurring' type
  provider: 'whatsapp' | 'slack';
  target: string;                            // Channel/phone/email
  messageTemplate: string;                   // Message to send
}
```

**Example - One-time reminder:**

```typescript
await bridge.scheduler.createJob({
  name: `reminder-${eventId}`,
  scheduleType: 'once',
  runAt: new Date(meetingTime.getTime() - 15 * 60 * 1000), // 15 min before
  provider: 'slack',
  target: '#team-channel',
  messageTemplate: '📅 Reminder: Team meeting starts in 15 minutes!',
});
```

**Example - Daily standup reminder:**

```typescript
await bridge.scheduler.createJob({
  name: 'daily-standup-reminder',
  scheduleType: 'cron',
  cronExpression: '0 9 * * 1-5', // 9 AM, Mon-Fri
  provider: 'slack',
  target: '#engineering',
  messageTemplate: '🌅 Good morning! Time for standup.',
});
```

### 3. Webhooks (Built-in Capability)

Receive data from external services via webhook endpoints.

**Permission required in APP.yaml:**

```yaml
capabilities:
  webhooks:
    enabled: true
```

**Available methods:**

| Method                                              | Description              | Parameters                                       |
| --------------------------------------------------- | ------------------------ | ------------------------------------------------ |
| `bridge.webhooks.getEndpointUrl(name)`              | Get webhook URL to share | `endpointName: string`                           |
| `bridge.webhooks.onWebhookReceived(name, callback)` | Listen for incoming data | `endpointName: string, callback: (data) => void` |

**Example - Form submission webhook:**

```typescript
// Get the webhook URL to embed in external forms
const webhookUrl = await bridge.webhooks.getEndpointUrl('form-submit');
console.log('Share this URL:', webhookUrl);

// Listen for incoming submissions
useEffect(() => {
  const cleanup = bridge.webhooks.onWebhookReceived('form-submit', (data) => {
    console.log('Received submission:', data);
    setSubmissions((prev) => [...prev, data]);
  });
  return cleanup;
}, [bridge]);
```

### 4. Slack Messaging

Send messages to Slack channels or users.

**Permission required in APP.yaml:**

```yaml
permissions:
  slack:
    read: false # Not yet implemented
    write: true # For sendDM, sendChannel
```

**Available methods:**

| Method                             | Description         | Parameters                            |
| ---------------------------------- | ------------------- | ------------------------------------- |
| `bridge.slack.sendDM(params)`      | Send direct message | `{ target: string, message: string }` |
| `bridge.slack.sendChannel(params)` | Post to channel     | `{ target: string, message: string }` |

**Example - Send notification:**

```typescript
await bridge.slack.sendChannel({
  target: '#notifications',
  message: `New booking: ${userName} scheduled a meeting for ${formatDate(dateTime)}`,
});
```

**Example - Send confirmation DM:**

```typescript
await bridge.slack.sendDM({
  target: userEmail, // Slack will resolve to user
  message: `Your meeting "${title}" has been confirmed for ${formatDate(dateTime)}.`,
});
```

### 5. App Metadata

Access app configuration and sharing info.

**Available methods (no permissions needed):**

| Method                     | Description                     |
| -------------------------- | ------------------------------- |
| `bridge.app.getManifest()` | Get APP.yaml as object          |
| `bridge.app.getShareUrl()` | Get shareable link for this app |

**Example:**

```typescript
const shareUrl = await bridge.app.getShareUrl();
navigator.clipboard.writeText(shareUrl);
alert('Link copied!');
```

## APP.yaml Permission Reference

Every mini-app must declare its permissions in `APP.yaml`:

```yaml
name: my-app
version: 1.0.0
title: My App Title
description: What the app does

# External service permissions
permissions:
  calendar:
    read: true # Can view events
    write: true # Can create/modify events
  slack:
    read: false
    write: true # Can send messages

# Built-in capabilities
capabilities:
  scheduler:
    enabled: true
    max_jobs: 5
  webhooks:
    enabled: true

# Sharing configuration
sharing:
  mode: secret_link # or 'public' or 'private'
  expires_after_days: 30

# Build configuration
build:
  entry: src/App.tsx
  output: dist/
```

**Permission Rules:**

- Bridge calls will fail if the required permission is not declared
- Request only the permissions the app actually needs
- `read` vs `write` are checked separately

## Crafting Prompts with Integrations

When generating apps, include specific integration requirements in the prompt:

**Good prompt with integrations:**

```
Create a meeting scheduler app with these features:
- Form to collect: title, attendees (comma-separated emails), date/time, duration
- Use bridge.calendar.createEvent to book the meeting with createMeetLink: true
- Use bridge.scheduler.createJob to schedule a Slack reminder 15 minutes before
- Show success message with the Google Meet link
- Permissions needed: calendar (read+write), scheduler enabled
```

**The generated APP.yaml should include:**

```yaml
permissions:
  calendar:
    read: true
    write: true
capabilities:
  scheduler:
    enabled: true
    max_jobs: 5
```

## Post-Creation Verification

After creating or updating an app, **always verify it compiles**:

### Step 1: Build the App

```bash
cd apps/<app-name> && npm install && npm run build
```

### Step 2: Check for TypeScript Errors

If the build fails, common issues include:

1. **React types not found** (`Cannot find module 'react'`):
   - Ensure `@types/react` and `@types/react-dom` are in `devDependencies`
   - Check that `tsconfig.json` includes proper `typeRoots`

2. **Shared component type errors** (missing `className`, `children`):
   - Props interfaces should extend `React.HTMLAttributes<HTMLElement>`
   - Example: `interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>`

3. **Index signature errors**:
   - Add `[key: string]: unknown;` to interface if needed for dynamic props

### Step 3: Verify the App Loads

After a successful build:

1. Run `curl -s -X POST http://localhost/api/apps/reload` to refresh the cache
2. Check status: `curl http://localhost/api/apps/<app-name>` should show `"status": "published"`, `"isBuilt": true`
3. Preview at: `http://localhost/apps/<app-name>/`

### tsconfig.json Template for Apps

If an app has compilation issues with shared components, ensure the tsconfig includes:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["../_shared/*"]
    },
    "typeRoots": ["./node_modules/@types"]
  },
  "include": ["src", "../_shared"]
}
```

## Dashboard Integration

Apps are viewable in the Dashboard:

1. Navigate to **Mini-Apps** in the sidebar
2. See all apps with their build status (Published/Building)
3. Click **Preview** to test a built app
4. Click **Copy Link** to share the preview URL

## Troubleshooting

| Issue                                      | Solution                                        |
| ------------------------------------------ | ----------------------------------------------- |
| App shows "Building" status                | Run `npm run build` in the app directory        |
| Preview returns 404                        | Ensure the app has a `dist/` folder after build |
| API shows 503 "Apps service not available" | Restart the dev server                          |
| Shared components not found                | Check `tsconfig.json` paths and includes        |
