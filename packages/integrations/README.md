# @orientbot/integrations

External service integrations for the Orient.

## Features

- **Google Integration**: Slides, Sheets, Gmail services

## Usage

```typescript
// Google
import { SlidesService, SheetsService, GmailService } from '@orientbot/integrations/google';
```

## Directory Structure

```
src/
├── index.ts           # Main exports
└── google/
    ├── index.ts       # Google exports
    ├── slides.ts      # Google Slides service
    ├── sheets.ts      # Google Sheets service
    └── gmail.ts       # Gmail service
```
