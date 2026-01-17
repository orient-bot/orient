/**
 * Prompt Service
 *
 * Provides a high-level interface for managing system prompts across WhatsApp and Slack.
 * Wraps the database operations and provides caching for performance.
 */

import { createServiceLogger } from '@orient/core';
import type {
  PromptPlatform,
  SystemPromptRecord,
  SystemPromptWithInfo,
  PromptServiceConfig,
  PromptDatabaseInterface,
} from '../types.js';

const logger = createServiceLogger('prompt-service');

/**
 * Default prompts embedded in the service (fallback if database not seeded)
 */
const EMBEDDED_DEFAULT_PROMPTS: Record<PromptPlatform, string> = {
  whatsapp: `You are an Orient Project Management assistant. You have access to JIRA, Slack, WhatsApp, Google Slides, and Mini-Apps tools through the orienter MCP server. Focus on:

- Querying and managing JIRA issues for the YOUR_COMPONENT component
- Checking blockers, SLA breaches, and sprint progress
- Sending Slack messages and looking up users
- Searching WhatsApp messages and conversations
- Updating weekly presentations
- Creating Mini-Apps (Calendly-like schedulers, forms, polls, dashboards)

MINI-APPS CREATION:
When asked to create an app, form, scheduler, poll, or dashboard:
1. Use ai_first_create_app with a detailed prompt describing the app
2. NEVER write code directly - always use the tool
3. The tool generates the app and creates a PR for review
4. Use ai_first_list_apps to see existing apps

Always provide concise, actionable summaries when reporting on project status. Use the discover_tools tool first if you need to find the right tool for a task.`,

  slack: `You are an Orient Project Management assistant. You have access to JIRA, Slack, WhatsApp, Google Slides, and Mini-Apps tools through the orienter MCP server. Focus on:

- Querying and managing JIRA issues for the YOUR_COMPONENT component
- Checking blockers, SLA breaches, and sprint progress
- Sending Slack messages and looking up users
- Searching WhatsApp messages and conversations
- Updating weekly presentations
- Creating Mini-Apps (Calendly-like schedulers, forms, polls, dashboards)

MINI-APPS CREATION:
When asked to create an app, form, scheduler, poll, or dashboard:
1. Use ai_first_create_app with a detailed prompt describing the app
2. NEVER write code directly - always use the tool
3. The tool generates the app and creates a PR for review

CRITICAL FORMATTING RULES FOR SLACK:
You are responding in Slack, so use Slack's mrkdwn format, NOT standard markdown:
- Bold text: Use *single asterisks* (not **double**)
- Italic text: Use _underscores_ (not *asterisks*)
- Code/monospace: Use \`backticks\` (same as markdown)
- DO NOT use markdown headers like ## or ###. Instead, use bold text
- Lists: Use bullet points with • or -
- Links: Use <url|text> format
- Emoji: Use Slack emoji codes like :white_check_mark: :warning: :rocket:

Always provide concise, actionable summaries when reporting on project status.`,
};

interface CacheEntry {
  prompt: string;
  timestamp: number;
}

export class PromptService {
  private db: PromptDatabaseInterface;
  private cache: Map<string, CacheEntry> = new Map();
  private cacheEnabled: boolean;
  private cacheTtlMs: number;

  constructor(db: PromptDatabaseInterface, config?: PromptServiceConfig) {
    this.db = db;
    this.cacheEnabled = config?.cacheEnabled ?? true;
    this.cacheTtlMs = config?.cacheTtlMs ?? 60000; // 1 minute default
    logger.info('Prompt service initialized', { cacheEnabled: this.cacheEnabled });
  }

  /**
   * Get cache key for a prompt lookup
   */
  private getCacheKey(platform: PromptPlatform, chatId: string): string {
    return `${platform}:${chatId}`;
  }

  /**
   * Get prompt from cache if valid
   */
  private getFromCache(platform: PromptPlatform, chatId: string): string | undefined {
    if (!this.cacheEnabled) return undefined;

    const key = this.getCacheKey(platform, chatId);
    const entry = this.cache.get(key);

    if (entry && Date.now() - entry.timestamp < this.cacheTtlMs) {
      return entry.prompt;
    }

    // Remove stale entry
    if (entry) {
      this.cache.delete(key);
    }

    return undefined;
  }

  /**
   * Set prompt in cache
   */
  private setInCache(platform: PromptPlatform, chatId: string, prompt: string): void {
    if (!this.cacheEnabled) return;

    const key = this.getCacheKey(platform, chatId);
    this.cache.set(key, { prompt, timestamp: Date.now() });
  }

  /**
   * Invalidate cache for a specific chat or entire platform
   */
  invalidateCache(platform: PromptPlatform, chatId?: string): void {
    if (chatId) {
      this.cache.delete(this.getCacheKey(platform, chatId));
      // Also invalidate default since it affects fallback
      this.cache.delete(this.getCacheKey(platform, '*'));
    } else {
      // Invalidate all entries for this platform
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${platform}:`)) {
          this.cache.delete(key);
        }
      }
    }
  }

  /**
   * Get the system prompt for a specific chat/channel
   * Returns custom prompt if set, otherwise platform default, otherwise embedded default
   */
  async getPromptForChat(platform: PromptPlatform, chatId: string): Promise<string> {
    // Check cache first
    const cached = this.getFromCache(platform, chatId);
    if (cached) {
      return cached;
    }

    try {
      // Try database lookup
      const prompt = await this.db.getSystemPromptText(platform, chatId);

      if (prompt) {
        this.setInCache(platform, chatId, prompt);
        return prompt;
      }
    } catch (error) {
      logger.warn('Failed to get prompt from database, using embedded default', {
        platform,
        chatId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Fall back to embedded default
    const embeddedDefault = EMBEDDED_DEFAULT_PROMPTS[platform];
    this.setInCache(platform, chatId, embeddedDefault);
    return embeddedDefault;
  }

  /**
   * Check if a chat has a custom prompt (not using default)
   */
  async hasCustomPrompt(platform: PromptPlatform, chatId: string): Promise<boolean> {
    const prompt = await this.db.getSystemPrompt(platform, chatId);
    return prompt !== undefined && prompt.chatId !== '*';
  }

  /**
   * Set or update system prompt for a chat/channel
   */
  async setPrompt(
    platform: PromptPlatform,
    chatId: string,
    promptText: string
  ): Promise<SystemPromptRecord> {
    const result = await this.db.setSystemPrompt(platform, chatId, promptText);
    this.invalidateCache(platform, chatId);
    return result;
  }

  /**
   * Set platform default prompt
   */
  async setDefaultPrompt(
    platform: PromptPlatform,
    promptText: string
  ): Promise<SystemPromptRecord> {
    const result = await this.db.setSystemPrompt(platform, '*', promptText);
    // Invalidate all entries for this platform since default affects all
    this.invalidateCache(platform);
    return result;
  }

  /**
   * Delete custom prompt for a chat (reverts to platform default)
   */
  async deletePrompt(platform: PromptPlatform, chatId: string): Promise<boolean> {
    if (chatId === '*') {
      logger.warn('Cannot delete platform default prompt');
      return false;
    }

    const result = await this.db.deleteSystemPrompt(platform, chatId);
    this.invalidateCache(platform, chatId);
    return result;
  }

  /**
   * Get the default prompt for a platform
   */
  async getDefaultPrompt(platform: PromptPlatform): Promise<string> {
    const record = await this.db.getDefaultPrompt(platform);
    return record?.promptText ?? EMBEDDED_DEFAULT_PROMPTS[platform];
  }

  /**
   * Get default prompts for all platforms
   */
  async getAllDefaultPrompts(): Promise<Record<PromptPlatform, string>> {
    const dbDefaults = await this.db.getDefaultPrompts();

    return {
      whatsapp: dbDefaults.whatsapp?.promptText ?? EMBEDDED_DEFAULT_PROMPTS.whatsapp,
      slack: dbDefaults.slack?.promptText ?? EMBEDDED_DEFAULT_PROMPTS.slack,
    };
  }

  /**
   * List all custom prompts, optionally filtered by platform
   */
  async listPrompts(platform?: PromptPlatform): Promise<SystemPromptWithInfo[]> {
    return this.db.listSystemPrompts(platform);
  }

  /**
   * Seed default prompts in the database if they don't exist
   */
  async seedDefaults(): Promise<void> {
    await this.db.seedDefaultPrompts();
  }

  /**
   * Get embedded default prompt (for reference when editing)
   */
  getEmbeddedDefault(platform: PromptPlatform): string {
    return EMBEDDED_DEFAULT_PROMPTS[platform];
  }
}

// Singleton instance
let promptServiceInstance: PromptService | null = null;

/**
 * Create a prompt service instance
 */
export function createPromptService(
  db: PromptDatabaseInterface,
  config?: PromptServiceConfig
): PromptService {
  return new PromptService(db, config);
}

/**
 * Get the global prompt service instance (must be initialized first)
 */
export function getPromptService(): PromptService {
  if (!promptServiceInstance) {
    throw new Error('Prompt service not initialized. Call initializePromptService first.');
  }
  return promptServiceInstance;
}

/**
 * Initialize the global prompt service instance
 */
export function initializePromptService(
  db: PromptDatabaseInterface,
  config?: PromptServiceConfig
): PromptService {
  promptServiceInstance = createPromptService(db, config);
  return promptServiceInstance;
}

/**
 * Check if prompt service has been initialized
 */
export function isPromptServiceInitialized(): boolean {
  return promptServiceInstance !== null;
}
