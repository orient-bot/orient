# WhatsApp Integration

Orient supports both personal-mode (Baileys) and Cloud API configurations.

## Personal Mode (Baileys)

Configure in `.mcp.config.local.json` under `whatsapp`:

- `adminPhone`
- `sessionPath`
- `allowedGroupIds`

## Cloud API (Meta)

Set these environment variables in `.env`:

- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_VERIFY_TOKEN`

## Notes

Ensure session data and credentials stay local and uncommitted. For the Docker
demo, use `docs/getting-started-demo.md` to pair via QR.
