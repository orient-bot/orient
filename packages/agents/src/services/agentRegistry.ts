/**
 * Agent Registry Service
 *
 * Provides database-backed agent configuration management.
 * Replaces static file-based configuration with dynamic runtime configuration.
 *
 * Key responsibilities:
 * - CRUD operations for agents, skills, tools, and context rules
 * - Context-based agent resolution (platform, chat, environment)
 *
 * Exported via @orient/agents package.
 * - Filesystem sync for OpenCode compatibility
 */

import { getDatabase, eq, and, desc, sql } from '@orient/database';
import { agents, agentSkills, agentTools, contextRules } from '@orient/database';
import { createServiceLogger } from '@orient/core';
import fs from 'fs/promises';
import path from 'path';

const logger = createServiceLogger('agent-registry');

// ============================================
// TYPES
// ============================================

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  mode: string | null;
  modelDefault: string | null;
  modelFallback: string | null;
  basePrompt: string | null;
  enabled: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface AgentSkill {
  id: number;
  agentId: string;
  skillName: string;
  enabled: boolean | null;
  createdAt: Date | null;
}

export interface AgentTool {
  id: number;
  agentId: string;
  pattern: string;
  type: string; // 'allow' | 'deny' | 'ask'
  createdAt: Date | null;
}

export interface ContextRule {
  id: number;
  contextType: string;
  contextId: string | null;
  agentId: string | null;
  skillOverrides: string | null; // JSON array
  priority: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface AgentWithDetails extends Agent {
  skills: AgentSkill[];
  tools: AgentTool[];
}

export interface AgentContext {
  agent: Agent;
  skills: string[];
  allowedTools: string[];
  deniedTools: string[];
  askTools: string[];
  systemPrompt: string;
  model: string;
}

export interface CreateAgentInput {
  id: string;
  name: string;
  description?: string;
  mode?: string;
  modelDefault?: string;
  modelFallback?: string;
  basePrompt?: string;
  enabled?: boolean;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  mode?: string;
  modelDefault?: string;
  modelFallback?: string;
  basePrompt?: string;
  enabled?: boolean;
}

export interface ContextQuery {
  platform?: 'whatsapp' | 'slack' | 'opencode' | 'cursor';
  chatId?: string;
  channelId?: string;
  environment?: string;
}

// ============================================
// AGENT REGISTRY CLASS
// ============================================

export class AgentRegistry {
  private db = getDatabase();

  // ============================================
  // AGENT CRUD
  // ============================================

  /**
   * List all agents
   */
  async listAgents(): Promise<Agent[]> {
    const result = await this.db.select().from(agents).orderBy(desc(agents.enabled), agents.name);
    return result;
  }

  /**
   * Get agent by ID
   */
  async getAgent(id: string): Promise<Agent | null> {
    const result = await this.db.select().from(agents).where(eq(agents.id, id));
    return result[0] || null;
  }

  /**
   * Get agent with all details (skills, tools)
   */
  async getAgentWithDetails(id: string): Promise<AgentWithDetails | null> {
    const agent = await this.getAgent(id);
    if (!agent) return null;

    const [skills, tools] = await Promise.all([
      this.db.select().from(agentSkills).where(eq(agentSkills.agentId, id)),
      this.db.select().from(agentTools).where(eq(agentTools.agentId, id)),
    ]);

    return { ...agent, skills, tools };
  }

  /**
   * Create a new agent
   */
  async createAgent(input: CreateAgentInput): Promise<Agent> {
    const op = logger.startOperation('createAgent', { id: input.id });

    try {
      const result = await this.db
        .insert(agents)
        .values({
          id: input.id,
          name: input.name,
          description: input.description,
          mode: input.mode ?? 'specialized',
          modelDefault: input.modelDefault,
          modelFallback: input.modelFallback,
          basePrompt: input.basePrompt,
          enabled: input.enabled ?? true,
        })
        .returning();

      op.success('Agent created');
      return result[0];
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Update an existing agent
   */
  async updateAgent(id: string, input: UpdateAgentInput): Promise<Agent | null> {
    const op = logger.startOperation('updateAgent', { id });

    try {
      const result = await this.db
        .update(agents)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(agents.id, id))
        .returning();

      if (result.length === 0) {
        op.failure('Agent not found');
        return null;
      }

      op.success('Agent updated');
      return result[0];
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Delete an agent
   */
  async deleteAgent(id: string): Promise<boolean> {
    const op = logger.startOperation('deleteAgent', { id });

    try {
      const result = await this.db.delete(agents).where(eq(agents.id, id)).returning();
      const deleted = result.length > 0;
      deleted ? op.success('Agent deleted') : op.failure('Agent not found');
      return deleted;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Toggle agent enabled state
   */
  async toggleAgent(id: string, enabled: boolean): Promise<Agent | null> {
    return this.updateAgent(id, { enabled });
  }

  // ============================================
  // SKILLS MANAGEMENT
  // ============================================

  /**
   * Get skills for an agent
   */
  async getAgentSkills(agentId: string): Promise<AgentSkill[]> {
    return this.db.select().from(agentSkills).where(eq(agentSkills.agentId, agentId));
  }

  /**
   * Set skills for an agent (replaces existing)
   */
  async setAgentSkills(agentId: string, skillNames: string[]): Promise<void> {
    const op = logger.startOperation('setAgentSkills', { agentId, count: skillNames.length });

    try {
      // Delete existing skills
      await this.db.delete(agentSkills).where(eq(agentSkills.agentId, agentId));

      // Insert new skills
      if (skillNames.length > 0) {
        await this.db.insert(agentSkills).values(
          skillNames.map((skillName) => ({
            agentId,
            skillName,
            enabled: true,
          }))
        );
      }

      op.success('Skills updated');
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Add a single skill to an agent
   */
  async addAgentSkill(agentId: string, skillName: string): Promise<void> {
    await this.db
      .insert(agentSkills)
      .values({ agentId, skillName, enabled: true })
      .onConflictDoNothing();
  }

  /**
   * Remove a skill from an agent
   */
  async removeAgentSkill(agentId: string, skillName: string): Promise<void> {
    await this.db
      .delete(agentSkills)
      .where(and(eq(agentSkills.agentId, agentId), eq(agentSkills.skillName, skillName)));
  }

  // ============================================
  // TOOLS MANAGEMENT
  // ============================================

  /**
   * Get tools for an agent
   */
  async getAgentTools(agentId: string): Promise<AgentTool[]> {
    return this.db.select().from(agentTools).where(eq(agentTools.agentId, agentId));
  }

  /**
   * Set tool patterns for an agent (replaces existing)
   */
  async setAgentTools(
    agentId: string,
    allowPatterns: string[],
    denyPatterns: string[],
    askPatterns: string[] = []
  ): Promise<void> {
    const op = logger.startOperation('setAgentTools', {
      agentId,
      allow: allowPatterns.length,
      deny: denyPatterns.length,
      ask: askPatterns.length,
    });

    try {
      // Delete existing tools
      await this.db.delete(agentTools).where(eq(agentTools.agentId, agentId));

      // Insert new allow patterns
      if (allowPatterns.length > 0) {
        await this.db.insert(agentTools).values(
          allowPatterns.map((pattern) => ({
            agentId,
            pattern,
            type: 'allow',
          }))
        );
      }

      // Insert new deny patterns
      if (denyPatterns.length > 0) {
        await this.db.insert(agentTools).values(
          denyPatterns.map((pattern) => ({
            agentId,
            pattern,
            type: 'deny',
          }))
        );
      }

      // Insert new ask patterns
      if (askPatterns.length > 0) {
        await this.db.insert(agentTools).values(
          askPatterns.map((pattern) => ({
            agentId,
            pattern,
            type: 'ask',
          }))
        );
      }

      op.success('Tools updated');
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  // ============================================
  // CONTEXT RULES
  // ============================================

  /**
   * Get all context rules
   */
  async getContextRules(): Promise<ContextRule[]> {
    return this.db.select().from(contextRules).orderBy(desc(contextRules.priority));
  }

  /**
   * Get context rules for a specific type
   */
  async getContextRulesByType(contextType: string, contextId?: string): Promise<ContextRule[]> {
    if (contextId) {
      return this.db
        .select()
        .from(contextRules)
        .where(
          and(eq(contextRules.contextType, contextType), eq(contextRules.contextId, contextId))
        )
        .orderBy(desc(contextRules.priority));
    }
    return this.db
      .select()
      .from(contextRules)
      .where(eq(contextRules.contextType, contextType))
      .orderBy(desc(contextRules.priority));
  }

  /**
   * Set a context rule
   */
  async setContextRule(rule: {
    contextType: string;
    contextId?: string | null;
    agentId?: string | null;
    skillOverrides?: string[] | null;
    priority?: number;
  }): Promise<ContextRule> {
    const op = logger.startOperation('setContextRule', {
      type: rule.contextType,
      id: rule.contextId,
    });

    try {
      const skillOverridesJson = rule.skillOverrides ? JSON.stringify(rule.skillOverrides) : null;

      const result = await this.db
        .insert(contextRules)
        .values({
          contextType: rule.contextType,
          contextId: rule.contextId ?? null,
          agentId: rule.agentId ?? null,
          skillOverrides: skillOverridesJson,
          priority: rule.priority ?? 0,
        })
        .returning();

      op.success('Context rule created');
      return result[0];
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Delete a context rule
   */
  async deleteContextRule(id: number): Promise<boolean> {
    const result = await this.db.delete(contextRules).where(eq(contextRules.id, id)).returning();
    return result.length > 0;
  }

  // ============================================
  // CONTEXT RESOLUTION
  // ============================================

  /**
   * Get the resolved agent context for a given query
   * Applies context rules in priority order to determine agent, skills, and tools
   */
  async getAgentForContext(query: ContextQuery): Promise<AgentContext | null> {
    const op = logger.startOperation('getAgentForContext', query as Record<string, unknown>);

    try {
      // Get all applicable rules, sorted by priority (highest first)
      const allRules = await this.db
        .select()
        .from(contextRules)
        .orderBy(desc(contextRules.priority));

      // Find the best matching agent
      let selectedAgent: Agent | null = null;
      const skillModifications: string[] = [];

      // Check rules in priority order
      for (const rule of allRules) {
        // Check if rule applies to this context
        const applies = this.ruleApplies(rule, query);
        if (!applies) continue;

        // If rule has an agent and we haven't selected one yet, use it
        if (rule.agentId && !selectedAgent) {
          selectedAgent = await this.getAgent(rule.agentId);
        }

        // Collect skill overrides
        if (rule.skillOverrides) {
          try {
            const overrides = JSON.parse(rule.skillOverrides) as string[];
            skillModifications.push(...overrides);
          } catch {
            // Invalid JSON, skip
          }
        }
      }

      // If no agent selected, use the default (pm-assistant)
      if (!selectedAgent) {
        selectedAgent = await this.getAgent('pm-assistant');
      }

      if (!selectedAgent) {
        op.failure('No agent found');
        return null;
      }

      // Get agent's skills and tools
      const [agentSkillsList, agentToolsList] = await Promise.all([
        this.getAgentSkills(selectedAgent.id),
        this.getAgentTools(selectedAgent.id),
      ]);

      // Apply skill modifications
      let enabledSkills = agentSkillsList.filter((s) => s.enabled).map((s) => s.skillName);

      for (const mod of skillModifications) {
        if (mod.startsWith('disable:')) {
          const skillName = mod.substring(8);
          enabledSkills = enabledSkills.filter((s) => s !== skillName);
        } else if (mod.startsWith('enable:')) {
          const skillName = mod.substring(7);
          if (!enabledSkills.includes(skillName)) {
            enabledSkills.push(skillName);
          }
        }
      }

      // Separate allow and deny tools
      const allowedTools = agentToolsList.filter((t) => t.type === 'allow').map((t) => t.pattern);
      const deniedTools = agentToolsList.filter((t) => t.type === 'deny').map((t) => t.pattern);
      const askTools = agentToolsList.filter((t) => t.type === 'ask').map((t) => t.pattern);

      const fallbackModel = await this.getAgent('pm-assistant');
      const resolvedModel =
        selectedAgent.modelDefault ||
        fallbackModel?.modelDefault ||
        'anthropic/claude-sonnet-4-20250514';

      const result: AgentContext = {
        agent: selectedAgent,
        skills: enabledSkills,
        allowedTools,
        deniedTools,
        askTools,
        systemPrompt: selectedAgent.basePrompt || '',
        model: resolvedModel,
      };

      op.success('Agent context resolved', {
        agentId: selectedAgent.id,
        skillCount: enabledSkills.length,
      });

      return result;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Check if a context rule applies to the given query
   */
  private ruleApplies(rule: ContextRule, query: ContextQuery): boolean {
    switch (rule.contextType) {
      case 'default':
        return true; // Default rules always apply

      case 'platform':
        return rule.contextId === query.platform;

      case 'chat':
        return rule.contextId === query.chatId;

      case 'channel':
        return rule.contextId === query.channelId;

      case 'environment':
        return rule.contextId === query.environment;

      default:
        return false;
    }
  }

  // ============================================
  // FILESYSTEM SYNC (OpenCode Compatibility)
  // ============================================

  /**
   * Sync agent configuration to filesystem for OpenCode
   *
   * Note: Skills are now stored in .claude/skills/ as the single source of truth.
   * This function validates that the skills directory exists and logs enabled skills
   * for the current environment.
   */
  async syncToFilesystem(
    options: {
      projectDir?: string;
      environment?: string;
      skillsSourceDir?: string;
      skillsTargetDir?: string;
    } = {}
  ): Promise<void> {
    const op = logger.startOperation('syncToFilesystem', options);

    try {
      const projectDir = options.projectDir || process.cwd();
      const environment = options.environment || process.env.DEPLOY_ENV || 'local';
      // .claude/skills/ is the single source of truth for skills
      const skillsDir = options.skillsTargetDir || path.join(projectDir, '.claude', 'skills');

      // Get agent configuration for this environment
      const agentContext = await this.getAgentForContext({ environment });
      const enabledSkills = agentContext?.skills || [];

      // Ensure skills directory exists
      await fs.mkdir(skillsDir, { recursive: true });

      // Validate that enabled skills exist in the skills directory
      const availableSkills = await this.listAvailableSkills(skillsDir);
      const missingSkills = enabledSkills.filter((s: string) => !availableSkills.includes(s));

      if (missingSkills.length > 0) {
        logger.warn('Some enabled skills are not found in skills directory', {
          missingSkills,
          skillsDir,
        });
      }

      op.success('Filesystem sync complete', {
        environment,
        enabledSkillsCount: enabledSkills.length,
        availableSkillsCount: availableSkills.length,
        missingSkills: missingSkills.length > 0 ? missingSkills : undefined,
      });
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Copy a directory recursively
   */
  private async copyDirectory(source: string, target: string): Promise<void> {
    await fs.mkdir(target, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath);
      } else {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  }

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * Get registry statistics
   */
  async getStats(): Promise<{
    totalAgents: number;
    enabledAgents: number;
    totalSkills: number;
    totalContextRules: number;
  }> {
    const [agentStats, skillCount, ruleCount] = await Promise.all([
      this.db
        .select({
          total: sql<number>`count(*)`,
          enabled: sql<number>`sum(case when enabled then 1 else 0 end)`,
        })
        .from(agents),
      this.db.select({ count: sql<number>`count(*)` }).from(agentSkills),
      this.db.select({ count: sql<number>`count(*)` }).from(contextRules),
    ]);

    return {
      totalAgents: Number(agentStats[0]?.total || 0),
      enabledAgents: Number(agentStats[0]?.enabled || 0),
      totalSkills: Number(skillCount[0]?.count || 0),
      totalContextRules: Number(ruleCount[0]?.count || 0),
    };
  }

  /**
   * List all available skills from the skills directory
   * Uses .claude/skills/ as the canonical source (single source of truth)
   */
  async listAvailableSkills(skillsDir?: string): Promise<string[]> {
    const dir = skillsDir || path.join(process.cwd(), '.claude', 'skills');

    try {
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

      await collectSkillFiles(dir);

      const skills = new Set<string>();

      for (const skillFile of skillFiles) {
        try {
          const content = await fs.readFile(skillFile, 'utf-8');
          const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
          const frontmatter = frontmatterMatch?.[1] ?? '';
          const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
          const skillName = nameMatch?.[1]?.trim() || path.basename(path.dirname(skillFile));
          skills.add(skillName);
        } catch {
          // Skip invalid skill files
        }
      }

      return Array.from(skills).sort();
    } catch {
      return [];
    }
  }
}

// ============================================
// SINGLETON
// ============================================

let registryInstance: AgentRegistry | null = null;

export function getAgentRegistry(): AgentRegistry {
  if (!registryInstance) {
    registryInstance = new AgentRegistry();
  }
  return registryInstance;
}

export function resetAgentRegistry(): void {
  registryInstance = null;
}
