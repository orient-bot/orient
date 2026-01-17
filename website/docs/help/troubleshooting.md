---
sidebar_position: 3
---

# Troubleshooting

Common issues and how to fix them.

## Password Reset

Forgot your dashboard password? Here's how to reset it.

### Option 1: Reset via Setup Wizard

The simplest approach - delete users from the database to trigger the setup wizard:

```bash
# Connect to the database
docker exec -it orienter-postgres-0 psql -U aibot -d aibot

# Delete all dashboard users
DELETE FROM dashboard_users;

# Exit
\q
```

Visit the dashboard again and you'll be prompted to create a new admin account.

### Option 2: Update Password Directly

1. Generate a new password hash:

```bash
node -e "require('bcryptjs').hash('YOUR_NEW_PASSWORD', 10, (e, h) => console.log(h))"
```

2. Update the database:

```bash
docker exec -it orienter-postgres-0 psql -U aibot -d aibot
```

```sql
UPDATE dashboard_users
SET password_hash = 'YOUR_HASH_HERE'
WHERE username = 'admin';
```

## WhatsApp Connection Issues

### QR Code Not Showing

1. Check the WhatsApp service is running:

   ```bash
   curl http://localhost:4097/health
   ```

2. Clear the auth state and restart:

   ```bash
   rm -rf data/whatsapp-auth/*
   ./run.sh dev stop && ./run.sh dev
   ```

3. Visit `http://localhost:80/qr/`

### Connection Drops Frequently

WhatsApp web sessions can expire. If Ori keeps disconnecting:

1. Log out from WhatsApp Web on all other devices
2. Clear the auth state as shown above
3. Scan the QR code again

## Slack Issues

### Bot Not Responding

1. Verify the bot token is set in your environment
2. Check the Slack app is installed in your workspace
3. Ensure the bot has been invited to the channel

### Commands Not Working

Make sure Socket Mode is enabled in your Slack app settings and `SLACK_APP_TOKEN` is set.

## Database Connection Errors

### "Connection refused"

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# View container logs
docker logs orienter-postgres-0
```

### Tables Missing

Run the database initialization:

```bash
./scripts/init-db.sh
```

## Storage Issues (MinIO/S3)

### "Access Denied" Errors

Verify your credentials in `.env`:

- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`

Default development values:

- User: `minioadmin`
- Password: `minioadmin123`

## Fresh Start

To completely reset your environment:

```bash
# Stop everything
./run.sh dev stop

# Remove Docker volumes
docker volume rm $(docker volume ls -q | grep orienter)

# Clear local data
rm -rf data/whatsapp-auth/*
rm -rf data/oauth-tokens/*

# Start fresh
./run.sh dev
```

:::warning
This deletes all messages, settings, and stored data.
:::

## Getting More Help

- Run diagnostics: `./run.sh doctor`
- View logs: `./run.sh dev logs`
- Check [FAQ](/docs/help/faq) for common questions
- Check [Tips](/docs/help/tips) for best practices
