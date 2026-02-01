---
sidebar_position: 2
---

# Frequently Asked Questions

Common questions about using the AI Assistant.

## General

### What is AI Assistant?

AI Assistant is an AI-powered bot that integrates with WhatsApp and Slack to help you with project management, scheduling, and various work tasks. It uses advanced language models to understand natural language and provide helpful responses.

### Is my data secure?

Yes. The AI Assistant:

- Operates within your organization's infrastructure
- Only accesses tools and data you have permission to use
- Logs conversations for debugging purposes only
- Does not share data externally without explicit action

### What can the AI help me with?

- **Project management**: Query JIRA issues, check blockers, track progress
- **Scheduling**: Set up reminders, automate messages, manage recurring tasks
- **Information**: Answer questions, provide status updates
- **Mini-apps**: Create custom interactive applications

---

## Connection Issues

### Why won't the QR code scan?

Common solutions:

1. Clean your phone camera lens
2. Adjust screen brightness
3. Move closer to the screen
4. Click to refresh the QR code
5. Try the pairing code method instead

### Why did my WhatsApp disconnect?

WhatsApp may disconnect if:

- Your phone loses internet connection
- WhatsApp is updated on your phone
- You manually unlink the device
- The session times out after extended inactivity

**Solution**: Re-scan the QR code in the dashboard.

### I can't find the AI in Slack

- Search for "AI Assistant" in Slack's search
- Ask your workspace admin to verify the bot is installed
- Check if the bot has been invited to your channel

---

## Chat & Responses

### Why isn't the AI responding?

1. **Check connection**: Visit the dashboard to verify connection status
2. **Check permissions**: Ensure your chat has AI permissions enabled
3. **Try again**: Sometimes a simple retry works
4. **Restart**: Contact support if issues persist

### The AI gave me wrong information

The AI can occasionally make mistakes. For critical information:

- Verify against the source (e.g., check JIRA directly)
- Report issues to help improve the system
- Provide feedback in the conversation

### Can the AI remember our previous conversations?

The AI remembers context within a single conversation session. However, it may not recall details from previous days or sessions. If you need to reference past context, briefly summarize it.

---

## Scheduling

### Why didn't my scheduled message send?

Check the dashboard for:

1. **Job status**: Is the schedule enabled?
2. **Run history**: Are there error messages?
3. **Target**: Is the chat/channel still accessible?
4. **Permissions**: Does the bot have write access?

### How do I cancel a scheduled message?

1. Go to the dashboard at [app.example.com](https://app.example.com)
2. Navigate to the **Schedules** tab
3. Find your schedule and click **Delete** or **Disable**

Or ask the AI: "Cancel my Friday reminder"

### What timezone are schedules in?

By default, all schedules use `Asia/Jerusalem` timezone. You can specify a different timezone when creating a schedule.

### Can I schedule messages to external numbers?

Schedules can only target chats that the bot has access to and permission to write to.

---

## Mini-Apps

### How long does it take to create an app?

The AI generates code quickly (seconds), but the app needs to go through a review process:

1. AI generates code → instant
2. Pull request created → seconds
3. Review and approval → depends on your team
4. Build and deploy → 1-2 minutes

### Why can't I access my app?

- **PR not merged**: Check if the app's pull request has been approved
- **Build failed**: Check the GitHub Actions for errors
- **Share link expired**: Generate a new share link

### Can I edit a mini-app after creation?

Yes! Ask the AI to update the app:

"Update my meeting scheduler app to add a notes field"

This will create a new pull request with the changes.

---

## Permissions

### Why can't the AI do what I asked?

The AI respects permission boundaries:

- **Chat permissions**: Some chats may be read-only
- **Tool access**: Certain tools may be restricted
- **Rate limits**: Too many requests may be throttled

Check with your administrator if you need additional permissions.

### Who can use the AI Assistant?

Access is controlled by your organization. Contact the Orient Task Force team for access.

---

## Technical

### What language models power the AI?

Orient uses OpenCode and supports all models available through OpenCode, with primary testing on grok-code-1-fast.

### Is there an API?

The AI is primarily designed for chat-based interaction. For programmatic access, contact your administrator about API availability.

### Can I self-host Orient?

Yes! Orient is open-source. Check out the [GitHub repository](https://github.com/orient/orient) for setup instructions.

Quick verification of your environment:

```bash
./run.sh doctor
```

### Where can I report bugs?

Contact the Orient Task Force team via Slack or email with:

- Description of the issue
- Steps to reproduce
- Screenshots if applicable

You can also open an issue on [GitHub](https://github.com/orient/orient/issues).

---

## Still Need Help?

If your question isn't answered here:

1. **Ask the AI**: "Help me with [your question]"
2. **Check documentation**: Browse other sections of this site
3. **Contact support**: Reach out to the Orient Task Force team
