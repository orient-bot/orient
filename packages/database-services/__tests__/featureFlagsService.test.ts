/**
 * Feature Flags Service Tests
 *
 * Tests cascade logic, user overrides, and hierarchy handling.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create mock pool instance that will be shared
const mockPoolInstance = {
  query: vi.fn(),
  end: vi.fn(),
};

// Mock pg module with a proper class that supports `new`
vi.mock('pg', () => {
  class MockPool {
    query = mockPoolInstance.query;
    end = mockPoolInstance.end;
  }
  return {
    default: {
      Pool: MockPool,
    },
    Pool: MockPool,
  };
});

import {
  FeatureFlagsService,
  createFeatureFlagsService,
  type FeatureFlag,
  type FeatureFlagWithOverride,
} from '../src/featureFlagsService.js';

describe('FeatureFlagsService', () => {
  let service: FeatureFlagsService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPoolInstance.query.mockReset();
    mockPoolInstance.end.mockReset();
    service = createFeatureFlagsService('postgresql://test:test@localhost/test');
  });

  describe('getAllFlags', () => {
    it('should return all feature flags', async () => {
      const mockFlags = [
        {
          id: 'mini_apps',
          name: 'Mini-Apps',
          description: 'AI-generated web applications',
          enabled: true,
          category: 'ui',
          sort_order: 10,
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-01'),
        },
        {
          id: 'mini_apps.create',
          name: 'Create App',
          description: 'Create new mini-apps',
          enabled: true,
          category: 'ui',
          sort_order: 11,
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-01'),
        },
      ];

      mockPoolInstance.query.mockResolvedValueOnce({ rows: mockFlags });

      const result = await service.getAllFlags();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'mini_apps',
        name: 'Mini-Apps',
        description: 'AI-generated web applications',
        enabled: true,
        category: 'ui',
        sortOrder: 10,
        createdAt: mockFlags[0].created_at,
        updatedAt: mockFlags[0].updated_at,
      });
    });
  });

  describe('getAllFlagsWithOverrides', () => {
    it('should return flags with user overrides applied', async () => {
      const mockFlags = [
        {
          id: 'mini_apps',
          name: 'Mini-Apps',
          description: 'AI-generated web applications',
          enabled: true,
          category: 'ui',
          sort_order: 10,
          created_at: new Date(),
          updated_at: new Date(),
          user_override: null,
        },
        {
          id: 'mini_apps.create',
          name: 'Create App',
          description: 'Create new mini-apps',
          enabled: true,
          category: 'ui',
          sort_order: 11,
          created_at: new Date(),
          updated_at: new Date(),
          user_override: false, // User disabled this
        },
      ];

      mockPoolInstance.query.mockResolvedValueOnce({ rows: mockFlags });

      const result = await service.getAllFlagsWithOverrides(1);

      expect(result).toHaveLength(2);
      expect(result[0].userOverride).toBeNull();
      expect(result[0].effectiveValue).toBe(true);
      expect(result[1].userOverride).toBe(false);
      expect(result[1].effectiveValue).toBe(false);
    });

    it('should apply cascade logic when parent is disabled', async () => {
      const mockFlags = [
        {
          id: 'mini_apps',
          name: 'Mini-Apps',
          description: 'AI-generated web applications',
          enabled: true,
          category: 'ui',
          sort_order: 10,
          created_at: new Date(),
          updated_at: new Date(),
          user_override: false, // Parent disabled by user
        },
        {
          id: 'mini_apps.create',
          name: 'Create App',
          description: 'Create new mini-apps',
          enabled: true,
          category: 'ui',
          sort_order: 11,
          created_at: new Date(),
          updated_at: new Date(),
          user_override: null, // No override
        },
        {
          id: 'mini_apps.edit_with_ai',
          name: 'Edit with AI',
          description: 'AI-powered editing',
          enabled: true,
          category: 'ui',
          sort_order: 12,
          created_at: new Date(),
          updated_at: new Date(),
          user_override: true, // Explicitly enabled, but parent is off
        },
      ];

      mockPoolInstance.query.mockResolvedValueOnce({ rows: mockFlags });

      const result = await service.getAllFlagsWithOverrides(1);

      // Parent is disabled
      expect(result[0].effectiveValue).toBe(false);
      // Children should be effectively disabled due to cascade
      expect(result[1].effectiveValue).toBe(false);
      expect(result[2].effectiveValue).toBe(false);
    });

    it('should handle deeply nested hierarchies', async () => {
      const mockFlags = [
        {
          id: 'a',
          name: 'A',
          description: null,
          enabled: true,
          category: 'ui',
          sort_order: 1,
          created_at: new Date(),
          updated_at: new Date(),
          user_override: null,
        },
        {
          id: 'a.b',
          name: 'A.B',
          description: null,
          enabled: true,
          category: 'ui',
          sort_order: 2,
          created_at: new Date(),
          updated_at: new Date(),
          user_override: false, // Disabled at middle level
        },
        {
          id: 'a.b.c',
          name: 'A.B.C',
          description: null,
          enabled: true,
          category: 'ui',
          sort_order: 3,
          created_at: new Date(),
          updated_at: new Date(),
          user_override: null,
        },
      ];

      mockPoolInstance.query.mockResolvedValueOnce({ rows: mockFlags });

      const result = await service.getAllFlagsWithOverrides(1);

      expect(result[0].effectiveValue).toBe(true); // 'a' is enabled
      expect(result[1].effectiveValue).toBe(false); // 'a.b' is disabled
      expect(result[2].effectiveValue).toBe(false); // 'a.b.c' disabled due to cascade
    });
  });

  describe('getEffectiveFlags', () => {
    it('should return a flat object of effective flag values', async () => {
      const mockFlags = [
        {
          id: 'mini_apps',
          name: 'Mini-Apps',
          description: null,
          enabled: true,
          category: 'ui',
          sort_order: 10,
          created_at: new Date(),
          updated_at: new Date(),
          user_override: null,
        },
        {
          id: 'mini_apps.create',
          name: 'Create App',
          description: null,
          enabled: true,
          category: 'ui',
          sort_order: 11,
          created_at: new Date(),
          updated_at: new Date(),
          user_override: false,
        },
      ];

      mockPoolInstance.query.mockResolvedValueOnce({ rows: mockFlags });

      const result = await service.getEffectiveFlags(1);

      expect(result).toEqual({
        mini_apps: true,
        'mini_apps.create': false,
      });
    });
  });

  describe('setUserOverride', () => {
    it('should set a user override for a flag', async () => {
      // Flag exists check
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [{ id: 'mini_apps' }] });
      // Upsert override
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [] });

      await service.setUserOverride(1, 'mini_apps', false);

      expect(mockPoolInstance.query).toHaveBeenCalledTimes(2);
      const upsertCall = mockPoolInstance.query.mock.calls[1];
      expect(upsertCall[0]).toContain('INSERT INTO user_feature_flag_overrides');
      expect(upsertCall[1]).toEqual([1, 'mini_apps', false]);
    });

    it('should throw error if flag does not exist', async () => {
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [] });

      await expect(service.setUserOverride(1, 'nonexistent', false)).rejects.toThrow(
        "Feature flag 'nonexistent' does not exist"
      );
    });
  });

  describe('removeUserOverride', () => {
    it('should remove a user override', async () => {
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [] });

      await service.removeUserOverride(1, 'mini_apps');

      expect(mockPoolInstance.query).toHaveBeenCalledTimes(1);
      const deleteCall = mockPoolInstance.query.mock.calls[0];
      expect(deleteCall[0]).toContain('DELETE FROM user_feature_flag_overrides');
      expect(deleteCall[1]).toEqual([1, 'mini_apps']);
    });
  });

  describe('getParentId', () => {
    it('should return parent for child flag', () => {
      expect(service.getParentId('mini_apps.create')).toBe('mini_apps');
    });

    it('should return parent for deeply nested flag', () => {
      expect(service.getParentId('a.b.c')).toBe('a.b');
    });

    it('should return null for root flag', () => {
      expect(service.getParentId('mini_apps')).toBeNull();
    });
  });

  describe('getAncestorIds', () => {
    it('should return all ancestors for nested flag', () => {
      const ancestors = service.getAncestorIds('a.b.c');
      expect(ancestors).toEqual(['a', 'a.b', 'a.b.c']);
    });

    it('should return single element for root flag', () => {
      const ancestors = service.getAncestorIds('mini_apps');
      expect(ancestors).toEqual(['mini_apps']);
    });
  });

  describe('close', () => {
    it('should close the database pool', async () => {
      await service.close();
      expect(mockPoolInstance.end).toHaveBeenCalled();
    });
  });
});
