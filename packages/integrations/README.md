# @orientbot/integrations

External service integrations for the Orient.

## Features

- **JIRA Integration**: Issue querying, creation, updates, SLA checking
- **Google Integration**: Slides, Sheets, Gmail services

## Usage

```typescript
// JIRA
import { JiraService, getAllIssues, getIssueByKey } from '@orientbot/integrations/jira';

// Google
import { SlidesService, SheetsService, GmailService } from '@orientbot/integrations/google';
```

## Directory Structure

```
src/
├── index.ts           # Main exports
├── jira/
│   ├── index.ts       # JIRA exports
│   ├── service.ts     # JIRA service implementation
│   └── types.ts       # JIRA-specific types
└── google/
    ├── index.ts       # Google exports
    ├── slides.ts      # Google Slides service
    ├── sheets.ts      # Google Sheets service
    └── gmail.ts       # Gmail service
```
