/**
 * Tests for Slack Bot Service - Pending Actions
 *
 * Tests for:
 * - detectPendingActions() regex pattern matching
 * - createPendingActionBlocks() Block Kit generation
 * - Action button handler parsing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock core
vi.mock('@orient/core', () => ({
  createDedicatedServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
  AVAILABLE_MODELS: {},
  parseModelName: vi.fn(),
}));

// Mock database-services
vi.mock('@orient/database-services', () => ({
  SlackDatabase: class {
    getChannelPermission = vi.fn();
    storeIncomingMessage = vi.fn();
    storeOutgoingMessage = vi.fn();
  },
}));

// Mock agents
vi.mock('@orient/agents', () => ({
  PromptService: class {},
  createProgressiveResponder: () => ({
    executeWithProgress: async <T>(fn: () => Promise<T>) => ({
      result: await fn(),
      messageCount: 0,
    }),
  }),
}));

// Mock @slack/bolt
vi.mock('@slack/bolt', () => ({
  default: {
    App: class {
      event = vi.fn();
      message = vi.fn();
      command = vi.fn();
      action = vi.fn();
      client = {
        auth: { test: vi.fn().mockResolvedValue({ user_id: 'U123' }) },
        chat: { postMessage: vi.fn(), update: vi.fn() },
        reactions: { add: vi.fn() },
        users: { info: vi.fn() },
        conversations: { list: vi.fn() },
      };
      start = vi.fn();
      stop = vi.fn();
    },
    LogLevel: { INFO: 'info' },
  },
  App: class {
    event = vi.fn();
    message = vi.fn();
    command = vi.fn();
    action = vi.fn();
    client = {
      auth: { test: vi.fn().mockResolvedValue({ user_id: 'U123' }) },
      chat: { postMessage: vi.fn(), update: vi.fn() },
      reactions: { add: vi.fn() },
      users: { info: vi.fn() },
      conversations: { list: vi.fn() },
    };
    start = vi.fn();
    stop = vi.fn();
  },
  LogLevel: { INFO: 'info' },
}));

// Mock openCodeSlackHandler
vi.mock('../src/services/openCodeSlackHandler.js', () => ({
  createOpenCodeSlackHandler: () => ({
    processMessage: vi.fn().mockResolvedValue({ text: 'Response', model: 'test', toolsUsed: [] }),
    isServerAvailable: vi.fn().mockResolvedValue(true),
    setPromptService: vi.fn(),
    getModelForContext: vi.fn().mockReturnValue({ name: 'Test', provider: 'test' }),
    setModelForContext: vi.fn(),
    detectModelSwitch: vi.fn(),
  }),
  OpenCodeSlackHandler: {
    getAvailableModelsInfo: vi.fn().mockReturnValue('Models info'),
  },
}));

describe('Pending Actions', () => {
  describe('detectPendingActions regex', () => {
    // Test the regex pattern directly since the method is private
    const detectPendingActions = (text: string): string[] => {
      const regex = /cfg_[a-z0-9]+_[a-z0-9]+/gi;
      const matches = text.match(regex);
      return matches || [];
    };

    it('should detect single pending action ID', () => {
      const text = 'Please confirm action cfg_abc123_def456 to proceed.';
      const result = detectPendingActions(text);
      expect(result).toEqual(['cfg_abc123_def456']);
    });

    it('should detect multiple pending action IDs', () => {
      const text = 'Found actions cfg_aaa_bbb and cfg_ccc_ddd and cfg_eee_fff';
      const result = detectPendingActions(text);
      expect(result).toEqual(['cfg_aaa_bbb', 'cfg_ccc_ddd', 'cfg_eee_fff']);
    });

    it('should return empty array when no action IDs found', () => {
      const text = 'No pending actions here.';
      const result = detectPendingActions(text);
      expect(result).toEqual([]);
    });

    it('should be case-insensitive', () => {
      const text = 'Actions: CFG_ABC_DEF and cfg_ghi_jkl and Cfg_Mno_Pqr';
      const result = detectPendingActions(text);
      expect(result).toHaveLength(3);
    });

    it('should not match invalid formats', () => {
      const text = 'cfg_only cfg__double cfg_no and_cfg_reversed';
      const result = detectPendingActions(text);
      expect(result).toEqual([]);
    });

    it('should match action IDs with numbers', () => {
      const text = 'Confirm cfg_123abc_456def for the update.';
      const result = detectPendingActions(text);
      expect(result).toEqual(['cfg_123abc_456def']);
    });

    it('should handle action ID at start of text', () => {
      const text = 'cfg_start_test is the action';
      const result = detectPendingActions(text);
      expect(result).toEqual(['cfg_start_test']);
    });

    it('should handle action ID at end of text', () => {
      const text = 'The action is cfg_end_test';
      const result = detectPendingActions(text);
      expect(result).toEqual(['cfg_end_test']);
    });
  });

  describe('createPendingActionBlocks structure', () => {
    // Test the block structure directly
    const createPendingActionBlocks = (text: string, actionId: string) => {
      const sectionBlock = {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: text,
        },
      };

      const actionsBlock = {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Approve',
              emoji: true,
            },
            style: 'primary',
            action_id: `config_approve_${actionId}`,
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Reject',
              emoji: true,
            },
            style: 'danger',
            action_id: `config_reject_${actionId}`,
          },
        ],
      };

      return [sectionBlock, actionsBlock];
    };

    it('should create two blocks - section and actions', () => {
      const blocks = createPendingActionBlocks('Test message', 'cfg_abc_123');
      expect(blocks).toHaveLength(2);
      expect(blocks[0].type).toBe('section');
      expect(blocks[1].type).toBe('actions');
    });

    it('should include message text in section block', () => {
      const message = 'Please confirm the pending action cfg_test_id';
      const blocks = createPendingActionBlocks(message, 'cfg_test_id');

      expect(blocks[0]).toEqual({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message,
        },
      });
    });

    it('should create Approve button with correct action_id', () => {
      const actionId = 'cfg_myaction_123';
      const blocks = createPendingActionBlocks('Message', actionId);
      const actionsBlock = blocks[1];

      const approveButton = actionsBlock.elements[0];
      expect(approveButton.action_id).toBe(`config_approve_${actionId}`);
      expect(approveButton.text.text).toBe('Approve');
      expect(approveButton.style).toBe('primary');
    });

    it('should create Reject button with correct action_id', () => {
      const actionId = 'cfg_myaction_456';
      const blocks = createPendingActionBlocks('Message', actionId);
      const actionsBlock = blocks[1];

      const rejectButton = actionsBlock.elements[1];
      expect(rejectButton.action_id).toBe(`config_reject_${actionId}`);
      expect(rejectButton.text.text).toBe('Reject');
      expect(rejectButton.style).toBe('danger');
    });

    it('should have two buttons in actions block', () => {
      const blocks = createPendingActionBlocks('Test', 'cfg_x_y');
      expect(blocks[1].elements).toHaveLength(2);
    });
  });

  describe('action_id parsing for button handler', () => {
    // Test the regex used in the action handler
    const parseActionId = (actionId: string) => {
      const match = actionId.match(/^config_(approve|reject)_(cfg_.+)$/);
      if (!match) return null;
      return {
        actionType: match[1],
        pendingActionId: match[2],
      };
    };

    it('should parse approve action correctly', () => {
      const result = parseActionId('config_approve_cfg_abc_123');
      expect(result).toEqual({
        actionType: 'approve',
        pendingActionId: 'cfg_abc_123',
      });
    });

    it('should parse reject action correctly', () => {
      const result = parseActionId('config_reject_cfg_xyz_789');
      expect(result).toEqual({
        actionType: 'reject',
        pendingActionId: 'cfg_xyz_789',
      });
    });

    it('should return null for invalid format', () => {
      expect(parseActionId('invalid_action_id')).toBeNull();
      expect(parseActionId('config_approve_notcfg')).toBeNull();
      expect(parseActionId('config_delete_cfg_abc_123')).toBeNull();
    });

    it('should handle complex action IDs', () => {
      const result = parseActionId('config_approve_cfg_longid123abc_xyz789def');
      expect(result).toEqual({
        actionType: 'approve',
        pendingActionId: 'cfg_longid123abc_xyz789def',
      });
    });
  });
});

describe('Action handler regex pattern', () => {
  // Test the regex pattern used in app.action()
  const actionRegex = /^config_(approve|reject)_.+$/;

  it('should match approve action pattern', () => {
    expect(actionRegex.test('config_approve_cfg_abc_123')).toBe(true);
  });

  it('should match reject action pattern', () => {
    expect(actionRegex.test('config_reject_cfg_xyz_789')).toBe(true);
  });

  it('should not match other action patterns', () => {
    expect(actionRegex.test('config_delete_cfg_abc')).toBe(false);
    expect(actionRegex.test('other_action_id')).toBe(false);
    expect(actionRegex.test('config_')).toBe(false);
  });
});
