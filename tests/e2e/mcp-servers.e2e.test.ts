/**
 * E2E Tests for Multi-Server MCP Architecture
 *
 * These tests verify that each MCP server type (coding, assistant, core)
 * exposes the correct tools and that agents can operate them.
 *
 * Prerequisites:
 * - Run: npm run build
 *
 * Run with:
 *   npm run test:e2e -- tests/e2e/mcp-servers.e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const TIMEOUT = 30000; // 30 seconds

interface McpMessage {
  jsonrpc: string;
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: unknown;
}

/**
 * MCP Server Test Client
 * Communicates with MCP servers over stdio using JSON-RPC
 */
class McpTestClient {
  private process: ChildProcess | null = null;
  private buffer = '';
  private messageId = 0;
  private pendingRequests = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();

  constructor(private serverPath: string) {}

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 10000);

      this.process = spawn('node', [this.serverPath], {
        cwd: PROJECT_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'test',
        },
      });

      this.process.stdout?.on('data', (data) => {
        this.handleData(data.toString());
      });

      this.process.stderr?.on('data', (data) => {
        // Log stderr for debugging but don't fail
        console.error(`[MCP stderr]: ${data.toString()}`);
      });

      this.process.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      // Give the server a moment to initialize
      setTimeout(() => {
        clearTimeout(timeout);
        resolve();
      }, 2000);
    });
  }

  private handleData(data: string): void {
    this.buffer += data;

    // Try to parse complete JSON-RPC messages
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message: McpMessage = JSON.parse(line);
          if (message.id !== undefined && this.pendingRequests.has(message.id)) {
            const pending = this.pendingRequests.get(message.id)!;
            this.pendingRequests.delete(message.id);
            if (message.error) {
              pending.reject(new Error(message.error.message));
            } else {
              pending.resolve(message.result);
            }
          }
        } catch {
          // Not valid JSON, ignore
        }
      }
    }
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const message: McpMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve, reject });

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout for ${method}`));
      }, TIMEOUT);

      // Clean up timeout on resolution
      const originalResolve = this.pendingRequests.get(id)!.resolve;
      this.pendingRequests.get(id)!.resolve = (value) => {
        clearTimeout(timeout);
        originalResolve(value);
      };

      this.process?.stdin?.write(JSON.stringify(message) + '\n');
    });
  }

  async initialize(): Promise<unknown> {
    return this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    });
  }

  async listTools(): Promise<McpTool[]> {
    const result = (await this.request('tools/list', {})) as { tools: McpTool[] };
    return result.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

// Check if build exists
function isBuildAvailable(): boolean {
  try {
    execSync('test -f dist/mcp-servers/coding-server.js', {
      cwd: PROJECT_ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const buildAvailable = isBuildAvailable();

describe('MCP Servers E2E Tests', () => {
  describe.skipIf(!buildAvailable)('Server Tool Lists', () => {
    describe('coding-mcp', () => {
      let client: McpTestClient;

      beforeAll(async () => {
        client = new McpTestClient('dist/mcp-servers/coding-server.js');
        await client.start();
        await client.initialize();
      }, TIMEOUT);

      afterAll(async () => {
        await client.stop();
      });

      it('should expose ~20 tools', async () => {
        const tools = await client.listTools();
        expect(tools.length).toBeGreaterThanOrEqual(15);
        expect(tools.length).toBeLessThanOrEqual(25);
      });

      it('should include slides tools for example-presentation-automation skill', async () => {
        const tools = await client.listTools();
        const toolNames = tools.map((t) => t.name);

        expect(toolNames).toContain('ai_first_slides_get_presentation');
        expect(toolNames).toContain('ai_first_slides_duplicate_template');
        expect(toolNames).toContain('ai_first_slides_update_text');
        expect(toolNames).toContain('ai_first_slides_update_slide_text');
      });

      it('should include apps tools', async () => {
        const tools = await client.listTools();
        const toolNames = tools.map((t) => t.name);

        expect(toolNames).toContain('ai_first_create_app');
        expect(toolNames).toContain('ai_first_list_apps');
        expect(toolNames).toContain('ai_first_get_app');
      });

      it('should include agents tools', async () => {
        const tools = await client.listTools();
        const toolNames = tools.map((t) => t.name);

        expect(toolNames).toContain('ai_first_get_agent_context');
        expect(toolNames).toContain('ai_first_list_agents');
        expect(toolNames).toContain('ai_first_handoff_to_agent');
      });

      it('should include discover_tools', async () => {
        const tools = await client.listTools();
        const toolNames = tools.map((t) => t.name);

        expect(toolNames).toContain('discover_tools');
      });

      it('should NOT include messaging/whatsapp tools', async () => {
        const tools = await client.listTools();
        const toolNames = tools.map((t) => t.name);

        expect(toolNames).not.toContain('ai_first_slack_send_dm');
        expect(toolNames).not.toContain('whatsapp_send_message');
      });
    });

    describe('core-mcp', () => {
      let client: McpTestClient;

      beforeAll(async () => {
        client = new McpTestClient('dist/mcp-servers/core-server.js');
        await client.start();
        await client.initialize();
      }, TIMEOUT);

      afterAll(async () => {
        await client.stop();
      });

      it('should expose ~12 tools', async () => {
        const tools = await client.listTools();
        expect(tools.length).toBeGreaterThanOrEqual(10);
        expect(tools.length).toBeLessThanOrEqual(40);
      });

      it('should include system tools', async () => {
        const tools = await client.listTools();
        const toolNames = tools.map((t) => t.name);

        expect(toolNames).toContain('ai_first_health_check');
        expect(toolNames).toContain('ai_first_get_config');
      });

      it('should include skills tools', async () => {
        const tools = await client.listTools();
        const toolNames = tools.map((t) => t.name);

        expect(toolNames).toContain('ai_first_list_skills');
        expect(toolNames).toContain('ai_first_read_skill');
      });

      it('should include agents tools', async () => {
        const tools = await client.listTools();
        const toolNames = tools.map((t) => t.name);

        expect(toolNames).toContain('ai_first_get_agent_context');
        expect(toolNames).toContain('ai_first_handoff_to_agent');
      });

      it('should include discover_tools', async () => {
        const tools = await client.listTools();
        const toolNames = tools.map((t) => t.name);

        expect(toolNames).toContain('discover_tools');
      });

      it('should NOT include JIRA query tools', async () => {
        const tools = await client.listTools();
        const toolNames = tools.map((t) => t.name);

        expect(toolNames).not.toContain('ai_first_get_all_issues');
        expect(toolNames).not.toContain('ai_first_get_blockers');
      });
    });

    describe('assistant-mcp', () => {
      let client: McpTestClient;

      beforeAll(async () => {
        client = new McpTestClient('dist/mcp-servers/assistant-server.js');
        await client.start();
        await client.initialize();
      }, TIMEOUT);

      afterAll(async () => {
        await client.stop();
      });

      it('should expose ~50+ tools', async () => {
        const tools = await client.listTools();
        expect(tools.length).toBeGreaterThanOrEqual(45);
      });

      it('should not include JIRA tools', async () => {
        const tools = await client.listTools();
        const toolNames = tools.map((t) => t.name);

        expect(toolNames).not.toContain('ai_first_get_all_issues');
        expect(toolNames).not.toContain('ai_first_get_issue');
        expect(toolNames).not.toContain('ai_first_get_blockers');
        expect(toolNames).not.toContain('ai_first_jira_create_issue_link');
      });

      it('should include messaging tools', async () => {
        const tools = await client.listTools();
        const toolNames = tools.map((t) => t.name);

        expect(toolNames).toContain('ai_first_slack_send_dm');
        expect(toolNames).toContain('ai_first_slack_send_channel_message');
      });

      it('should include WhatsApp tools', async () => {
        const tools = await client.listTools();
        const toolNames = tools.map((t) => t.name);

        expect(toolNames).toContain('whatsapp_send_message');
        expect(toolNames).toContain('whatsapp_search_messages');
      });

      it('should include Google OAuth tools', async () => {
        const tools = await client.listTools();
        const toolNames = tools.map((t) => t.name);

        expect(toolNames).toContain('google_calendar_list_events');
        expect(toolNames).toContain('google_gmail_list_messages');
      });

      it('should include discover_tools', async () => {
        const tools = await client.listTools();
        const toolNames = tools.map((t) => t.name);

        expect(toolNames).toContain('discover_tools');
      });
    });
  });

  describe.skipIf(!buildAvailable)('Tool Execution', () => {
    describe('coding-mcp tool execution', () => {
      let client: McpTestClient;

      beforeAll(async () => {
        client = new McpTestClient('dist/mcp-servers/coding-server.js');
        await client.start();
        await client.initialize();
      }, TIMEOUT);

      afterAll(async () => {
        await client.stop();
      });

      it('should execute discover_tools and return categories', async () => {
        const result = (await client.callTool('discover_tools', {
          mode: 'list_categories',
        })) as { content: Array<{ type: string; text: string }> };

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');

        // Parse the response - it should contain category information
        const text = result.content[0].text;
        expect(text).toBeDefined();
        // The response should mention categories or contain structured data
        expect(text.length).toBeGreaterThan(10);
      });

      it('should execute ai_first_list_apps and return response', async () => {
        const result = (await client.callTool('ai_first_list_apps', {})) as {
          content: Array<{ type: string; text: string }>;
        };

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
        // Response should be valid JSON or contain app-related info
        expect(result.content[0].text).toBeDefined();
      });

      it('should reject tools not in coding-mcp', async () => {
        const result = (await client.callTool('ai_first_slack_send_dm', {
          userId: 'test',
          message: 'test',
        })) as { content: Array<{ type: string; text: string }>; isError?: boolean };

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('not available');
      });
    });

    describe('core-mcp tool execution', () => {
      let client: McpTestClient;

      beforeAll(async () => {
        client = new McpTestClient('dist/mcp-servers/core-server.js');
        await client.start();
        await client.initialize();
      }, TIMEOUT);

      afterAll(async () => {
        await client.stop();
      });

      it('should execute ai_first_list_skills and return response', async () => {
        const result = (await client.callTool('ai_first_list_skills', {})) as {
          content: Array<{ type: string; text: string }>;
        };

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
        // Response should contain skill-related information
        expect(result.content[0].text).toBeDefined();
      });

      it('should execute ai_first_list_agents and return response', async () => {
        const result = (await client.callTool('ai_first_list_agents', {})) as {
          content: Array<{ type: string; text: string }>;
        };

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
        // Response should contain agent-related information
        expect(result.content[0].text).toBeDefined();
      });
    });
  });

  describe.skipIf(!buildAvailable)('Server Coverage', () => {
    it(
      'union of all servers should cover all tools from legacy',
      async () => {
        // Start all servers and collect their tools
        const codingClient = new McpTestClient('dist/mcp-servers/coding-server.js');
        const coreClient = new McpTestClient('dist/mcp-servers/core-server.js');
        const assistantClient = new McpTestClient('dist/mcp-servers/assistant-server.js');

        await Promise.all([codingClient.start(), coreClient.start(), assistantClient.start()]);

        await Promise.all([
          codingClient.initialize(),
          coreClient.initialize(),
          assistantClient.initialize(),
        ]);

        const [codingTools, coreTools, assistantTools] = await Promise.all([
          codingClient.listTools(),
          coreClient.listTools(),
          assistantClient.listTools(),
        ]);

        await Promise.all([codingClient.stop(), coreClient.stop(), assistantClient.stop()]);

        // Combine all tool names
        const allServerTools = new Set([
          ...codingTools.map((t) => t.name),
          ...coreTools.map((t) => t.name),
          ...assistantTools.map((t) => t.name),
        ]);

        // Expected critical tools from legacy
        const criticalTools = [
          'ai_first_health_check',
          'ai_first_get_config',
          'ai_first_slides_get_presentation',
          'ai_first_create_app',
          'ai_first_list_skills',
          'ai_first_get_agent_context',
          'discover_tools',
          'whatsapp_send_message',
          'ai_first_slack_send_dm',
          'google_calendar_list_events',
        ];

        for (const tool of criticalTools) {
          expect(allServerTools.has(tool)).toBe(true);
        }
      },
      TIMEOUT * 3
    );
  });
});
