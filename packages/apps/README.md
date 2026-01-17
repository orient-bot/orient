# @orient/apps

Mini-apps system for the Orient.

## Overview

This package provides the infrastructure for creating, managing, and running mini-applications within the Orient ecosystem.

Features:

- **AppsService** - Core app management (create, list, update, delete)
- **AppGeneratorService** - AI-powered app generation from prompts
- **AppGitService** - Git worktree management for app development
- **AppRuntimeService** - Runtime for executing apps
- **MiniappEditService** - In-browser app editing via OpenCode
- **SkillsService** - Skill management for agents

## Installation

```bash
pnpm add @orient/apps
```

## Usage

```typescript
import { AppConfig, AppManifest, GeneratedApp } from '@orient/apps';

// App configuration
const appConfig: AppConfig = {
  name: 'my-app',
  description: 'A sample mini-app',
  author: 'user@example.com',
};
```

## Migration Status

This package contains services migrated from `src/services/`:

- `appsService.ts` - App CRUD operations
- `appGeneratorService.ts` - AI app generation
- `appGitService.ts` - Git worktree management
- `appRuntimeService.ts` - App execution
- `miniappEditService.ts` - In-browser editing
- `miniappEditDatabase.ts` - Edit session database
- `skillsService.ts` - Skill management
