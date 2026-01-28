/**
 * Media Tools Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../src/types.js';

// Mock the core logger
vi.mock('@orientbot/core', () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    startOperation: () => ({
      success: vi.fn(),
      failure: vi.fn(),
    }),
  }),
}));

describe('Media Tools', () => {
  describe('GenerateMascotTool', () => {
    let generateMascotTool: any;
    let mockContext: ToolContext;

    beforeEach(async () => {
      vi.resetModules();
      const { generateMascotTool: tool } = await import('../src/tools/media/index.js');
      generateMascotTool = tool;

      mockContext = {
        config: {} as any,
        correlationId: 'test-123',
        getMascotBaseImage: vi.fn().mockResolvedValue(Buffer.from('test-image')),
      };
    });

    it('should have correct metadata', () => {
      expect(generateMascotTool.name).toBe('media_generate_mascot');
      expect(generateMascotTool.category).toBe('media');
      expect(generateMascotTool.keywords).toContain('mascot');
      expect(generateMascotTool.keywords).toContain('avatar');
      expect(generateMascotTool.keywords).toContain('image');
    });

    it('should have correct input schema', () => {
      const metadata = generateMascotTool.toMetadata();
      expect(metadata.tool.inputSchema).toBeDefined();
    });

    it('should return error when Gemini service is not available', async () => {
      const result = await generateMascotTool.execute(
        {
          variation_type: 'pose',
          prompt: 'sitting and waving',
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Gemini service not available');
    });

    it('should return error when base mascot image is not available', async () => {
      // Context without getMascotBaseImage to test this error path
      const contextWithoutMascot = {
        config: {} as any,
        correlationId: 'test-123',
        getGeminiService: vi.fn().mockResolvedValue({}),
      };

      const result = await generateMascotTool.execute(
        {
          variation_type: 'pose',
          prompt: 'sitting and waving',
        },
        contextWithoutMascot
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Base mascot image not available');
    });

    it('should have examples for common use cases', () => {
      expect(generateMascotTool.examples).toBeDefined();
      expect(generateMascotTool.examples.length).toBeGreaterThan(0);

      // Check for celebration example
      const celebrationExample = generateMascotTool.examples.find(
        (e: any) => e.input.output_name === 'celebration'
      );
      expect(celebrationExample).toBeDefined();
    });

    it('should convert to MCP tool format', () => {
      const mcpTool = generateMascotTool.toMCPTool();
      expect(mcpTool.name).toBe('media_generate_mascot');
      expect(mcpTool.description).toContain('mascot');
      expect(mcpTool.inputSchema).toBeDefined();
    });
  });
});
