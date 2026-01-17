import type { ApprovalGrant, ApprovalRequest, ApprovalStatus, PermissionPolicy } from './types.js';

export interface ApprovalRequestCreateInput {
  id: string;
  sessionId: string;
  platform: string;
  userId: string;
  agentId: string;
  policy: PermissionPolicy;
  toolName: string;
  toolInput: Record<string, unknown>;
  status: ApprovalStatus;
  platformMessageId?: string;
  createdAt: Date;
  expiresAt?: Date;
}

export interface ApprovalRequestUpdateInput {
  status?: ApprovalStatus;
  platformMessageId?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
  expiresAt?: Date;
}

export interface ApprovalRequestFilter {
  id?: string;
  sessionId?: string;
  platform?: string;
  userId?: string;
  agentId?: string;
  status?: ApprovalStatus;
}

export interface ApprovalGrantFilter {
  sessionId: string;
  userId: string;
  grantType?: ApprovalGrant['grantType'];
  grantValue?: string;
}

export interface PermissionStore {
  listPolicies(): Promise<PermissionPolicy[]>;
  createApprovalRequest(input: ApprovalRequestCreateInput): Promise<ApprovalRequest>;
  updateApprovalRequest(
    id: string,
    input: ApprovalRequestUpdateInput
  ): Promise<ApprovalRequest | null>;
  getApprovalRequest(id: string): Promise<ApprovalRequest | null>;
  listApprovalRequests(filter: ApprovalRequestFilter): Promise<ApprovalRequest[]>;
  listApprovalGrants(filter: ApprovalGrantFilter): Promise<ApprovalGrant[]>;
  createApprovalGrant(grant: Omit<ApprovalGrant, 'id' | 'createdAt'>): Promise<ApprovalGrant>;
  deleteApprovalGrants(filter: ApprovalGrantFilter): Promise<number>;
}

export class InMemoryPermissionStore implements PermissionStore {
  private policies: PermissionPolicy[] = [];
  private requests = new Map<string, ApprovalRequest>();
  private grants: ApprovalGrant[] = [];
  private grantId = 1;

  constructor(initialPolicies: PermissionPolicy[] = []) {
    this.policies = [...initialPolicies];
  }

  async listPolicies(): Promise<PermissionPolicy[]> {
    return [...this.policies];
  }

  async createApprovalRequest(input: ApprovalRequestCreateInput): Promise<ApprovalRequest> {
    const request: ApprovalRequest = {
      id: input.id,
      sessionId: input.sessionId,
      platform: input.platform,
      userId: input.userId,
      agentId: input.agentId,
      tool: {
        name: input.toolName,
        input: input.toolInput,
      },
      policy: input.policy,
      status: input.status,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
    };

    this.requests.set(request.id, request);
    return request;
  }

  async updateApprovalRequest(
    id: string,
    input: ApprovalRequestUpdateInput
  ): Promise<ApprovalRequest | null> {
    const existing = this.requests.get(id);
    if (!existing) return null;

    const updated: ApprovalRequest = {
      ...existing,
      status: input.status ?? existing.status,
      resolvedAt: input.resolvedAt ?? existing.resolvedAt,
      resolvedBy: input.resolvedBy ?? existing.resolvedBy,
      expiresAt: input.expiresAt ?? existing.expiresAt,
    };

    this.requests.set(id, updated);
    return updated;
  }

  async getApprovalRequest(id: string): Promise<ApprovalRequest | null> {
    return this.requests.get(id) ?? null;
  }

  async listApprovalRequests(filter: ApprovalRequestFilter): Promise<ApprovalRequest[]> {
    return Array.from(this.requests.values()).filter((request) => {
      if (filter.id && request.id !== filter.id) return false;
      if (filter.sessionId && request.sessionId !== filter.sessionId) return false;
      if (filter.platform && request.platform !== filter.platform) return false;
      if (filter.userId && request.userId !== filter.userId) return false;
      if (filter.agentId && request.agentId !== filter.agentId) return false;
      if (filter.status && request.status !== filter.status) return false;
      return true;
    });
  }

  async listApprovalGrants(filter: ApprovalGrantFilter): Promise<ApprovalGrant[]> {
    return this.grants.filter((grant) => {
      if (grant.sessionId !== filter.sessionId) return false;
      if (grant.userId !== filter.userId) return false;
      if (filter.grantType && grant.grantType !== filter.grantType) return false;
      if (filter.grantValue && grant.grantValue !== filter.grantValue) return false;
      return true;
    });
  }

  async createApprovalGrant(
    grant: Omit<ApprovalGrant, 'id' | 'createdAt'>
  ): Promise<ApprovalGrant> {
    const created: ApprovalGrant = {
      id: this.grantId++,
      createdAt: new Date(),
      ...grant,
    };
    this.grants.push(created);
    return created;
  }

  async deleteApprovalGrants(filter: ApprovalGrantFilter): Promise<number> {
    const before = this.grants.length;
    this.grants = this.grants.filter((grant) => {
      if (grant.sessionId !== filter.sessionId) return true;
      if (grant.userId !== filter.userId) return true;
      if (filter.grantType && grant.grantType !== filter.grantType) return true;
      if (filter.grantValue && grant.grantValue !== filter.grantValue) return true;
      return false;
    });
    return before - this.grants.length;
  }
}
