import { useState } from 'react';
import { useFeatureFlags, type FeatureFlagDefinition } from '../../hooks/useFeatureFlags';
import { setFeatureFlagOverride } from '../../api';

export function FeatureFlagsPage() {
  const { flags, refresh, loading } = useFeatureFlags();
  const [updating, setUpdating] = useState(false);

  // Group flags by parent
  const rootFlags = Object.entries(flags).filter(([_, flag]) => !flag.parentFlag);

  // Convert camelCase UI ID to snake_case database ID
  // Examples:
  //   miniApps -> mini_apps
  //   miniApps_create -> mini_apps.create
  //   monitoring_serverHealth -> monitoring.server_health
  const toDbId = (uiId: string): string => {
    // Split on underscore (hierarchy separator)
    const parts = uiId.split('_');

    // Convert each part from camelCase to snake_case
    const dbParts = parts.map((part) =>
      part
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '')
    );

    // Join with dot for hierarchy
    return dbParts.join('.');
  };

  const updateFlag = async (flagId: string, updates: Partial<FeatureFlagDefinition>) => {
    setUpdating(true);
    try {
      const dbId = toDbId(flagId);
      // Use the authenticated API function
      await setFeatureFlagOverride(dbId, updates.enabled ?? false);
      await refresh();
    } catch (error) {
      console.error('Failed to update feature flag:', error);
      alert('Failed to update feature flag. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Feature Flags</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Control which features are visible and how they behave when disabled.
        </p>
      </div>

      <div className="space-y-4">
        {rootFlags.map(([flagId, flag]) => {
          const children = Object.entries(flags).filter(([_, f]) => f.parentFlag === flagId);

          return (
            <div key={flagId} className="card p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-medium capitalize text-foreground">
                    {flagId.replace(/([A-Z])/g, ' $1').trim()}
                  </h3>
                  {flag.route && (
                    <p className="text-sm text-muted-foreground mt-1">Route: {flag.route}</p>
                  )}
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={flag.enabled}
                    onChange={(e) => updateFlag(flagId, { enabled: e.target.checked })}
                    disabled={updating}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium text-foreground">Enabled</span>
                </label>
              </div>

              {!flag.enabled && (
                <div className="mt-4 pt-4 border-t border-border">
                  <label className="block text-sm font-medium text-foreground mb-3">
                    When disabled:
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-2 cursor-pointer group">
                      <input
                        type="radio"
                        name={`strategy-${flagId}`}
                        value="hide"
                        checked={flag.uiStrategy === 'hide'}
                        onChange={() => updateFlag(flagId, { uiStrategy: 'hide' })}
                        disabled={updating}
                        className="mt-0.5 w-4 h-4 border-gray-300 text-primary focus:ring-primary"
                      />
                      <div>
                        <span className="text-sm text-foreground group-hover:text-foreground/80">
                          Hide from navigation
                        </span>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Feature will be completely hidden from the UI
                        </p>
                      </div>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer group">
                      <input
                        type="radio"
                        name={`strategy-${flagId}`}
                        value="notify"
                        checked={flag.uiStrategy === 'notify'}
                        onChange={() => updateFlag(flagId, { uiStrategy: 'notify' })}
                        disabled={updating}
                        className="mt-0.5 w-4 h-4 border-gray-300 text-primary focus:ring-primary"
                      />
                      <div>
                        <span className="text-sm text-foreground group-hover:text-foreground/80">
                          Show "Feature disabled" overlay
                        </span>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Feature will be visible but show a disabled message
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Child flags */}
              {children.length > 0 && (
                <div className="mt-4 pl-6 border-l-2 border-border space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Sub-features
                  </p>
                  {children.map(([childId, childFlag]) => (
                    <div
                      key={childId}
                      className="flex items-center justify-between py-2 px-3 rounded-md bg-secondary/50"
                    >
                      <span className="text-sm capitalize text-foreground">
                        {childId
                          .split('_')
                          .pop()
                          ?.replace(/([A-Z])/g, ' $1')}
                      </span>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={childFlag.enabled}
                          disabled={!flag.enabled || updating}
                          onChange={(e) => updateFlag(childId, { enabled: e.target.checked })}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <span className="text-xs text-muted-foreground">Enabled</span>
                      </label>
                    </div>
                  ))}
                  {!flag.enabled && (
                    <p className="text-xs text-muted-foreground italic">
                      Enable parent feature to configure sub-features
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
