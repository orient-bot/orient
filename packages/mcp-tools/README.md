# @orientbot/mcp-tools

Portable MCP tools and registry for the Orient.

## Features

- **Base Tool Class**: Abstract class for creating type-safe MCP tools
- **Tool Registry**: Central registry with search and discovery capabilities
- **Tool Context**: Context factory for service injection
- **Category Organization**: Tools organized by domain (messaging, docs, google, system, etc.)

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
class SendSlackDmTool extends MCPTool<{ userId: string; message: string }, { success: boolean }> {
  name = 'slack_send_dm';
  description = 'Send a Slack DM to a user';
  category = 'messaging' as const;
  inputSchema = z.object({
    userId: z.string().describe('Slack user ID'),
    message: z.string().describe('Message to send'),
  });
  keywords = ['slack', 'dm', 'message'];
  useCases = ['Send a direct message to a Slack user'];

  async execute(
    input: { userId: string; message: string },
    context: ToolContext
  ): Promise<{ success: boolean }> {
    // Implementation would use context.services?.slack
    return { success: true };
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
const results = registry.searchTools('send message');

// Get tools by category
const messagingTools = registry.getToolsByCategory('messaging');

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
| `messaging` | Slack communication tools      |
| `whatsapp`  | WhatsApp messaging tools       |
| `docs`      | Google Docs/Slides tools       |
| `google`    | Google OAuth tools             |
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
