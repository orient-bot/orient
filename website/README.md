# Documentation Website

This directory contains the Docusaurus-based documentation website for the Orient.

## What's Here

- **Docusaurus Site**: Full documentation website with navigation, search, and versioning
- **Location**: `website/docs/` (previously in `apps/docs/`)
- **Deployed to**: https://docs.example.com (via Vercel)

## Purpose

This is the **public-facing documentation website**, not a mini-app. It provides:

- User guides (WhatsApp, Slack setup)
- Feature documentation (scheduling, mini-apps, chatting)
- FAQ and tips

## Relationship to Other Docs

```
/docs/                    # Raw markdown docs (architecture, implementation)
/website/docs/            # Docusaurus website (user-facing documentation)
/apps/                    # Mini-Apps (user-facing React apps)
```

- `/docs/` contains internal/developer documentation
- `/website/docs/` is the Docusaurus site that renders user-facing docs
- `/apps/` contains AI-generated mini-apps (meeting schedulers, forms, etc.)

## Development

```bash
cd website/docs
npm install
npm start
```

This will start the Docusaurus dev server at http://localhost:3000

## Build

```bash
cd website/docs
npm run build
```

Builds the static site to `build/` directory.

## Deployment

Automatically deployed to Vercel when changes are pushed to `main` branch:

- GitHub Action: `.github/workflows/deploy-docs.yml`
- Trigger: Changes to `website/docs/**`
- Target: https://docs.example.com

## Configuration

- `docusaurus.config.ts` - Site configuration
- `sidebars.ts` - Navigation structure
- `docs/` - Markdown content files
- `static/` - Static assets (images, favicon)
