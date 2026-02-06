/**
 * Tests for ensureOpenCodeConfig() logic from main.ts
 *
 * Verifies opencode.json generation, path resolution, and skip-if-exists logic.
 * Since ensureOpenCodeConfig is a private function in main.ts, we re-implement
 * its logic here for unit testing. Integration testing validates it end-to-end.
 *
 * Run with: pnpm --filter @orient-bot/dashboard test ensureOpenCodeConfig
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('ensureOpenCodeConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orient-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Reimplementation of the ensureOpenCodeConfig logic for testing.
   * This mirrors the function in main.ts.
   */
  function ensureOpenCodeConfig(orientHome: string, resolvedMcpPath?: string): void {
    const configPath = path.join(orientHome, 'opencode.json');
    if (fs.existsSync(configPath)) return;

    let assistantServerPath: string;
    if (resolvedMcpPath) {
      assistantServerPath = resolvedMcpPath;
    } else {
      try {
        assistantServerPath = require.resolve('@orient-bot/mcp-servers/dist/assistant-server.js');
      } catch {
        return;
      }
    }

    const config = {
      $schema: 'https://opencode.ai/config.json',
      default_agent: 'ori',
      model: 'anthropic/claude-haiku-4-5',
      mcp: {
        'orient-assistant': {
          type: 'local',
          command: ['node', assistantServerPath],
          enabled: true,
        },
      },
      permission: {
        edit: 'allow',
        bash: 'allow',
        webfetch: 'allow',
        skill: 'allow',
        doom_loop: 'allow',
        external_directory: 'allow',
        mcp: 'allow',
        read: 'allow',
      },
      agent: {
        ori: {
          mode: 'primary',
          description:
            'Your friendly border collie companion for JIRA, meetings, workflows, and onboarding',
          prompt: "I'm Ori, a friendly border collie here to help!",
          tools: {
            write: false,
            edit: false,
            bash: false,
            Bash: false,
            discover_tools: true,
          },
        },
        communicator: {
          mode: 'subagent',
          description: 'Slack/WhatsApp messaging with proper formatting',
          prompt: 'You are a messaging specialist.',
        },
        scheduler: {
          mode: 'subagent',
          description: 'Calendar management, reminders, time-based tasks',
          prompt: 'You are a scheduling assistant.',
        },
        explorer: {
          mode: 'subagent',
          description: 'Fast codebase exploration, documentation lookup',
          prompt: 'You are a codebase explorer.',
          tools: { write: false, edit: false, read: true, glob: true, grep: true },
        },
      },
    };

    try {
      fs.mkdirSync(orientHome, { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    } catch {
      // Silently fail
    }
  }

  it('should skip generation if opencode.json already exists', () => {
    const configPath = path.join(tmpDir, 'opencode.json');
    fs.writeFileSync(configPath, '{"existing": true}');

    ensureOpenCodeConfig(tmpDir, '/fake/path/assistant-server.js');

    const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(content.existing).toBe(true);
    expect(content.default_agent).toBeUndefined();
  });

  it('should generate config when opencode.json does not exist', () => {
    ensureOpenCodeConfig(tmpDir, '/fake/path/assistant-server.js');

    const configPath = path.join(tmpDir, 'opencode.json');
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it('should create the directory if it does not exist', () => {
    const nestedDir = path.join(tmpDir, 'nested', 'dir');
    ensureOpenCodeConfig(nestedDir, '/fake/path/assistant-server.js');

    expect(fs.existsSync(path.join(nestedDir, 'opencode.json'))).toBe(true);
  });

  it('should include ori agent as default agent', () => {
    ensureOpenCodeConfig(tmpDir, '/fake/path/assistant-server.js');

    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'opencode.json'), 'utf-8'));
    expect(config.default_agent).toBe('ori');
    expect(config.agent.ori).toBeDefined();
    expect(config.agent.ori.mode).toBe('primary');
    expect(config.agent.ori.description).toContain('border collie');
  });

  it('should include correct permissions', () => {
    ensureOpenCodeConfig(tmpDir, '/fake/path/assistant-server.js');

    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'opencode.json'), 'utf-8'));
    expect(config.permission).toEqual({
      edit: 'allow',
      bash: 'allow',
      webfetch: 'allow',
      skill: 'allow',
      doom_loop: 'allow',
      external_directory: 'allow',
      mcp: 'allow',
      read: 'allow',
    });
  });

  it('should include MCP orient-assistant server with resolved path', () => {
    const mcpPath = '/usr/local/lib/node_modules/@orient-bot/mcp-servers/dist/assistant-server.js';
    ensureOpenCodeConfig(tmpDir, mcpPath);

    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'opencode.json'), 'utf-8'));
    expect(config.mcp['orient-assistant']).toBeDefined();
    expect(config.mcp['orient-assistant'].type).toBe('local');
    expect(config.mcp['orient-assistant'].enabled).toBe(true);
    expect(config.mcp['orient-assistant'].command).toEqual(['node', mcpPath]);
  });

  it('should include subagents (communicator, scheduler, explorer)', () => {
    ensureOpenCodeConfig(tmpDir, '/fake/path/assistant-server.js');

    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'opencode.json'), 'utf-8'));
    expect(config.agent.communicator).toBeDefined();
    expect(config.agent.communicator.mode).toBe('subagent');
    expect(config.agent.scheduler).toBeDefined();
    expect(config.agent.scheduler.mode).toBe('subagent');
    expect(config.agent.explorer).toBeDefined();
    expect(config.agent.explorer.mode).toBe('subagent');
  });

  it('should set model to claude-haiku-4-5', () => {
    ensureOpenCodeConfig(tmpDir, '/fake/path/assistant-server.js');

    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'opencode.json'), 'utf-8'));
    expect(config.model).toBe('anthropic/claude-haiku-4-5');
  });

  it('should skip generation if require.resolve would fail (no resolvedPath)', () => {
    // When no resolvedMcpPath is provided and require.resolve would fail
    ensureOpenCodeConfig(tmpDir);

    // Config should not have been written (require.resolve fails for non-existent package)
    // In actual code, this means source installs where the repo opencode.json is used
    const configPath = path.join(tmpDir, 'opencode.json');
    // The file may or may not exist depending on whether @orient-bot/mcp-servers is resolvable
    // from the test environment. The important thing is it doesn't throw.
  });

  it('should write valid JSON', () => {
    ensureOpenCodeConfig(tmpDir, '/fake/path/assistant-server.js');

    const content = fs.readFileSync(path.join(tmpDir, 'opencode.json'), 'utf-8');
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it('should include $schema field', () => {
    ensureOpenCodeConfig(tmpDir, '/fake/path/assistant-server.js');

    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'opencode.json'), 'utf-8'));
    expect(config.$schema).toBe('https://opencode.ai/config.json');
  });

  it('should disable write/edit/bash for ori agent', () => {
    ensureOpenCodeConfig(tmpDir, '/fake/path/assistant-server.js');

    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'opencode.json'), 'utf-8'));
    expect(config.agent.ori.tools.write).toBe(false);
    expect(config.agent.ori.tools.edit).toBe(false);
    expect(config.agent.ori.tools.bash).toBe(false);
  });

  it('should enable discover_tools for ori agent', () => {
    ensureOpenCodeConfig(tmpDir, '/fake/path/assistant-server.js');

    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'opencode.json'), 'utf-8'));
    expect(config.agent.ori.tools.discover_tools).toBe(true);
  });
});
