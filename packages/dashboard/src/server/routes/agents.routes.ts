/**
 * Agents Routes
 *
 * API endpoints for agent registry management.
 * Uses @orientbot/database for Drizzle ORM integration.
 */

import { Router, Request, Response } from 'express';
import { createServiceLogger } from '@orientbot/core';
import {
  getDatabase,
  agents,
  agentSkills,
  agentTools,
  contextRules,
  eq,
  and,
  desc,
} from '@orientbot/database';
import { AuthenticatedRequest } from '../../auth.js';

const logger = createServiceLogger('agents-routes');

/**
 * Create Agents routes
 */
export function createAgentsRoutes(
  requireAuth: (req: Request, res: Response, next: () => void) => void
): Router {
  const router = Router();

  // Helper to get database instance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getDb = async (): Promise<any> => await getDatabase();

  // Get agent registry stats
  router.get('/stats', requireAuth, async (_req: Request, res: Response) => {
    try {
      const db = await getDb();
      const allAgents = await db.select().from(agents);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const enabledAgents = allAgents.filter((a: any) => a.enabled);

      // Count distinct enabled skills from agent_skills table
      const enabledSkills = await db
        .selectDistinct({ skillName: agentSkills.skillName })
        .from(agentSkills)
        .where(eq(agentSkills.enabled, true));

      // Count context rules
      const allContextRules = await db.select().from(contextRules);

      res.json({
        totalAgents: allAgents.length,
        enabledAgents: enabledAgents.length,
        totalSkills: enabledSkills.length,
        totalContextRules: allContextRules.length,
      });
    } catch (error) {
      logger.error('Failed to get agent stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get agent stats' });
    }
  });

  // List all agents
  router.get('/', requireAuth, async (_req: Request, res: Response) => {
    try {
      const db = await getDb();
      const agentList = await db.select().from(agents).orderBy(agents.name);
      res.json({ agents: agentList });
    } catch (error) {
      logger.error('Failed to list agents', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to list agents' });
    }
  });

  // List available skills from filesystem
  router.get('/available-skills', requireAuth, async (_req: Request, res: Response) => {
    try {
      const db = await getDb();
      // Get unique skill names from agent_skills table
      const skills = await db
        .selectDistinct({ skillName: agentSkills.skillName })
        .from(agentSkills);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res.json({ skills: skills.map((s: any) => s.skillName) });
    } catch (error) {
      logger.error('Failed to list available skills', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to list available skills' });
    }
  });

  // Get context rules
  router.get('/context-rules', requireAuth, async (_req: Request, res: Response) => {
    try {
      const db = await getDb();
      const rules = await db.select().from(contextRules).orderBy(desc(contextRules.priority));
      res.json({ rules });
    } catch (error) {
      logger.error('Failed to list context rules', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to list context rules' });
    }
  });

  // Resolve agent context
  router.post('/resolve-context', requireAuth, async (req: Request, res: Response) => {
    try {
      const { platform, chatId } = req.body;

      if (!platform) {
        res.status(400).json({ error: 'platform is required' });
        return;
      }

      // Find matching context rules ordered by priority
      const db = await getDb();
      const rules = await db.select().from(contextRules).orderBy(desc(contextRules.priority));

      // Find the best matching rule
      let matchedRule = null;
      for (const rule of rules) {
        if (rule.contextType === 'chat' && rule.contextId === chatId) {
          matchedRule = rule;
          break;
        }
        if (rule.contextType === 'platform' && rule.contextId === platform) {
          matchedRule = rule;
          break;
        }
        if (rule.contextType === 'default') {
          matchedRule = rule;
          // Don't break - keep looking for more specific matches
        }
      }

      if (!matchedRule || !matchedRule.agentId) {
        res.json({
          agent: null,
          skills: [],
          allowedTools: [],
          deniedTools: [],
          askTools: [],
          systemPrompt: null,
          model: null,
        });
        return;
      }

      // Get the agent
      const [agent] = await db.select().from(agents).where(eq(agents.id, matchedRule.agentId));

      if (!agent) {
        res.json({
          agent: null,
          skills: [],
          allowedTools: [],
          deniedTools: [],
          askTools: [],
          systemPrompt: null,
          model: null,
        });
        return;
      }

      // Get skills and tools
      const skills = await db
        .select()
        .from(agentSkills)
        .where(and(eq(agentSkills.agentId, agent.id), eq(agentSkills.enabled, true)));

      const tools = await db.select().from(agentTools).where(eq(agentTools.agentId, agent.id));

      res.json({
        agent,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        skills: skills.map((s: any) => s.skillName),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        allowedTools: tools.filter((t: any) => t.type === 'allow').map((t: any) => t.pattern),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        deniedTools: tools.filter((t: any) => t.type === 'deny').map((t: any) => t.pattern),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        askTools: tools.filter((t: any) => t.type === 'ask').map((t: any) => t.pattern),
        systemPrompt: agent.basePrompt,
        model: agent.modelDefault,
      });
    } catch (error) {
      logger.error('Failed to resolve context', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to resolve context' });
    }
  });

  // Get a specific agent with details
  router.get('/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const { id } = req.params;

      const [agent] = await db.select().from(agents).where(eq(agents.id, id));

      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }

      // Get skills and tools
      const skills = await db.select().from(agentSkills).where(eq(agentSkills.agentId, id));
      const tools = await db.select().from(agentTools).where(eq(agentTools.agentId, id));

      res.json({
        ...agent,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        skills: skills.map((s: any) => ({ id: s.id, skillName: s.skillName, enabled: s.enabled })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: tools.map((t: any) => ({
          id: t.id,
          agentId: t.agentId,
          pattern: t.pattern,
          type: t.type,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        allowTools: tools.filter((t: any) => t.type === 'allow').map((t: any) => t.pattern),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        denyTools: tools.filter((t: any) => t.type === 'deny').map((t: any) => t.pattern),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        askTools: tools.filter((t: any) => t.type === 'ask').map((t: any) => t.pattern),
      });
    } catch (error) {
      logger.error('Failed to get agent', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get agent' });
    }
  });

  // Create a new agent
  router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const { id, name, description, mode, modelDefault, modelFallback, basePrompt, enabled } =
        req.body;

      if (!id || !name) {
        res.status(400).json({ error: 'Agent id and name are required' });
        return;
      }

      await db.insert(agents).values({
        id,
        name,
        description: description || null,
        mode: mode || 'specialized',
        modelDefault: modelDefault || null,
        modelFallback: modelFallback || null,
        basePrompt: basePrompt || null,
        enabled: enabled ?? true,
      });

      const [newAgent] = await db.select().from(agents).where(eq(agents.id, id));
      res.status(201).json(newAgent);
    } catch (error) {
      logger.error('Failed to create agent', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to create agent' });
    }
  });

  // Update an agent
  router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const { id } = req.params;
      const updates = req.body;

      // Check agent exists
      const [existing] = await db.select().from(agents).where(eq(agents.id, id));
      if (!existing) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }

      // Build update object
      const updateData: Record<string, unknown> = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.mode !== undefined) updateData.mode = updates.mode;
      if (updates.modelDefault !== undefined) updateData.modelDefault = updates.modelDefault;
      if (updates.modelFallback !== undefined) updateData.modelFallback = updates.modelFallback;
      if (updates.basePrompt !== undefined) updateData.basePrompt = updates.basePrompt;
      if (updates.enabled !== undefined) updateData.enabled = updates.enabled;

      if (Object.keys(updateData).length > 0) {
        await db.update(agents).set(updateData).where(eq(agents.id, id));
      }

      const [updated] = await db.select().from(agents).where(eq(agents.id, id));
      res.json(updated);
    } catch (error) {
      logger.error('Failed to update agent', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to update agent' });
    }
  });

  // Delete an agent
  router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const { id } = req.params;

      // Check agent exists
      const [existing] = await db.select().from(agents).where(eq(agents.id, id));
      if (!existing) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }

      // Delete related records first
      await db.delete(agentSkills).where(eq(agentSkills.agentId, id));
      await db.delete(agentTools).where(eq(agentTools.agentId, id));
      await db.delete(contextRules).where(eq(contextRules.agentId, id));

      // Delete agent
      await db.delete(agents).where(eq(agents.id, id));

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to delete agent', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to delete agent' });
    }
  });

  // Toggle agent enabled/disabled
  router.post('/:id/toggle', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const { id } = req.params;
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'enabled must be a boolean' });
        return;
      }

      const [existing] = await db.select().from(agents).where(eq(agents.id, id));
      if (!existing) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }

      await db.update(agents).set({ enabled }).where(eq(agents.id, id));

      const [updated] = await db.select().from(agents).where(eq(agents.id, id));
      res.json(updated);
    } catch (error) {
      logger.error('Failed to toggle agent', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to toggle agent' });
    }
  });

  // Get agent skills
  router.get('/:id/skills', requireAuth, async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const { id } = req.params;
      const skills = await db.select().from(agentSkills).where(eq(agentSkills.agentId, id));
      res.json({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        skills: skills.map((s: any) => ({ id: s.id, skillName: s.skillName, enabled: s.enabled })),
      });
    } catch (error) {
      logger.error('Failed to get agent skills', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get agent skills' });
    }
  });

  // Update agent skills
  router.put('/:id/skills', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const { id } = req.params;
      const { skills } = req.body;

      if (!Array.isArray(skills)) {
        res.status(400).json({ error: 'skills must be an array' });
        return;
      }

      // Delete existing skills
      await db.delete(agentSkills).where(eq(agentSkills.agentId, id));

      // Insert new skills
      for (const skill of skills) {
        const skillName = typeof skill === 'string' ? skill : skill.name;
        const enabled = typeof skill === 'string' ? true : (skill.enabled ?? true);
        await db.insert(agentSkills).values({ agentId: id, skillName, enabled });
      }

      const updatedSkills = await db.select().from(agentSkills).where(eq(agentSkills.agentId, id));
      res.json({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        skills: updatedSkills.map((s: any) => ({
          id: s.id,
          skillName: s.skillName,
          enabled: s.enabled,
        })),
      });
    } catch (error) {
      logger.error('Failed to update agent skills', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to update agent skills' });
    }
  });

  // Get agent tools
  router.get('/:id/tools', requireAuth, async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const { id } = req.params;
      const tools = await db.select().from(agentTools).where(eq(agentTools.agentId, id));
      res.json({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        allowTools: tools.filter((t: any) => t.type === 'allow').map((t: any) => t.pattern),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        denyTools: tools.filter((t: any) => t.type === 'deny').map((t: any) => t.pattern),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        askTools: tools.filter((t: any) => t.type === 'ask').map((t: any) => t.pattern),
      });
    } catch (error) {
      logger.error('Failed to get agent tools', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get agent tools' });
    }
  });

  // Update agent tools
  router.put('/:id/tools', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const { id } = req.params;
      const allowTools = req.body.allowTools ?? req.body.allow ?? [];
      const denyTools = req.body.denyTools ?? req.body.deny ?? [];
      const askTools = req.body.askTools ?? req.body.ask ?? [];

      // Delete existing tools
      await db.delete(agentTools).where(eq(agentTools.agentId, id));

      // Insert allow tools
      if (Array.isArray(allowTools)) {
        for (const pattern of allowTools) {
          await db.insert(agentTools).values({ agentId: id, pattern, type: 'allow' });
        }
      }

      // Insert deny tools
      if (Array.isArray(denyTools)) {
        for (const pattern of denyTools) {
          await db.insert(agentTools).values({ agentId: id, pattern, type: 'deny' });
        }
      }

      // Insert ask tools
      if (Array.isArray(askTools)) {
        for (const pattern of askTools) {
          await db.insert(agentTools).values({ agentId: id, pattern, type: 'ask' });
        }
      }

      const updatedTools = await db.select().from(agentTools).where(eq(agentTools.agentId, id));
      res.json({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        allowTools: updatedTools.filter((t: any) => t.type === 'allow').map((t: any) => t.pattern),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        denyTools: updatedTools.filter((t: any) => t.type === 'deny').map((t: any) => t.pattern),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        askTools: updatedTools.filter((t: any) => t.type === 'ask').map((t: any) => t.pattern),
      });
    } catch (error) {
      logger.error('Failed to update agent tools', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to update agent tools' });
    }
  });

  // Create context rule
  router.post('/context-rules', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const { contextType, contextId, agentId, skillOverrides, priority } = req.body;

      if (!contextType) {
        res.status(400).json({ error: 'contextType is required' });
        return;
      }

      await db.insert(contextRules).values({
        contextType,
        contextId: contextId || null,
        agentId: agentId || null,
        skillOverrides: skillOverrides ? JSON.stringify(skillOverrides) : null,
        priority: priority ?? 0,
      });

      const rules = await db.select().from(contextRules).orderBy(desc(contextRules.priority));
      res.status(201).json({ rules });
    } catch (error) {
      logger.error('Failed to create context rule', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to create context rule' });
    }
  });

  // Delete context rule
  router.delete(
    '/context-rules/:id',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const ruleId = parseInt(id, 10);

        if (isNaN(ruleId)) {
          res.status(400).json({ error: 'Invalid rule ID' });
          return;
        }

        const db = await getDb();
        await db.delete(contextRules).where(eq(contextRules.id, ruleId));

        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to delete context rule', {
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ error: 'Failed to delete context rule' });
      }
    }
  );

  // Sync agents to filesystem
  router.post('/sync', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      // TODO: Implement filesystem sync for OpenCode
      res.json({ success: true, message: 'Sync not yet implemented' });
    } catch (error) {
      logger.error('Failed to sync agents', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to sync agents' });
    }
  });

  logger.info('Agents routes initialized with database integration');

  return router;
}
