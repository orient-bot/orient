---
sidebar_position: 1
---

# Chatting with AI

<div style={{textAlign: 'center', marginBottom: '2rem'}}>
  <img src="/img/mascot/ori-working.png" alt="Ori chatting" width="180" />
</div>

Learn how to have effective conversations with the AI Assistant.

## Natural Conversations

The AI Assistant understands natural language. You don't need special commands or syntax - just write like you're talking to a colleague.

### Examples

| You Say                                          | AI Responds With                              |
| ------------------------------------------------ | --------------------------------------------- |
| "What can you help me with?"                     | A list of available features and capabilities |
| "Remind me to review the report tomorrow at 9am" | Confirmation of scheduled reminder            |
| "What are our current blockers?"                 | List of blocking JIRA issues                  |
| "Schedule a message to the team for Friday 5pm"  | Help setting up the scheduled message         |

## Getting the Best Responses

### Be Specific

❌ "Help me with the project"  
✅ "Show me the in-progress issues for the Orient project"

### Provide Context

❌ "What's the status?"  
✅ "What's the status of our current sprint?"

### Ask Follow-up Questions

The AI remembers your conversation context. You can ask follow-up questions:

```
You: What are our current blockers?
AI: [shows 3 blockers]
You: Tell me more about the first one
AI: [detailed info about PROJ-12345]
```

## Common Use Cases

### Project Management

- "Show me current blockers"
- "What was completed this week?"
- "Check for SLA breaches"
- "List in-progress issues"

### Scheduling

- "Remind me to follow up with Tom tomorrow"
- "Schedule a standup reminder for weekdays at 9am"
- "Set up a weekly summary message for Fridays"

### Information Lookup

- "What's the status of ticket PROJ-12345?"
- "Who is assigned to the authentication feature?"
- "Show me this week's velocity"

### Quick Help

- "What tools do you have?"
- "How do I schedule a message?"
- "Help me create a mini-app"

## Conversation Tips

### 1. One Request at a Time

For complex tasks, break them down:

✅ Ask about blockers, then ask about in-progress items separately

❌ "Show me blockers and in-progress items and what was completed"

### 2. Use Specific Names and IDs

When referring to tickets, use the full ID:

✅ "What's the status of PROJ-12345?"

❌ "What's that ticket about authentication?"

### 3. Confirm Understanding

If the AI seems to misunderstand, rephrase or clarify:

```
You: Schedule a reminder
AI: What would you like to be reminded about?
You: I want a daily standup reminder at 9am on weekdays
```

## Response Types

The AI can respond with:

- **Text answers** - Direct responses to questions
- **Lists** - Bullet-pointed information
- **Tables** - Structured data (like ticket lists)
- **Confirmations** - When actions are completed
- **Questions** - When it needs more information

## Privacy & Security

- Conversations are logged for debugging purposes
- The AI only accesses tools and data you have permission to use
- No external data is shared without explicit action

## Next Steps

- [Schedule messages and reminders](./scheduling)
- [Create mini-apps](./mini-apps)
- [Tips and tricks](../help/tips)
