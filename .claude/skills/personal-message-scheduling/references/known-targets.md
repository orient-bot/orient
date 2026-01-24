# Known Targets Reference

Common WhatsApp groups and contacts for scheduling messages.

## WhatsApp Target Formats

- **Groups**: `XXXXXXXXX@g.us`
- **Contacts**: `9725XXXXXXXX@s.whatsapp.net` (Israeli format)

## Work Groups

| Group Name | JID | Purpose |
|------------|-----|---------|
| agents for non-dev | `120363426817875017@g.us` | AI agents work updates |
| Genoox mobile | `972544334507-1424335267@g.us` | Mobile team |

## Bot Testing Groups

| Group Name | JID | Purpose |
|------------|-----|---------|
| בוט שלי | `120363422821405641@g.us` | Bot testing |
| טסט בוט | `120363425522419030@g.us` | Bot testing |

## Family Groups

| Group Name | JID | Purpose |
|------------|-----|---------|
| תומור | `972508250700-1443686078@g.us` | Family updates |
| האחים | `972543259093-1510303965@g.us` | Siblings |

## Friends Groups

| Group Name | JID | Purpose |
|------------|-----|---------|
| חומר אנושי משובח | `972547839878-1516978720@g.us` | Friends |
| פאדלינו לאן | `120363404011761297@g.us` | Paddle friends |

## Finding New Targets

Query the WhatsApp messages database to discover group JIDs:

```sql
SELECT DISTINCT 
  chat_id, 
  chat_name,
  COUNT(*) as message_count
FROM messages 
WHERE chat_id LIKE '%@g.us'
GROUP BY chat_id, chat_name
ORDER BY message_count DESC
LIMIT 20;
```

## Slack Targets

For Slack, use channel IDs (format: `C01234567`). Find channel IDs via:
- Slack web app: Right-click channel → Copy link → extract ID from URL
- Slack API: Use `conversations.list` endpoint

