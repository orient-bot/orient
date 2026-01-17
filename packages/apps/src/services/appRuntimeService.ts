/**
 * App Runtime Service
 *
 * Handles runtime tool invocation from Mini-Apps.
 * Enforces permissions based on APP.yaml manifest and manages
 * the postMessage bridge between app iframes and backend services.
 *
 * Exported via @orient/apps package.
 */

import crypto from 'crypto';
import { createServiceLogger } from '@orient/core';
import { AppsService } from './appsService.js';
import { App, AppManifest } from '../types.js';

// Placeholder types for services that need to be implemented
// TODO: Implement these services
interface SchedulerService {
  createJob(
    options: unknown
  ): Promise<{ id: number; name: string; scheduleType: string; nextRunAt: Date; enabled: boolean }>;
  getAllJobs(): Promise<
    Array<{ id: number; name: string; scheduleType: string; nextRunAt: Date; enabled: boolean }>
  >;
  getJob(id: number): Promise<{
    id: number;
    name: string;
    scheduleType: string;
    nextRunAt: Date;
    enabled: boolean;
  } | null>;
  deleteJob(id: number): Promise<void>;
}

interface WebhookService {
  registerEndpoint(options: unknown): Promise<{ url: string; secret: string }>;
  listEndpoints(appName: string): Promise<Array<{ name: string; url: string }>>;
  deleteEndpoint(appName: string, endpointName: string): Promise<void>;
}

const logger = createServiceLogger('app-runtime');

// ============================================
// TYPES
// ============================================

export interface AppShareToken {
  token: string;
  appName: string;
  createdAt: Date;
  expiresAt?: Date;
  maxUses?: number;
  useCount: number;
  isActive: boolean;
}

export interface ToolInvocation {
  appName: string;
  shareToken: string;
  method: string;
  params: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface AppExecution {
  id: string;
  appName: string;
  shareToken: string;
  method: string;
  result: 'success' | 'error' | 'denied';
  errorMessage?: string;
  executedAt: Date;
  durationMs: number;
}

export interface AppRuntimeConfig {
  /** Rate limit: max tool calls per app per minute */
  rateLimitPerMinute?: number;
  /** Default share token expiry in days */
  defaultExpiryDays?: number;
}

// ============================================
// TOOL HANDLERS
// ============================================

type ToolHandler = (
  app: App,
  params: Record<string, unknown>,
  services: RuntimeServices
) => Promise<unknown>;

interface RuntimeServices {
  schedulerService?: SchedulerService;
  webhookService?: WebhookService;
  calendarService?: unknown; // Will be typed when integrated
  slackService?: unknown;
}

// ============================================
// APP RUNTIME SERVICE
// ============================================

export class AppRuntimeService {
  private appsService: AppsService;
  private services: RuntimeServices;
  private config: Required<AppRuntimeConfig>;

  // In-memory storage (should be moved to database for production)
  private shareTokens: Map<string, AppShareToken> = new Map();
  private executions: AppExecution[] = [];
  private rateLimitCounters: Map<string, { count: number; resetAt: Date }> = new Map();

  // Tool handlers
  private toolHandlers: Map<string, ToolHandler> = new Map();

  constructor(appsService: AppsService, services: RuntimeServices, config: AppRuntimeConfig = {}) {
    this.appsService = appsService;
    this.services = services;
    this.config = {
      rateLimitPerMinute: config.rateLimitPerMinute || 60,
      defaultExpiryDays: config.defaultExpiryDays || 30,
    };

    // Register built-in tool handlers
    this.registerBuiltInHandlers();

    logger.info('App runtime service initialized', {
      rateLimitPerMinute: this.config.rateLimitPerMinute,
    });
  }

  /**
   * Register built-in tool handlers
   */
  private registerBuiltInHandlers(): void {
    // Bridge ping (for connectivity check)
    this.toolHandlers.set('bridge.ping', async () => ({ ready: true }));

    // App metadata
    this.toolHandlers.set('app.getManifest', async (app) => app.manifest);
    this.toolHandlers.set('app.getShareUrl', async (app) => {
      const baseUrl = process.env.APPS_BASE_URL || 'https://apps.example.com';
      return `${baseUrl}/a/${app.manifest.name}`;
    });

    // Calendar tools
    this.toolHandlers.set('calendar.listEvents', async (app, params, services) => {
      this.requirePermission(app, 'calendar', 'read');
      // TODO: Integrate with actual calendar service
      logger.debug('calendar.listEvents called', { appName: app.manifest.name, params });
      return [];
    });

    this.toolHandlers.set('calendar.createEvent', async (app, params, services) => {
      this.requirePermission(app, 'calendar', 'write');
      // TODO: Integrate with actual calendar service
      logger.debug('calendar.createEvent called', { appName: app.manifest.name, params });
      return { id: crypto.randomUUID(), ...params };
    });

    this.toolHandlers.set('calendar.updateEvent', async (app, params, services) => {
      this.requirePermission(app, 'calendar', 'write');
      logger.debug('calendar.updateEvent called', { appName: app.manifest.name, params });
      return { id: params.eventId, ...params };
    });

    this.toolHandlers.set('calendar.deleteEvent', async (app, params, services) => {
      this.requirePermission(app, 'calendar', 'write');
      logger.debug('calendar.deleteEvent called', { appName: app.manifest.name, params });
      return { deleted: true };
    });

    // Scheduler tools
    this.toolHandlers.set('scheduler.createJob', async (app, params, services) => {
      this.requireCapability(app, 'scheduler');
      this.checkSchedulerLimit(app);

      if (!services.schedulerService) {
        throw new Error('Scheduler service not available');
      }

      const job = await services.schedulerService.createJob({
        name: `app:${app.manifest.name}:${params.name}`,
        description: `Created by app ${app.manifest.name}`,
        scheduleType: params.scheduleType as 'once' | 'recurring' | 'cron',
        runAt: params.runAt ? new Date(params.runAt as string) : undefined,
        cronExpression: params.cronExpression as string | undefined,
        intervalMinutes: params.intervalMinutes as number | undefined,
        provider: params.provider as 'whatsapp' | 'slack',
        target: params.target as string,
        messageTemplate: params.messageTemplate as string,
        enabled: true,
      });

      return {
        id: job.id,
        name: job.name,
        scheduleType: job.scheduleType,
        nextRunAt: job.nextRunAt,
        enabled: job.enabled,
      };
    });

    this.toolHandlers.set('scheduler.listJobs', async (app, params, services) => {
      this.requireCapability(app, 'scheduler');

      if (!services.schedulerService) {
        throw new Error('Scheduler service not available');
      }

      const allJobs = await services.schedulerService.getAllJobs();
      const appPrefix = `app:${app.manifest.name}:`;

      return allJobs
        .filter((job) => job.name.startsWith(appPrefix))
        .map((job) => ({
          id: job.id,
          name: job.name.replace(appPrefix, ''),
          scheduleType: job.scheduleType,
          nextRunAt: job.nextRunAt,
          enabled: job.enabled,
        }));
    });

    this.toolHandlers.set('scheduler.cancelJob', async (app, params, services) => {
      this.requireCapability(app, 'scheduler');

      if (!services.schedulerService) {
        throw new Error('Scheduler service not available');
      }

      const jobId = params.jobId as number;
      const job = await services.schedulerService.getJob(jobId);

      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      // Verify the job belongs to this app
      const appPrefix = `app:${app.manifest.name}:`;
      if (!job.name.startsWith(appPrefix)) {
        throw new Error(`Job ${jobId} does not belong to this app`);
      }

      await services.schedulerService.deleteJob(jobId);
      return { cancelled: true };
    });

    // Webhook tools
    this.toolHandlers.set('webhooks.getEndpointUrl', async (app, params, services) => {
      this.requireCapability(app, 'webhooks');

      const endpointName = params.endpointName as string;
      const endpoints = app.manifest.capabilities.webhooks?.endpoints || [];

      const endpoint = endpoints.find((e) => e.name === endpointName);
      if (!endpoint) {
        throw new Error(`Webhook endpoint "${endpointName}" not declared in APP.yaml`);
      }

      const baseUrl = process.env.APPS_BASE_URL || 'https://apps.example.com';
      return `${baseUrl}/hooks/${app.manifest.name}/${endpointName}`;
    });

    // Slack tools
    this.toolHandlers.set('slack.sendDM', async (app, params, services) => {
      this.requirePermission(app, 'slack', 'write');
      // TODO: Integrate with actual Slack service
      logger.debug('slack.sendDM called', { appName: app.manifest.name, params });
      return { sent: true };
    });

    this.toolHandlers.set('slack.sendChannel', async (app, params, services) => {
      this.requirePermission(app, 'slack', 'write');
      // TODO: Integrate with actual Slack service
      logger.debug('slack.sendChannel called', { appName: app.manifest.name, params });
      return { sent: true };
    });
  }

  /**
   * Generate a share token for an app
   */
  generateShareToken(appName: string, options?: { expiryDays?: number; maxUses?: number }): string {
    const app = this.appsService.getApp(appName);
    if (!app) {
      throw new Error(`App "${appName}" not found`);
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const now = new Date();
    const expiryDays = options?.expiryDays || this.config.defaultExpiryDays;

    const shareToken: AppShareToken = {
      token,
      appName,
      createdAt: now,
      expiresAt: expiryDays
        ? new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000)
        : undefined,
      maxUses: options?.maxUses,
      useCount: 0,
      isActive: true,
    };

    this.shareTokens.set(token, shareToken);

    logger.info('Share token generated', { appName, expiresAt: shareToken.expiresAt });

    return token;
  }

  /**
   * Validate a share token
   */
  validateShareToken(token: string): { valid: boolean; appName?: string; reason?: string } {
    const shareToken = this.shareTokens.get(token);

    if (!shareToken) {
      return { valid: false, reason: 'Token not found' };
    }

    if (!shareToken.isActive) {
      return { valid: false, reason: 'Token has been revoked' };
    }

    if (shareToken.expiresAt && shareToken.expiresAt < new Date()) {
      return { valid: false, reason: 'Token has expired' };
    }

    if (shareToken.maxUses && shareToken.useCount >= shareToken.maxUses) {
      return { valid: false, reason: 'Token usage limit reached' };
    }

    return { valid: true, appName: shareToken.appName };
  }

  /**
   * Revoke a share token
   */
  revokeShareToken(token: string): boolean {
    const shareToken = this.shareTokens.get(token);
    if (shareToken) {
      shareToken.isActive = false;
      return true;
    }
    return false;
  }

  /**
   * Execute a tool invocation from an app
   */
  async executeToolForApp(invocation: ToolInvocation): Promise<ToolResult> {
    const startTime = Date.now();
    const executionId = crypto.randomUUID();

    const { appName, shareToken, method, params } = invocation;

    try {
      // Validate share token
      const tokenValidation = this.validateShareToken(shareToken);
      if (!tokenValidation.valid) {
        return this.recordExecution(
          executionId,
          appName,
          shareToken,
          method,
          'denied',
          startTime,
          tokenValidation.reason
        );
      }

      if (tokenValidation.appName !== appName) {
        return this.recordExecution(
          executionId,
          appName,
          shareToken,
          method,
          'denied',
          startTime,
          'Token does not match app'
        );
      }

      // Get app
      const app = this.appsService.getApp(appName);
      if (!app) {
        return this.recordExecution(
          executionId,
          appName,
          shareToken,
          method,
          'error',
          startTime,
          'App not found'
        );
      }

      // Check rate limit
      if (!this.checkRateLimit(appName)) {
        return this.recordExecution(
          executionId,
          appName,
          shareToken,
          method,
          'denied',
          startTime,
          'Rate limit exceeded'
        );
      }

      // Get handler
      const handler = this.toolHandlers.get(method);
      if (!handler) {
        return this.recordExecution(
          executionId,
          appName,
          shareToken,
          method,
          'error',
          startTime,
          `Unknown method: ${method}`
        );
      }

      // Execute
      const result = await handler(app, params, this.services);

      // Increment token usage
      const token = this.shareTokens.get(shareToken);
      if (token) {
        token.useCount++;
      }

      return this.recordExecution(
        executionId,
        appName,
        shareToken,
        method,
        'success',
        startTime,
        undefined,
        result
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.recordExecution(
        executionId,
        appName,
        shareToken,
        method,
        'error',
        startTime,
        errorMessage
      );
    }
  }

  /**
   * Record an execution and return the result
   */
  private recordExecution(
    id: string,
    appName: string,
    shareToken: string,
    method: string,
    result: 'success' | 'error' | 'denied',
    startTime: number,
    errorMessage?: string,
    data?: unknown
  ): ToolResult {
    const durationMs = Date.now() - startTime;

    const execution: AppExecution = {
      id,
      appName,
      shareToken: shareToken.substring(0, 8) + '...', // Truncate for logging
      method,
      result,
      errorMessage,
      executedAt: new Date(),
      durationMs,
    };

    this.executions.push(execution);

    // Keep only last 1000 executions
    if (this.executions.length > 1000) {
      this.executions = this.executions.slice(-1000);
    }

    if (result === 'success') {
      logger.debug('Tool execution successful', { appName, method, durationMs });
      return { success: true, data };
    } else {
      logger.warn('Tool execution failed', { appName, method, result, errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Check rate limit for an app
   */
  private checkRateLimit(appName: string): boolean {
    const now = new Date();
    const key = appName;
    const counter = this.rateLimitCounters.get(key);

    if (!counter || counter.resetAt < now) {
      // Reset counter
      this.rateLimitCounters.set(key, {
        count: 1,
        resetAt: new Date(now.getTime() + 60 * 1000), // 1 minute window
      });
      return true;
    }

    if (counter.count >= this.config.rateLimitPerMinute) {
      return false;
    }

    counter.count++;
    return true;
  }

  /**
   * Require a permission for an app
   */
  private requirePermission(app: App, category: string, access: 'read' | 'write'): void {
    const permission = app.manifest.permissions[category as keyof typeof app.manifest.permissions];

    if (!permission || typeof permission !== 'object' || Array.isArray(permission)) {
      throw new Error(`App "${app.manifest.name}" does not have ${category} permission`);
    }

    const perm = permission as { read: boolean; write: boolean };
    const hasAccess = access === 'read' ? perm.read : perm.write;

    if (!hasAccess) {
      throw new Error(`App "${app.manifest.name}" does not have ${category}.${access} permission`);
    }
  }

  /**
   * Require a capability for an app
   */
  private requireCapability(app: App, capability: 'scheduler' | 'webhooks'): void {
    const cap = app.manifest.capabilities[capability];

    if (!cap?.enabled) {
      throw new Error(`App "${app.manifest.name}" does not have ${capability} capability enabled`);
    }
  }

  /**
   * Check scheduler job limit
   */
  private checkSchedulerLimit(app: App): void {
    const maxJobs = app.manifest.capabilities.scheduler?.max_jobs || 10;

    // Count existing jobs for this app
    // In production, this should query the scheduler database
    const appPrefix = `app:${app.manifest.name}:`;
    // For now, we skip this check
    // TODO: Implement proper job counting
  }

  /**
   * Get recent executions for an app
   */
  getExecutions(appName?: string, limit: number = 100): AppExecution[] {
    let executions = this.executions;

    if (appName) {
      executions = executions.filter((e) => e.appName === appName);
    }

    return executions.slice(-limit);
  }

  /**
   * Get execution statistics
   */
  getStats(appName?: string): {
    total: number;
    success: number;
    error: number;
    denied: number;
    avgDurationMs: number;
  } {
    let executions = this.executions;

    if (appName) {
      executions = executions.filter((e) => e.appName === appName);
    }

    const success = executions.filter((e) => e.result === 'success').length;
    const error = executions.filter((e) => e.result === 'error').length;
    const denied = executions.filter((e) => e.result === 'denied').length;
    const totalDuration = executions.reduce((sum, e) => sum + e.durationMs, 0);

    return {
      total: executions.length,
      success,
      error,
      denied,
      avgDurationMs: executions.length > 0 ? Math.round(totalDuration / executions.length) : 0,
    };
  }

  /**
   * List all share tokens for an app
   */
  getShareTokensForApp(
    appName: string
  ): Array<Omit<AppShareToken, 'token'> & { tokenPreview: string }> {
    return Array.from(this.shareTokens.values())
      .filter((t) => t.appName === appName)
      .map((t) => ({
        tokenPreview: t.token.substring(0, 8) + '...',
        appName: t.appName,
        createdAt: t.createdAt,
        expiresAt: t.expiresAt,
        maxUses: t.maxUses,
        useCount: t.useCount,
        isActive: t.isActive,
      }));
  }
}

/**
 * Create an AppRuntimeService instance
 */
export function createAppRuntimeService(
  appsService: AppsService,
  services: RuntimeServices,
  config?: AppRuntimeConfig
): AppRuntimeService {
  return new AppRuntimeService(appsService, services, config);
}
