/**
 * Dashboard API Routes
 *
 * Express router for dashboard API endpoints with full database integration.
 */

import { Router, Request, Response } from 'express';
import { createServiceLogger, getConfigVersion } from '@orient/core';
import type { DashboardServices } from './index.js';
import { AuthenticatedRequest, createAuthMiddleware } from '../auth.js';
import { ChatPermission, ChatType } from '../types/index.js';
import {
  createSlackRoutes,
  createSchedulerRoutes,
  createWebhookRoutes,
  createPromptsRoutes,
  createAgentsRoutes,
  createBillingRoutes,
  createMcpRoutes,
  createAppsRoutes,
  createSecretsRoutes,
  createProvidersRoutes,
  createOnboarderRoutes,
  createIntegrationsRoutes,
  createStorageRoutes,
  createVersionRoutes,
} from './routes/index.js';
import { initStorageService } from '../services/storageService.js';
// TODO: Re-enable with miniapp editor if needed

const logger = createServiceLogger('dashboard-routes');

/**
 * Create dashboard API router
 */
export function createDashboardRouter(services: DashboardServices): Router {
  const router = Router();
  const {
    db,
    slackDb,
    schedulerDb,
    schedulerService,
    webhookService,
    promptService,
    appsService,
    storageDb,
    /* miniappEditService, */ auth,
  } = services;
  router.get('/config/version', (_req: Request, res: Response) => {
    res.json({ version: getConfigVersion() });
  });

  // ============================================
  // DEMO MEETINGS (public for localhost demo app)
  // ============================================

  router.get('/demo/meetings', async (req: Request, res: Response) => {
    try {
      const limitParam = req.query.limit as string | undefined;
      const parsedLimit = limitParam ? parseInt(limitParam, 10) : NaN;
      const limit = Number.isFinite(parsedLimit) ? Math.max(parsedLimit, 1) : 20;

      const meetings = await db.listDemoMeetings(limit);
      res.json({ meetings });
    } catch (error) {
      logger.error('Get demo meetings error', { error: String(error) });
      res.status(500).json({ error: 'Failed to load demo meetings' });
    }
  });

  router.post('/demo/meetings', async (req: Request, res: Response) => {
    try {
      const { title, description, attendees, dateTime, durationMinutes, sendReminder } = req.body;

      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: 'Title is required' });
      }

      if (!dateTime || typeof dateTime !== 'string') {
        return res.status(400).json({ error: 'dateTime is required' });
      }

      const parsedDate = new Date(dateTime);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: 'dateTime must be a valid ISO timestamp' });
      }

      const duration = Number(durationMinutes);
      if (!Number.isFinite(duration) || duration <= 0) {
        return res.status(400).json({ error: 'durationMinutes must be a positive number' });
      }

      const meeting = await db.createDemoMeeting({
        title,
        description: typeof description === 'string' ? description : null,
        attendees: typeof attendees === 'string' ? attendees : null,
        startTime: parsedDate,
        durationMinutes: duration,
        sendReminder: sendReminder !== false,
      });

      res.status(201).json({ meeting });
    } catch (error) {
      logger.error('Create demo meeting error', { error: String(error) });
      res.status(500).json({ error: 'Failed to create demo meeting' });
    }
  });

  // ============================================
  // DEMO GITHUB CHANGELOG MONITORS (public)
  // ============================================

  router.get('/demo/github-monitors', async (req: Request, res: Response) => {
    try {
      const limitParam = req.query.limit as string | undefined;
      const parsedLimit = limitParam ? parseInt(limitParam, 10) : NaN;
      const limit = Number.isFinite(parsedLimit) ? Math.max(parsedLimit, 1) : 50;

      const monitors = await db.listDemoGithubMonitors(limit);
      res.json({ monitors });
    } catch (error) {
      logger.error('Get demo monitors error', { error: String(error) });
      res.status(500).json({ error: 'Failed to load demo monitors' });
    }
  });

  router.post('/demo/github-monitors', async (req: Request, res: Response) => {
    try {
      const { repoUrl, slackChannel, scheduleTime } = req.body;

      if (!repoUrl || typeof repoUrl !== 'string') {
        return res.status(400).json({ error: 'repoUrl is required' });
      }
      if (!slackChannel || typeof slackChannel !== 'string') {
        return res.status(400).json({ error: 'slackChannel is required' });
      }
      if (!scheduleTime || typeof scheduleTime !== 'string') {
        return res.status(400).json({ error: 'scheduleTime is required' });
      }

      const monitor = await db.createDemoGithubMonitor({
        repoUrl,
        slackChannel,
        scheduleTime,
      });

      res.status(201).json({ monitor });
    } catch (error) {
      logger.error('Create demo monitor error', { error: String(error) });
      res.status(500).json({ error: 'Failed to create demo monitor' });
    }
  });

  router.post('/demo/github-monitors/:id/check', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: 'Invalid monitor id' });
      }

      const updated = await db.markDemoGithubMonitorChecked(id);
      if (!updated) {
        return res.status(404).json({ error: 'Monitor not found' });
      }

      res.json({ success: true });
    } catch (error) {
      logger.error('Check demo monitor error', { error: String(error) });
      res.status(500).json({ error: 'Failed to update monitor' });
    }
  });

  router.delete('/demo/github-monitors/:id', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: 'Invalid monitor id' });
      }

      const deleted = await db.deleteDemoGithubMonitor(id);
      if (!deleted) {
        return res.status(404).json({ error: 'Monitor not found' });
      }

      res.json({ success: true });
    } catch (error) {
      logger.error('Delete demo monitor error', { error: String(error) });
      res.status(500).json({ error: 'Failed to delete demo monitor' });
    }
  });

  // Auth middleware for protected routes
  const requireAuth = createAuthMiddleware(auth);

  // Mount modular routes
  if (slackDb) {
    router.use('/slack', createSlackRoutes(slackDb, requireAuth));
  }
  if (schedulerService) {
    router.use('/schedules', createSchedulerRoutes(schedulerService, requireAuth));
  }
  if (webhookService) {
    router.use('/webhooks', createWebhookRoutes(webhookService, requireAuth));
  }
  if (promptService) {
    router.use('/prompts', createPromptsRoutes(promptService, requireAuth));
  }

  // Apps routes (for mini-apps listing and bridge API)
  if (appsService) {
    router.use('/apps', createAppsRoutes(appsService, requireAuth, { storageDb }));
  }
  // Secrets routes (always available)
  router.use('/secrets', createSecretsRoutes(requireAuth));

  // Providers routes (always available)
  router.use('/providers', createProvidersRoutes(requireAuth));

  // Agents routes (stub implementation - always available)
  router.use('/agents', createAgentsRoutes(requireAuth));

  // Billing routes (stub implementation - always available)
  router.use('/billing', createBillingRoutes(requireAuth));

  // MCP routes (always available)
  router.use('/mcp', createMcpRoutes(requireAuth));

  // Integrations catalog routes (always available)
  router.use('/integrations', createIntegrationsRoutes(requireAuth));

  // Storage routes (always available)
  initStorageService(db, slackDb);
  router.use('/storage', createStorageRoutes(requireAuth));

  // Version check routes (always available)
  router.use('/version', createVersionRoutes(requireAuth));

  // Onboarder routes (always available - uses db for session persistence)
  router.use('/onboarder', createOnboarderRoutes(db, requireAuth));

  // ============================================
  // AUTH ROUTES (public)
  // ============================================

  // Login
  router.post('/auth/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      const result = await auth.login(username, password);

      if (!result) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      // Return { token, username } directly to match frontend expectations
      res.json(result);
    } catch (error) {
      logger.error('Login error', { error: String(error) });
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // Register (first user only, or admin-only)
  router.post('/auth/register', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Username and password are required',
        });
      }

      // Check if any users exist
      const hasUsers = await db.hasDashboardUsers();

      if (hasUsers) {
        // If users exist, only allow registration from authenticated admin
        // For now, just reject
        return res.status(403).json({
          success: false,
          error: 'Registration not allowed. Users already exist.',
        });
      }

      const userId = await auth.createUser(username, password);

      res.json({
        success: true,
        data: { userId, message: 'User created successfully' },
      });
    } catch (error) {
      logger.error('Registration error', { error: String(error) });
      res.status(500).json({
        success: false,
        error: 'Registration failed',
      });
    }
  });

  // Check if initial setup is needed (no users exist)
  router.get('/auth/setup-required', async (_req: Request, res: Response) => {
    try {
      const hasUsers = await db.hasDashboardUsers();
      res.json({ setupRequired: !hasUsers });
    } catch (error) {
      logger.error('Setup check error', { error: String(error) });
      res.status(500).json({ error: 'Failed to check setup status' });
    }
  });

  // Initial setup - create first admin user
  router.post('/auth/setup', async (req: Request, res: Response) => {
    try {
      const hasUsers = await db.hasDashboardUsers();
      if (hasUsers) {
        res.status(403).json({ error: 'Setup already completed. Users exist.' });
        return;
      }

      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
      }

      if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters' });
        return;
      }

      const userId = await auth.createUser(username, password);
      const loginResult = await auth.login(username, password);

      logger.info('Initial admin user created', { username, userId });

      res.json({
        success: true,
        userId,
        token: loginResult?.token,
        message: 'Admin user created successfully',
      });
    } catch (error) {
      logger.error('Setup failed', { error: String(error) });
      res.status(500).json({ error: 'Setup failed' });
    }
  });

  // Validate token
  router.get('/auth/validate', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({
      success: true,
      data: { user: req.user },
    });
  });

  // Get current user info (used after login to validate session)
  // Returns { user: { ... } } to match frontend expectations
  router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({ user: req.user });
  });

  // ============================================
  // HEALTH & STATS (protected)
  // ============================================

  router.get('/health', async (_req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        data: {
          status: 'healthy',
          uptime: process.uptime() * 1000,
          lastCheck: new Date(),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Health check failed',
      });
    }
  });

  router.get('/stats', requireAuth, async (_req: Request, res: Response) => {
    try {
      // Return stats directly (not wrapped) to match frontend expectations
      const dashboardStats = await db.getDashboardStats();
      res.json(dashboardStats);
    } catch (error) {
      logger.error('Stats error', { error: String(error) });
      res.status(500).json({ error: 'Failed to get stats' });
    }
  });

  // ============================================
  // CHAT PERMISSIONS
  // ============================================

  // Get all chats with permissions - returns { chats: [...] } to match frontend
  router.get('/chats', requireAuth, async (_req: Request, res: Response) => {
    try {
      const chats = await db.getAllChatsWithPermissions();
      res.json({ chats });
    } catch (error) {
      logger.error('Get chats error', { error: String(error) });
      res.status(500).json({ error: 'Failed to get chats' });
    }
  });

  // Get chats without permissions (for discovery) - legacy endpoint
  router.get('/chats/unassigned', requireAuth, async (_req: Request, res: Response) => {
    try {
      const chats = await db.getChatsWithoutPermissions();
      res.json({ chats });
    } catch (error) {
      logger.error('Get unassigned chats error', { error: String(error) });
      res.status(500).json({ error: 'Failed to get unassigned chats' });
    }
  });

  // Discover chats without explicit permissions (with smart defaults)
  // Returns { chats: [...], defaultPermission: 'read_only' } to match frontend
  router.get('/chats/discover', requireAuth, async (_req: Request, res: Response) => {
    try {
      const chats = await db.getChatsWithoutPermissions();

      // Add effective permission (smart defaults would go here)
      const chatsWithDefaults = chats.map((chat) => ({
        ...chat,
        effectivePermission: 'read_only' as ChatPermission,
        isSmartDefaultWritable: false,
      }));

      res.json({
        chats: chatsWithDefaults,
        defaultPermission: 'read_only' as ChatPermission,
      });
    } catch (error) {
      logger.error('Discover chats error', { error: String(error) });
      res.status(500).json({ error: 'Failed to discover chats' });
    }
  });

  // Get all chats unified (both configured and unconfigured in one view)
  // Returns { chats: [...] } with isConfigured flag for each chat
  router.get('/chats/all', requireAuth, async (_req: Request, res: Response) => {
    try {
      const chats = await db.getAllChatsUnified();
      res.json({ chats });
    } catch (error) {
      logger.error('Get all chats unified error', { error: String(error) });
      res.status(500).json({ error: 'Failed to get all chats' });
    }
  });

  // Get single chat permission
  router.get('/chats/:chatId', requireAuth, async (req: Request, res: Response) => {
    try {
      const { chatId } = req.params;
      const decodedChatId = decodeURIComponent(chatId);
      const chat = await db.getChatPermission(decodedChatId);

      if (!chat) {
        return res.status(404).json({
          success: false,
          error: 'Chat not found',
        });
      }

      res.json({
        success: true,
        data: chat,
      });
    } catch (error) {
      logger.error('Get chat error', { error: String(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to get chat',
      });
    }
  });

  // Set chat permission
  router.patch(
    '/chats/:chatId/permission',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { chatId } = req.params;
        const decodedChatId = decodeURIComponent(chatId);
        const { permission, chatType, displayName, notes } = req.body;

        if (!permission || !['ignored', 'read_only', 'read_write'].includes(permission)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid permission. Must be: ignored, read_only, or read_write',
          });
        }

        // Auto-detect chat type if not provided
        const resolvedChatType: ChatType =
          chatType || (decodedChatId.endsWith('@g.us') ? 'group' : 'individual');

        await db.setChatPermission(
          decodedChatId,
          resolvedChatType,
          permission as ChatPermission,
          displayName,
          notes,
          req.user?.username
        );

        // Return updated record
        const updated = await db.getChatPermission(decodedChatId);
        res.json(updated);
      } catch (error) {
        logger.error('Set permission error', { error: String(error) });
        res.status(500).json({
          success: false,
          error: 'Failed to set permission',
        });
      }
    }
  );

  // Delete chat permission
  router.delete('/chats/:chatId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { chatId } = req.params;
      const decodedChatId = decodeURIComponent(chatId);
      const deleted = await db.deleteChatPermission(decodedChatId, req.user?.username);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Chat not found',
        });
      }

      res.json({
        success: true,
        data: { message: 'Permission deleted' },
      });
    } catch (error) {
      logger.error('Delete permission error', { error: String(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to delete permission',
      });
    }
  });

  // ============================================
  // AUDIT LOG
  // ============================================

  router.get('/audit-log', requireAuth, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const chatId = req.query.chatId as string | undefined;

      const logs = await db.getPermissionAuditLog(limit, chatId);

      res.json({
        success: true,
        data: logs,
      });
    } catch (error) {
      logger.error('Get audit log error', { error: String(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to get audit log',
      });
    }
  });

  // ============================================
  // GROUPS
  // ============================================

  router.get('/groups', requireAuth, async (_req: Request, res: Response) => {
    try {
      const groups = await db.getAllGroups();
      res.json({
        success: true,
        data: groups,
      });
    } catch (error) {
      logger.error('Get groups error', { error: String(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to get groups',
      });
    }
  });

  router.get('/groups/search', requireAuth, async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;

      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Search query is required',
        });
      }

      const groups = await db.searchGroups(query);
      res.json({
        success: true,
        data: groups,
      });
    } catch (error) {
      logger.error('Search groups error', { error: String(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to search groups',
      });
    }
  });

  // ============================================
  // AGENT CAPABILITIES
  // ============================================

  router.get('/capabilities', requireAuth, async (_req: Request, res: Response) => {
    try {
      // Return empty capabilities - full implementation not yet migrated
      res.json({
        skills: [],
        categories: [],
        summary: {
          totalSkills: 0,
          totalTools: 0,
          categoryCounts: {},
        },
      });
    } catch (error) {
      logger.error('Get capabilities error', { error: String(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to get capabilities',
      });
    }
  });

  // ============================================
  // PRODUCTION MONITORING
  // ============================================

  // Get server metrics
  router.get('/monitoring/metrics', requireAuth, async (_req: Request, res: Response) => {
    try {
      const { monitoring } = services;

      if (!monitoring) {
        return res.status(503).json({
          error: 'Monitoring service not configured',
        });
      }

      if (!monitoring.isEnabled()) {
        return res.status(503).json({
          error: 'Monitoring is disabled',
        });
      }

      const metrics = await monitoring.collectMetrics();
      res.json(metrics);
    } catch (error) {
      logger.error('Monitoring metrics error', { error: String(error) });
      res.status(500).json({
        error: 'Failed to collect metrics',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get monitoring thresholds
  router.get('/monitoring/config', requireAuth, async (_req: Request, res: Response) => {
    try {
      const { monitoring } = services;

      if (!monitoring) {
        return res.json({
          cpu: 80,
          memory: 85,
          disk: 90,
        });
      }

      res.json(monitoring.getThresholds());
    } catch (error) {
      logger.error('Get monitoring config error', { error: String(error) });
      res.status(500).json({ error: 'Failed to get monitoring config' });
    }
  });

  // Update monitoring thresholds
  router.put('/monitoring/config', requireAuth, async (req: Request, res: Response) => {
    try {
      const { monitoring } = services;

      if (!monitoring) {
        return res.status(503).json({
          error: 'Monitoring service not configured',
        });
      }

      const { cpu, memory, disk } = req.body;

      // Validate thresholds
      if (cpu !== undefined && (typeof cpu !== 'number' || cpu < 0 || cpu > 100)) {
        return res.status(400).json({ error: 'CPU threshold must be a number between 0 and 100' });
      }
      if (memory !== undefined && (typeof memory !== 'number' || memory < 0 || memory > 100)) {
        return res
          .status(400)
          .json({ error: 'Memory threshold must be a number between 0 and 100' });
      }
      if (disk !== undefined && (typeof disk !== 'number' || disk < 0 || disk > 100)) {
        return res.status(400).json({ error: 'Disk threshold must be a number between 0 and 100' });
      }

      monitoring.setThresholds({ cpu, memory, disk });
      res.json({ message: 'Thresholds updated', thresholds: monitoring.getThresholds() });
    } catch (error) {
      logger.error('Update monitoring config error', { error: String(error) });
      res.status(500).json({ error: 'Failed to update monitoring config' });
    }
  });

  // Test monitoring connection
  router.get('/monitoring/test', requireAuth, async (_req: Request, res: Response) => {
    try {
      const { monitoring } = services;

      if (!monitoring) {
        return res.status(503).json({
          error: 'Monitoring service not configured',
        });
      }

      const result = await monitoring.testConnection();
      res.json(result);
    } catch (error) {
      logger.error('Test monitoring connection error', { error: String(error) });
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
