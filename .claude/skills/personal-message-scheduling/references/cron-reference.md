# Cron Expression Reference

## Syntax

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, Sunday=0)
│ │ │ │ │
* * * * *
```

## Common Presets

| Description | Expression |
|-------------|------------|
| Weekdays at 8:00 AM | `0 8 * * 1-5` |
| Weekdays at 9:00 AM | `0 9 * * 1-5` |
| Weekdays at 8:30 AM | `30 8 * * 1-5` |
| Weekdays at 5:00 PM | `0 17 * * 1-5` |
| Mondays at 9:00 AM | `0 9 * * 1` |
| Fridays at 4:00 PM | `0 16 * * 5` |
| Every hour | `0 * * * *` |
| Every 2 hours | `0 */2 * * *` |
| Daily at 9:00 AM | `0 9 * * *` |
| Daily at midnight | `0 0 * * *` |

## Special Characters

| Char | Meaning | Example |
|------|---------|---------|
| `*` | Any value | `* * * * *` = every minute |
| `,` | List | `0,30 * * * *` = at 0 and 30 min |
| `-` | Range | `0 9-17 * * *` = hourly 9AM-5PM |
| `/` | Step | `*/15 * * * *` = every 15 min |

## Day of Week Values

| Day | Number |
|-----|--------|
| Sunday | 0 |
| Monday | 1 |
| Tuesday | 2 |
| Wednesday | 3 |
| Thursday | 4 |
| Friday | 5 |
| Saturday | 6 |

## Validation

Test expressions before creating jobs:

```bash
curl -X POST "${API_BASE}/api/schedules/validate-cron" \
  -H "Content-Type: application/json" \
  -d '{"expression": "0 9 * * 1-5"}'
```

Response:
```json
{
  "valid": true,
  "description": "At 09:00 on Monday through Friday"
}
```

## Common Patterns

### Work Hours
- `0 9 * * 1-5` - Weekday mornings
- `0 17 * * 1-5` - Weekday end of day
- `30 8 * * 1-5` - Before standup

### Meetings
- `0 9 * * 1` - Monday kickoff
- `0 16 * * 5` - Friday wrap-up
- `0 14 * * 3` - Mid-week check-in

### Monitoring
- `0 * * * *` - Every hour
- `*/30 * * * *` - Every 30 minutes
- `0 0 * * *` - Daily at midnight

