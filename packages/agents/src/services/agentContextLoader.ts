/**
 * Agent Context Loader
 *
 * Bridges the AgentRegistry with runtime agent services.
 * Provides context-aware configuration loading for Slack and WhatsApp agents.
 *
 * Exported via @orient/agents package.
 */

import { getAgentRegistry, AgentContext } from './agentRegistry.js';
import { getContextService, Platform } from './contextService.js';
import { createServiceLogger } from '@orient/core';
import fs from 'fs/promises';
import path from 'path';

const logger = createServiceLogger('agent-context-loader');

/**
 * Loaded agent configuration with skill content
 */
export interface LoadedAgentConfig {
  agentId: string;
  agentName: string;
  model: string;
  systemPromptEnhancement: string;
  skills: string[];
  allowedToolPatterns: string[];
  deniedToolPatterns: string[];
  askToolPatterns: string[];
}

/**
 * Cache for loaded configurations
 */
const configCache: Map<string, { config: LoadedAgentConfig; loadedAt: Date }> = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load agent configuration for a given platform
 */
export async function loadAgentConfig(
  platform: 'whatsapp' | 'slack' | 'opencode' | 'cursor',
  options?: {
    chatId?: string;
    channelId?: string;
    environment?: string;
    forceRefresh?: boolean;
  }
): Promise<LoadedAgentConfig | null> {
  const cacheKey = `${platform}:${options?.chatId || options?.channelId || 'default'}`;

  // Check cache
  if (!options?.forceRefresh) {
    const cached = configCache.get(cacheKey);
    if (cached && Date.now() - cached.loadedAt.getTime() < CACHE_TTL_MS) {
      logger.debug('Using cached agent config', { cacheKey });
      return cached.config;
    }
  }

  const op = logger.startOperation('loadAgentConfig', { platform, ...options });

  try {
    const registry = getAgentRegistry();

    // Get agent for this context
    const context = await registry.getAgentForContext({
      platform,
      chatId: options?.chatId,
      channelId: options?.channelId,
      environment: options?.environment || process.env.DEPLOY_ENV || 'local',
    });

    if (!context) {
      logger.warn('No agent found for context', { platform, cacheKey });
      op.failure('No agent found');
      return null;
    }

    // Load skill content for system prompt enhancement
    const skillContent = await loadSkillContent(context.skills);

    // Determine chatId for context (use chatId or channelId)
    const chatIdForContext = options?.chatId || options?.channelId;

    const config: LoadedAgentConfig = {
      agentId: context.agent.id,
      agentName: context.agent.name,
      model: context.model,
      systemPromptEnhancement: await buildSystemPromptEnhancement(
        context,
        skillContent,
        platform,
        chatIdForContext
      ),
      skills: context.skills,
      allowedToolPatterns: context.allowedTools,
      deniedToolPatterns: context.deniedTools,
      askToolPatterns: context.askTools,
    };

    // Cache the result
    configCache.set(cacheKey, { config, loadedAt: new Date() });

    op.success('Agent config loaded', {
      agentId: config.agentId,
      skillCount: config.skills.length,
    });

    return config;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error));
    return null;
  }
}

/**
 * Load skill content from filesystem
 */
async function loadSkillContent(skillNames: string[]): Promise<Map<string, string>> {
  const content = new Map<string, string>();

  const skillsDir = path.join(process.cwd(), '.claude', 'skills');

  const skillFiles: string[] = [];

  const collectSkillFiles = async (currentDir: string): Promise<void> => {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    const hasSkillFile = entries.some(
      (entry) => entry.isFile() && entry.name.toLowerCase() === 'skill.md'
    );

    if (hasSkillFile) {
      skillFiles.push(path.join(currentDir, 'SKILL.md'));
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      await collectSkillFiles(path.join(currentDir, entry.name));
    }
  };

  try {
    await collectSkillFiles(skillsDir);
  } catch {
    // If skills directory is missing, return empty map
    return content;
  }

  const skillPathByName = new Map<string, string>();

  for (const skillFile of skillFiles) {
    try {
      const skillText = await fs.readFile(skillFile, 'utf-8');
      const frontmatterMatch = skillText.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
      const frontmatter = frontmatterMatch?.[1] ?? '';
      const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
      const skillName = nameMatch?.[1]?.trim() || path.basename(path.dirname(skillFile));
      skillPathByName.set(skillName, skillFile);
    } catch {
      // Skip unreadable skill files
    }
  }

  for (const skillName of skillNames) {
    try {
      const skillPath =
        skillPathByName.get(skillName) || path.join(skillsDir, skillName, 'SKILL.md');
      const skillText = await fs.readFile(skillPath, 'utf-8');

      // Extract just the body (remove YAML frontmatter)
      const bodyMatch = skillText.match(/^---[\s\S]*?---\s*([\s\S]*)$/);
      const body = bodyMatch ? bodyMatch[1].trim() : skillText;

      content.set(skillName, body);
    } catch (error) {
      // Skill file not found - skip silently
      logger.debug('Could not load skill content', { skillName, error: String(error) });
    }
  }

  return content;
}

/**
 * Build system prompt enhancement from agent context and skills
 */
async function buildSystemPromptEnhancement(
  context: AgentContext,
  skillContent: Map<string, string>,
  platform?: Platform,
  chatId?: string
): Promise<string> {
  const sections: string[] = [];

  // Add agent identity
  if (context.agent.description) {
    sections.push(`## Agent Role\n${context.agent.description}`);
  }

  // Add base prompt if available
  if (context.systemPrompt) {
    sections.push(`## Instructions\n${context.systemPrompt}`);
  }

  // Add persistent context if available
  if (platform && chatId) {
    try {
      const contextService = getContextService();
      const persistentContext = await contextService.getContext(platform, chatId);
      const formattedContext = contextService.formatForPrompt(persistentContext);

      if (formattedContext) {
        sections.push(formattedContext);
      }
    } catch (error) {
      logger.warn('Failed to load persistent context', {
        platform,
        chatId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Add skill knowledge (summarized to avoid token bloat)
  if (skillContent.size > 0) {
    sections.push('\n## Available Skills Reference');
    for (const [skillName, content] of skillContent.entries()) {
      // Extract just the first section or quick reference
      const quickRef = extractQuickReference(content);
      if (quickRef) {
        sections.push(`### ${skillName}\n${quickRef}`);
      }
    }
  }

  // Add tool guidance
  if (
    context.allowedTools.length > 0 ||
    context.deniedTools.length > 0 ||
    context.askTools.length > 0
  ) {
    sections.push('\n## Tool Access');
    if (context.allowedTools.length > 0) {
      sections.push(`Allowed patterns: ${context.allowedTools.join(', ')}`);
    }
    if (context.askTools.length > 0) {
      sections.push(`Ask before using: ${context.askTools.join(', ')}`);
    }
    if (context.deniedTools.length > 0) {
      sections.push(`Denied patterns: ${context.deniedTools.join(', ')}`);
    }
  }

  return sections.join('\n\n');
}

/**
 * Extract quick reference section from skill content
 */
function extractQuickReference(content: string): string {
  // Try to find a "Quick Reference" or similar section
  const quickRefMatch = content.match(/##\s*Quick Reference[^#]*(?=##|$)/i);
  if (quickRefMatch) {
    return quickRefMatch[0].substring(0, 500).trim();
  }

  // Otherwise return first paragraph
  const firstPara = content.split('\n\n')[0];
  return firstPara ? firstPara.substring(0, 300).trim() : '';
}

/**
 * Check if a tool name matches any of the patterns
 */
export function matchesToolPattern(toolName: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return toolName.startsWith(prefix);
    }
    return toolName === pattern;
  });
}

/**
 * Filter tools based on agent's allow/deny patterns
 */
export function filterToolsByPatterns<T extends { name: string }>(
  tools: T[],
  config: LoadedAgentConfig
): T[] {
  const allowPatterns = [...config.allowedToolPatterns, ...config.askToolPatterns];

  return tools.filter((tool) => {
    // If allowed patterns specified, tool must match at least one
    if (allowPatterns.length > 0) {
      if (!matchesToolPattern(tool.name, allowPatterns)) {
        return false;
      }
    }

    // If denied patterns specified, tool must not match any
    if (config.deniedToolPatterns.length > 0) {
      if (matchesToolPattern(tool.name, config.deniedToolPatterns)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Clear the configuration cache
 */
export function clearConfigCache(): void {
  configCache.clear();
  logger.debug('Configuration cache cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: configCache.size,
    keys: Array.from(configCache.keys()),
  };
}
