/**
 * Unit Tests for Send Image Tool Registry Entries
 *
 * Verifies that whatsapp_send_image and slack_send_image
 * are properly registered in the tool registry with correct metadata.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

// Mock logger before imports
vi.mock('@orient-bot/core', () => ({
  createServiceLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startOperation: () => ({
      success: vi.fn(),
      failure: vi.fn(),
    }),
  }),
}));

describe('Send Image Tool Registry', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('slack_send_image registration', () => {
    it('should be registered in the messaging category', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const tool = registry.getTool('slack_send_image');
      expect(tool).toBeDefined();
      expect(tool!.category).toBe('messaging');
    });

    it('should have correct tool definition', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const tool = registry.getTool('slack_send_image');
      expect(tool!.tool.name).toBe('slack_send_image');
      expect(tool!.tool.description).toContain('image');
      expect(tool!.tool.description).toContain('Slack');
    });

    it('should have required channel property', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const tool = registry.getTool('slack_send_image');
      const schema = tool!.tool.inputSchema as any;
      expect(schema.required).toContain('channel');
    });

    it('should have imageUrl and imagePath properties', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const tool = registry.getTool('slack_send_image');
      const schema = tool!.tool.inputSchema as any;
      expect(schema.properties).toHaveProperty('imageUrl');
      expect(schema.properties).toHaveProperty('imagePath');
      expect(schema.properties).toHaveProperty('caption');
      expect(schema.properties).toHaveProperty('filename');
    });

    it('should have relevant keywords', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const tool = registry.getTool('slack_send_image');
      expect(tool!.keywords).toContain('slack');
      expect(tool!.keywords).toContain('image');
    });

    it('should be discoverable by category', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const messagingTools = registry.getToolsByCategory('messaging');
      const names = messagingTools.map((t) => t.tool.name);
      expect(names).toContain('slack_send_image');
    });
  });

  describe('whatsapp_send_image registration', () => {
    it('should be registered in the whatsapp category', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const tool = registry.getTool('whatsapp_send_image');
      expect(tool).toBeDefined();
      expect(tool!.category).toBe('whatsapp');
    });

    it('should have correct tool definition', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const tool = registry.getTool('whatsapp_send_image');
      expect(tool!.tool.name).toBe('whatsapp_send_image');
      expect(tool!.tool.description).toContain('image');
      expect(tool!.tool.description).toContain('WhatsApp');
    });

    it('should have imageUrl and imagePath properties', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const tool = registry.getTool('whatsapp_send_image');
      const schema = tool!.tool.inputSchema as any;
      expect(schema.properties).toHaveProperty('imageUrl');
      expect(schema.properties).toHaveProperty('imagePath');
      expect(schema.properties).toHaveProperty('caption');
      expect(schema.properties).toHaveProperty('jid');
    });

    it('should not require any properties (all optional)', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const tool = registry.getTool('whatsapp_send_image');
      const schema = tool!.tool.inputSchema as any;
      expect(schema.required).toEqual([]);
    });

    it('should have relevant keywords', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const tool = registry.getTool('whatsapp_send_image');
      expect(tool!.keywords).toContain('whatsapp');
      expect(tool!.keywords).toContain('image');
    });

    it('should be discoverable by category', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const whatsappTools = registry.getToolsByCategory('whatsapp');
      const names = whatsappTools.map((t) => t.tool.name);
      expect(names).toContain('whatsapp_send_image');
    });
  });

  describe('tool naming convention', () => {
    it('image tools use standard naming without prefix', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const slackTool = registry.getTool('slack_send_image');
      const whatsappTool = registry.getTool('whatsapp_send_image');

      expect(slackTool).toBeDefined();
      expect(whatsappTool).toBeDefined();

      // Ensure old-style names don't exist
      expect(registry.getTool('ai_first_slack_send_image')).toBeUndefined();
      expect(registry.getTool('orient_slack_send_image')).toBeUndefined();
      expect(registry.getTool('orient_whatsapp_send_image')).toBeUndefined();
    });

    it('image tools are discoverable in their categories', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const messagingTools = registry.getToolsByCategory('messaging');
      const whatsappTools = registry.getToolsByCategory('whatsapp');

      const messagingNames = messagingTools.map((t) => t.tool.name);
      const whatsappNames = whatsappTools.map((t) => t.tool.name);

      expect(messagingNames).toContain('slack_send_image');
      expect(whatsappNames).toContain('whatsapp_send_image');
    });
  });
});
