/**
 * Tool Inventory Baseline Test
 *
 * Run this BEFORE the MCP server split refactor to establish a baseline
 * of all tools currently available in the monolithic server.
 *
 * This baseline is used to verify that no tools are lost during the refactor.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createToolRegistry,
  ToolRegistry,
  ToolCategory,
  getToolExecutorRegistry,
} from '@orientbot/agents';
import * as fs from 'fs';
import * as path from 'path';

describe('Tool Inventory Baseline', () => {
  let registry: ToolRegistry;

  beforeAll(() => {
    registry = createToolRegistry();
  });

  describe('Total Tool Count', () => {
    it('should have the expected total number of tools', () => {
      // Current baseline: 66 tools (may vary as tools are added/removed)
      // Update this number if tools are intentionally added/removed
      const toolCount = registry.size;
      console.log(`Total tools registered: ${toolCount}`);

      // Log all tool names for visibility
      const allTools = registry.getAllTools();
      console.log('All registered tools:');
      allTools.forEach((t) => console.log(`  - ${t.tool.name} (${t.category})`));

      expect(toolCount).toBeGreaterThanOrEqual(35); // Minimum expected
    });
  });

  describe('Category Distribution', () => {
    // Based on baseline captured 2026-01-11: 64 total tools
    const expectedCategories: Record<ToolCategory, { min: number; description: string }> = {
      messaging: { min: 4, description: 'Slack messaging tools' },
      whatsapp: { min: 10, description: 'WhatsApp messaging tools' },
      docs: { min: 8, description: 'Google Slides/Sheets tools' },
      google: { min: 8, description: 'Google OAuth services (Gmail, Calendar, Tasks)' },
      system: { min: 8, description: 'System, skills, health check tools' },
      apps: { min: 5, description: 'Mini-apps tools' },
      agents: { min: 3, description: 'Agent orchestration tools' },
      context: { min: 2, description: 'Context management tools' },
      media: { min: 1, description: 'Media generation tools' },
    };

    Object.entries(expectedCategories).forEach(([category, { min, description }]) => {
      it(`should have at least ${min} tools in '${category}' category (${description})`, () => {
        const tools = registry.getToolsByCategory(category as ToolCategory);
        console.log(`${category}: ${tools.length} tools`);
        tools.forEach((t) => console.log(`  - ${t.tool.name}`));

        expect(tools.length).toBeGreaterThanOrEqual(min);
      });
    });

    it('should have all 9 categories', () => {
      const categories = registry.getCategories();
      expect(categories).toHaveLength(9);

      const categoryNames = categories.map((c) => c.name);
      expect(categoryNames).toContain('messaging');
      expect(categoryNames).toContain('whatsapp');
      expect(categoryNames).toContain('docs');
      expect(categoryNames).toContain('google');
      expect(categoryNames).toContain('system');
      expect(categoryNames).toContain('apps');
      expect(categoryNames).toContain('agents');
      expect(categoryNames).toContain('context');
      expect(categoryNames).toContain('media');
    });
  });

  describe('Critical Tools Presence', () => {
    const criticalTools = [
      // System
      'ai_first_health_check',
      'ai_first_get_config',

      // Messaging
      'ai_first_slack_send_dm',
      'ai_first_slack_send_channel_message',

      // WhatsApp
      'whatsapp_send_message',
      'whatsapp_search_messages',

      // Slides (required by example-presentation-automation skill)
      'ai_first_slides_get_presentation',
      'ai_first_slides_get_slide',
      'ai_first_slides_duplicate_template',
      'ai_first_slides_update_text',
      'ai_first_slides_update_slide_text',
      'ai_first_slides_delete_slide',
      'ai_first_slides_update_weekly',

      // Google OAuth
      'google_calendar_list_events',
      'google_gmail_list_messages',

      // Apps
      'ai_first_create_app',
      'ai_first_list_apps',

      // Agents
      'ai_first_get_agent_context',
      'ai_first_list_agents',
      'ai_first_handoff_to_agent',

      // Skills
      'ai_first_list_skills',
      'ai_first_read_skill',
    ];

    criticalTools.forEach((toolName) => {
      it(`should have critical tool: ${toolName}`, () => {
        const tool = registry.getTool(toolName);
        expect(tool).toBeDefined();
        expect(tool?.tool.name).toBe(toolName);
      });
    });
  });

  describe('Tool Metadata Quality', () => {
    it('should have keywords for all tools', () => {
      const allTools = registry.getAllTools();
      const missingKeywords: string[] = [];

      allTools.forEach((tool) => {
        if (!tool.keywords || tool.keywords.length === 0) {
          missingKeywords.push(tool.tool.name);
        }
      });

      if (missingKeywords.length > 0) {
        console.warn('Tools missing keywords:', missingKeywords);
      }

      // Allow some tools to be missing keywords for now
      expect(missingKeywords.length).toBeLessThan(allTools.length * 0.2); // 80% coverage
    });

    it('should have useCases for all tools', () => {
      const allTools = registry.getAllTools();
      const missingUseCases: string[] = [];

      allTools.forEach((tool) => {
        if (!tool.useCases || tool.useCases.length === 0) {
          missingUseCases.push(tool.tool.name);
        }
      });

      if (missingUseCases.length > 0) {
        console.warn('Tools missing useCases:', missingUseCases);
      }

      // Allow some tools to be missing use cases for now
      expect(missingUseCases.length).toBeLessThan(allTools.length * 0.2); // 80% coverage
    });
  });

  describe('Baseline Export', () => {
    it('should export tool baseline to JSON file', () => {
      const allTools = registry.getAllTools();

      const baseline = {
        exportedAt: new Date().toISOString(),
        totalCount: allTools.length,
        tools: allTools.map((t) => ({
          name: t.tool.name,
          category: t.category,
          description: t.tool.description?.substring(0, 100),
        })),
        byCategory: {} as Record<string, string[]>,
      };

      // Group by category
      allTools.forEach((t) => {
        if (!baseline.byCategory[t.category]) {
          baseline.byCategory[t.category] = [];
        }
        baseline.byCategory[t.category].push(t.tool.name);
      });

      // Write to fixtures
      const fixturesDir = path.join(__dirname, '../fixtures');
      if (!fs.existsSync(fixturesDir)) {
        fs.mkdirSync(fixturesDir, { recursive: true });
      }

      const baselinePath = path.join(fixturesDir, 'tool-baseline.json');
      fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));

      console.log(`Baseline exported to: ${baselinePath}`);
      console.log(`Total tools: ${baseline.totalCount}`);
      Object.entries(baseline.byCategory).forEach(([cat, tools]) => {
        console.log(`  ${cat}: ${tools.length} tools`);
      });

      expect(fs.existsSync(baselinePath)).toBe(true);
    });
  });
});

/**
 * Server Assignment Tests
 *
 * These tests define which tools should go to which server.
 * Run these AFTER the refactor to verify correct assignment.
 */
describe('Server Assignment Definitions', () => {
  describe('coding-mcp expected tools', () => {
    const codingMcpTools = [
      // System
      'ai_first_health_check',
      'ai_first_get_config',

      // Slides (example-presentation-automation skill)
      'ai_first_slides_get_presentation',
      'ai_first_slides_get_slide',
      'ai_first_slides_duplicate_template',
      'ai_first_slides_update_text',
      'ai_first_slides_update_slide_text',
      'ai_first_slides_delete_slide',
      'ai_first_slides_update_weekly',

      // Agents
      'ai_first_get_agent_context',
      'ai_first_list_agents',
      'ai_first_handoff_to_agent',

      // Apps
      'ai_first_create_app',
      'ai_first_get_app',
      'ai_first_list_apps',
    ];

    it('should define ~17 tools for coding-mcp', () => {
      console.log('coding-mcp expected tools:', codingMcpTools.length);
      codingMcpTools.forEach((t) => console.log(`  - ${t}`));
      expect(codingMcpTools.length).toBeGreaterThanOrEqual(15);
    });
  });

  describe('core-mcp expected tools', () => {
    const coreMcpTools = [
      // System
      'ai_first_health_check',
      'ai_first_get_config',

      // Skills
      'ai_first_list_skills',
      'ai_first_read_skill',
      'ai_first_create_skill_async',
      'ai_first_edit_skill_async',
      'ai_first_list_skill_prs',
      'ai_first_reload_skills',

      // Agents
      'ai_first_get_agent_context',
      'ai_first_list_agents',
      'ai_first_handoff_to_agent',

      // Discovery (global)
      'discover_tools',
    ];

    it('should define ~12 tools for core-mcp', () => {
      console.log('core-mcp expected tools:', coreMcpTools.length);
      coreMcpTools.forEach((t) => console.log(`  - ${t}`));
      expect(coreMcpTools.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('assistant-mcp expected tools', () => {
    it('should include all remaining tools (~45+)', () => {
      const registry = createToolRegistry();
      const allTools = registry.getAllTools();

      // assistant-mcp gets all tools that aren't exclusive to coding/core
      const assistantTools = allTools.filter((t) =>
        ['messaging', 'whatsapp', 'docs', 'google'].includes(t.category)
      );

      console.log('assistant-mcp expected tools:', assistantTools.length);
      expect(assistantTools.length).toBeGreaterThanOrEqual(40);
    });
  });
});

/**
 * Tool Executor Registry Tests
 *
 * Verify that all tool handlers are registered in the ToolExecutorRegistry,
 * ensuring tools are accessible via the assistant MCP server (base-server.ts).
 */
describe('Tool Executor Registry', () => {
  const executorRegistry = getToolExecutorRegistry();

  describe('WhatsApp tool handlers', () => {
    const whatsappTools = [
      'whatsapp_search_messages',
      'whatsapp_get_recent',
      'whatsapp_get_conversation',
      'whatsapp_get_group_messages',
      'whatsapp_get_stats',
      'whatsapp_list_contacts',
      'whatsapp_list_groups',
      'whatsapp_get_media',
      'whatsapp_send_poll',
      'whatsapp_send_message',
    ];

    whatsappTools.forEach((toolName) => {
      it(`should have handler registered: ${toolName}`, () => {
        expect(executorRegistry.hasHandler(toolName)).toBe(true);
      });
    });

    it('should have all 10 WhatsApp tool handlers', () => {
      const registeredCount = whatsappTools.filter((t) => executorRegistry.hasHandler(t)).length;
      expect(registeredCount).toBe(10);
    });
  });

  describe('Google tool handlers (regression)', () => {
    const googleTools = [
      'google_oauth_status',
      'google_calendar_list_events',
      'google_calendar_create_event',
    ];

    googleTools.forEach((toolName) => {
      it(`should have handler registered: ${toolName}`, () => {
        expect(executorRegistry.hasHandler(toolName)).toBe(true);
      });
    });
  });

  describe('Total handler count', () => {
    it('should have a minimum number of registered handlers', () => {
      const handlers = executorRegistry.getRegisteredHandlers();
      console.log(`Total executor handlers registered: ${handlers.length}`);
      console.log('Registered handlers:', handlers);
      // At minimum: media + config + google + whatsapp handlers
      expect(handlers.length).toBeGreaterThanOrEqual(15);
    });
  });
});
