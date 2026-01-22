import { useCallback, useEffect, useState } from 'react';
import { getFeatureFlags } from '../api';

export interface FeatureFlagDefinition {
  /** Whether the feature is enabled */
  enabled: boolean;
  /** UI strategy when disabled: 'hide' (remove from UI) or 'notify' (show with overlay) */
  uiStrategy: 'hide' | 'notify';
  /** Route to control (e.g., /apps, /automation) */
  route?: string;
  /** Navigation section where this feature appears */
  navSection?: 'SERVICES' | 'MANAGEMENT' | 'TOOLS';
  /** Parent flag ID for hierarchical relationships */
  parentFlag?: string;
}

/**
 * Pre-launch defaults - matches database feature_flags table
 * IDs use camelCase to match UI expectations (database uses snake_case)
 * This ensures a consistent, safe UI state if the API fails or is unavailable.
 */
const PRE_LAUNCH_DEFAULTS: Record<string, FeatureFlagDefinition> = {
  // Mini Apps - disabled by default
  miniApps: { enabled: false, uiStrategy: 'hide', route: '/apps', navSection: 'MANAGEMENT' },
  miniApps_create: { enabled: false, parentFlag: 'miniApps', uiStrategy: 'hide' },
  miniApps_editWithAi: { enabled: false, parentFlag: 'miniApps', uiStrategy: 'hide' },
  miniApps_share: { enabled: false, parentFlag: 'miniApps', uiStrategy: 'hide' },

  // Monitoring - disabled by default
  monitoring: {
    enabled: false,
    uiStrategy: 'hide',
    route: '/monitoring',
    navSection: 'MANAGEMENT',
  },
  monitoring_serverHealth: { enabled: false, parentFlag: 'monitoring', uiStrategy: 'hide' },

  // Agent Registry - enabled by default
  agentRegistry: { enabled: true, uiStrategy: 'hide', route: '/agents', navSection: 'MANAGEMENT' },
  agentRegistry_edit: { enabled: true, parentFlag: 'agentRegistry', uiStrategy: 'hide' },

  // Automation - enabled by default
  automation: { enabled: true, uiStrategy: 'hide', route: '/automation', navSection: 'MANAGEMENT' },
  automation_schedules: { enabled: true, parentFlag: 'automation', uiStrategy: 'hide' },
  automation_webhooks: { enabled: true, parentFlag: 'automation', uiStrategy: 'hide' },

  // Operations - enabled by default
  operations: { enabled: true, uiStrategy: 'hide', route: '/operations', navSection: 'MANAGEMENT' },
  operations_billing: { enabled: true, parentFlag: 'operations', uiStrategy: 'hide' },
  operations_storage: { enabled: true, parentFlag: 'operations', uiStrategy: 'hide' },
  operations_monitoring: { enabled: false, parentFlag: 'operations', uiStrategy: 'hide' },
  operations_monitoring_serverHealth: {
    enabled: false,
    parentFlag: 'operations_monitoring',
    uiStrategy: 'hide',
  },
};

export interface UseFeatureFlagsReturn {
  /** All feature flags */
  flags: Record<string, FeatureFlagDefinition>;
  /** Loading state */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Check if a feature is enabled (including parent chain) */
  isEnabled: (flagId: string) => boolean;
  /** Check if a feature should be hidden */
  shouldHide: (flagId: string) => boolean;
  /** Check if a feature should show notification overlay */
  shouldNotify: (flagId: string) => boolean;
  /** Refresh feature flags from server */
  refresh: () => Promise<void>;
}

export function useFeatureFlags(): UseFeatureFlagsReturn {
  // Initialize with pre-launch defaults for consistent behavior
  const [flags, setFlags] = useState<Record<string, FeatureFlagDefinition>>(PRE_LAUNCH_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch feature flags from API
  const loadFlags = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Use authenticated API function
      const data = await getFeatureFlags();

      // Transform API array to object map expected by UI
      // API returns: { flags: [{ id: 'mini_apps', enabled: true, ... }] }
      // UI expects: { miniApps: { enabled: true, uiStrategy: 'hide', ... } }
      const flagsFromApi: Record<string, FeatureFlagDefinition> = {};

      if (Array.isArray(data.flags)) {
        for (const flag of data.flags) {
          // Convert snake_case ID to camelCase for UI compatibility
          const camelId = flag.id.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
          // Also handle dot notation (mini_apps.create -> miniApps_create)
          const uiId = camelId.replace(/\./g, '_');

          // Determine parent flag from ID hierarchy
          const parentFlag = flag.id.includes('.')
            ? flag.id.split('.')[0].replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())
            : undefined;

          flagsFromApi[uiId] = {
            enabled: flag.effectiveValue ?? flag.enabled ?? false,
            uiStrategy: 'hide',
            parentFlag,
          };
        }
      }

      // Merge with defaults to ensure all flags exist
      setFlags({ ...PRE_LAUNCH_DEFAULTS, ...flagsFromApi });
    } catch (err) {
      // Fallback to pre-launch defaults (all disabled) for safe UI state
      console.warn('Failed to load feature flags, using pre-launch defaults:', err);
      setError(err instanceof Error ? err.message : 'Failed to load feature flags');
      setFlags(PRE_LAUNCH_DEFAULTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  // Check if a feature is enabled (including parent chain)
  const isEnabled = useCallback(
    (flagId: string): boolean => {
      const flag = flags[flagId];
      if (!flag) {
        // If flag doesn't exist, assume DISABLED (pre-launch safe)
        return false;
      }

      if (!flag.enabled) {
        return false;
      }

      // Check parent chain
      if (flag.parentFlag) {
        return isEnabled(flag.parentFlag);
      }

      return true;
    },
    [flags]
  );

  // Check if a feature should be hidden
  const shouldHide = useCallback(
    (flagId: string): boolean => {
      const flag = flags[flagId];
      if (!flag) {
        // If flag doesn't exist, HIDE it (pre-launch safe)
        return true;
      }

      if (!isEnabled(flagId)) {
        return flag.uiStrategy === 'hide';
      }
      return false;
    },
    [flags, isEnabled]
  );

  // Check if a feature should show notification overlay
  const shouldNotify = useCallback(
    (flagId: string): boolean => {
      const flag = flags[flagId];
      if (!flag) {
        // If flag doesn't exist, don't notify (just hide)
        return false;
      }

      if (!isEnabled(flagId)) {
        return flag.uiStrategy === 'notify';
      }
      return false;
    },
    [flags, isEnabled]
  );

  return {
    flags,
    loading,
    error,
    isEnabled,
    shouldHide,
    shouldNotify,
    refresh: loadFlags,
  };
}
