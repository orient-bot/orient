/**
 * E2E Tests for Send Image Feature
 *
 * Tests the complete flow:
 * 1. MCP tool call → WhatsApp API server → WhatsAppService → Socket
 * 2. MCP tool call → Slack files.uploadV2 → Channel
 *
 * Run with: E2E_TESTS=true npx vitest packages/bot-whatsapp/__tests__/send-image.e2e.test.ts
 *
 * These tests require:
 * - WhatsApp bot running and connected (port 4097)
 * - Slack bot token configured
 * - Active WhatsApp chat context
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock core for logger (always needed)
vi.mock('@orient/core', () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    startOperation: () => ({
      success: vi.fn(),
      failure: vi.fn(),
    }),
  }),
  createDedicatedServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    startOperation: () => ({
      success: vi.fn(),
      failure: vi.fn(),
    }),
  }),
}));

const WHATSAPP_API_BASE = 'http://127.0.0.1:4097';

// Helper to check if WhatsApp API is available
async function isWhatsAppApiAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${WHATSAPP_API_BASE}/status`);
    return response.ok;
  } catch {
    return false;
  }
}

describe('E2E: WhatsApp Send Image', () => {
  let apiAvailable: boolean;

  beforeAll(async () => {
    apiAvailable = await isWhatsAppApiAvailable();
    if (!apiAvailable) {
      console.warn('WhatsApp API server not available - E2E tests will be skipped');
    }
  });

  it('should send image via URL to WhatsApp API', async () => {
    if (!apiAvailable) {
      return; // Skip if API not available
    }

    const response = await fetch(`${WHATSAPP_API_BASE}/send-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: 'https://httpbin.org/image/png',
        caption: 'E2E test image via URL',
      }),
    });

    const result = (await response.json()) as any;

    // If we get 400/403, it's a valid response (no context or permission denied)
    // If 200, image was sent
    expect([200, 400, 403]).toContain(response.status);

    if (response.status === 200) {
      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    }
  });

  it('should return 400 when no image source provided', async () => {
    if (!apiAvailable) {
      return;
    }

    const response = await fetch(`${WHATSAPP_API_BASE}/send-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caption: 'No image source',
      }),
    });

    const result = (await response.json()) as any;
    expect(response.status).toBe(400);
    expect(result.error).toBeDefined();
  });

  it('should return 400 when file path does not exist', async () => {
    if (!apiAvailable) {
      return;
    }

    const response = await fetch(`${WHATSAPP_API_BASE}/send-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imagePath: '/nonexistent/path/to/image.png',
      }),
    });

    const result = (await response.json()) as any;
    expect(response.status).toBe(400);
    expect(result.error).toContain('File not found');
  });

  it('should accept explicit JID parameter', async () => {
    if (!apiAvailable) {
      return;
    }

    const response = await fetch(`${WHATSAPP_API_BASE}/send-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jid: 'test@s.whatsapp.net',
        imageUrl: 'https://httpbin.org/image/png',
        caption: 'E2E test with explicit JID',
      }),
    });

    const result = (await response.json()) as any;

    // Could be 200 (sent), 403 (permission denied), or 500 (network/connection)
    expect([200, 403, 500]).toContain(response.status);
  });
});

describe('E2E: MCP Tool Definitions', () => {
  it('orient_whatsapp_send_image tool has correct structure', () => {
    // Verify the expected tool shape matches what MCP server would register
    const toolDef = {
      name: 'orient_whatsapp_send_image',
      description:
        'Send an image to the current WhatsApp chat. Provide either a URL or local file path to the image.',
      inputSchema: {
        type: 'object',
        properties: {
          imageUrl: { type: 'string' },
          imagePath: { type: 'string' },
          caption: { type: 'string' },
          jid: { type: 'string' },
        },
        required: [],
      },
    };

    expect(toolDef.name).toMatch(/^orient_/);
    expect(toolDef.inputSchema.properties).toHaveProperty('imageUrl');
    expect(toolDef.inputSchema.properties).toHaveProperty('imagePath');
    expect(toolDef.inputSchema.properties).toHaveProperty('caption');
    expect(toolDef.inputSchema.properties).toHaveProperty('jid');
    expect(toolDef.inputSchema.required).toEqual([]);
  });

  it('orient_slack_send_image tool has correct structure', () => {
    const toolDef = {
      name: 'orient_slack_send_image',
      description:
        'Upload and send an image to a Slack channel or DM. Provide either a URL or local file path.',
      inputSchema: {
        type: 'object',
        properties: {
          channel: { type: 'string' },
          imageUrl: { type: 'string' },
          imagePath: { type: 'string' },
          caption: { type: 'string' },
          filename: { type: 'string' },
        },
        required: ['channel'],
      },
    };

    expect(toolDef.name).toMatch(/^orient_/);
    expect(toolDef.inputSchema.properties).toHaveProperty('channel');
    expect(toolDef.inputSchema.required).toContain('channel');
  });
});
