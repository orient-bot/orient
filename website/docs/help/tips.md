---
sidebar_position: 1
---

# Tips & Tricks

<div style={{textAlign: 'center', marginBottom: '2rem'}}>
  <img src="/img/mascot/ori-thinking.png" alt="Ori with tips" width="180" />
</div>

Get the most out of AI Assistant with these power-user tips.

## Communication Tips

### 1. Be Conversational

The AI understands natural language. Write like you're talking to a helpful colleague, not a computer.

✅ "Hey, can you check if there are any blockers in our sprint?"  
✅ "What's Tom working on right now?"  
❌ "/query blockers --project=Orient"

### 2. Use Follow-ups

Don't repeat context - the AI remembers your conversation:

```
You: Show me our blockers
AI: [lists 3 blockers]
You: What's the priority on the first one?
AI: [details about the first blocker]
You: Can you add a comment to it?
```

### 3. Ask for Clarification

If you're not sure what the AI can do, just ask:

- "What can you help me with?"
- "How do I schedule a message?"
- "What tools do you have access to?"

## Scheduling Tips

### 4. Use Natural Time Expressions

The AI understands various time formats:

✅ "tomorrow at 9am"  
✅ "next Monday"  
✅ "in 2 hours"  
✅ "every weekday at 9:30"

### 5. Test Schedules First

Use the dashboard's "Run Now" button to test a schedule before relying on it for important reminders.

### 6. Name Your Schedules

Give schedules descriptive names for easy management:

✅ "Sprint Review Reminder - Friday 3pm"  
❌ "Reminder 3"

## Project Management Tips

### 7. Reference Tickets by ID

When asking about specific issues, use the full ID:

✅ "What's the status of PROJ-12345?"  
❌ "What's that authentication ticket?"

### 8. Batch Similar Requests

For multiple similar items, ask in groups:

✅ "Show me all in-progress issues and their assignees"  
❌ "What's in progress?" then "Who's working on each one?"

### 9. Use Specific Queries

The more specific your request, the better the response:

✅ "Show me blockers created this week"  
❌ "Are there any problems?"

## Platform-Specific Tips

### WhatsApp

- **Reconnect if needed**: If the connection drops, just re-scan the QR code
- **Check connection status**: Visit the dashboard to see if you're connected
- **Use in groups**: Add the AI to group chats for team queries

### Slack

- **Mention to summon**: Use `@AI Assistant` in channels
- **DM for privacy**: Use direct messages for sensitive queries
- **Thread replies**: The AI can respond in threads to keep channels clean

## Advanced Tips

### 10. Create Mini-Apps for Repeated Tasks

If you find yourself doing the same thing repeatedly, ask the AI to create a mini-app:

"Create an app that lets me quickly log my daily status with a dropdown for project and a text field for notes"

### 11. Use Template Variables in Schedules

Make scheduled messages dynamic with template variables:

```
📊 Status for {{date}} ({{day}})

Don't forget to update your progress!
```

### 12. Check the Dashboard Regularly

The dashboard at [app.example.com](https://app.example.com) shows:

- Connection status
- Chat permissions
- Scheduled jobs
- Mini-apps
- Execution history

## Common Pitfalls to Avoid

### ❌ Vague Requests

"Help me with the project" → What project? What kind of help?

### ❌ Multiple Unrelated Questions

"What are the blockers and also schedule a reminder and create an app" → Split into separate requests

### ❌ Assuming Context from Yesterday

Start new conversations with brief context if needed - the AI may not remember details from previous sessions.

### ❌ Ignoring Errors

If something fails, check the dashboard for error details rather than just retrying.

## Keyboard Shortcuts

When using the dashboard:

| Shortcut | Action                  |
| -------- | ----------------------- |
| `/`      | Focus search            |
| `Esc`    | Close modals            |
| `Tab`    | Navigate between fields |

## Getting Help

If you're stuck:

1. Ask the AI: "Help me with [task]"
2. Check this documentation
3. Contact the Orient Task Force team
