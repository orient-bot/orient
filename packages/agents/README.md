# @orient-bot/agents

AI agent services for the Orient.

## Overview

This package provides:

- **AgentService** - Core agent orchestration and message processing
- **ToolCallingService** - Tool execution and loop management
- **AgentRegistry** - Dynamic agent configuration and context resolution
- **ProgressiveResponder** - Streaming response handling

## Installation

```bash
pnpm add @orient-bot/agents
```

## Usage

```typescript
import { AgentService, ToolCallingService, AgentRegistry } from '@orient-bot/agents';

// Initialize the agent service
const agentService = new AgentService({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  // ...
});

// Process a message
const response = await agentService.processMessage(
  'What issues are in progress?',
  userId,
  channelId
);
```

## Migration Status

This package contains services migrated from `src/services/`:

- `agentService.ts` - Core agent service
- `whatsappAgentService.ts` - WhatsApp-specific agent
- `toolCallingService.ts` - Tool execution
- `agentRegistry.ts` - Agent configuration
- `agentContextLoader.ts` - Context loading
- `toolDiscovery.ts` - Tool discovery
- `toolRegistry.ts` - Tool registration
- `progressiveResponder.ts` - Streaming responses
- `contextService.ts` - Context management
