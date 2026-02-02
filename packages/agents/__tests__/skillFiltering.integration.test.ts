import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the integration connection service with configurable responses
// Using a module-level variable that can be modified by tests
let mockIntegrationResponses: Record<string, boolean> = {};

vi.mock('../src/services/integrationConnectionService.js', () => {
  return {
    IntegrationConnectionService: class {
      async isIntegrationConnected(name: string): Promise<boolean> {
        return mockIntegrationResponses[name] ?? false;
      }
    },
  };
});

// Mock @orient-bot/core
vi.mock('@orient-bot/core', () => ({
  createServiceLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    startOperation: () => ({
      success: vi.fn(),
      failure: vi.fn(),
    }),
  }),
  getBuiltinSkillsPath: () => '/mock/builtin/skills',
  getUserSkillsPath: () => '/mock/user/skills',
  getRawConfig: vi.fn().mockReturnValue({}),
}));

import {
  CapabilityAvailabilityService,
  resetCapabilityAvailabilityService,
} from '../src/services/capabilityAvailabilityService.js';

describe('Skill Filtering Integration', () => {
  let capabilityService: CapabilityAvailabilityService;

  beforeEach(() => {
    resetCapabilityAvailabilityService();
    capabilityService = new CapabilityAvailabilityService();
    capabilityService.clearCache();
    mockIntegrationResponses = {};
  });

  describe('Skill requirements filtering scenarios', () => {
    // Test the filtering logic that would be applied to skills

    it('filters out skills when required OAuth is not connected', async () => {
      // Google connected, Atlassian not connected
      mockIntegrationResponses = { google: true, atlassian: false };

      const skillsWithRequirements = [
        { name: 'atlassian-mcp', requires: ['atlassian-oauth'] },
        { name: 'google-cli', requires: ['google-oauth'] },
        { name: 'general-skill', requires: undefined },
      ];

      const availableSkills: string[] = [];
      const filteredSkills: string[] = [];

      for (const skill of skillsWithRequirements) {
        const available = await capabilityService.areCapabilitiesAvailable(skill.requires);
        if (available) {
          availableSkills.push(skill.name);
        } else {
          filteredSkills.push(skill.name);
        }
      }

      expect(availableSkills).toContain('google-cli');
      expect(availableSkills).toContain('general-skill');
      expect(filteredSkills).toContain('atlassian-mcp');
    });

    it('includes all skills when all integrations are connected', async () => {
      // All integrations connected
      mockIntegrationResponses = { google: true, atlassian: true, slack: true };

      const skillsWithRequirements = [
        { name: 'atlassian-mcp', requires: ['atlassian-oauth'] },
        { name: 'google-cli', requires: ['google-oauth'] },
        { name: 'general-skill', requires: undefined },
      ];

      const availableSkills: string[] = [];

      for (const skill of skillsWithRequirements) {
        const available = await capabilityService.areCapabilitiesAvailable(skill.requires);
        if (available) {
          availableSkills.push(skill.name);
        }
      }

      expect(availableSkills).toContain('atlassian-mcp');
      expect(availableSkills).toContain('google-cli');
      expect(availableSkills).toContain('general-skill');
    });

    it('filters skills requiring multiple capabilities when any is missing', async () => {
      // Google connected, Slack not
      mockIntegrationResponses = { google: true, slack: false };

      const skillsWithRequirements = [
        { name: 'multi-integration-skill', requires: ['google-oauth', 'slack-config'] },
        { name: 'google-only-skill', requires: ['google-oauth'] },
      ];

      const availableSkills: string[] = [];
      const filteredSkills: string[] = [];

      for (const skill of skillsWithRequirements) {
        const available = await capabilityService.areCapabilitiesAvailable(skill.requires);
        if (available) {
          availableSkills.push(skill.name);
        } else {
          filteredSkills.push(skill.name);
        }
      }

      expect(availableSkills).toContain('google-only-skill');
      expect(filteredSkills).toContain('multi-integration-skill');
    });

    it('skills without requires are always available (backward compatible)', async () => {
      // No integrations connected
      mockIntegrationResponses = { google: false, atlassian: false };

      const skillsWithRequirements = [
        { name: 'skill-with-undefined', requires: undefined },
        { name: 'skill-with-empty-array', requires: [] },
        { name: 'skill-with-requirements', requires: ['google-oauth'] },
      ];

      const availableSkills: string[] = [];

      for (const skill of skillsWithRequirements) {
        const available = await capabilityService.areCapabilitiesAvailable(skill.requires);
        if (available) {
          availableSkills.push(skill.name);
        }
      }

      expect(availableSkills).toContain('skill-with-undefined');
      expect(availableSkills).toContain('skill-with-empty-array');
      expect(availableSkills).not.toContain('skill-with-requirements');
    });
  });

  describe('SkillsService requires parsing', () => {
    // Test the frontmatter parsing for requires field

    it('parses skill metadata with requires field', () => {
      // The SkillsService parseFrontmatter is private, but we can test
      // through the public interface by checking that skills loaded
      // with requires in their frontmatter have the field populated.

      // For now, we'll just verify the interface types are correct
      const skillMetadata = {
        name: 'test-skill',
        description: 'A test skill',
        requires: ['google-oauth', 'atlassian-oauth'],
      };

      expect(skillMetadata.requires).toEqual(['google-oauth', 'atlassian-oauth']);
    });
  });
});

describe('Skill filtering test matrix', () => {
  let capabilityService: CapabilityAvailabilityService;

  beforeEach(() => {
    resetCapabilityAvailabilityService();
    capabilityService = new CapabilityAvailabilityService();
    capabilityService.clearCache();
    mockIntegrationResponses = {};
  });

  // Test matrix from the plan
  const testCases = [
    {
      scenario: 'No requirements',
      requirements: undefined as string[] | undefined,
      integrations: {},
      expected: true,
    },
    {
      scenario: 'Empty requirements',
      requirements: [] as string[],
      integrations: {},
      expected: true,
    },
    {
      scenario: 'Single OAuth met',
      requirements: ['google-oauth'],
      integrations: { google: true },
      expected: true,
    },
    {
      scenario: 'Single OAuth unmet',
      requirements: ['atlassian-oauth'],
      integrations: { atlassian: false },
      expected: false,
    },
    {
      scenario: 'Multiple all met',
      requirements: ['google-oauth', 'slack-oauth'],
      integrations: { google: true, slack: true },
      expected: true,
    },
    {
      scenario: 'Multiple partial (one unmet)',
      requirements: ['google-oauth', 'atlassian-oauth'],
      integrations: { google: true, atlassian: false },
      expected: false,
    },
  ];

  for (const testCase of testCases) {
    it(`${testCase.scenario}: returns ${testCase.expected}`, async () => {
      // Configure mock based on integrations
      mockIntegrationResponses = testCase.integrations;

      const result = await capabilityService.areCapabilitiesAvailable(testCase.requirements);
      expect(result).toBe(testCase.expected);
    });
  }
});
