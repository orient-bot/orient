/**
 * PolicyEngine Tests
 */
import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../src/permissions/policyEngine.js';
import { InMemoryPermissionStore } from '../src/permissions/approvalStore.js';
import { PlatformAdapterRegistry } from '../src/permissions/adapters/registry.js';
import type { PlatformApprovalAdapter } from '../src/permissions/adapters/base.js';
import type { PermissionPolicy, PlatformContext, ToolCall } from '../src/permissions/types.js';

class TestApprovalAdapter implements PlatformApprovalAdapter {
  platform = 'slack';
  supportsNativeApproval = true;
  supportedInteractionTypes = ['button'] as const;
  lastRequestId: string | null = null;

  async requestApproval(request: { id: string }) {
    this.lastRequestId = request.id;
    return { requestId: request.id };
  }

  async handleApprovalResponse(response: { requestId: string; approved: boolean }) {
    return {
      requestId: response.requestId,
      status: response.approved ? 'approved' : 'denied',
      resolvedBy: 'tester',
      resolvedAt: new Date(),
    };
  }

  async cancelRequest(): Promise<void> {
    return;
  }

  formatApprovalPrompt() {
    return {};
  }

  formatApprovalResult() {
    return {};
  }
}

const BASE_CONTEXT: PlatformContext = {
  platform: 'slack',
  userId: 'user-1',
  sessionId: 'session-1',
  channelId: 'channel-1',
};

const TOOL_CALL: ToolCall = {
  name: 'file_write',
  input: { path: '/tmp/test.txt' },
};

describe('PolicyEngine', () => {
  it('allows tool call when no policy matches', async () => {
    const store = new InMemoryPermissionStore([]);
    const registry = new PlatformAdapterRegistry();
    const engine = new PolicyEngine({
      store,
      adapterRegistry: registry,
      defaultPolicies: [],
    });

    const decision = await engine.evaluateToolCall(TOOL_CALL, BASE_CONTEXT, 'agent-1');
    expect(decision.action).toBe('allow');
  });

  it('denies tool call when deny policy matches', async () => {
    const policy: PermissionPolicy = {
      id: 'deny-danger',
      name: 'Deny dangerous tool',
      toolPatterns: ['file_*'],
      action: 'deny',
      granularity: 'per_call',
      riskLevel: 'high',
      enabled: true,
    };
    const store = new InMemoryPermissionStore([policy]);
    const registry = new PlatformAdapterRegistry();
    const engine = new PolicyEngine({
      store,
      adapterRegistry: registry,
      defaultPolicies: [],
    });

    const decision = await engine.evaluateToolCall(TOOL_CALL, BASE_CONTEXT, 'agent-1');
    expect(decision.action).toBe('deny');
  });

  it('grants per-session approval after user approval', async () => {
    const policy: PermissionPolicy = {
      id: 'ask-session',
      name: 'Ask per session',
      toolPatterns: ['file_*'],
      action: 'ask',
      granularity: 'per_session',
      riskLevel: 'medium',
      enabled: true,
    };
    const store = new InMemoryPermissionStore([policy]);
    const registry = new PlatformAdapterRegistry();
    const adapter = new TestApprovalAdapter();
    registry.register(adapter);

    const engine = new PolicyEngine({
      store,
      adapterRegistry: registry,
      defaultPolicies: [],
    });

    const decision = await engine.evaluateToolCall(TOOL_CALL, BASE_CONTEXT, 'agent-1');
    expect(decision.action).toBe('ask');

    const approvalPromise = engine.requestApproval({
      tool: TOOL_CALL,
      context: BASE_CONTEXT,
      agentId: 'agent-1',
      policy,
    });

    // Wait for the async requestApproval to reach the adapter call
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(adapter.lastRequestId).toBeTruthy();
    await engine.handlePlatformResponse('slack', {
      requestId: adapter.lastRequestId!,
      approved: true,
    });

    const approval = await approvalPromise;
    expect(approval.status).toBe('approved');

    const followupDecision = await engine.evaluateToolCall(TOOL_CALL, BASE_CONTEXT, 'agent-1');
    expect(followupDecision.action).toBe('allow');
  });

  it('denies when no adapter registered', async () => {
    const policy: PermissionPolicy = {
      id: 'ask-per-call',
      name: 'Ask per call',
      toolPatterns: ['file_*'],
      action: 'ask',
      granularity: 'per_call',
      riskLevel: 'medium',
      enabled: true,
    };
    const store = new InMemoryPermissionStore([policy]);
    const registry = new PlatformAdapterRegistry();
    const engine = new PolicyEngine({
      store,
      adapterRegistry: registry,
      defaultPolicies: [],
    });

    const approval = await engine.requestApproval({
      tool: TOOL_CALL,
      context: BASE_CONTEXT,
      agentId: 'agent-1',
      policy,
    });

    expect(approval.status).toBe('denied');
  });
});
