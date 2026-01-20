# WhatsApp Messages Database Schema

SQLite database at `data/messages.db`.

## Tables

### messages

Main message storage with full-text search support.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Auto-increment primary key |
| `message_id` | TEXT | Unique WhatsApp message ID |
| `direction` | TEXT | `incoming` or `outgoing` |
| `jid` | TEXT | WhatsApp JID (sender/recipient) |
| `phone` | TEXT | Phone number (extracted from JID) |
| `text` | TEXT | Message content |
| `is_group` | INTEGER | 1 if group message, 0 otherwise |
| `group_id` | TEXT | Group JID (null for direct messages) |
| `timestamp` | TEXT | ISO 8601 datetime |
| `created_at` | TEXT | Database insertion time |
| `media_type` | TEXT | `image`, `audio`, `video`, `document`, or null |
| `media_path` | TEXT | Local path to saved media file |
| `media_mime_type` | TEXT | MIME type (e.g., `image/jpeg`) |
| `transcribed_text` | TEXT | Voice message transcription |
| `transcribed_language` | TEXT | Language of transcription |

**Indexes**: `phone`, `timestamp`, `direction`, `is_group`, `text` (FTS), `media_type`

### groups

Group metadata storage.

| Column | Type | Description |
|--------|------|-------------|
| `group_id` | TEXT | Group JID (primary key) |
| `group_name` | TEXT | Group display name |
| `group_subject` | TEXT | Group subject/description |
| `participant_count` | INTEGER | Number of participants |
| `last_updated` | TEXT | Last metadata update time |

**Indexes**: `group_name`, `group_subject`

### messages_fts

Virtual FTS5 table for full-text search on message text.

## JID Format

WhatsApp JIDs follow these patterns:
- **Direct message**: `{phone}@s.whatsapp.net`
- **Group**: `{group_id}@g.us`

Phone numbers are stored without the `+` prefix.

## Media Storage

Media files are saved to `data/media/` with subdirectories:
- `audio/` - Voice messages (.opus)
- `images/` - Photos
- `video/` - Videos
- `documents/` - PDFs, docs, etc.

## Useful Queries

### Count Messages by Contact

```sql
SELECT phone, COUNT(*) as count 
FROM messages 
GROUP BY phone 
ORDER BY count DESC 
LIMIT 10;
```

### Recent Messages with Date

```sql
SELECT 
  datetime(timestamp) as time,
  direction,
  phone,
  substr(text, 1, 100) as preview
FROM messages 
ORDER BY timestamp DESC 
LIMIT 20;
```

### Messages from Specific Date Range

```sql
SELECT * FROM messages 
WHERE timestamp >= '2026-01-01' 
  AND timestamp < '2026-01-08'
ORDER BY timestamp;
```

### Group Message Stats

```sql
SELECT 
  g.group_name,
  COUNT(m.id) as message_count
FROM messages m
JOIN groups g ON m.group_id = g.group_id
WHERE m.is_group = 1
GROUP BY g.group_id
ORDER BY message_count DESC;
```

## Recovery: lost_and_found Table

When using SQLite's `.recover` command on a corrupted database, orphaned rows are placed in `lost_and_found`.

### Column Mapping

| lost_and_found | messages field |
|----------------|----------------|
| c0 | (internal id) |
| c1 | message_id |
| c2 | direction |
| c3 | jid |
| c4 | phone |
| c5 | text |
| c6 | is_group |
| c7 | group_id |
| c8 | timestamp |
| c9 | created_at |
| c10 | media_type |
| c11 | media_path |
| c12 | media_mime_type |
| c13 | transcribed_text |
| c14 | transcribed_language |

### Recovery Query

```sql
INSERT OR IGNORE INTO messages 
  (message_id, direction, jid, phone, text, is_group, group_id, 
   timestamp, created_at, media_type, media_path, media_mime_type, 
   transcribed_text, transcribed_language)
SELECT c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14
FROM lost_and_found
WHERE c2 IN ('incoming', 'outgoing')
  AND c1 IS NOT NULL
  AND c8 IS NOT NULL;
```
