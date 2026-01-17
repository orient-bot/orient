# Getting Started: Demo

This guide boots a minimal demo environment for Orient using Docker. It is
intentionally lightweight and uses demo credentials. Do not use this setup in
production.

## Prerequisites

- Docker + Docker Compose
- A WhatsApp account on a mobile device for QR pairing

### Check Your Environment

You can verify Docker is installed and running:

```bash
docker --version
docker compose version
```

Or use the doctor script (requires Node.js):

```bash
./run.sh doctor
```

## Quick Start

```bash
cd docker
docker compose -f docker-compose.demo.yml up -d
```

### Verify

```bash
docker compose -f docker-compose.demo.yml ps
```

## Connect WhatsApp

1. Open the QR UI at `http://localhost:4097/qr`
2. Scan the QR code with WhatsApp on your phone
3. Open the dashboard at `http://localhost:4098`

## Demo Credentials (Do Not Use in Production)

These are baked into `docker-compose.demo.yml`:

- PostgreSQL: `orient_demo` / `orient_demo_password`
- MinIO: `orientdemo` / `orientdemo_password`
- S3 Bucket: `orient-demo`

## Next Steps

- For AI features, run the full stack with OpenCode (`docker-compose.yml`)
- Configure environment variables in `.env` for production
- Explore integrations in `docs/integrations/`

## Cleanup

```bash
docker compose -f docker-compose.demo.yml down -v
```
