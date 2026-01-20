# Known Contacts Reference

This file contains known contacts and their phone numbers for quick lookup.

## Primary Contacts

| Name | Aliases | Phone | Relationship | Notes |
|------|---------|-------|--------------|-------|
| מורי | מור, Mor, Mori, מורית | `972524670511` | Wife/Partner | Primary family contact |

## Family Members

These names appear frequently in messages but may not have direct phone numbers:

| Name | Aliases | Notes |
|------|---------|-------|
| שי | Shai, שייה | Eldest daughter, has חוגים (activities) |
| נדב | Nadav, נדבי | Son |
| אדר | דרי, Adar, Dri, אדרי | Youngest child |

## Work Contacts

| Name | Phone | Notes |
|------|-------|-------|
| (Add as discovered) | | |

## Groups

### Family Groups

| Group Name | Group ID | Members | Purpose |
|------------|----------|---------|---------|
| תומור | `972508250700-1443686078@g.us` | Tom, Mor, family | Family updates, photos |
| האחים | `972543259093-1510303965@g.us` | Siblings | Brother/sister chat |
| משפחת בן שמחון משתדרגת | `972508250730-1326877332@g.us` | Extended family | Family events |
| אמאבא | `972507776044-1458310612@g.us` | Parents | Parents group |

### Friends Groups

| Group Name | Group ID | Notes |
|------------|----------|-------|
| חומר אנושי משובח | `972547839878-1516978720@g.us` | Friends group |
| NFTom | `120363042726120030@g.us` | Friends/crypto |
| החברים של | `972527888987-1363631576@g.us` | Friends |
| פאדלינו לאן | `120363404011761297@g.us` | Paddle friends |
| סקי משבר גיל 40 האמיתי מס׳ אחת | `120363420973870666@g.us` | Ski trip planning |

### Work Groups

| Group Name | Group ID | Notes |
|------------|----------|-------|
| Genoox mobile | `972544334507-1424335267@g.us` | Work mobile team |
| agents for non-dev | `120363426817875017@g.us` | AI agents work |

### Neighborhood/Community

| Group Name | Group ID | Notes |
|------------|----------|-------|
| לחם חביתה-חשמונאים 100 | `120363171204226960@g.us` | Building/neighborhood |
| בני הבית | `120363427132925010@g.us` | Home-related |

### Bot Testing

| Group Name | Group ID | Notes |
|------------|----------|-------|
| בוט שלי | `120363422821405641@g.us` | Bot testing |
| טסט בוט | `120363425522419030@g.us` | Bot testing |

## Phone Number Format

- Always use format without `+` prefix
- Israeli numbers: `9725XXXXXXXX` (10-digit mobile)
- Example: `972524670511` (not `+972524670511`)

## Adding New Contacts

When you discover a new frequently-used contact:

1. Find their phone number from messages:
   ```sql
   SELECT DISTINCT phone FROM messages 
   WHERE text LIKE '%NAME%' 
   LIMIT 10;
   ```

2. Add to this file with:
   - Hebrew name (primary)
   - English transliteration
   - Common nicknames/aliases
   - Relationship context
   - Any relevant notes




