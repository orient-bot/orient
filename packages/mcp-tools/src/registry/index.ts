/**
 * Tool Registry
 *
 * Central registry for all MCP tools with metadata, categories, and search capabilities.
 * Implements the "Tool Search Tool" pattern from Anthropic's advanced tool use guide.
 */

import { createServiceLogger } from '@orientbot/core';
import type {
  ToolCategory,
  ToolMetadata,
  ToolHandler,
  CategoryInfo,
  ToolSearchResult,
} from '../types.js';

const logger = createServiceLogger('tool-registry');

/**
 * Category descriptions for discovery
 */
const CATEGORY_DESCRIPTIONS: Record<ToolCategory, string> = {
  messaging: 'Slack communication tools for channels and messages',
  whatsapp: 'WhatsApp messaging tools for conversations and media',
  docs: 'Google Docs/Slides tools for presentations and documents',
  google: 'Google Workspace tools for Calendar, Gmail, Tasks, and more',
  system: 'System tools for configuration, health, and skills',
  media: 'Media generation tools for images, mascot variations, and visual assets',
};

/**
 * Category keywords for matching
 */
const CATEGORY_KEYWORDS: Record<ToolCategory, string[]> = {
  messaging: ['slack', 'channel', 'message', 'dm', 'thread', 'notification'],
  whatsapp: ['whatsapp', 'phone', 'chat', 'group', 'contact', 'poll'],
  docs: ['slides', 'presentation', 'document', 'sheets', 'spreadsheet'],
  google: ['calendar', 'gmail', 'tasks', 'email', 'event', 'meeting', 'schedule'],
  system: ['config', 'health', 'skill', 'discover', 'tool', 'setup'],
  media: ['image', 'mascot', 'avatar', 'generate', 'variation', 'picture', 'visual', 'art'],
};

/**
 * Tool Registry - Central store for all tool definitions with rich metadata
 */
export class ToolRegistry {
  private tools: Map<string, ToolMetadata> = new Map();
  private handlers: Map<string, ToolHandler> = new Map();
  private categoryIndex: Map<ToolCategory, Set<string>> = new Map();
  private initialized = false;

  constructor() {
    // Initialize category index
    const categories: ToolCategory[] = [
      'messaging',
      'whatsapp',
      'docs',
      'google',
      'system',
      'media',
    ];
    for (const cat of categories) {
      this.categoryIndex.set(cat, new Set());
    }
  }

  /**
   * Register a tool with its metadata
   */
  registerTool(metadata: ToolMetadata, handler?: ToolHandler): void {
    const name = metadata.tool.name;
    this.tools.set(name, metadata);

    if (handler) {
      this.handlers.set(name, handler);
    }

    // Add to category index
    const categorySet = this.categoryIndex.get(metadata.category);
    if (categorySet) {
      categorySet.add(name);
    }

    logger.debug('Registered tool', { name, category: metadata.category });
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): ToolMetadata | undefined {
    return this.tools.get(name);
  }

  /**
   * Get a tool handler by name
   */
  getHandler(name: string): ToolHandler | undefined {
    return this.handlers.get(name);
  }

  /**
   * Get all tools in a category
   */
  getToolsByCategory(category: ToolCategory): ToolMetadata[] {
    const toolNames = this.categoryIndex.get(category);
    if (!toolNames) return [];

    return Array.from(toolNames)
      .map((name) => this.tools.get(name))
      .filter((t): t is ToolMetadata => t !== undefined);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): ToolMetadata[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all tool names
   */
  getAllToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get category information
   */
  getCategoryInfo(category: ToolCategory): CategoryInfo {
    const tools = this.getToolsByCategory(category);
    return {
      name: category,
      description: CATEGORY_DESCRIPTIONS[category],
      toolCount: tools.length,
      keywords: CATEGORY_KEYWORDS[category],
    };
  }

  /**
   * Get all categories with their information
   */
  getAllCategories(): CategoryInfo[] {
    const categories: ToolCategory[] = [
      'messaging',
      'whatsapp',
      'docs',
      'google',
      'system',
      'media',
    ];
    return categories.map((cat) => this.getCategoryInfo(cat));
  }

  /**
   * Search tools by query
   * Uses keyword and use case matching
   */
  searchTools(query: string, limit = 10): ToolSearchResult[] {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);
    const results: ToolSearchResult[] = [];

    for (const tool of this.tools.values()) {
      let score = 0;
      const matchedKeywords: string[] = [];

      // Check tool name match
      if (tool.tool.name.toLowerCase().includes(queryLower)) {
        score += 10;
      }

      // Check description match
      if (tool.tool.description?.toLowerCase().includes(queryLower)) {
        score += 5;
      }

      // Check keyword matches
      for (const keyword of tool.keywords) {
        const keywordLower = keyword.toLowerCase();
        if (queryLower.includes(keywordLower) || keywordLower.includes(queryLower)) {
          score += 3;
          matchedKeywords.push(keyword);
        }
        // Also check individual query words
        for (const word of queryWords) {
          if (keywordLower.includes(word) || word.includes(keywordLower)) {
            score += 1;
            if (!matchedKeywords.includes(keyword)) {
              matchedKeywords.push(keyword);
            }
          }
        }
      }

      // Check use case matches
      for (const useCase of tool.useCases) {
        const useCaseLower = useCase.toLowerCase();
        if (useCaseLower.includes(queryLower)) {
          score += 4;
        }
        for (const word of queryWords) {
          if (useCaseLower.includes(word)) {
            score += 1;
          }
        }
      }

      if (score > 0) {
        results.push({ tool, score, matchedKeywords });
      }
    }

    // Sort by score descending, then by name
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.tool.tool.name.localeCompare(b.tool.tool.name);
    });

    return results.slice(0, limit);
  }

  /**
   * Mark registry as initialized
   */
  markInitialized(): void {
    this.initialized = true;
    logger.info('Tool registry initialized', { toolCount: this.tools.size });
  }

  /**
   * Check if registry is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalTools: number;
    byCategory: Record<ToolCategory, number>;
    initialized: boolean;
  } {
    const byCategory: Record<ToolCategory, number> = {
      messaging: 0,
      whatsapp: 0,
      docs: 0,
      google: 0,
      system: 0,
      media: 0,
    };

    for (const [category, tools] of this.categoryIndex) {
      byCategory[category] = tools.size;
    }

    return {
      totalTools: this.tools.size,
      byCategory,
      initialized: this.initialized,
    };
  }

  /**
   * Clear all registered tools (for testing)
   */
  clear(): void {
    this.tools.clear();
    this.handlers.clear();
    for (const set of this.categoryIndex.values()) {
      set.clear();
    }
    this.initialized = false;
    logger.debug('Tool registry cleared');
  }
}

// Singleton instance
let registryInstance: ToolRegistry | null = null;

/**
 * Get the global tool registry instance
 */
export function getToolRegistry(): ToolRegistry {
  if (!registryInstance) {
    registryInstance = new ToolRegistry();
  }
  return registryInstance;
}

/**
 * Reset the global registry (for testing)
 */
export function resetToolRegistry(): void {
  if (registryInstance) {
    registryInstance.clear();
  }
  registryInstance = null;
}
