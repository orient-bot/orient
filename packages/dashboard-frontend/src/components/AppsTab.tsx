import { useState, useEffect } from 'react';
import MiniAppEditorModal from './MiniAppEditor/MiniAppEditorModal';
import MissingIntegrationsBadge from './MissingIntegrationsBadge';
import MissingCapabilitiesBadge from './MissingCapabilitiesBadge';
import { assetUrl } from '../api';

interface AppSummary {
  name: string;
  title: string;
  description: string;
  version: string;
  status: 'draft' | 'pending_review' | 'published' | 'archived';
  isBuilt: boolean;
  author?: string;
  permissions?: Record<string, { read: boolean; write: boolean }>;
  capabilities?: {
    scheduler?: { enabled: boolean };
    webhooks?: { enabled: boolean };
    storage?: { enabled: boolean };
  };
}

interface AppStats {
  total: number;
  success: number;
  error: number;
  denied: number;
  avgDurationMs: number;
}

interface AppDetails {
  name: string;
  title: string;
  description: string;
  version: string;
  status: string;
  isBuilt: boolean;
  author?: string;
  permissions: Record<string, { read: boolean; write: boolean }>;
  capabilities: {
    scheduler?: { enabled: boolean; max_jobs: number };
    webhooks?: { enabled: boolean; max_endpoints: number };
  };
  sharing: {
    mode: string;
    expires_after_days?: number;
    max_uses?: number;
  };
}

interface ShareToken {
  tokenPreview: string;
  appName: string;
  createdAt: string;
  expiresAt?: string;
  maxUses?: number;
  useCount: number;
  isActive: boolean;
}

const API_BASE = '';

export default function AppsTab() {
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<AppDetails | null>(null);
  const [appStats, setAppStats] = useState<AppStats | null>(null);
  const [shareTokens, setShareTokens] = useState<ShareToken[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareSettings, setShareSettings] = useState({ expiryDays: 30, maxUses: '' });
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [editorAppName, setEditorAppName] = useState<string>('');
  const [editorCreateNew, setEditorCreateNew] = useState(false);
  const [activeIntegrations, setActiveIntegrations] = useState<string[]>([]);
  const [availableCapabilities, setAvailableCapabilities] = useState<string[]>([]);

  useEffect(() => {
    loadApps();
    loadActiveIntegrations();
    loadAvailableCapabilities();
  }, []);

  const loadApps = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE}/api/apps`);
      if (!response.ok) throw new Error('Failed to load apps');
      const data = await response.json();
      setApps(data.apps || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load apps');
    } finally {
      setLoading(false);
    }
  };

  const loadAppDetails = async (name: string) => {
    try {
      const [detailsRes, statsRes, tokensRes] = await Promise.all([
        fetch(`${API_BASE}/api/apps/${name}`),
        fetch(`${API_BASE}/api/apps/${name}/stats`),
        fetch(`${API_BASE}/api/apps/${name}/share`),
      ]);

      if (detailsRes.ok) {
        const data = await detailsRes.json();
        setSelectedApp(data.app);
      }

      if (statsRes.ok) {
        const data = await statsRes.json();
        setAppStats(data.stats);
      }

      if (tokensRes.ok) {
        const data = await tokensRes.json();
        setShareTokens(data.tokens || []);
      }
    } catch (err) {
      console.error('Failed to load app details', err);
    }
  };

  const loadActiveIntegrations = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/integrations/active`);
      if (response.ok) {
        const data = await response.json();
        setActiveIntegrations(data.integrations || []);
      }
    } catch (err) {
      console.error('Failed to load active integrations', err);
    }
  };

  const loadAvailableCapabilities = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/integrations/capabilities`);
      if (response.ok) {
        const data = await response.json();
        setAvailableCapabilities(data.capabilities || []);
      }
    } catch (err) {
      console.error('Failed to load available capabilities', err);
    }
  };

  const getMissingIntegrations = (app: AppSummary): string[] => {
    if (!app.permissions) return [];
    return Object.keys(app.permissions).filter(
      (permission) => !activeIntegrations.includes(permission)
    );
  };

  const getMissingCapabilities = (app: AppSummary): string[] => {
    if (!app.capabilities) return [];
    const missing: string[] = [];

    if (app.capabilities.scheduler?.enabled && !availableCapabilities.includes('scheduler')) {
      missing.push('scheduler');
    }
    if (app.capabilities.webhooks?.enabled && !availableCapabilities.includes('webhooks')) {
      missing.push('webhooks');
    }
    if (app.capabilities.storage?.enabled && !availableCapabilities.includes('storage')) {
      missing.push('storage');
    }

    return missing;
  };

  const hasUnsupportedFeatures = (app: AppSummary): boolean => {
    return getMissingIntegrations(app).length > 0 || getMissingCapabilities(app).length > 0;
  };

  const handleReload = async () => {
    try {
      await fetch(`${API_BASE}/api/apps/reload`, { method: 'POST' });
      await loadApps();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reload apps');
    }
  };

  const handleGenerateShareLink = async () => {
    if (!selectedApp) return;

    try {
      const response = await fetch(`${API_BASE}/api/apps/${selectedApp.name}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expiryDays: shareSettings.expiryDays,
          maxUses: shareSettings.maxUses ? parseInt(shareSettings.maxUses) : undefined,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate share link');

      const data = await response.json();
      await navigator.clipboard.writeText(data.shareUrl);
      alert(`Share link copied to clipboard!\n\n${data.shareUrl}`);

      setShowShareModal(false);
      await loadAppDetails(selectedApp.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate share link');
    }
  };

  const getStatusBadge = (status: string, isBuilt: boolean) => {
    if (!isBuilt) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
          Building
        </span>
      );
    }

    switch (status) {
      case 'published':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            Published
          </span>
        );
      case 'draft':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400">
            Draft
          </span>
        );
      case 'pending_review':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            Pending Review
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400">
            {status}
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900 dark:border-zinc-100"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Mini-Apps</h2>
          <p className="text-sm text-muted-foreground">
            AI-generated applications that can be shared with users
          </p>
        </div>
        <button
          onClick={handleReload}
          className="inline-flex items-center px-3 py-2 rounded-md text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80"
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Reload
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/10 dark:border-red-900 p-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-2xl font-bold">{apps.length}</div>
          <div className="text-sm text-muted-foreground">Total Apps</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-2xl font-bold">
            {apps.filter((a) => a.status === 'published').length}
          </div>
          <div className="text-sm text-muted-foreground">Published</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-2xl font-bold">{apps.filter((a) => a.isBuilt).length}</div>
          <div className="text-sm text-muted-foreground">Built</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-2xl font-bold">
            {apps.filter((a) => a.status === 'draft').length}
          </div>
          <div className="text-sm text-muted-foreground">Drafts</div>
        </div>
      </div>

      {/* Apps List */}
      {apps.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          {/* Ori Mascot - Encouraging to create apps */}
          <div className="w-24 h-24 mx-auto mb-4">
            <img
              src={assetUrl('/mascot/variations/empty-apps.png')}
              alt="Ori encourages you to create apps"
              className="w-full h-full object-contain"
            />
          </div>
          <h3 className="font-medium mb-1">Let's build something amazing!</h3>
          <p className="text-sm text-muted-foreground mb-4">
            No apps yet. Ask me to create one for you - I love building things!
          </p>
          <button
            onClick={() => {
              setEditorCreateNew(true);
              setShowEditorModal(true);
            }}
            className="btn btn-primary"
          >
            Create Your First App
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left p-4 text-xs font-medium uppercase text-muted-foreground">
                  App
                </th>
                <th className="text-left p-4 text-xs font-medium uppercase text-muted-foreground">
                  Version
                </th>
                <th className="text-left p-4 text-xs font-medium uppercase text-muted-foreground">
                  Status
                </th>
                <th className="text-left p-4 text-xs font-medium uppercase text-muted-foreground">
                  Integrations
                </th>
                <th className="text-left p-4 text-xs font-medium uppercase text-muted-foreground">
                  Author
                </th>
                <th className="text-right p-4 text-xs font-medium uppercase text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => {
                const unsupported = hasUnsupportedFeatures(app);
                const rowClass = unsupported
                  ? 'border-t border-border bg-muted/30 opacity-60'
                  : 'border-t border-border hover:bg-muted/50';

                return (
                  <tr key={app.name} className={rowClass}>
                    <td className="p-4">
                      <div>
                        <div className="font-medium">{app.title}</div>
                        <div className="text-xs text-muted-foreground font-mono">{app.name}</div>
                      </div>
                    </td>
                    <td className="p-4 font-mono text-sm">{app.version}</td>
                    <td className="p-4">{getStatusBadge(app.status, app.isBuilt)}</td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        <MissingIntegrationsBadge
                          missingIntegrations={getMissingIntegrations(app)}
                        />
                        <MissingCapabilitiesBadge
                          missingCapabilities={getMissingCapabilities(app)}
                        />
                      </div>
                    </td>
                    <td className="p-4 text-sm text-muted-foreground">{app.author || '-'}</td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => {
                          setEditorAppName(app.name);
                          setEditorCreateNew(false);
                          setShowEditorModal(true);
                        }}
                        disabled={unsupported}
                        className="btn btn-primary inline-flex items-center gap-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        title={
                          unsupported ? 'This app requires features not available' : undefined
                        }
                      >
                        <svg
                          className="w-3 h-3 mr-1"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                          />
                        </svg>
                        Edit with AI
                      </button>
                      {app.isBuilt && !unsupported && (
                        <>
                          <a
                            href={`/apps/${app.name}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-2 py-1 rounded text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                          >
                            <svg
                              className="w-3 h-3 mr-1"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                            Preview
                          </a>
                          <button
                            onClick={() => {
                              const url = `${window.location.origin}/apps/${app.name}/`;
                              navigator.clipboard.writeText(url);
                              alert(`Link copied!\n\n${url}`);
                            }}
                            className="inline-flex items-center px-2 py-1 rounded text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80"
                            title="Copy app link"
                          >
                            <svg
                              className="w-3 h-3 mr-1"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                              />
                            </svg>
                            Link
                          </button>
                        </>
                      )}
                      {app.isBuilt && unsupported && (
                        <span className="text-xs text-muted-foreground italic">
                          Unsupported in this environment
                        </span>
                      )}
                      <button
                        onClick={() => loadAppDetails(app.name)}
                        className="inline-flex items-center px-2 py-1 rounded text-sm font-medium hover:bg-muted"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* App Details Modal */}
      {selectedApp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl border border-border max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{selectedApp.title}</h3>
                  <p className="text-sm text-muted-foreground font-mono">{selectedApp.name}</p>
                </div>
                <button
                  onClick={() => setSelectedApp(null)}
                  className="p-2 hover:bg-muted rounded-md"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Preview Link */}
              {selectedApp.isBuilt && (
                <div className="flex gap-2">
                  <a
                    href={`/apps/${selectedApp.name}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <svg
                      className="w-4 h-4 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                    Open Preview
                  </a>
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/apps/${selectedApp.name}/`;
                      navigator.clipboard.writeText(url);
                      alert('Preview URL copied to clipboard!');
                    }}
                    className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  >
                    <svg
                      className="w-4 h-4 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                      />
                    </svg>
                    Copy Link
                  </button>
                </div>
              )}

              {/* Description */}
              <div>
                <h4 className="text-sm font-medium mb-2">Description</h4>
                <p className="text-sm text-muted-foreground">{selectedApp.description}</p>
              </div>

              {/* Stats */}
              {appStats && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Usage Statistics</h4>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-lg font-bold">{appStats.total}</div>
                      <div className="text-xs text-muted-foreground">Total Calls</div>
                    </div>
                    <div className="text-center p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                      <div className="text-lg font-bold text-green-700 dark:text-green-400">
                        {appStats.success}
                      </div>
                      <div className="text-xs text-green-600 dark:text-green-400">Success</div>
                    </div>
                    <div className="text-center p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                      <div className="text-lg font-bold text-red-700 dark:text-red-400">
                        {appStats.error}
                      </div>
                      <div className="text-xs text-red-600 dark:text-red-400">Errors</div>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-lg font-bold">{appStats.avgDurationMs}ms</div>
                      <div className="text-xs text-muted-foreground">Avg Duration</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Permissions */}
              <div>
                <h4 className="text-sm font-medium mb-2">Permissions</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(selectedApp.permissions).map(([key, value]) => (
                    <span
                      key={key}
                      className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-muted"
                    >
                      {key}: {value.read && 'read'}
                      {value.read && value.write && ', '}
                      {value.write && 'write'}
                    </span>
                  ))}
                  {Object.keys(selectedApp.permissions).length === 0 && (
                    <span className="text-sm text-muted-foreground">No permissions</span>
                  )}
                </div>
              </div>

              {/* Capabilities */}
              <div>
                <h4 className="text-sm font-medium mb-2">Capabilities</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedApp.capabilities.scheduler?.enabled && (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                      Scheduler (max {selectedApp.capabilities.scheduler.max_jobs} jobs)
                    </span>
                  )}
                  {selectedApp.capabilities.webhooks?.enabled && (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400">
                      Webhooks (max {selectedApp.capabilities.webhooks.max_endpoints} endpoints)
                    </span>
                  )}
                  {!selectedApp.capabilities.scheduler?.enabled &&
                    !selectedApp.capabilities.webhooks?.enabled && (
                      <span className="text-sm text-muted-foreground">No capabilities</span>
                    )}
                </div>
              </div>

              {/* Share Tokens */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">Share Links</h4>
                  <button
                    onClick={() => setShowShareModal(true)}
                    className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Generate Link
                  </button>
                </div>
                {shareTokens.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No share links generated</p>
                ) : (
                  <div className="space-y-2">
                    {shareTokens.map((token, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2 bg-muted rounded-lg text-sm"
                      >
                        <span className="font-mono">{token.tokenPreview}</span>
                        <span className={token.isActive ? 'text-green-600' : 'text-red-600'}>
                          {token.isActive ? `${token.useCount} uses` : 'Revoked'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && selectedApp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl border border-border max-w-md w-full">
            <div className="p-6 border-b border-border">
              <h3 className="text-lg font-semibold">Generate Share Link</h3>
              <p className="text-sm text-muted-foreground">for {selectedApp.title}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Expiry (days)</label>
                <input
                  type="number"
                  value={shareSettings.expiryDays}
                  onChange={(e) =>
                    setShareSettings({
                      ...shareSettings,
                      expiryDays: parseInt(e.target.value) || 30,
                    })
                  }
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max Uses (optional)</label>
                <input
                  type="number"
                  value={shareSettings.maxUses}
                  onChange={(e) => setShareSettings({ ...shareSettings, maxUses: e.target.value })}
                  placeholder="Unlimited"
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                />
              </div>
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-2">
              <button
                onClick={() => setShowShareModal(false)}
                className="px-4 py-2 rounded-md text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateShareLink}
                className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Generate & Copy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Editor Modal */}
      {showEditorModal && (
        <MiniAppEditorModal
          appName={editorAppName}
          createNew={editorCreateNew}
          onClose={() => setShowEditorModal(false)}
          onSuccess={() => {
            setShowEditorModal(false);
            loadApps(); // Reload apps after successful edit
          }}
        />
      )}
    </div>
  );
}
