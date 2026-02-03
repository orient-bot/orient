import { useState, useEffect, useCallback } from 'react';
import { getIntegrationsCatalog, connectIntegration, type CatalogIntegration } from '../api';
import { IntegrationCredentialModal } from './IntegrationCredentialModal';

// Simple notification component
interface Notification {
  type: 'success' | 'error' | 'info';
  message: string;
}

function NotificationBanner({
  notification,
  onDismiss,
}: {
  notification: Notification;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const colors = {
    success:
      'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800',
    error:
      'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800',
    info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800',
  };

  return (
    <div
      className={`fixed top-4 right-4 z-50 max-w-md rounded-lg border p-4 shadow-lg ${colors[notification.type]}`}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium">{notification.message}</p>
        <button onClick={onDismiss} className="text-current opacity-70 hover:opacity-100">
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Integration icons as simple SVGs
const INTEGRATION_ICONS: Record<string, JSX.Element> = {
  google: (
    <svg viewBox="0 0 24 24" className="w-8 h-8">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  ),
  atlassian: (
    <svg viewBox="0 0 24 24" fill="#0052CC" className="w-8 h-8">
      <path d="M7.12 11.084a.683.683 0 00-1.16.126L.913 21.393A.684.684 0 001.527 22.4h7.04a.687.687 0 00.614-.376c1.47-2.947 1.178-7.403-2.061-10.94z" />
      <path d="M11.406 1.132a14.323 14.323 0 00-.63 14.104l3.029 6.066a.684.684 0 00.614.377h7.04a.683.683 0 00.614-.99L12.574 1.13a.683.683 0 00-1.168.003z" />
    </svg>
  ),
  github: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  ),
  linear: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
      <path d="M3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12Z" />
      <path d="M7.5 12L10.5 15L16.5 9" strokeWidth="2" stroke="white" fill="none" />
    </svg>
  ),
};

function getIntegrationIcon(name: string): JSX.Element {
  return (
    INTEGRATION_ICONS[name] || (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="w-8 h-8"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 9h6M9 12h6M9 15h4" />
      </svg>
    )
  );
}

function StatusBadge({ status, isConnected }: { status: string; isConnected: boolean }) {
  if (isConnected) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        Connected
      </span>
    );
  }

  const colors: Record<string, string> = {
    stable: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    beta: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    experimental: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  };

  return (
    <span
      className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[status] || colors.experimental}`}
    >
      {status}
    </span>
  );
}

export default function IntegrationCatalog() {
  const [integrations, setIntegrations] = useState<CatalogIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIntegration, setExpandedIntegration] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [credentialModalOpen, setCredentialModalOpen] = useState(false);
  const [credentialModalIntegration, setCredentialModalIntegration] =
    useState<CatalogIntegration | null>(null);
  const [notification, setNotification] = useState<Notification | null>(null);

  const showNotification = useCallback((type: Notification['type'], message: string) => {
    setNotification({ type, message });
  }, []);

  const loadCatalog = useCallback(async () => {
    try {
      const data = await getIntegrationsCatalog();
      setIntegrations(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();

    // Listen for OAuth completion messages
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'oauth-complete') {
        // For Atlassian, we need to call the complete endpoint to exchange code for tokens
        if (event.data.provider === 'atlassian') {
          try {
            const completeResult = await fetch('/api/integrations/connect/atlassian/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
            }).then((r) => r.json());

            if (completeResult.connected) {
              showNotification('success', 'Successfully connected to Atlassian!');
            } else if (completeResult.error) {
              showNotification('error', completeResult.error);
            }
          } catch (err) {
            showNotification('error', 'Failed to complete Atlassian connection');
          }
        } else if (event.data.success) {
          showNotification('success', `${event.data.provider} connected successfully!`);
        }

        // Refresh catalog to show updated connection status
        loadCatalog();
        setConnecting(null);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadCatalog, showNotification]);

  const proceedWithOAuth = async (integrationName: string, authMethod?: string) => {
    setConnecting(integrationName);
    try {
      const result = await connectIntegration(integrationName, authMethod);

      if (result.connected) {
        showNotification('success', result.message || `${integrationName} is already connected!`);
        await loadCatalog();
        return;
      }

      if (result.authUrl) {
        // Open OAuth authorization URL
        const popup = window.open(result.authUrl, '_blank', 'width=600,height=700,popup=true');
        showNotification(
          'info',
          result.instructions || 'Complete authorization in the popup window.'
        );

        // For Atlassian, poll the completion endpoint to exchange code for tokens
        if (integrationName === 'atlassian') {
          const maxAttempts = 60; // 60 attempts * 2 seconds = 2 minutes timeout
          let attempts = 0;

          const pollForCompletion = async () => {
            while (attempts < maxAttempts) {
              attempts++;
              await new Promise((resolve) => setTimeout(resolve, 2000));

              // Check if popup was closed without completing
              if (popup && popup.closed) {
                // Try one more time in case they just completed
                try {
                  const completeResult = await fetch(
                    '/api/integrations/connect/atlassian/complete',
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                    }
                  ).then((r) => r.json());

                  if (completeResult.connected) {
                    showNotification('success', 'Successfully connected to Atlassian!');
                    await loadCatalog();
                    return;
                  }
                } catch {
                  // Ignore
                }
                return;
              }

              try {
                const completeResult = await fetch('/api/integrations/connect/atlassian/complete', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                }).then((r) => r.json());

                if (completeResult.connected) {
                  showNotification('success', 'Successfully connected to Atlassian!');
                  if (popup) popup.close();
                  await loadCatalog();
                  return;
                } else if (completeResult.error) {
                  showNotification('error', completeResult.error);
                  return;
                }
                // If pending: true, continue polling
              } catch {
                // Network error, continue polling
              }
            }

            showNotification('error', 'Authorization timed out. Please try again.');
          };

          pollForCompletion().finally(() => setConnecting(null));
          return; // Don't call setConnecting(null) yet
        }
      } else if (result.requiresOpenCode) {
        // Atlassian requires OpenCode
        showNotification(
          'info',
          result.message || 'Please use OpenCode to authenticate with Atlassian.'
        );
        if (result.openCodeUrl) {
          window.open(result.openCodeUrl, '_blank');
        }
      } else if (!result.success) {
        showNotification('error', result.message || 'Failed to connect.');
      } else {
        // Successfully connected (e.g., JIRA API token)
        showNotification('success', result.message || 'Connected successfully!');
        await loadCatalog();
      }
    } catch (err) {
      showNotification(
        'error',
        err instanceof Error ? err.message : 'Failed to connect integration'
      );
    } finally {
      setConnecting(null);
    }
  };

  const handleConnect = async (integrationName: string) => {
    const integration = integrations.find((i) => i.manifest.name === integrationName);
    if (!integration) return;

    // Check if secrets are configured
    if (!integration.secretsConfigured) {
      // Open credential modal instead of showing alert
      setCredentialModalIntegration(integration);
      setCredentialModalOpen(true);
      return;
    }

    // Secrets are configured, proceed with OAuth
    await proceedWithOAuth(integrationName);
  };

  const handleCredentialsSaved = async (authMethod?: string) => {
    if (!credentialModalIntegration) return;

    // Refresh catalog to update secretsConfigured status
    await loadCatalog();

    // Now proceed with OAuth connection
    await proceedWithOAuth(credentialModalIntegration.manifest.name, authMethod);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-2 text-muted-foreground">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Loading integrations...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notification */}
      {notification && (
        <NotificationBanner notification={notification} onDismiss={() => setNotification(null)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Integration Catalog</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Connect external services to extend Orient's capabilities
          </p>
        </div>
        <div className="text-sm text-muted-foreground">{integrations.length} available</div>
      </div>

      {error && (
        <div className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 rounded-lg p-4 text-sm">
          <p className="font-medium">Failed to load catalog</p>
          <p className="text-xs mt-1 opacity-75">{error}</p>
        </div>
      )}

      {/* Integration Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {integrations.map((integration) => (
          <div
            key={integration.manifest.name}
            className="card border border-border bg-card hover:shadow-md transition-shadow"
          >
            <div className="p-4">
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  {getIntegrationIcon(integration.manifest.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{integration.manifest.title}</h3>
                    <StatusBadge
                      status={integration.manifest.status}
                      isConnected={integration.isConnected}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {integration.manifest.description}
                  </p>
                </div>
              </div>

              {/* Tools preview */}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedIntegration(
                      expandedIntegration === integration.manifest.name
                        ? null
                        : integration.manifest.name
                    )
                  }
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <svg
                    className={`w-4 h-4 transition-transform ${expandedIntegration === integration.manifest.name ? 'rotate-90' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  {integration.manifest.tools.length} tools available
                </button>

                {expandedIntegration === integration.manifest.name && (
                  <div className="mt-2 pl-5 space-y-1">
                    {integration.manifest.tools.slice(0, 5).map((tool) => (
                      <div
                        key={tool.name}
                        className="text-xs text-muted-foreground flex items-center gap-2"
                      >
                        <span className="font-mono text-foreground">{tool.name}</span>
                        <span className="opacity-75">- {tool.description}</span>
                      </div>
                    ))}
                    {integration.manifest.tools.length > 5 && (
                      <div className="text-xs text-muted-foreground italic">
                        +{integration.manifest.tools.length - 5} more tools
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {integration.manifest.docsUrl && (
                    <a
                      href={integration.manifest.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                        <path d="M15 3h6v6" />
                        <path d="M10 14L21 3" />
                      </svg>
                      Docs
                    </a>
                  )}
                  <span className="text-xs text-muted-foreground">
                    v{integration.manifest.version}
                  </span>
                </div>

                {integration.isConnected ? (
                  <button
                    type="button"
                    className="btn btn-secondary h-8 text-sm"
                    onClick={() => {
                      /* TODO: Disconnect */
                    }}
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary h-8 text-sm flex items-center gap-1.5 disabled:opacity-50"
                    disabled={connecting === integration.manifest.name}
                    onClick={() => handleConnect(integration.manifest.name)}
                  >
                    {connecting === integration.manifest.name ? (
                      <>
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Connecting...
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-4 h-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M15 3h6v6" />
                          <path d="M10 14L21 3" />
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                        </svg>
                        Connect
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {integrations.length === 0 && !loading && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No integrations available in the catalog.</p>
        </div>
      )}

      {/* Credential Modal */}
      <IntegrationCredentialModal
        open={credentialModalOpen}
        onOpenChange={setCredentialModalOpen}
        integration={credentialModalIntegration}
        onCredentialsSaved={handleCredentialsSaved}
        onSuccess={(msg) => showNotification('success', msg)}
        onError={(msg) => showNotification('error', msg)}
      />
    </div>
  );
}
