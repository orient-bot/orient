/**
 * Tool Discovery Service
 *
 * Provides intelligent tool discovery through category browsing and semantic search.
 * Implements the "Tool Search Tool" pattern from Anthropic's advanced tool use guide.
 *
 * Exported via @orient/mcp-tools package.
 *
 * @see https://www.anthropic.com/engineering/advanced-tool-use
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  ToolRegistry,
  ToolMetadata,
  ToolCategory,
  CategoryInfo,
  getToolRegistry,
} from './toolRegistry.js';
import { createServiceLogger } from '@orient/core';

const logger = createServiceLogger('tool-discovery');

/**
 * Search result with relevance score
 */
export interface SearchResult {
  tool: Tool;
  category: ToolCategory;
  score: number;
  matchedOn: string[];
}

/**
 * Discovery result - what agents receive
 */
export interface DiscoveryResult {
  mode: 'list_categories' | 'browse' | 'search';
  categories?: CategoryInfo[];
  tools?: Tool[];
  searchResults?: SearchResult[];
  totalMatched?: number;
}

/**
 * Discovery input from agents
 */
export interface DiscoveryInput {
  mode: 'list_categories' | 'browse' | 'search';
  category?: string;
  query?: string;
  intent?: string;
  limit?: number;
}

/**
 * Scoring weights for search relevance
 */
const SCORE_WEIGHTS = {
  exactNameMatch: 100,
  namePartialMatch: 50,
  keywordMatch: 30,
  useCaseMatch: 40,
  descriptionMatch: 15,
  categoryMatch: 10,
};

/**
 * Tool Discovery Service
 */
export class ToolDiscoveryService {
  private registry: ToolRegistry;

  constructor(registry?: ToolRegistry) {
    this.registry = registry || getToolRegistry();
  }

  /**
   * Main discovery entry point - handles all discovery modes
   */
  discover(input: DiscoveryInput): DiscoveryResult {
    const op = logger.startOperation('discover', { mode: input.mode });

    try {
      switch (input.mode) {
        case 'list_categories':
          return this.listCategories();

        case 'browse':
          return this.browseCategory(input.category as ToolCategory);

        case 'search':
          return this.search(input.query || input.intent || '', input.limit);

        default:
          throw new Error(`Unknown discovery mode: ${input.mode}`);
      }
    } finally {
      op.success('Discovery complete', { mode: input.mode });
    }
  }

  /**
   * List all available categories with descriptions
   */
  listCategories(): DiscoveryResult {
    const categories = this.registry.getCategories();

    logger.debug('Listed categories', { count: categories.length });

    return {
      mode: 'list_categories',
      categories,
    };
  }

  /**
   * Browse tools in a specific category
   */
  browseCategory(category: ToolCategory): DiscoveryResult {
    if (!category) {
      throw new Error('Category is required for browse mode');
    }

    const tools = this.registry.getToolsByCategory(category);

    if (tools.length === 0) {
      // Check if it's a valid category
      const validCategories = this.registry.getCategories().map((c) => c.name);
      if (!validCategories.includes(category)) {
        throw new Error(
          `Invalid category: ${category}. Valid categories are: ${validCategories.join(', ')}`
        );
      }
    }

    logger.debug('Browsed category', { category, toolCount: tools.length });

    return {
      mode: 'browse',
      tools: tools.map((m) => m.tool),
      totalMatched: tools.length,
    };
  }

  /**
   * Search for tools using semantic matching
   */
  search(query: string, limit: number = 10): DiscoveryResult {
    if (!query || query.trim().length === 0) {
      throw new Error('Query is required for search mode');
    }

    const allTools = this.registry.getAllTools();
    const normalizedQuery = query.toLowerCase().trim();
    const queryTokens = this.tokenize(normalizedQuery);

    // Score each tool
    const scoredResults: SearchResult[] = [];

    for (const metadata of allTools) {
      const { score, matchedOn } = this.scoreMatch(metadata, normalizedQuery, queryTokens);

      if (score > 0) {
        scoredResults.push({
          tool: metadata.tool,
          category: metadata.category,
          score,
          matchedOn,
        });
      }
    }

    // Sort by score descending
    scoredResults.sort((a, b) => b.score - a.score);

    // Limit results
    const limitedResults = scoredResults.slice(0, limit);

    logger.debug('Search completed', {
      query,
      totalMatched: scoredResults.length,
      returned: limitedResults.length,
      topScore: limitedResults[0]?.score,
    });

    return {
      mode: 'search',
      searchResults: limitedResults,
      tools: limitedResults.map((r) => r.tool),
      totalMatched: scoredResults.length,
    };
  }

  /**
   * Tokenize a string into searchable tokens
   */
  private tokenize(text: string): string[] {
    // Split on whitespace, underscores, and common separators
    return text
      .toLowerCase()
      .split(/[\s_\-.,;:!?'"()[\]{}]+/)
      .filter((token) => token.length > 1);
  }

  /**
   * Score how well a tool matches the query
   */
  private scoreMatch(
    metadata: ToolMetadata,
    normalizedQuery: string,
    queryTokens: string[]
  ): { score: number; matchedOn: string[] } {
    let score = 0;
    const matchedOn: string[] = [];

    const toolName = metadata.tool.name.toLowerCase();
    const description = (metadata.tool.description || '').toLowerCase();

    // 1. Exact name match (highest priority)
    if (toolName === normalizedQuery || toolName.includes(normalizedQuery)) {
      score += SCORE_WEIGHTS.exactNameMatch;
      matchedOn.push('name');
    }

    // 2. Partial name match (tool name contains query tokens)
    for (const token of queryTokens) {
      if (toolName.includes(token)) {
        score += SCORE_WEIGHTS.namePartialMatch;
        if (!matchedOn.includes('name')) matchedOn.push('name');
      }
    }

    // 3. Keyword matches
    for (const keyword of metadata.keywords) {
      const normalizedKeyword = keyword.toLowerCase();

      // Direct keyword match
      if (normalizedQuery.includes(normalizedKeyword)) {
        score += SCORE_WEIGHTS.keywordMatch;
        if (!matchedOn.includes('keyword')) matchedOn.push('keyword');
      }

      // Token matches keyword
      for (const token of queryTokens) {
        if (normalizedKeyword.includes(token) || token.includes(normalizedKeyword)) {
          score += SCORE_WEIGHTS.keywordMatch / 2;
          if (!matchedOn.includes('keyword')) matchedOn.push('keyword');
        }
      }
    }

    // 4. Use case matches (natural language intent matching)
    for (const useCase of metadata.useCases) {
      const normalizedUseCase = useCase.toLowerCase();

      // Check if query is similar to a use case
      const useCaseTokens = this.tokenize(normalizedUseCase);
      let useCaseMatchCount = 0;

      for (const token of queryTokens) {
        for (const useCaseToken of useCaseTokens) {
          if (useCaseToken.includes(token) || token.includes(useCaseToken)) {
            useCaseMatchCount++;
          }
        }
      }

      // Score based on percentage of tokens matched
      if (useCaseMatchCount > 0) {
        const matchRatio = useCaseMatchCount / Math.max(queryTokens.length, useCaseTokens.length);
        score += Math.round(SCORE_WEIGHTS.useCaseMatch * matchRatio);
        if (!matchedOn.includes('useCase')) matchedOn.push('useCase');
      }
    }

    // 5. Description matches
    for (const token of queryTokens) {
      if (description.includes(token)) {
        score += SCORE_WEIGHTS.descriptionMatch;
        if (!matchedOn.includes('description')) matchedOn.push('description');
      }
    }

    // 6. Category matches
    const categoryInfo = this.registry.getCategories().find((c) => c.name === metadata.category);
    if (categoryInfo) {
      for (const catKeyword of categoryInfo.keywords) {
        if (normalizedQuery.includes(catKeyword) || queryTokens.includes(catKeyword)) {
          score += SCORE_WEIGHTS.categoryMatch;
          if (!matchedOn.includes('category')) matchedOn.push('category');
          break;
        }
      }
    }

    return { score, matchedOn };
  }

  /**
   * Get the discovery meta-tool definition
   * This is the only tool exposed upfront to agents
   */
  static getDiscoveryToolDefinition(): Tool {
    return {
      name: 'discover_tools',
      description: `Find and discover available tools by category or natural language search.

USE THIS TOOL FIRST before attempting to use any other tools. This tool helps you find the right tools for your task.

Modes:
- "list_categories": Get all tool categories with descriptions
- "browse": Get all tools in a specific category  
- "search": Find tools by natural language query

Examples:
- To see what tool domains exist: { "mode": "list_categories" }
- To see all calendar tools: { "mode": "browse", "category": "calendar" }
- To find tools for sending messages: { "mode": "search", "query": "send message to user" }
- To find tools for weekly planning: { "mode": "search", "intent": "plan the user's week and check availability" }`,
      inputSchema: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['list_categories', 'browse', 'search'],
            description: 'Discovery mode: list_categories, browse, or search',
          },
          category: {
            type: 'string',
            enum: ['jira', 'messaging', 'whatsapp', 'docs', 'google', 'system'],
            description: 'For browse mode: the category to list tools from',
          },
          query: {
            type: 'string',
            description: 'For search mode: natural language query to find relevant tools',
          },
          intent: {
            type: 'string',
            description:
              'For search mode: describe what you want to accomplish to find relevant tools',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of tools to return in search mode (default: 10)',
          },
        },
        required: ['mode'],
      },
    };
  }
}

/**
 * Format discovery results for display to agents
 */
export function formatDiscoveryResult(result: DiscoveryResult): string {
  switch (result.mode) {
    case 'list_categories':
      return JSON.stringify(
        {
          message: 'Available tool categories. Use browse mode with a category to see tools.',
          categories: result.categories?.map((c) => ({
            name: c.name,
            description: c.description,
            toolCount: c.toolCount,
          })),
        },
        null,
        2
      );

    case 'browse':
      return JSON.stringify(
        {
          message: `Found ${result.totalMatched} tools in category.`,
          tools: result.tools,
        },
        null,
        2
      );

    case 'search':
      return JSON.stringify(
        {
          message: `Found ${result.totalMatched} matching tools. Showing top ${result.tools?.length || 0}.`,
          results: result.searchResults?.map((r) => ({
            name: r.tool.name,
            description: r.tool.description,
            category: r.category,
            relevance: r.score,
            matchedOn: r.matchedOn,
          })),
          // Include full tool definitions for immediate use
          tools: result.tools,
        },
        null,
        2
      );

    default:
      return JSON.stringify(result, null, 2);
  }
}

// Export a singleton instance
let discoveryInstance: ToolDiscoveryService | null = null;

export function getToolDiscoveryService(): ToolDiscoveryService {
  if (!discoveryInstance) {
    discoveryInstance = new ToolDiscoveryService();
  }
  return discoveryInstance;
}
