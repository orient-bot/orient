/**
 * @orientbot/mcp-tools
 *
 * Portable MCP tools and registry for the Orient.
 *
 * This package provides:
 * - Base tool class for creating MCP-compatible tools
 * - Tool registry with search and discovery
 * - Tool context factory for service injection
 * - System tools for health and config
 */

// Re-export types
export type {
  ToolCategory,
  ToolContext,
  ToolResult,
  ToolMetadata,
  ToolHandler,
  ToolRegistration,
  CategoryInfo,
  ToolSearchResult,
  ToolServices,
  SlackServiceInterface,
  WhatsAppServiceInterface,
} from './types.js';

// Re-export tools module
export { MCPTool, createTool, createToolContext, clearContextCache } from './tools/index.js';

// Re-export registry module
export { ToolRegistry, getToolRegistry, resetToolRegistry } from './registry/index.js';

// Re-export System tools
export {
  HealthCheckTool,
  healthCheckTool,
  GetConfigTool,
  getConfigTool,
} from './tools/system/index.js';

// Re-export Slack tools
export {
  SlackLookupUserTool,
  slackLookupUserTool,
  SlackSendDMTool,
  slackSendDMTool,
  SlackSendChannelMessageTool,
  slackSendChannelMessageTool,
} from './tools/slack/index.js';

// Re-export Docs tools
export {
  GetPresentationTool,
  getPresentationTool,
  UpdateTextTool,
  updateTextTool,
} from './tools/docs/index.js';

// Re-export Media tools
export {
  GenerateMascotTool,
  GenerateVideoTool,
  generateMascotTool,
  generateVideoTool,
} from './tools/media/index.js';

// Re-export Google Slides tools (MCP server delegation)
export {
  googleSlidesTools,
  isGoogleSlidesTool,
  handleGoogleSlidesToolCall,
  type SlidesToolDeps,
  type ToolResponse,
} from './tools/google/index.js';

// Re-export Config tools
export {
  getPendingActionsStore,
  resetPendingActionsStore,
  confirmationTools,
  permissionTools,
  promptTools,
  secretTools,
  agentTools,
  scheduleTools,
  allConfigTools,
} from './tools/config/index.js';

// Re-export Agent tools (stubs - migration pending)
export { getAgentContextTool, listAgentsTool, handoffToAgentTool } from './tools/agents/index.js';

// Re-export Context tools (stubs - migration pending)
export { readContextTool, updateContextTool } from './tools/context/index.js';
