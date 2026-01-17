import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPendingActionsStore,
  resetPendingActionsStore,
  type PendingAction,
  type ActionExecutionResult,
} from '../../src/tools/config/pending-store.js';

describe('PendingActionsStore', () => {
  beforeEach(() => {
    resetPendingActionsStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
  });

  afterEach(() => {
    resetPendingActionsStore();
    vi.useRealTimers();
  });

  it('creates and retrieves pending actions', () => {
    const store = getPendingActionsStore();
    const result = store.createPendingAction('permission', 'create', 'chat-123', { allow: true });

    expect(result.actionId).toMatch(/^cfg_/);
    expect(result.summary).toContain('Create permission');
    expect(result.expiresAt).toBeGreaterThan(Date.now());
    expect(store.pendingCount).toBe(1);

    const action = store.getAction(result.actionId);
    expect(action?.target).toBe('chat-123');
    expect(action?.changes).toEqual({ allow: true });
  });

  it('expires actions after TTL', async () => {
    const store = getPendingActionsStore();
    const result = store.createPendingAction('prompt', 'update', 'chat-456', { prompt: 'Hello' });

    expect(store.getAction(result.actionId)).toBeTruthy();

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
    expect(store.getAction(result.actionId)).toBeNull();
    expect(store.listPendingActions()).toHaveLength(0);
  });

  it('requires an executor to confirm actions', async () => {
    const store = getPendingActionsStore();
    const result = store.createPendingAction('secret', 'create', 'token', { value: 'abc' });

    const confirmation = await store.confirmAction(result.actionId);
    expect(confirmation.success).toBe(false);
    expect(confirmation.message).toContain('No executor registered');
  });

  it('executes and clears confirmed actions', async () => {
    const store = getPendingActionsStore();
    const result = store.createPendingAction('agent', 'update', 'agent-1', { enabled: true });

    const executor = vi.fn<[], Promise<ActionExecutionResult>>().mockResolvedValue({
      success: true,
      message: 'done',
    });

    store.registerExecutor('agent', executor);

    const confirmation = await store.confirmAction(result.actionId);
    expect(confirmation.success).toBe(true);
    expect(executor).toHaveBeenCalledTimes(1);
    expect(store.pendingCount).toBe(0);
  });

  it('cancels pending actions', () => {
    const store = getPendingActionsStore();
    const result = store.createPendingAction('schedule', 'delete', 'sched-1', { id: 'sched-1' });

    const cancelResult = store.cancelAction(result.actionId);
    expect(cancelResult.success).toBe(true);
    expect(store.pendingCount).toBe(0);
  });

  it('cleans up expired actions during list', async () => {
    const store = getPendingActionsStore();
    store.createPendingAction('permission', 'create', 'chat-789', { allow: false });

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
    const pending = store.listPendingActions();
    expect(pending).toHaveLength(0);
    expect(store.pendingCount).toBe(0);
  });
});
