import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  getFeatureFlags,
  setFeatureFlagOverride,
  removeFeatureFlagOverride,
  getAuthToken,
  type FeatureFlagWithOverride,
} from '../api';

interface FeatureFlagsContextState {
  flags: FeatureFlagWithOverride[];
  loading: boolean;
  error: string | null;
  isEnabled: (flagId: string) => boolean;
  setOverride: (flagId: string, enabled: boolean) => Promise<void>;
  removeOverride: (flagId: string) => Promise<void>;
  getParentId: (flagId: string) => string | null;
  getChildren: (flagId: string) => FeatureFlagWithOverride[];
  refresh: () => Promise<void>;
}

const initialState: FeatureFlagsContextState = {
  flags: [],
  loading: true,
  error: null,
  isEnabled: () => true,
  setOverride: async () => {},
  removeOverride: async () => {},
  getParentId: () => null,
  getChildren: () => [],
  refresh: async () => {},
};

const FeatureFlagsContext = createContext<FeatureFlagsContextState>(initialState);

interface FeatureFlagsProviderProps {
  children: React.ReactNode;
}

export function FeatureFlagsProvider({ children }: FeatureFlagsProviderProps) {
  const [flags, setFlags] = useState<FeatureFlagWithOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Build a map of effective values for quick lookup
  const effectiveValues = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const flag of flags) {
      map[flag.id] = flag.effectiveValue;
    }
    return map;
  }, [flags]);

  // Load flags from backend
  const loadFlags = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setFlags([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await getFeatureFlags();
      setFlags(response.flags);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load feature flags';
      setError(message);
      console.error('Failed to load feature flags:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load flags on mount and when auth changes
  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  /**
   * Get parent flag ID from a hierarchical flag ID
   * e.g., 'mini_apps.create' -> 'mini_apps'
   */
  const getParentId = useCallback((flagId: string): string | null => {
    const lastDot = flagId.lastIndexOf('.');
    if (lastDot === -1) {
      return null;
    }
    return flagId.substring(0, lastDot);
  }, []);

  /**
   * Get all direct children of a flag
   */
  const getChildren = useCallback(
    (flagId: string): FeatureFlagWithOverride[] => {
      return flags.filter((f) => {
        const parent = getParentId(f.id);
        return parent === flagId;
      });
    },
    [flags, getParentId]
  );

  /**
   * Check if a flag is enabled (with cascade - checks all ancestors)
   * A flag is only enabled if ALL ancestors are enabled
   */
  const isEnabled = useCallback(
    (flagId: string): boolean => {
      // If flags haven't loaded yet, default to true to avoid hiding UI unnecessarily
      if (flags.length === 0) {
        return true;
      }

      // Check the flag itself and all ancestors
      const parts = flagId.split('.');
      for (let i = 1; i <= parts.length; i++) {
        const ancestorId = parts.slice(0, i).join('.');
        // If this ancestor is in our map and is false, the flag is disabled
        if (ancestorId in effectiveValues && !effectiveValues[ancestorId]) {
          return false;
        }
      }

      // If the flag is not in our map, default to true
      return effectiveValues[flagId] ?? true;
    },
    [effectiveValues, flags.length]
  );

  /**
   * Set a user override for a flag
   */
  const setOverride = useCallback(async (flagId: string, enabled: boolean): Promise<void> => {
    try {
      const response = await setFeatureFlagOverride(flagId, enabled);
      setFlags(response.flags);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set flag override';
      setError(message);
      throw err;
    }
  }, []);

  /**
   * Remove a user override (revert to global default)
   */
  const removeOverride = useCallback(async (flagId: string): Promise<void> => {
    try {
      const response = await removeFeatureFlagOverride(flagId);
      setFlags(response.flags);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove flag override';
      setError(message);
      throw err;
    }
  }, []);

  const value = useMemo(
    () => ({
      flags,
      loading,
      error,
      isEnabled,
      setOverride,
      removeOverride,
      getParentId,
      getChildren,
      refresh: loadFlags,
    }),
    [
      flags,
      loading,
      error,
      isEnabled,
      setOverride,
      removeOverride,
      getParentId,
      getChildren,
      loadFlags,
    ]
  );

  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlags() {
  const context = useContext(FeatureFlagsContext);

  if (context === undefined) {
    throw new Error('useFeatureFlags must be used within a FeatureFlagsProvider');
  }

  return context;
}

/**
 * Hook for checking if a specific flag is enabled
 * Usage: const isAppsEnabled = useFeatureFlag('mini_apps');
 */
export function useFeatureFlag(flagId: string): boolean {
  const { isEnabled } = useFeatureFlags();
  return isEnabled(flagId);
}
