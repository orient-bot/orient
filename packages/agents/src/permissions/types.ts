export type Platform = 'slack' | 'whatsapp' | 'dashboard' | 'opencode' | string;

export type PermissionAction = 'allow' | 'deny' | 'ask';
export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';
export type ApprovalGranularity = 'per_call' | 'per_session' | 'per_category';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface PlatformContext {
  platform: Platform;
  userId: string;
  sessionId: string;
  channelId?: string;
  threadId?: string;
  chatId?: string;
  metadata?: Record<string, unknown>;
}

export interface PermissionPolicy {
  id: string;
  name: string;
  description?: string;
  toolPatterns: string[];
  agentIds?: string[];
  platforms?: Platform[];
  action: PermissionAction;
  granularity: ApprovalGranularity;
  timeout?: number;
  promptTemplate?: string;
  riskLevel: RiskLevel;
  priority?: number;
  enabled?: boolean;
}

export interface ApprovalRequest {
  id: string;
  sessionId: string;
  platform: Platform;
  userId: string;
  agentId: string;
  tool: ToolCall;
  policy: PermissionPolicy;
  status: ApprovalStatus;
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface ApprovalGrant {
  id: number;
  sessionId: string;
  userId: string;
  grantType: 'tool' | 'category' | 'policy';
  grantValue: string;
  expiresAt?: Date;
  createdAt: Date;
}

export interface ApprovalPromptResult {
  requestId: string;
  platformMessageId?: string;
}

export interface ApprovalResult {
  requestId: string;
  status: ApprovalStatus;
  resolvedBy?: string;
  resolvedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface PolicyDecision {
  action: PermissionAction;
  policy?: PermissionPolicy;
  reason?: string;
  grant?: ApprovalGrant;
}
