# @orientbot/mcp-servers

MCP (Model Context Protocol) server implementations for the Orient.

## Overview

This package provides:

- **BaseServer** - Base class for MCP server implementations
- **CoreServer** - Core MCP server with standard tools
- **CodingServer** - MCP server for coding agents
- **AssistantServer** - MCP server for assistant agents
- **ToolExecutor** - Tool execution infrastructure
- **ToolFilter** - Tool filtering based on agent context

## Installation

```bash
pnpm add @orientbot/mcp-servers
```

## Usage

```typescript
import { CoreServer, CodingServer } from '@orientbot/mcp-servers';

// Create a core server
const coreServer = new CoreServer({
  port: 4099,
  // ...
});

await coreServer.start();
```

## Migration Status

This package contains servers migrated from `src/mcp-servers/`:

- `base-server.ts` - Base server class
- `core-server.ts` - Core server implementation
- `coding-server.ts` - Coding server implementation
- `assistant-server.ts` - Assistant server implementation
- `tool-executor.ts` - Tool execution
- `tool-filter.ts` - Tool filtering
