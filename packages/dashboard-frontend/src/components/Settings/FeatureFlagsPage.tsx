import { useState } from 'react';
import { useFeatureFlags } from '../../context/FeatureFlagsContext';
import type { FeatureFlagWithOverride } from '../../api';

export function FeatureFlagsPage() {
  const { flags, loading, error, setOverride, removeOverride, getParentId, isEnabled } =
    useFeatureFlags();
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());

  // Group flags by parent
  const parentFlags = flags.filter((f) => !getParentId(f.id));
  const childrenByParent = new Map<string, FeatureFlagWithOverride[]>();

  for (const flag of flags) {
    const parentId = getParentId(flag.id);
    if (parentId) {
      const existing = childrenByParent.get(parentId) || [];
      existing.push(flag);
      childrenByParent.set(parentId, existing);
    }
  }

  const handleToggle = async (flagId: string, currentValue: boolean) => {
    try {
      setPendingActions((prev) => new Set(prev).add(flagId));
      await setOverride(flagId, !currentValue);
    } catch (err) {
      console.error('Failed to toggle flag:', err);
    } finally {
      setPendingActions((prev) => {
        const next = new Set(prev);
        next.delete(flagId);
        return next;
      });
    }
  };

  const handleReset = async (flagId: string) => {
    try {
      setPendingActions((prev) => new Set(prev).add(flagId));
      await removeOverride(flagId);
    } catch (err) {
      console.error('Failed to reset flag:', err);
    } finally {
      setPendingActions((prev) => {
        const next = new Set(prev);
        next.delete(flagId);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Feature Flags</h2>
          <p className="text-sm text-muted-foreground mt-1">Loading feature flags...</p>
        </div>
        <div className="card p-6 animate-pulse">
          <div className="h-4 bg-secondary rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-10 bg-secondary rounded"></div>
            <div className="h-10 bg-secondary rounded"></div>
            <div className="h-10 bg-secondary rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Feature Flags</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Control which features are visible in the dashboard.
          </p>
        </div>
        <div className="card p-6 border-destructive/50 bg-destructive/10">
          <p className="text-sm text-destructive">Failed to load feature flags: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Feature Flags</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Control which features are visible in the dashboard. Disabling a parent feature will also
          hide all its sub-features.
        </p>
      </div>

      <div className="space-y-4">
        {parentFlags.map((parent) => {
          const children = childrenByParent.get(parent.id) || [];
          const parentEnabled = isEnabled(parent.id);
          const isPending = pendingActions.has(parent.id);

          return (
            <div key={parent.id} className="card overflow-hidden">
              {/* Parent flag header */}
              <div
                className={`p-4 border-b border-border ${
                  !parentEnabled ? 'bg-muted/50' : 'bg-background'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleToggle(parent.id, parentEnabled)}
                      disabled={isPending}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                        parentEnabled ? 'bg-primary' : 'bg-secondary'
                      } ${isPending ? 'opacity-50 cursor-wait' : ''}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          parentEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{parent.name}</span>
                        {parent.userOverride !== null && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">
                            Custom
                          </span>
                        )}
                      </div>
                      {parent.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{parent.description}</p>
                      )}
                    </div>
                  </div>

                  {parent.userOverride !== null && (
                    <button
                      type="button"
                      onClick={() => handleReset(parent.id)}
                      disabled={isPending}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Child flags */}
              {children.length > 0 && (
                <div className={`divide-y divide-border ${!parentEnabled ? 'opacity-50' : ''}`}>
                  {children.map((child) => {
                    const childEnabled = isEnabled(child.id);
                    const isChildPending = pendingActions.has(child.id);
                    // Child is effectively disabled if parent is off
                    const effectivelyDisabled = !parentEnabled;

                    return (
                      <div
                        key={child.id}
                        className={`p-4 pl-8 ${effectivelyDisabled ? 'bg-muted/30' : ''}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleToggle(child.id, childEnabled)}
                              disabled={isChildPending || effectivelyDisabled}
                              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                                childEnabled ? 'bg-primary' : 'bg-secondary'
                              } ${isChildPending || effectivelyDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                  childEnabled ? 'translate-x-4' : 'translate-x-0'
                                }`}
                              />
                            </button>
                            <div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-sm ${effectivelyDisabled ? 'text-muted-foreground' : 'text-foreground'}`}
                                >
                                  {child.name}
                                </span>
                                {child.userOverride !== null && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">
                                    Custom
                                  </span>
                                )}
                                {effectivelyDisabled && (
                                  <span className="text-[10px] text-muted-foreground italic">
                                    (parent disabled)
                                  </span>
                                )}
                              </div>
                              {child.description && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {child.description}
                                </p>
                              )}
                            </div>
                          </div>

                          {child.userOverride !== null && !effectivelyDisabled && (
                            <button
                              type="button"
                              onClick={() => handleReset(child.id)}
                              disabled={isChildPending}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {parentFlags.length === 0 && (
          <div className="card p-6 text-center">
            <p className="text-sm text-muted-foreground">No feature flags configured.</p>
          </div>
        )}
      </div>

      {/* Info note */}
      <div className="p-4 rounded-lg bg-muted/30 border border-border">
        <p className="text-xs text-muted-foreground">
          <strong>Note:</strong> Feature flags control the visibility of sections and features in
          this dashboard. Custom overrides apply only to your account. Global defaults are managed
          by the system administrator.
        </p>
      </div>
    </div>
  );
}
