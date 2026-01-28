/**
 * Unit Tests for Send Image Tool Registry Entries
 *
 * Verifies that orient_whatsapp_send_image and orient_slack_send_image
 * are properly registered in the tool registry with correct metadata.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock logger before imports
vi.mock('@orient/core', () => ({
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
  beforeEach(async () => {
    const { resetToolRegistry } = await import('../src/registry/index.js');
    resetToolRegistry();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('orient_slack_send_image registration', () => {
    it('should be registered in the messaging category', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const tool = registry.getTool('orient_slack_send_image');
      expect(tool).toBeDefined();
      expect(tool!.category).toBe('messaging');
    });

    it('should have correct tool definition', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const tool = registry.getTool('orient_slack_send_image');
      expect(tool!.tool.name).toBe('orient_slack_send_image');
      expect(tool!.tool.description).toContain('image');
      expect(tool!.tool.description).toContain('Slack');
    });

    it('should have required channel property', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const tool = registry.getTool('orient_slack_send_image');
      const schema = tool!.tool.inputSchema as any;
      expect(schema.required).toContain('channel');
    });

    it('should have imageUrl and imagePath properties', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const tool = registry.getTool('orient_slack_send_image');
      const schema = tool!.tool.inputSchema as any;
      expect(schema.properties).toHaveProperty('imageUrl');
      expect(schema.properties).toHaveProperty('imagePath');
      expect(schema.properties).toHaveProperty('caption');
      expect(schema.properties).toHaveProperty('filename');
    });

    it('should have relevant keywords', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const tool = registry.getTool('orient_slack_send_image');
      expect(tool!.keywords).toContain('slack');
      expect(tool!.keywords).toContain('image');
    });

    it('should be searchable by image-related queries', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const results = registry.searchTools('slack image');
      const names = results.map((r) => r.tool.tool.name);
      expect(names).toContain('orient_slack_send_image');
    });
  });

  describe('orient_whatsapp_send_image registration', () => {
    it('should be registered in the whatsapp category', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const tool = registry.getTool('orient_whatsapp_send_image');
      expect(tool).toBeDefined();
      expect(tool!.category).toBe('whatsapp');
    });

    it('should have correct tool definition', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const tool = registry.getTool('orient_whatsapp_send_image');
      expect(tool!.tool.name).toBe('orient_whatsapp_send_image');
      expect(tool!.tool.description).toContain('image');
      expect(tool!.tool.description).toContain('WhatsApp');
    });

    it('should have imageUrl and imagePath properties', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const tool = registry.getTool('orient_whatsapp_send_image');
      const schema = tool!.tool.inputSchema as any;
      expect(schema.properties).toHaveProperty('imageUrl');
      expect(schema.properties).toHaveProperty('imagePath');
      expect(schema.properties).toHaveProperty('caption');
      expect(schema.properties).toHaveProperty('jid');
    });

    it('should not require any properties (all optional)', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const tool = registry.getTool('orient_whatsapp_send_image');
      const schema = tool!.tool.inputSchema as any;
      expect(schema.required).toEqual([]);
    });

    it('should have relevant keywords', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const tool = registry.getTool('orient_whatsapp_send_image');
      expect(tool!.keywords).toContain('whatsapp');
      expect(tool!.keywords).toContain('image');
    });

    it('should be searchable by whatsapp image queries', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const results = registry.searchTools('whatsapp photo');
      const names = results.map((r) => r.tool.tool.name);
      expect(names).toContain('orient_whatsapp_send_image');
    });
  });

  describe('orient_ prefix convention', () => {
    it('new image tools use orient_ prefix, not ai_first_', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const slackTool = registry.getTool('orient_slack_send_image');
      const whatsappTool = registry.getTool('orient_whatsapp_send_image');

      expect(slackTool).toBeDefined();
      expect(whatsappTool).toBeDefined();

      // Ensure old-style names don't exist
      expect(registry.getTool('ai_first_slack_send_image')).toBeUndefined();
      expect(registry.getTool('whatsapp_send_image')).toBeUndefined();
    });

    it('orient_ prefixed tools are discoverable in their categories', async () => {
      const { createToolRegistry } = await import('../src/services/toolRegistry.js');
      const registry = createToolRegistry();

      const messagingTools = registry.getToolsByCategory('messaging');
      const whatsappTools = registry.getToolsByCategory('whatsapp');

      const messagingNames = messagingTools.map((t) => t.tool.name);
      const whatsappNames = whatsappTools.map((t) => t.tool.name);

      expect(messagingNames).toContain('orient_slack_send_image');
      expect(whatsappNames).toContain('orient_whatsapp_send_image');
    });
  });
});
