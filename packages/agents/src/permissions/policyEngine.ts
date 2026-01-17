import { DEFAULT_POLICIES } from './defaultPolicies.js';
import type {
  ApprovalResult,
  PermissionPolicy,
  PlatformContext,
  PolicyDecision,
  ToolCall,
} from './types.js';
import type { PermissionStore } from './approvalStore.js';
import { PlatformAdapterRegistry } from './adapters/registry.js';

interface PolicyEngineConfig {
  store: PermissionStore;
  adapterRegistry: PlatformAdapterRegistry;
  defaultPolicies?: PermissionPolicy[];
  fallbackPlatform?: string;
  defaultTimeoutMs?: number;
}

interface ApprovalRequestInput {
  tool: ToolCall;
  context: PlatformContext;
  agentId: string;
  policy: PermissionPolicy;
}

type PendingResolver = {
  resolve: (value: ApprovalResult) => void;
  reject: (reason?: unknown) => void;
  timeoutId?: NodeJS.Timeout;
};

function normalizePriority(value?: number): number {
  return typeof value === 'number' ? value : 0;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternToRegex(pattern: string): RegExp {
  const escaped = escapeRegExp(pattern).replace(/\\\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function matchesPattern(pattern: string, value: string): boolean {
  return patternToRegex(pattern).test(value);
}

function matchesAnyPattern(patterns: string[], value: string): boolean {
  return patterns.some((pattern) => matchesPattern(pattern, value));
}

export class PolicyEngine {
  private store: PermissionStore;
  private adapterRegistry: PlatformAdapterRegistry;
  private defaultPolicies: PermissionPolicy[];
  private fallbackPlatform: string;
  private defaultTimeoutMs: number;
  private pending = new Map<string, PendingResolver>();

  constructor(config: PolicyEngineConfig) {
    this.store = config.store;
    this.adapterRegistry = config.adapterRegistry;
    this.defaultPolicies = config.defaultPolicies ?? DEFAULT_POLICIES;
    this.fallbackPlatform = config.fallbackPlatform ?? 'dashboard';
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 5 * 60 * 1000;
  }

  async evaluateToolCall(
    tool: ToolCall,
    context: PlatformContext,
    agentId: string
  ): Promise<PolicyDecision> {
    const policies = await this.getPolicies();
    const matched = policies.find((policy) => this.policyApplies(policy, tool, context, agentId));

    if (!matched) {
      return { action: 'allow' };
    }

    if (matched.action !== 'ask') {
      return { action: matched.action, policy: matched };
    }

    if (matched.granularity !== 'per_call') {
      const grantType = matched.granularity === 'per_session' ? 'policy' : 'category';
      const grants = await this.store.listApprovalGrants({
        sessionId: context.sessionId,
        userId: context.userId,
        grantType,
        grantValue: matched.id,
      });

      const validGrant = grants.find((grant) => !grant.expiresAt || grant.expiresAt > new Date());
      if (validGrant) {
        return { action: 'allow', policy: matched, grant: validGrant };
      }
    }

    return { action: 'ask', policy: matched };
  }

  async requestApproval(input: ApprovalRequestInput): Promise<ApprovalResult> {
    const requestId = this.createRequestId();
    const requestPlatform = this.resolveRequestPlatform(input.context.platform);
    const requestContext: PlatformContext = {
      ...input.context,
      platform: requestPlatform,
    };

    const request = await this.store.createApprovalRequest({
      id: requestId,
      sessionId: input.context.sessionId,
      platform: requestPlatform,
      userId: input.context.userId,
      agentId: input.agentId,
      policy: input.policy,
      toolName: input.tool.name,
      toolInput: input.tool.input,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: this.getExpiry(input.policy),
    });

    const adapter = this.adapterRegistry.get(requestPlatform);
    if (!adapter) {
      const denied = await this.resolveApproval(request.id, {
        requestId: request.id,
        status: 'denied',
        resolvedBy: 'system',
        resolvedAt: new Date(),
        metadata: { reason: 'No approval adapter registered' },
      });
      return denied;
    }

    const promptResult = await adapter.requestApproval(request, requestContext);
    await this.store.updateApprovalRequest(request.id, {
      platformMessageId: promptResult.platformMessageId,
    });

    return this.waitForApproval(request.id, input.policy.timeout);
  }

  async handlePlatformResponse(
    platform: string,
    response: unknown
  ): Promise<ApprovalResult | null> {
    const adapter = this.adapterRegistry.get(platform);
    if (!adapter) return null;

    const result = await adapter.handleApprovalResponse(response);
    if (!result) return null;

    return this.resolveApproval(result.requestId, result);
  }

  async resolveApproval(requestId: string, result: ApprovalResult): Promise<ApprovalResult> {
    const request = await this.store.getApprovalRequest(requestId);
    if (!request) {
      return { ...result, requestId, status: 'denied' };
    }

    await this.store.updateApprovalRequest(requestId, {
      status: result.status,
      resolvedAt: result.resolvedAt ?? new Date(),
      resolvedBy: result.resolvedBy,
    });

    if (result.status === 'approved' && request.policy.granularity !== 'per_call') {
      const grantType = request.policy.granularity === 'per_session' ? 'policy' : 'category';
      await this.store.createApprovalGrant({
        sessionId: request.sessionId,
        userId: request.userId,
        grantType,
        grantValue: request.policy.id,
        expiresAt: request.expiresAt,
      });
    }

    const pending = this.pending.get(requestId);
    if (pending) {
      if (pending.timeoutId) clearTimeout(pending.timeoutId);
      pending.resolve(result);
      this.pending.delete(requestId);
    }

    return result;
  }

  private async getPolicies(): Promise<PermissionPolicy[]> {
    const stored = await this.store.listPolicies();
    const merged = new Map<string, PermissionPolicy>();

    for (const policy of this.defaultPolicies) {
      merged.set(policy.id, policy);
    }

    for (const policy of stored) {
      merged.set(policy.id, policy);
    }

    return Array.from(merged.values()).sort(
      (a, b) => normalizePriority(b.priority) - normalizePriority(a.priority)
    );
  }

  private policyApplies(
    policy: PermissionPolicy,
    tool: ToolCall,
    context: PlatformContext,
    agentId: string
  ): boolean {
    if (policy.enabled === false) return false;
    if (policy.platforms && !policy.platforms.includes(context.platform)) return false;
    if (policy.agentIds && !policy.agentIds.includes(agentId)) return false;
    return matchesAnyPattern(policy.toolPatterns, tool.name);
  }

  private resolveRequestPlatform(platform: string): string {
    const adapter = this.adapterRegistry.get(platform);
    if (adapter?.supportsNativeApproval) {
      return platform;
    }
    return this.fallbackPlatform;
  }

  private getExpiry(policy: PermissionPolicy): Date | undefined {
    if (!policy.timeout) return undefined;
    return new Date(Date.now() + policy.timeout);
  }

  private waitForApproval(requestId: string, timeout?: number): Promise<ApprovalResult> {
    return new Promise((resolve, reject) => {
      const timeoutMs = timeout ?? this.defaultTimeoutMs;
      const timeoutId = setTimeout(() => {
        void this.resolveApproval(requestId, {
          requestId,
          status: 'expired',
          resolvedBy: 'system',
          resolvedAt: new Date(),
        });
      }, timeoutMs);

      this.pending.set(requestId, { resolve, reject, timeoutId });
    });
  }

  private createRequestId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `approval_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}
