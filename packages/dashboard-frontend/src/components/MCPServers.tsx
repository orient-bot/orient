import { useState, useEffect, useRef } from 'react';
import {
  getMCPServers,
  getMCPOAuthConfig,
  triggerMCPOAuth,
  clearMCPTokens,
  completeMCPOAuth,
  setSecret,
  assetUrl,
  type MCPServer,
  type OAuthConfig,
} from '../api';

interface MCPServersProps {
  onUpdate?: () => void;
}

// Status colors and icons
const getStatusConfig = (server: MCPServer) => {
  if (!server.enabled) {
    return {
      color: 'bg-surface-100 text-surface-500 border-surface-200',
      dotColor: 'bg-surface-400',
      label: 'Disabled',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
          />
        </svg>
      ),
    };
  }

  if (server.connected) {
    return {
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dotColor: 'bg-emerald-500',
      label: 'Connected',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ),
    };
  }

  if (server.type === 'remote' && !server.hasTokens) {
    return {
      color: 'bg-amber-50 text-amber-700 border-amber-200',
      dotColor: 'bg-amber-500',
      label: 'Needs Auth',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      ),
    };
  }

  return {
    color: 'bg-red-50 text-red-700 border-red-200',
    dotColor: 'bg-red-500',
    label: 'Disconnected',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    ),
  };
};

// Server type icons
const getServerTypeIcon = (type: 'local' | 'remote') => {
  if (type === 'local') {
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
        />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
};

// Specific server icons
const getServerIcon = (name: string) => {
  const lowerName = name.toLowerCase();

  if (
    lowerName.includes('atlassian') ||
    lowerName.includes('jira') ||
    lowerName.includes('confluence')
  ) {
    return (
      <svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.005 1.005 0 0 0 23.013 0z" />
      </svg>
    );
  }

  if (lowerName.includes('orienter') || lowerName.includes('pm')) {
    return (
      <svg
        className="w-6 h-6 text-violet-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    );
  }

  if (lowerName.includes('google')) {
    return (
      <svg className="w-6 h-6" viewBox="0 0 24 24">
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
    );
  }

  // Default server icon
  return (
    <svg className="w-6 h-6 text-surface-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
      />
    </svg>
  );
};

function ServerCard({
  server,
  oauthConfig,
  onAuthorize,
  onClearTokens,
  isLoading,
}: {
  server: MCPServer;
  oauthConfig: OAuthConfig | null;
  onAuthorize: (name: string) => void;
  onClearTokens: (name: string) => void;
  isLoading: boolean;
}) {
  const status = getStatusConfig(server);
  const isRemoteOAuth = server.type === 'remote' && server.url?.includes('atlassian');
  const isGoogleOAuth = server.name.toLowerCase().includes('google');

  return (
    <div className="card p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        {/* Server Icon */}
        <div className="w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center flex-shrink-0">
          {getServerIcon(server.name)}
        </div>

        {/* Server Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-surface-900 truncate">{server.name}</h3>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${status.color}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${status.dotColor}`} />
              {status.label}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-surface-500 mb-2">
            <span className="inline-flex items-center gap-1">
              {getServerTypeIcon(server.type)}
              {server.type === 'local' ? 'Local Process' : 'Remote Server'}
            </span>
            {server.url && (
              <span className="truncate text-surface-400" title={server.url}>
                {(() => {
                  try {
                    return new URL(server.url).hostname;
                  } catch {
                    return server.url; // For non-URL strings like "Connected: email@example.com"
                  }
                })()}
              </span>
            )}
          </div>

          {/* OAuth Info for remote servers */}
          {isRemoteOAuth && (
            <div className="text-xs text-surface-400 bg-surface-50 rounded-lg p-2 mt-2">
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                <span>OAuth 2.1 Authentication</span>
              </div>
              {oauthConfig && (
                <div className="mt-1 text-surface-500 text-[10px] font-mono truncate">
                  Callback: {oauthConfig.redirectUrl}
                </div>
              )}
            </div>
          )}

          {/* OAuth Info for Google */}
          {isGoogleOAuth && (
            <div className="text-xs text-surface-400 bg-surface-50 rounded-lg p-2 mt-2">
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                <span>Google OAuth 2.0</span>
              </div>
              <div className="mt-1 text-surface-500 text-[10px]">
                Gmail, Calendar, Tasks, Sheets, Slides
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {(isRemoteOAuth || isGoogleOAuth) && !server.connected && (
            <button
              onClick={() => onAuthorize(server.name)}
              disabled={isLoading}
              className="btn btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1.5"
            >
              {isLoading ? (
                <span className="spinner-sm" />
              ) : (
                <>
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                    />
                  </svg>
                  Connect
                </>
              )}
            </button>
          )}

          {(isRemoteOAuth || isGoogleOAuth) && server.hasTokens && (
            <button
              onClick={() => onClearTokens(server.name)}
              disabled={isLoading}
              className="btn btn-ghost text-xs py-1.5 px-3 text-red-600 hover:bg-red-50 inline-flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Disconnect
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MCPServers({ onUpdate }: MCPServersProps) {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [oauthConfig, setOauthConfig] = useState<OAuthConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isUploadingCredentials, setIsUploadingCredentials] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [serversData, configData] = await Promise.all([getMCPServers(), getMCPOAuthConfig()]);
      setServers(serversData.servers);
      setOauthConfig(configData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MCP servers');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthorize = async (serverName: string) => {
    setActionLoading(serverName);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await triggerMCPOAuth(serverName);

      if (result.authUrl) {
        // Open the authorization URL in a new window
        const authWindow = window.open(result.authUrl, '_blank', 'width=600,height=700');

        if (authWindow) {
          setSuccessMessage(
            `Authorization window opened. Complete the authorization in the popup window...`
          );

          // Poll for completion - first try to complete the OAuth flow, then check status
          const pollInterval = setInterval(async () => {
            try {
              // Try to complete the OAuth flow (exchange code for tokens)
              const completeResult = await completeMCPOAuth(serverName);

              if (completeResult.success) {
                // OAuth completed successfully!
                clearInterval(pollInterval);
                const { servers: updatedServers } = await getMCPServers();
                setServers(updatedServers);
                setSuccessMessage(`Successfully connected to ${serverName}!`);
                onUpdate?.();
              } else if (!completeResult.pending) {
                // Failed but not pending - show error
                clearInterval(pollInterval);
                setError(completeResult.message || 'Failed to complete OAuth');
              }
              // If pending, keep polling
            } catch {
              // Ignore polling errors
            }
          }, 2000);

          // Stop polling after 5 minutes
          setTimeout(
            () => {
              clearInterval(pollInterval);
              setError('OAuth timeout - please try again');
            },
            5 * 60 * 1000
          );
        } else {
          setError('Popup blocked. Please allow popups and try again.');
        }
      } else if (result.requiresOpenCode) {
        // Server requires OpenCode for OAuth - show info message instead of error
        const openCodeUrl = result.openCodeUrl || 'http://localhost:4099';
        setSuccessMessage(
          `${serverName} authentication: Open OpenCode at ${openCodeUrl} and use any JIRA tool to trigger the OAuth flow. ` +
            `The authentication will complete automatically.`
        );
      } else if (!result.success) {
        // Server returned an error
        setError(
          result.message ||
            `Failed to initiate OAuth for ${serverName}. This may require local development mode.`
        );
      } else {
        // Success but no authUrl - show any message provided
        setSuccessMessage(
          result.message || result.instructions || `OAuth initiated for ${serverName}`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start authorization');
    } finally {
      setActionLoading(null);
    }
  };

  const handleClearTokens = async (serverName: string) => {
    if (
      !confirm(
        `Are you sure you want to disconnect from ${serverName}? You will need to re-authorize to use it again.`
      )
    ) {
      return;
    }

    setActionLoading(serverName);
    setError(null);
    setSuccessMessage(null);

    try {
      await clearMCPTokens(serverName);
      setSuccessMessage(`Disconnected from ${serverName}`);
      await loadData();
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear tokens');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle Google OAuth credentials JSON file upload
  const handleCredentialsUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingCredentials(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      // Google credentials JSON has either 'installed' or 'web' key
      const credentials = json.installed || json.web;
      if (!credentials) {
        throw new Error(
          'Invalid credentials file. Expected a Google OAuth client_secret JSON file with "installed" or "web" configuration.'
        );
      }

      const clientId = credentials.client_id;
      const clientSecret = credentials.client_secret;

      if (!clientId || !clientSecret) {
        throw new Error('Invalid credentials file. Missing client_id or client_secret.');
      }

      // Store credentials as secrets
      await setSecret('GOOGLE_OAUTH_CLIENT_ID', {
        value: clientId,
        category: 'oauth',
        description:
          'Google OAuth Client ID for Gmail, Calendar, Tasks, Sheets, Slides integration',
      });

      await setSecret('GOOGLE_OAUTH_CLIENT_SECRET', {
        value: clientSecret,
        category: 'oauth',
        description: 'Google OAuth Client Secret',
      });

      setSuccessMessage(
        'Google OAuth credentials saved! Please restart the dashboard server to apply changes, then click Connect again.'
      );

      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON file. Please upload a valid Google OAuth credentials JSON file.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to upload credentials');
      }
    } finally {
      setIsUploadingCredentials(false);
    }
  };

  // Calculate stats
  const stats = {
    total: servers.length,
    connected: servers.filter((s) => s.connected).length,
    needsAuth: servers.filter((s) => s.type === 'remote' && !s.hasTokens && s.enabled).length,
    disabled: servers.filter((s) => !s.enabled).length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-surface-900">MCP Servers</h2>
          <p className="text-sm text-surface-500">
            Model Context Protocol servers for extended capabilities
          </p>
        </div>
        <button
          onClick={loadData}
          className="btn btn-secondary text-sm py-1.5 px-3 inline-flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-surface-500 text-xs uppercase tracking-wide">Total Servers</p>
          <p className="text-2xl font-bold text-surface-900 mt-1">{stats.total}</p>
        </div>
        <div className="card p-4">
          <p className="text-surface-500 text-xs uppercase tracking-wide">Connected</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.connected}</p>
        </div>
        <div className="card p-4">
          <p className="text-surface-500 text-xs uppercase tracking-wide">Needs Auth</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{stats.needsAuth}</p>
        </div>
        <div className="card p-4">
          <p className="text-surface-500 text-xs uppercase tracking-wide">Disabled</p>
          <p className="text-2xl font-bold text-surface-400 mt-1">{stats.disabled}</p>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1">
              <p className="font-medium">Error</p>
              <p className="mt-1">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Show setup instructions for Google OAuth credential errors */}
          {error.includes('Google OAuth not configured') && (
            <div className="mt-4 pt-4 border-t border-red-200">
              <p className="font-medium text-red-800 mb-3">Google OAuth Setup Required</p>

              {/* Upload credentials button */}
              <div className="mb-4 p-3 bg-white rounded-lg border border-red-200">
                <p className="font-medium text-red-700 mb-2">Upload Google OAuth Credentials</p>
                <p className="text-xs text-red-500 mb-3">
                  Upload your{' '}
                  <code className="bg-red-100 px-1 py-0.5 rounded">client_secret_*.json</code> file
                  from Google Cloud Console:
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleCredentialsUpload}
                  disabled={isUploadingCredentials}
                  className="hidden"
                  id="google-credentials-upload"
                />
                <label
                  htmlFor="google-credentials-upload"
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                    isUploadingCredentials
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  {isUploadingCredentials ? (
                    <>
                      <span className="spinner-sm" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                        />
                      </svg>
                      Upload Credentials JSON
                    </>
                  )}
                </label>
              </div>

              <div className="text-xs text-red-600 space-y-3">
                <div className="pt-2 border-t border-red-200">
                  <p className="font-medium mb-1">How to get Google OAuth credentials:</p>
                  <ol className="list-decimal list-inside space-y-1 text-red-500">
                    <li>
                      Go to{' '}
                      <a
                        href="https://console.cloud.google.com/apis/credentials"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-red-700"
                      >
                        Google Cloud Console
                      </a>
                    </li>
                    <li>Create or select a project</li>
                    <li>Enable APIs: Gmail, Calendar, Tasks, Sheets, Slides, Drive</li>
                    <li>Go to "OAuth consent screen" and configure (External, add test users)</li>
                    <li>Go to "Credentials" → "Create Credentials" → "OAuth client ID"</li>
                    <li>Select "Desktop app" as the application type</li>
                    <li>Download the JSON file and upload it above</li>
                  </ol>
                </div>
                <p className="text-red-500 italic">
                  After uploading, restart the dashboard server and try Connect again.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <div className="flex-1">
              <p className="font-medium">Info</p>
              <p className="mt-1">{successMessage}</p>
              {successMessage.includes('OpenCode') && (
                <a
                  href="http://localhost:4099"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                  Open OpenCode
                </a>
              )}
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="p-1 hover:bg-emerald-100 rounded"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      )}

      {/* OAuth Config Info */}
      {oauthConfig && (
        <div className="card p-4 bg-blue-50 border-blue-200">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="text-sm text-blue-700">
              <p className="font-medium">OAuth Callback Configuration</p>
              <p className="mt-1 text-blue-600">
                Redirect URL:{' '}
                <code className="bg-blue-100 px-1 py-0.5 rounded text-xs">
                  {oauthConfig.redirectUrl}
                </code>
              </p>
              <p className="mt-1 text-blue-500 text-xs">
                {oauthConfig.isProduction ? 'Production mode' : 'Development mode'} • Port{' '}
                {oauthConfig.port}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Server List */}
      <div className="space-y-3">
        {servers.length === 0 ? (
          <div className="text-center py-12">
            {/* Ori Mascot - Integrations helper */}
            <div className="w-24 h-24 mx-auto mb-4">
              <img
                src={assetUrl('/mascot/variations/integrations.png')}
                alt="Ori is ready to connect integrations"
                className="w-full h-full object-contain"
              />
            </div>
            <p className="text-surface-700 font-medium">No MCP servers configured</p>
            <p className="text-sm text-surface-500 mt-1">
              I can help connect to external services!
            </p>
            <p className="text-xs text-surface-400 mt-2">
              Add servers to your opencode.json configuration file
            </p>
          </div>
        ) : (
          servers.map((server) => (
            <ServerCard
              key={server.name}
              server={server}
              oauthConfig={oauthConfig}
              onAuthorize={handleAuthorize}
              onClearTokens={handleClearTokens}
              isLoading={actionLoading === server.name}
            />
          ))
        )}
      </div>

      {/* Help Section */}
      <div className="mt-8 p-4 bg-surface-50 rounded-lg border border-surface-200">
        <h3 className="text-sm font-medium text-surface-700 mb-2">About MCP Servers</h3>
        <div className="text-xs text-surface-500 space-y-2">
          <p>
            <strong>Local servers</strong> run as child processes and communicate via stdio. They
            are started automatically when the agent initializes.
          </p>
          <p>
            <strong>Remote servers</strong> connect over HTTPS and may require OAuth authentication.
            Click "Connect" to authorize access to external services like Atlassian (Jira,
            Confluence) or Google (Gmail, Calendar, Tasks, Sheets, Slides).
          </p>
          <p>
            After authorizing a remote server, refresh this page or wait for the connection status
            to update automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
