# Troubleshooting

Common issues and solutions for Orient.

## Resetting the Admin Password

If you've forgotten your dashboard admin password, there are two ways to reset it.

### Option 1: Re-run the Setup Wizard (Recommended)

The simplest approach is to delete all users from the database, which triggers the setup wizard on next visit:

```bash
# Connect to PostgreSQL (adjust container name if needed)
docker exec -it orienter-postgres-0 psql -U aibot -d aibot

# Delete all dashboard users
DELETE FROM dashboard_users;

# Exit psql
\q
```

Now visit `http://localhost:80` (or your dashboard URL) and you'll be prompted to create a new admin user.

### Option 2: Update Password Directly

If you want to keep the existing user but change the password:

1. **Generate a bcrypt hash** for your new password:

```bash
# Using Node.js (requires bcryptjs)
node -e "require('bcryptjs').hash('YOUR_NEW_PASSWORD', 10, (e, h) => console.log(h))"

# Or using npx (no install needed)
npx -y bcryptjs-cli hash YOUR_NEW_PASSWORD
```

2. **Update the password in the database:**

```bash
docker exec -it orienter-postgres-0 psql -U aibot -d aibot
```

```sql
UPDATE dashboard_users
SET password_hash = 'YOUR_BCRYPT_HASH_HERE'
WHERE username = 'admin';
```

Replace `admin` with your actual username and `YOUR_BCRYPT_HASH_HERE` with the hash from step 1.

## Database Connection Issues

### "Connection refused" to PostgreSQL

1. **Check if the container is running:**

```bash
docker ps | grep postgres
```

2. **Check container logs:**

```bash
docker logs orienter-postgres-0
```

3. **Verify environment variables** in `.env`:

```bash
grep POSTGRES .env
```

### Database not initialized

If tables are missing, run the initialization:

```bash
./scripts/init-db.sh
```

## WhatsApp QR Code Not Showing

1. **Check if the WhatsApp service is running:**

```bash
# Development mode
curl http://localhost:4097/health

# Or check logs
docker logs orienter-whatsapp-0
```

2. **Clear WhatsApp auth state** and restart:

```bash
rm -rf data/whatsapp-auth/*
./run.sh dev stop
./run.sh dev
```

3. **Visit the QR page:** `http://localhost:80/qr/`

## MinIO/S3 Storage Issues

### "Access Denied" errors

Check your MinIO credentials in `.env`:

```bash
grep MINIO .env
```

Default development credentials:

- User: `minioadmin`
- Password: `minioadmin123`

### Bucket not found

Buckets are created automatically on startup. If missing, restart the services:

```bash
./run.sh dev stop
./run.sh dev
```

## Port Conflicts

If you see "address already in use" errors:

1. **Find what's using the port:**

```bash
lsof -i :80    # Nginx
lsof -i :5432  # PostgreSQL
lsof -i :4098  # Dashboard
```

2. **Kill the conflicting process** or use a different instance ID:

```bash
# Use instance 1 (adds 1000 to all ports)
INSTANCE_ID=1 ./run.sh dev
```

This changes ports to: 1080, 6432, 5098, etc.

## Environment Diagnostics

Run the doctor script to check your environment:

```bash
./run.sh doctor
```

After reviewing the output and approving changes, use auto-fix mode to resolve common issues:

```bash
./run.sh doctor --fix
```

## Clearing All Data (Fresh Start)

To completely reset your local environment:

```bash
# Stop all services
./run.sh dev stop

# Remove Docker volumes (databases, storage)
docker volume rm $(docker volume ls -q | grep orienter)

# Remove local auth/data files
rm -rf data/whatsapp-auth/*
rm -rf data/oauth-tokens/*

# Restart
./run.sh dev
```

**Warning:** This deletes all messages, configurations, and stored data.

## Getting Help

If you're still stuck:

1. Check the logs: `./run.sh dev logs`
2. Run diagnostics: `./run.sh doctor`
3. Search existing issues on GitHub
4. Open a new issue with:
   - Output of `./run.sh doctor`
   - Relevant log messages
   - Steps to reproduce
