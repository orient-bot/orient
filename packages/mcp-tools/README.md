# @orientbot/mcp-tools

Portable MCP tools and registry for the Orient.

## Features

- **Base Tool Class**: Abstract class for creating type-safe MCP tools
- **Tool Registry**: Central registry with search and discovery capabilities
- **Tool Context**: Context factory for service injection
- **Category Organization**: Tools organized by domain (jira, messaging, docs, etc.)

## Installation

```bash
pnpm add @orientbot/mcp-tools
```

## Usage

### Creating a Tool

```typescript
import { MCPTool, ToolContext } from '@orientbot/mcp-tools';
import { z } from 'zod';

// Using the base class
class GetIssueCountTool extends MCPTool<{ projectKey: string }, number> {
  name = 'get_issue_count';
  description = 'Get the count of issues in a project';
  category = 'jira' as const;
  inputSchema = z.object({
    projectKey: z.string().describe('JIRA project key'),
  });
  keywords = ['issue', 'count', 'jira'];
  useCases = ['Count issues in a project'];

  async execute(input: { projectKey: string }, context: ToolContext): Promise<number> {
    // Implementation using context.jiraClient
    return 42;
  }
}

// Using the factory function
import { createTool } from '@orientbot/mcp-tools';

const myTool = createTool({
  name: 'my_tool',
  description: 'My custom tool',
  category: 'system',
  inputSchema: z.object({ message: z.string() }),
  keywords: ['custom'],
  useCases: ['Custom operations'],
  execute: async (input, context) => {
    return { message: input.message };
  },
});
```

### Using the Registry

```typescript
import { getToolRegistry, ToolRegistry } from '@orientbot/mcp-tools';

const registry = getToolRegistry();

// Register a tool
registry.registerTool(myTool.toMetadata());

// Search for tools
const results = registry.searchTools('issue management');

// Get tools by category
const jiraTools = registry.getToolsByCategory('jira');

// Get all categories
const categories = registry.getAllCategories();
```

### Creating Tool Context

```typescript
import { createToolContext, loadConfig } from '@orientbot/mcp-tools';
import { loadConfig } from '@orientbot/core';

const config = loadConfig();
const context = createToolContext(config, {
  correlationId: 'unique-request-id',
});

// Use context with tools
const result = await myTool.run(input, context);
```

## Tool Categories

| Category    | Description                    |
| ----------- | ------------------------------ |
| `jira`      | JIRA project management tools  |
| `messaging` | Slack communication tools      |
| `whatsapp`  | WhatsApp messaging tools       |
| `docs`      | Google Docs/Slides tools       |
| `system`    | System and configuration tools |

## Development

```bash
# Build
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck
```
