## Quickstart (Development)

1. Install dependencies:
   - pnpm 9+
   - Node.js 20+
2. Create local configs:
   - `cp .env.example .env`
   - `cp .mcp.config.example.json .mcp.config.local.json`
3. Start dev services:
   - `./run.sh dev`

## Quickstart (Demo)

1. Start demo stack:
   - `cd docker`
   - `docker compose -f docker-compose.demo.yml up -d`
2. Pair WhatsApp:
   - Open `http://localhost:4097/qr`
   - Scan QR with WhatsApp
3. Open dashboard:
   - `http://localhost:4098`

## Notes

- Demo credentials are for local testing only.
- Do not commit `.env` or `.mcp.config.local.json`.
