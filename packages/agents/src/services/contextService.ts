/**
 * Context Persistence Service
 *
 * Provides persistent storage for agent context per chat/channel.
 * Enables agents to remember user preferences, track activity, and maintain state across sessions.
 *
 * Key responsibilities:
 * - CRUD operations for chat context
 *
 * Exported via @orientbot/agents package.
 * - Deep merge updates for partial context changes
 * - Activity history management with capping
 * - Format context for system prompt injection
 */

import { getDatabase, eq, and } from '@orientbot/database';
import { chatContext } from '@orientbot/database';
import { createServiceLogger } from '@orientbot/core';

const logger = createServiceLogger('context-service');

// ============================================
// TYPES
// ============================================

export type Platform = 'whatsapp' | 'slack' | 'opencode' | 'cursor';

/**
 * Activity record for tracking recent user/agent interactions
 */
export interface ActivityRecord {
  timestamp: string;
  type: 'user_action' | 'agent_action' | 'task_completed' | 'preference_updated' | 'custom';
  description: string;
  metadata?: Record<string, unknown>;
}

/**
 * Persistent agent context structure (flexible JSON)
 * All fields are optional to allow gradual population
 */
export interface PersistentContext {
  /** User identity information */
  identity?: {
    name?: string;
    role?: string;
    team?: string;
    timezone?: string;
    preferredLanguage?: string;
    [key: string]: unknown;
  };

  /** User preferences and settings */
  userProfile?: {
    communicationStyle?: 'formal' | 'casual' | 'technical';
    responseLength?: 'brief' | 'detailed' | 'verbose';
    notificationPreferences?: Record<string, boolean>;
    customPreferences?: Record<string, unknown>;
    [key: string]: unknown;
  };

  /** Recent activity history (capped at MAX_ACTIVITY_RECORDS) */
  recentActivity?: ActivityRecord[];

  /** Current working context */
  currentState?: {
    activeProject?: string;
    activeTask?: string;
    lastTopic?: string;
    workingDirectory?: string;
    openItems?: string[];
    [key: string]: unknown;
  };

  /** Additional custom fields */
  [key: string]: unknown;
}

/**
 * Database row for chat context
 */
export interface ChatContextRow {
  id: number;
  chatId: string;
  platform: string;
  contextJson: string;
  version: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

// ============================================
// CONSTANTS
// ============================================

const MAX_ACTIVITY_RECORDS = 20;
const DEFAULT_CONTEXT: PersistentContext = {
  identity: {},
  userProfile: {},
  recentActivity: [],
  currentState: {},
};

// ============================================
// CONTEXT SERVICE CLASS
// ============================================

export class ContextService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getDb(): Promise<any> {
    return await getDatabase();
  }

  // ============================================
  // CRUD OPERATIONS
  // ============================================

  /**
   * Get context for a chat/channel, creating default if not exists
   */
  async getContext(platform: Platform, chatId: string): Promise<PersistentContext> {
    const op = logger.startOperation('getContext', { platform, chatId });

    try {
      const result = await (
        await this.getDb()
      )
        .select()
        .from(chatContext)
        .where(and(eq(chatContext.platform, platform), eq(chatContext.chatId, chatId)));

      if (result.length > 0) {
        const row = result[0];
        const context = this.parseContextJson(row.contextJson);
        op.success('Context retrieved');
        return context;
      }

      // Create default context if not exists
      const defaultContext = { ...DEFAULT_CONTEXT };
      await (await this.getDb()).insert(chatContext).values({
        platform,
        chatId,
        contextJson: JSON.stringify(defaultContext),
        version: 1,
      });

      op.success('Default context created');
      return defaultContext;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Update context with deep merge of provided updates
   */
  async updateContext(
    platform: Platform,
    chatId: string,
    updates: Partial<PersistentContext>
  ): Promise<PersistentContext> {
    const op = logger.startOperation('updateContext', { platform, chatId });

    try {
      // Get existing context
      const existing = await this.getContext(platform, chatId);

      // Deep merge updates
      const merged = this.deepMerge(existing, updates);

      // Update in database
      await (
        await this.getDb()
      )
        .update(chatContext)
        .set({
          contextJson: JSON.stringify(merged),
          updatedAt: new Date(),
        })
        .where(and(eq(chatContext.platform, platform), eq(chatContext.chatId, chatId)));

      op.success('Context updated');
      return merged;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Add an activity record to the context history
   * Automatically caps at MAX_ACTIVITY_RECORDS
   */
  async addActivity(
    platform: Platform,
    chatId: string,
    activity: Omit<ActivityRecord, 'timestamp'>
  ): Promise<PersistentContext> {
    const op = logger.startOperation('addActivity', { platform, chatId, type: activity.type });

    try {
      const existing = await this.getContext(platform, chatId);

      const newActivity: ActivityRecord = {
        ...activity,
        timestamp: new Date().toISOString(),
      };

      // Prepend new activity and cap at MAX_ACTIVITY_RECORDS
      const recentActivity = [newActivity, ...(existing.recentActivity || [])].slice(
        0,
        MAX_ACTIVITY_RECORDS
      );

      const updated = await this.updateContext(platform, chatId, { recentActivity });

      op.success('Activity added', { activityCount: recentActivity.length });
      return updated;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Clear context for a chat/channel (resets to default)
   */
  async clearContext(platform: Platform, chatId: string): Promise<PersistentContext> {
    const op = logger.startOperation('clearContext', { platform, chatId });

    try {
      const defaultContext = { ...DEFAULT_CONTEXT };

      await (
        await this.getDb()
      )
        .update(chatContext)
        .set({
          contextJson: JSON.stringify(defaultContext),
          version: 1,
          updatedAt: new Date(),
        })
        .where(and(eq(chatContext.platform, platform), eq(chatContext.chatId, chatId)));

      op.success('Context cleared');
      return defaultContext;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Delete context for a chat/channel entirely
   */
  async deleteContext(platform: Platform, chatId: string): Promise<boolean> {
    const op = logger.startOperation('deleteContext', { platform, chatId });

    try {
      const result = await (
        await this.getDb()
      )
        .delete(chatContext)
        .where(and(eq(chatContext.platform, platform), eq(chatContext.chatId, chatId)))
        .returning();

      const deleted = result.length > 0;
      deleted ? op.success('Context deleted') : op.failure('Context not found');
      return deleted;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  // ============================================
  // PROMPT FORMATTING
  // ============================================

  /**
   * Format context for injection into system prompt
   * Returns human-readable markdown
   */
  formatForPrompt(context: PersistentContext): string {
    const sections: string[] = [];

    // Identity section
    if (context.identity && Object.keys(context.identity).length > 0) {
      const identity = context.identity;
      const identityLines: string[] = [];

      if (identity.name) identityLines.push(`- **Name**: ${identity.name}`);
      if (identity.role) identityLines.push(`- **Role**: ${identity.role}`);
      if (identity.team) identityLines.push(`- **Team**: ${identity.team}`);
      if (identity.timezone) identityLines.push(`- **Timezone**: ${identity.timezone}`);
      if (identity.preferredLanguage)
        identityLines.push(`- **Preferred Language**: ${identity.preferredLanguage}`);

      // Add any custom identity fields
      for (const [key, value] of Object.entries(identity)) {
        if (!['name', 'role', 'team', 'timezone', 'preferredLanguage'].includes(key) && value) {
          identityLines.push(`- **${this.formatKey(key)}**: ${value}`);
        }
      }

      if (identityLines.length > 0) {
        sections.push(`### User Identity\n${identityLines.join('\n')}`);
      }
    }

    // User preferences section
    if (context.userProfile && Object.keys(context.userProfile).length > 0) {
      const profile = context.userProfile;
      const profileLines: string[] = [];

      if (profile.communicationStyle)
        profileLines.push(`- **Communication Style**: ${profile.communicationStyle}`);
      if (profile.responseLength)
        profileLines.push(`- **Response Length**: ${profile.responseLength}`);

      // Add custom preferences
      if (profile.customPreferences) {
        for (const [key, value] of Object.entries(profile.customPreferences)) {
          profileLines.push(`- **${this.formatKey(key)}**: ${JSON.stringify(value)}`);
        }
      }

      if (profileLines.length > 0) {
        sections.push(`### User Preferences\n${profileLines.join('\n')}`);
      }
    }

    // Current state section
    if (context.currentState && Object.keys(context.currentState).length > 0) {
      const state = context.currentState;
      const stateLines: string[] = [];

      if (state.activeProject) stateLines.push(`- **Active Project**: ${state.activeProject}`);
      if (state.activeTask) stateLines.push(`- **Active Task**: ${state.activeTask}`);
      if (state.lastTopic) stateLines.push(`- **Last Topic**: ${state.lastTopic}`);
      if (state.workingDirectory)
        stateLines.push(`- **Working Directory**: ${state.workingDirectory}`);
      if (state.openItems && state.openItems.length > 0) {
        stateLines.push(`- **Open Items**: ${state.openItems.join(', ')}`);
      }

      if (stateLines.length > 0) {
        sections.push(`### Current Context\n${stateLines.join('\n')}`);
      }
    }

    // Recent activity section (last 5 for prompt brevity)
    if (context.recentActivity && context.recentActivity.length > 0) {
      const recentActivities = context.recentActivity.slice(0, 5);
      const activityLines = recentActivities.map((a) => {
        const time = new Date(a.timestamp).toLocaleString();
        return `- [${time}] ${a.description}`;
      });

      sections.push(`### Recent Activity\n${activityLines.join('\n')}`);
    }

    if (sections.length === 0) {
      return '';
    }

    return `## Persistent Context\n\n${sections.join('\n\n')}`;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Parse JSON context string, returning default on error
   */
  private parseContextJson(json: string): PersistentContext {
    try {
      return JSON.parse(json) as PersistentContext;
    } catch {
      logger.warn('Failed to parse context JSON, using default', { json: json.slice(0, 100) });
      return { ...DEFAULT_CONTEXT };
    }
  }

  /**
   * Deep merge two objects
   */
  private deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
    const result = { ...target };

    for (const key of Object.keys(source) as Array<keyof T>) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        // Recursively merge objects
        result[key] = this.deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        ) as T[keyof T];
      } else if (sourceValue !== undefined) {
        // Override with source value
        result[key] = sourceValue as T[keyof T];
      }
    }

    return result;
  }

  /**
   * Format camelCase key to human-readable format
   */
  private formatKey(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * Get statistics about stored contexts
   */
  async getStats(): Promise<{
    totalContexts: number;
    byPlatform: Record<string, number>;
  }> {
    const results = await (await this.getDb()).select().from(chatContext);

    const byPlatform: Record<string, number> = {};
    for (const row of results) {
      byPlatform[row.platform] = (byPlatform[row.platform] || 0) + 1;
    }

    return {
      totalContexts: results.length,
      byPlatform,
    };
  }
}

// ============================================
// SINGLETON
// ============================================

let serviceInstance: ContextService | null = null;

export function getContextService(): ContextService {
  if (!serviceInstance) {
    serviceInstance = new ContextService();
  }
  return serviceInstance;
}

export function resetContextService(): void {
  serviceInstance = null;
}
