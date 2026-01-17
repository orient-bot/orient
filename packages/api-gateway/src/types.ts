/**
 * API Gateway Type Definitions
 */

/**
 * Scheduled message configuration
 */
export interface ScheduledMessage {
  id: number;
  name: string;
  cronExpression: string;
  targetType: 'whatsapp' | 'slack';
  targetId: string;
  message: string;
  isActive: boolean;
  lastRun?: Date;
  nextRun?: Date;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Webhook forward configuration
 */
export interface WebhookForward {
  id: number;
  name: string;
  sourcePathPrefix: string;
  targetUrl: string;
  isActive: boolean;
  verifySignature: boolean;
  signatureHeader?: string;
  signatureSecret?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  latencyMs?: number;
  lastCheck: Date;
  details?: Record<string, unknown>;
}

/**
 * System health status
 */
export interface SystemHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  uptime: number;
  checks: HealthCheckResult[];
  timestamp: Date;
}

/**
 * Scheduler job info
 */
export interface SchedulerJobInfo {
  id: string;
  name: string;
  cronExpression: string;
  isRunning: boolean;
  nextRun?: Date;
  lastRun?: Date;
  lastResult?: 'success' | 'failure';
}
