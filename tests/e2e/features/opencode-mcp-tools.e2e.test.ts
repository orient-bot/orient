/**
 * OpenCode MCP Tools Integration E2E Tests
 *
 * Tests the integration between OpenCode agents and MCP servers:
 * 1. Agent can discover available MCP tools
 * 2. Agent can use orient-coding MCP server tools
 * 3. Agent can use orient-assistant MCP server tools
 * 4. Tool results are properly formatted in responses
 *
 * Prerequisites:
 * - OpenCode server running on localhost:4099
 * - MCP servers configured in opencode.json
 * - OPENAI_API_KEY or ANTHROPIC_API_KEY for LLM calls
 *
 * Run with:
 *   RUN_MCP_TESTS=true pnpm test:e2e tests/e2e/features/opencode-mcp-tools.e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const TESTS_ENABLED = process.env.RUN_MCP_TESTS === 'true';
const OPENCODE_URL = process.env.OPENCODE_URL || 'http://localhost:4099';
const TIMEOUT = 60000; // 60 seconds for tool operations

const describeOrSkip = TESTS_ENABLED ? describe : describe.skip;

// Helper to call OpenCode API
async function openCodeApi(path: string, options: RequestInit = {}): Promise<Response | null> {
  try {
    return await fetch(`${OPENCODE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      },
    });
  } catch (error) {
    console.log(`[MCP E2E] OpenCode server error: ${error}`);
    return null;
  }
}

// Create a new session with specified agent
async function createSession(title: string, agent?: string): Promise<{ id: string } | null> {
  const response = await openCodeApi('/session', {
    method: 'POST',
    body: JSON.stringify({ title, agent }),
  });

  if (!response?.ok) return null;
  return response.json();
}

// Send a message and wait for response
async function sendMessage(
  sessionId: string,
  message: string,
  agent?: string
): Promise<any | null> {
  const body: Record<string, any> = {
    parts: [{ type: 'text', text: message }],
  };

  if (agent) {
    body.agent = agent;
  }

  const response = await openCodeApi(`/session/${sessionId}/message`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!response?.ok) {
    console.log(`[MCP E2E] Message send failed: ${response?.status}`);
    return null;
  }

  return response.json();
}

// Extract text from OpenCode message parts
function extractText(message: any): string {
  if (!message?.parts) return '';

  return message.parts
    .filter((p: any) => p.type === 'text')
    .map((p: any) => p.text || '')
    .join('\n')
    .trim();
}

// Extract tool uses from message parts
function extractToolUses(message: any): Array<{ name: string; input: any }> {
  if (!message?.parts) return [];

  return message.parts
    .filter((p: any) => p.type === 'tool_use')
    .map((p: any) => ({
      name: p.name || p.tool || 'unknown',
      input: p.input || {},
    }));
}

// Check if MCP servers are connected
async function checkMcpStatus(): Promise<Record<string, { status: string }> | null> {
  const response = await openCodeApi('/mcp');
  if (!response?.ok) return null;
  return response.json();
}

describeOrSkip('OpenCode MCP Tools E2E Tests', () => {
  // Track all created sessions for cleanup
  const createdSessionIds: string[] = [];

  beforeAll(async () => {
    // Check OpenCode is running
    const health = await openCodeApi('/global/health');
    if (!health?.ok) {
      console.log('[MCP E2E] OpenCode server not available, tests will fail');
    }

    // Check MCP servers
    const mcpStatus = await checkMcpStatus();
    console.log('[MCP E2E] MCP Server Status:', mcpStatus);
  });

  afterAll(async () => {
    // Cleanup ALL test sessions
    console.log(`[MCP E2E] Cleaning up ${createdSessionIds.length} test sessions`);
    for (const sessionId of createdSessionIds) {
      try {
        await openCodeApi(`/session/${sessionId}`, { method: 'DELETE' });
        console.log(`[MCP E2E] Deleted session: ${sessionId}`);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('MCP Server Status', () => {
    it(
      'should have MCP servers connected',
      async () => {
        const mcpStatus = await checkMcpStatus();
        expect(mcpStatus).not.toBeNull();

        // Check for expected MCP servers
        if (mcpStatus) {
          const serverNames = Object.keys(mcpStatus);
          console.log('[MCP E2E] Connected MCP servers:', serverNames);

          // At least one server should be connected
          const connectedServers = serverNames.filter(
            (name) => mcpStatus[name]?.status === 'connected'
          );
          expect(connectedServers.length).toBeGreaterThan(0);
        }
      },
      TIMEOUT
    );
  });

  describe('Agent Tool Discovery', () => {
    it(
      'should allow agent to discover available tools',
      async () => {
        // Create session with pm-assistant agent
        const session = await createSession('MCP Tools Discovery Test', 'pm-assistant');
        expect(session).not.toBeNull();
        createdSessionIds.push(session!.id);

        // Ask about available tools
        const response = await sendMessage(
          session!.id,
          'What tools do you have available? Just list a few.'
        );

        expect(response).not.toBeNull();

        const text = extractText(response);
        const toolUses = extractToolUses(response);

        console.log('[MCP E2E] Response text:', text.substring(0, 200));
        console.log(
          '[MCP E2E] Tools used:',
          toolUses.map((t) => t.name)
        );

        // Agent should either describe tools or use discover_tools
        // The response should mention some capabilities
        expect(text.length).toBeGreaterThan(0);
      },
      TIMEOUT
    );
  });

  describe('MCP Tool Invocation', () => {
    it(
      'should use MCP tools when appropriate',
      async () => {
        // Create a new session for this test
        const session = await createSession('MCP Tool Invocation Test', 'pm-assistant');
        expect(session).not.toBeNull();
        createdSessionIds.push(session!.id);

        // Ask something that might trigger a tool
        const response = await sendMessage(session!.id, 'Check the health status of the system');

        expect(response).not.toBeNull();

        const text = extractText(response);
        const toolUses = extractToolUses(response);

        console.log('[MCP E2E] Health check response:', text.substring(0, 300));
        console.log(
          '[MCP E2E] Tools invoked:',
          toolUses.map((t) => t.name)
        );

        // Either used health check tool or described status
        const usedHealthTool = toolUses.some(
          (t) => t.name.includes('health') || t.name.includes('status') || t.name.includes('check')
        );
        const describedStatus =
          text.toLowerCase().includes('health') ||
          text.toLowerCase().includes('status') ||
          text.toLowerCase().includes('connected') ||
          text.toLowerCase().includes('running');

        expect(usedHealthTool || describedStatus).toBe(true);
      },
      TIMEOUT
    );
  });

  describe('Agent Conversation Flow', () => {
    it(
      'should maintain context across messages',
      async () => {
        const session = await createSession('Conversation Context Test', 'pm-assistant');
        expect(session).not.toBeNull();
        createdSessionIds.push(session!.id);

        // First message - introduce a topic
        const msg1 = await sendMessage(
          session!.id,
          'Remember that my name is TestUser for this conversation'
        );
        expect(msg1).not.toBeNull();

        // Second message - reference the earlier context
        const msg2 = await sendMessage(session!.id, 'What is my name?');
        expect(msg2).not.toBeNull();

        const text = extractText(msg2);
        console.log('[MCP E2E] Context test response:', text);

        // Should remember the name from first message
        expect(text.toLowerCase()).toContain('testuser');
      },
      TIMEOUT
    );
  });
});
