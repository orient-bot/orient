/**
 * Tool Filter
 *
 * Filters tools from the registry based on server configuration.
 * This allows each server type to expose only relevant tools.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getToolRegistry, type ToolCategory, type ToolMetadata } from '@orientbot/agents';
import { ToolDiscoveryService } from '@orientbot/agents';
import { ServerToolConfig } from './types.js';
import { createServiceLogger } from '@orientbot/core';

const logger = createServiceLogger('tool-filter');

/**
 * Filters tools from the registry based on configuration
 */
export function filterTools(config: ServerToolConfig): Tool[] {
  const registry = getToolRegistry();
  const allTools = registry.getAllTools();
  const filteredTools: Tool[] = [];
  const includedNames = new Set<string>();

  // Step 1: Add tools from specified categories
  if (config.categories === 'all') {
    // Include all tools
    for (const toolMeta of allTools) {
      if (!config.excludeTools?.includes(toolMeta.tool.name)) {
        filteredTools.push(toolMeta.tool);
        includedNames.add(toolMeta.tool.name);
      }
    }
  } else {
    // Include tools from specified categories
    for (const category of config.categories) {
      const categoryTools = registry.getToolsByCategory(category);
      for (const toolMeta of categoryTools) {
        if (!config.excludeTools?.includes(toolMeta.tool.name)) {
          if (!includedNames.has(toolMeta.tool.name)) {
            filteredTools.push(toolMeta.tool);
            includedNames.add(toolMeta.tool.name);
          }
        }
      }
    }
  }

  // Step 2: Add explicitly included tools
  if (config.includeTools) {
    for (const toolName of config.includeTools) {
      if (!includedNames.has(toolName)) {
        const toolMeta = registry.getTool(toolName);
        if (toolMeta) {
          filteredTools.push(toolMeta.tool);
          includedNames.add(toolName);
        } else {
          logger.warn('Included tool not found in registry', { toolName });
        }
      }
    }
  }

  // Step 3: Add discover_tools if configured
  if (config.includeDiscovery) {
    const discoveryTool = ToolDiscoveryService.getDiscoveryToolDefinition();
    if (!includedNames.has(discoveryTool.name)) {
      filteredTools.push(discoveryTool);
      includedNames.add(discoveryTool.name);
    }
  }

  logger.info('Tools filtered', {
    totalInRegistry: allTools.length,
    filteredCount: filteredTools.length,
    categories: config.categories === 'all' ? 'all' : config.categories,
    includedExtra: config.includeTools?.length || 0,
    excluded: config.excludeTools?.length || 0,
  });

  return filteredTools;
}

/**
 * Gets tool names that a server exposes
 * Useful for testing and documentation
 */
export function getFilteredToolNames(config: ServerToolConfig): string[] {
  return filterTools(config).map((t) => t.name);
}

/**
 * Checks if a tool name is available for a given server config
 */
export function isToolAvailable(toolName: string, config: ServerToolConfig): boolean {
  // Check exclusions first
  if (config.excludeTools?.includes(toolName)) {
    return false;
  }

  // Check explicit inclusions
  if (config.includeTools?.includes(toolName)) {
    return true;
  }

  // Check discover_tools
  if (toolName === 'discover_tools') {
    return config.includeDiscovery;
  }

  // Check categories
  const registry = getToolRegistry();
  const toolMeta = registry.getTool(toolName);
  if (!toolMeta) {
    return false;
  }

  if (config.categories === 'all') {
    return true;
  }

  return config.categories.includes(toolMeta.category);
}

/**
 * Gets tools grouped by category for a server config
 * Useful for documentation and debugging
 */
export function getToolsByCategory(config: ServerToolConfig): Record<string, string[]> {
  const registry = getToolRegistry();
  const filteredToolNames = new Set(getFilteredToolNames(config));
  const result: Record<string, string[]> = {};

  for (const toolName of filteredToolNames) {
    const toolMeta = registry.getTool(toolName);
    const category = toolMeta?.category || 'system';

    if (!result[category]) {
      result[category] = [];
    }
    result[category].push(toolName);
  }

  // Add discover_tools to system if included
  if (config.includeDiscovery && !result['system']) {
    result['system'] = ['discover_tools'];
  } else if (
    config.includeDiscovery &&
    result['system'] &&
    !result['system'].includes('discover_tools')
  ) {
    result['system'].push('discover_tools');
  }

  return result;
}
