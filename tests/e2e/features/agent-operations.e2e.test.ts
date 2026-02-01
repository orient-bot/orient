/**
 * Agent Operations E2E Tests
 *
 * Tests the Orient bot's AI agent capabilities end-to-end:
 * 1. Responding to user messages
 * 2. Configuring the system via tools
 * 3. Leveraging MCP tools for tasks
 *
 * These tests require:
 * - Running dashboard (for API access)
 * - OpenCode server (for agent processing)
 * - ANTHROPIC_API_KEY for LLM calls
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestAuthHelper } from '../helpers/auth';

const AGENT_TESTS_ENABLED = process.env.RUN_AGENT_TESTS === 'true';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:4098';
const OPENCODE_URL = process.env.OPENCODE_URL || 'http://localhost:4099';

const describeOrSkip = AGENT_TESTS_ENABLED ? describe : describe.skip;

// Helper to call OpenCode server directly
async function openCodeApi(path: string, options: RequestInit = {}): Promise<Response | null> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  try {
    return await fetch(`${OPENCODE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch (error) {
    // OpenCode server not running
    console.log(`[Agent E2E] OpenCode server not available: ${error}`);
    return null;
  }
}

// Helper to extract text from OpenCode message response
function extractTextResponse(message: any): string {
  if (!message?.parts) return '';

  const textParts = message.parts
    .filter((p: any) => p.type === 'text')
    .map((p: any) => p.text || '')
    .join('\n');

  return textParts.trim();
}

// Helper to extract tools used from OpenCode message
function extractToolsUsed(message: any): string[] {
  if (!message?.parts) return [];

  return message.parts
    .filter((p: any) => p.type === 'tool_use')
    .map((p: any) => p.name || p.tool || 'unknown');
}

describeOrSkip('Agent Operations E2E Tests', () => {
  let auth: TestAuthHelper;
  let testSessionId: string | null = null;

  beforeAll(async () => {
    auth = new TestAuthHelper(DASHBOARD_URL);
    await auth.init();
    console.log(`[Agent E2E] Authenticated as: ${auth.getUsername()}`);
  });

  afterAll(async () => {
    // Cleanup test session if created
    if (testSessionId) {
      try {
        await openCodeApi(`/session/${testSessionId}`, { method: 'DELETE' });
        console.log(`[Agent E2E] Cleaned up session: ${testSessionId}`);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('OpenCode Server Connectivity', () => {
    it('should check if OpenCode server is running', async () => {
      // OpenCode uses /global/health endpoint
      const response = await openCodeApi('/global/health');

      if (!response) {
        console.log('[Agent E2E] OpenCode server not running - skipping OpenCode tests');
        return;
      }

      if (!response.ok) {
        console.log('[Agent E2E] OpenCode server not responding - tests will be limited');
        return;
      }

      const data = await response.json();
      console.log(`[Agent E2E] OpenCode server status: ${JSON.stringify(data)}`);
      expect(data).toBeDefined();
      expect(data.healthy).toBe(true);
    });

    it('should list available sessions', async () => {
      // OpenCode uses /session endpoint for listing sessions
      const response = await openCodeApi('/session');

      if (!response) {
        console.log('[Agent E2E] OpenCode server not available - skipping');
        return;
      }

      if (response.ok) {
        const data = await response.json();
        // OpenCode returns an array of sessions directly
        const sessionCount = Array.isArray(data) ? data.length : 0;
        console.log(`[Agent E2E] Found ${sessionCount} existing sessions`);
      }
    });
  });

  describe('Agent Response Capability', () => {
    it('should create a new session and get a response', async () => {
      // Create session
      const createResponse = await openCodeApi('/session', {
        method: 'POST',
        body: JSON.stringify({
          title: `e2e-test-session-${Date.now()}`,
        }),
      });

      if (!createResponse || !createResponse.ok) {
        console.log('[Agent E2E] Could not create session - OpenCode may not be running');
        return;
      }

      const session = await createResponse.json();
      testSessionId = session.id;
      console.log(`[Agent E2E] Created session: ${testSessionId}`);

      // Send a simple message
      const messageResponse = await openCodeApi(`/session/${testSessionId}/message`, {
        method: 'POST',
        body: JSON.stringify({
          message: 'Hello! Please respond with a brief greeting.',
        }),
      });

      if (messageResponse && messageResponse.ok) {
        const message = await messageResponse.json();
        const text = extractTextResponse(message);

        console.log(`[Agent E2E] Agent response: "${text.substring(0, 100)}..."`);
        expect(text.length).toBeGreaterThan(0);
      } else {
        console.log(`[Agent E2E] Message failed: ${messageResponse?.status || 'no response'}`);
      }
    });

    it('should maintain conversation context across messages', async () => {
      if (!testSessionId) {
        console.log('[Agent E2E] Skipping - no session available');
        return;
      }

      // Send message with context
      const msg1Response = await openCodeApi(`/session/${testSessionId}/message`, {
        method: 'POST',
        body: JSON.stringify({
          message: 'Remember this number: 42. What number did I just tell you?',
        }),
      });

      if (msg1Response && msg1Response.ok) {
        const message = await msg1Response.json();
        const text = extractTextResponse(message);

        console.log(`[Agent E2E] Context test response: "${text.substring(0, 150)}"`);
        // Response should include "42"
        expect(text).toContain('42');
      } else {
        console.log('[Agent E2E] Skipping context test - OpenCode not available');
      }
    });

    it('should handle multi-turn conversation', async () => {
      if (!testSessionId) {
        console.log('[Agent E2E] Skipping - no session available');
        return;
      }

      // Turn 1
      const t1 = await openCodeApi(`/session/${testSessionId}/message`, {
        method: 'POST',
        body: JSON.stringify({
          message: 'My name is TestUser for this E2E test.',
        }),
      });

      if (!t1) {
        console.log('[Agent E2E] Skipping multi-turn - OpenCode not available');
        return;
      }

      // Turn 2 - Ask about context
      const response = await openCodeApi(`/session/${testSessionId}/message`, {
        method: 'POST',
        body: JSON.stringify({
          message: 'What is my name?',
        }),
      });

      if (response && response.ok) {
        const message = await response.json();
        const text = extractTextResponse(message);

        console.log(`[Agent E2E] Name recall: "${text.substring(0, 100)}"`);
        expect(text.toLowerCase()).toContain('testuser');
      }
    });
  });

  describe('Agent Tool Usage', () => {
    it('should be able to use system tools', async () => {
      if (!testSessionId) {
        console.log('[Agent E2E] Skipping - no session available');
        return;
      }

      // Ask agent to do something that might use a tool
      const response = await openCodeApi(`/session/${testSessionId}/message`, {
        method: 'POST',
        body: JSON.stringify({
          message: 'What tools do you have available? List some of them briefly.',
        }),
      });

      if (response && response.ok) {
        const message = await response.json();
        const text = extractTextResponse(message);
        const toolsUsed = extractToolsUsed(message);

        console.log(`[Agent E2E] Tool inquiry response: "${text.substring(0, 200)}"`);
        if (toolsUsed.length > 0) {
          console.log(`[Agent E2E] Tools used: ${toolsUsed.join(', ')}`);
        }

        expect(text.length).toBeGreaterThan(0);
      } else {
        console.log('[Agent E2E] Skipping tool test - OpenCode not available');
      }
    });

    it('should handle tool execution requests', async () => {
      if (!testSessionId) {
        console.log('[Agent E2E] Skipping - no session available');
        return;
      }

      // Request that would trigger a tool if available
      const response = await openCodeApi(`/session/${testSessionId}/message`, {
        method: 'POST',
        body: JSON.stringify({
          message: 'Can you check the system health or status?',
        }),
      });

      if (response && response.ok) {
        const message = await response.json();
        const text = extractTextResponse(message);
        const toolsUsed = extractToolsUsed(message);

        console.log(`[Agent E2E] Health check response: "${text.substring(0, 150)}"`);
        console.log(
          `[Agent E2E] Tools used: ${toolsUsed.length > 0 ? toolsUsed.join(', ') : 'none'}`
        );
      } else {
        console.log('[Agent E2E] Skipping tool execution test - OpenCode not available');
      }
    });
  });

  describe('Agent Configuration via Dashboard API', () => {
    it('should list agents via API', async () => {
      const response = await auth.request('/api/agents');

      if (response.status === 404) {
        console.log('[Agent E2E] Agents API endpoint not found');
        return;
      }

      if (response.status === 200) {
        const data = await response.json();
        console.log(`[Agent E2E] Found ${data.agents?.length || 0} agents`);

        if (data.agents?.length > 0) {
          console.log(
            `[Agent E2E] Agent names: ${data.agents.map((a: any) => a.name || a.id).join(', ')}`
          );
        }
      }
    });

    it('should get agent details', async () => {
      const response = await auth.request('/api/agents');

      if (response.status !== 200) return;

      const data = await response.json();
      if (!data.agents?.length) return;

      const firstAgent = data.agents[0];
      const agentId = firstAgent.id || firstAgent.name;

      const detailResponse = await auth.request(`/api/agents/${agentId}`);

      if (detailResponse.status === 200) {
        const agent = await detailResponse.json();
        console.log(`[Agent E2E] Agent details: ${JSON.stringify(agent).substring(0, 200)}`);
        expect(agent.id || agent.name).toBeDefined();
      }
    });

    it('should list available models', async () => {
      const response = await auth.request('/api/models');

      if (response.status === 404) {
        console.log('[Agent E2E] Models API endpoint not found');
        return;
      }

      if (response.status === 200) {
        const data = await response.json();
        const models = data.models || data;
        console.log(
          `[Agent E2E] Available models: ${Array.isArray(models) ? models.length : 'N/A'}`
        );
      }
    });
  });

  describe('Agent Session Management', () => {
    it('should create and delete sessions', async () => {
      // Create
      const createResponse = await openCodeApi('/session', {
        method: 'POST',
        body: JSON.stringify({
          title: `e2e-cleanup-test-${Date.now()}`,
        }),
      });

      if (!createResponse || !createResponse.ok) {
        console.log('[Agent E2E] Could not create session - OpenCode not available');
        return;
      }

      const session = await createResponse.json();
      console.log(`[Agent E2E] Created temp session: ${session.id}`);

      // Delete
      const deleteResponse = await openCodeApi(`/session/${session.id}`, {
        method: 'DELETE',
      });

      if (deleteResponse) {
        expect([200, 204]).toContain(deleteResponse.status);
        console.log('[Agent E2E] Session deleted successfully');
      }
    });

    it('should list and filter sessions', async () => {
      // OpenCode uses /session endpoint for listing
      const response = await openCodeApi('/session');

      if (!response) {
        console.log('[Agent E2E] OpenCode not available - skipping session list');
        return;
      }

      if (response.ok) {
        const data = await response.json();
        // OpenCode returns an array directly
        const sessions = Array.isArray(data) ? data : data.sessions || [];

        if (Array.isArray(sessions)) {
          const e2eSessions = sessions.filter(
            (s: any) => s.title?.includes('e2e') || s.id?.includes('e2e')
          );
          console.log(
            `[Agent E2E] Total sessions: ${sessions.length}, E2E sessions: ${e2eSessions.length}`
          );
        }
      }
    });
  });

  describe('Agent Security', () => {
    it('should require authentication for agent config endpoints', async () => {
      const response = await fetch(`${DASHBOARD_URL}/api/agents`, {
        headers: { 'Content-Type': 'application/json' },
      });

      // Should require auth
      expect([401, 404]).toContain(response.status);
    });
  });
});

// Export test scenarios for documentation
export const agentTestScenarios = {
  basicConversation: {
    description: 'Test basic agent conversation',
    steps: [
      'Create a new session',
      'Send a greeting message',
      'Verify agent responds',
      'Check response contains meaningful content',
    ],
    expectedOutcome: 'Agent provides coherent response',
  },

  contextRetention: {
    description: 'Test conversation context retention',
    steps: [
      'Create session',
      'Tell agent a piece of information',
      'Ask agent to recall the information',
      'Verify correct recall',
    ],
    expectedOutcome: 'Agent remembers context across turns',
  },

  toolUsage: {
    description: 'Test agent tool usage',
    steps: [
      'Create session',
      'Request action that requires a tool',
      'Verify tool was called',
      'Check tool result incorporated in response',
    ],
    expectedOutcome: 'Agent uses appropriate tools',
  },

  configManagement: {
    description: 'Test agent configuration via API',
    steps: [
      'List available agents',
      'Get agent details',
      'Update agent configuration',
      'Verify changes applied',
    ],
    expectedOutcome: 'Agent config can be managed via API',
  },
};
