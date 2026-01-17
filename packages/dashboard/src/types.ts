/**
 * Dashboard Types
 *
 * Type definitions for the dashboard package.
 */

// ============================================================================
// Stats Types
// ============================================================================

/**
 * Message statistics
 */
export interface MessageStats {
  totalMessages: number;
  messagesLast24h: number;
  messagesLast7d: number;
  uniqueContacts: number;
  uniqueGroups: number;
}

/**
 * Platform-specific stats
 */
export interface PlatformStats {
  whatsapp: MessageStats;
  slack: MessageStats;
}

/**
 * Health status
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: ServiceHealth[];
  uptime: number;
  lastCheck: Date;
}

/**
 * Individual service health
 */
export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  message?: string;
  lastCheck: Date;
}

// ============================================================================
// Chat Types
// ============================================================================

/**
 * Chat configuration
 */
export interface ChatConfig {
  id: string;
  platform: 'whatsapp' | 'slack';
  chatId: string;
  chatName?: string;
  permission: 'ignored' | 'read_only' | 'read_write';
  customPrompt?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Chat list item
 */
export interface ChatListItem {
  id: string;
  platform: 'whatsapp' | 'slack';
  chatId: string;
  chatName: string;
  permission: 'ignored' | 'read_only' | 'read_write';
  lastMessage?: Date;
  messageCount: number;
}

// ============================================================================
// Scheduled Message Types
// ============================================================================

/**
 * Scheduled message
 */
export interface ScheduledMessage {
  id: number;
  name: string;
  cronExpression: string;
  targetType: 'slack' | 'whatsapp';
  targetId: string;
  message: string;
  isActive: boolean;
  lastRun?: Date;
  nextRun?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create scheduled message request
 */
export interface CreateScheduledMessageRequest {
  name: string;
  cronExpression: string;
  targetType: 'slack' | 'whatsapp';
  targetId: string;
  message: string;
}

// ============================================================================
// System Prompt Types
// ============================================================================

/**
 * System prompt configuration
 */
export interface SystemPrompt {
  id: string;
  name: string;
  prompt: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Audit Log Types
// ============================================================================

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  action: string;
  actor: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Standard API response
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
