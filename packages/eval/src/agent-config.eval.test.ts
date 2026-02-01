/**
 * Agent Configuration Eval Tests
 *
 * Verifies that OpenCode has the correct agent configuration after sync.
 * These tests hit the OpenCode /config API endpoint directly — no API keys needed.
 *
 * Requirements:
 * - OpenCode server must be running at localhost:4099
 *
 * Usage: npx vitest run src/agent-config.eval.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';

const OPENCODE_URL = process.env.OPENCODE_URL || 'http://localhost:4099';

interface OpenCodeConfig {
  $schema?: string;
  model: string;
  default_agent: string;
  agent: Record<
    string,
    {
      prompt?: string;
      tools?: Record<string, boolean>;
      description: string;
      mode: string;
      permission?: Record<string, string>;
    }
  >;
}

let config: OpenCodeConfig;
let healthy = false;

describe('Agent Configuration', () => {
  beforeAll(async () => {
    // Check OpenCode is running
    try {
      const healthRes = await fetch(`${OPENCODE_URL}/global/health`);
      const health = (await healthRes.json()) as { healthy: boolean };
      healthy = health.healthy;
    } catch {
      healthy = false;
    }

    if (!healthy) {
      console.warn('OpenCode is not running — skipping agent config tests');
      return;
    }

    // Fetch config
    const res = await fetch(`${OPENCODE_URL}/config`);
    config = (await res.json()) as OpenCodeConfig;
  });

  describe('Global Config', () => {
    it('should have ori as default_agent', () => {
      if (!healthy) return;
      expect(config.default_agent).toBe('ori');
    });

    it('should use Claude Haiku as default model', () => {
      if (!healthy) return;
      expect(config.model).toBe('anthropic/claude-haiku-4-5-20251001');
    });

    it('should NOT use gpt-4o-mini as default model', () => {
      if (!healthy) return;
      expect(config.model).not.toContain('gpt-4o-mini');
    });
  });

  describe('Ori Agent', () => {
    it('should exist in agent config', () => {
      if (!healthy) return;
      expect(config.agent.ori).toBeDefined();
    });

    it('should be a primary agent', () => {
      if (!healthy) return;
      expect(config.agent.ori.mode).toBe('primary');
    });

    it('should have border collie personality in prompt', () => {
      if (!healthy) return;
      const prompt = config.agent.ori.prompt || '';
      expect(prompt).toContain('border collie');
      expect(prompt).toContain('Ask Ori. I act.');
    });

    it('should have PM capabilities in prompt', () => {
      if (!healthy) return;
      const prompt = config.agent.ori.prompt || '';
      expect(prompt).toContain('JIRA');
      expect(prompt).toContain('Slack');
      expect(prompt).toContain('WhatsApp');
      expect(prompt).toContain('Google Calendar');
      expect(prompt).toContain('Mini-Apps');
    });

    it('should have tool usage guidelines in prompt', () => {
      if (!healthy) return;
      const prompt = config.agent.ori.prompt || '';
      expect(prompt).toContain('Tool Usage Guidelines');
      expect(prompt).toContain('Simple greetings and conversations DO NOT require tools');
      expect(prompt).toContain('discover_tools');
    });

    it('should deny write/edit/bash tools', () => {
      if (!healthy) return;
      const tools = config.agent.ori.tools || {};
      expect(tools.write).toBe(false);
      expect(tools.edit).toBe(false);
      expect(tools.bash).toBe(false);
    });

    it('should allow config tools', () => {
      if (!healthy) return;
      const tools = config.agent.ori.tools || {};
      expect(tools.config_confirm_action).toBe(true);
      expect(tools.config_set_permission).toBe(true);
      expect(tools.config_list_agents).toBe(true);
      expect(tools.discover_tools).toBe(true);
    });

    it('should have a description mentioning border collie', () => {
      if (!healthy) return;
      expect(config.agent.ori.description).toContain('border collie');
    });
  });

  describe('Other Seed Agents', () => {
    it('should have communicator agent as subagent', () => {
      if (!healthy) return;
      expect(config.agent.communicator).toBeDefined();
      expect(config.agent.communicator.mode).toBe('subagent');
    });

    it('should have scheduler agent as subagent', () => {
      if (!healthy) return;
      expect(config.agent.scheduler).toBeDefined();
      expect(config.agent.scheduler.mode).toBe('subagent');
    });

    it('should have explorer agent as subagent', () => {
      if (!healthy) return;
      expect(config.agent.explorer).toBeDefined();
      expect(config.agent.explorer.mode).toBe('subagent');
    });

    it('should have app-builder agent as subagent', () => {
      if (!healthy) return;
      expect(config.agent['app-builder']).toBeDefined();
      expect(config.agent['app-builder'].mode).toBe('subagent');
    });
  });

  describe('OpenCode-only Agents Preserved', () => {
    it('should still have build agent', () => {
      if (!healthy) return;
      expect(config.agent.build).toBeDefined();
      expect(config.agent.build.mode).toBe('primary');
    });

    it('should still have plan agent', () => {
      if (!healthy) return;
      expect(config.agent.plan).toBeDefined();
      expect(config.agent.plan.mode).toBe('primary');
    });
  });

  describe('Removed Agents', () => {
    it('should NOT have pm-assistant agent', () => {
      if (!healthy) return;
      expect(config.agent['pm-assistant']).toBeUndefined();
    });
  });
});
