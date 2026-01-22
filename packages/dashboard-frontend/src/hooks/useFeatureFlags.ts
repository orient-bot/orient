import { useCallback, useEffect, useState } from 'react';

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
 * Pre-launch defaults - ALL FEATURES DISABLED
 * This ensures a consistent, safe UI state if the API fails or is unavailable.
 * Matches the server-side PRE_LAUNCH_DEFAULTS.
 */
const PRE_LAUNCH_DEFAULTS: Record<string, FeatureFlagDefinition> = {
  slaMonitoring: { enabled: false, uiStrategy: 'hide' },
  weeklyReports: { enabled: false, uiStrategy: 'hide' },
  miniApps: { enabled: false, uiStrategy: 'hide', route: '/apps', navSection: 'MANAGEMENT' },
  miniApps_create: { enabled: false, parentFlag: 'miniApps', uiStrategy: 'hide' },
  miniApps_editWithAI: { enabled: false, parentFlag: 'miniApps', uiStrategy: 'hide' },
  miniApps_share: { enabled: false, parentFlag: 'miniApps', uiStrategy: 'hide' },
  automation: {
    enabled: false,
    uiStrategy: 'hide',
    route: '/automation',
    navSection: 'MANAGEMENT',
  },
  automation_schedules: { enabled: false, parentFlag: 'automation', uiStrategy: 'hide' },
  automation_webhooks: { enabled: false, parentFlag: 'automation', uiStrategy: 'hide' },
  agentRegistry: { enabled: false, uiStrategy: 'hide', route: '/agents', navSection: 'MANAGEMENT' },
  agentRegistry_edit: { enabled: false, parentFlag: 'agentRegistry', uiStrategy: 'hide' },
  operations: {
    enabled: false,
    uiStrategy: 'hide',
    route: '/operations',
    navSection: 'MANAGEMENT',
  },
  operations_monitoring: { enabled: false, parentFlag: 'operations', uiStrategy: 'hide' },
  operations_storage: { enabled: false, parentFlag: 'operations', uiStrategy: 'hide' },
  operations_billing: { enabled: false, parentFlag: 'operations', uiStrategy: 'hide' },
  whatsappBot: { enabled: false, uiStrategy: 'hide' },
  slackBot: { enabled: false, uiStrategy: 'hide' },
  googleSlides: { enabled: false, uiStrategy: 'hide' },
  mcpServer: { enabled: false, uiStrategy: 'hide' },
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

      const response = await fetch('/api/feature-flags', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to load feature flags: ${response.statusText}`);
      }

      const data = await response.json();
      // Merge with defaults to ensure all flags exist
      setFlags({ ...PRE_LAUNCH_DEFAULTS, ...(data.flags || {}) });
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
