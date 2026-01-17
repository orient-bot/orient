import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  applySetup,
  getSetupStatus,
  listSecrets,
  assetUrl,
  type SetupField,
  type SetupStatus,
} from '../api';
import WhatsAppPairingPanel from './WhatsAppPairingPanel';

interface WorkspaceSetupPanelProps {
  activeService?: 'whatsapp' | 'slack' | null;
  needsWhatsAppPairing: boolean;
  needsSlackSetup: boolean;
  whatsappStatusError?: string | null;
  onOpenWhatsAppSetup?: () => void;
  onOpenQrPage?: () => void;
  onRefreshWhatsAppStatus: () => void;
  onSkipWhatsApp: () => void;
  onOpenSlackSetup: () => void;
  onOpenIntegrations: () => void;
  onSkipSlack: () => void;
}

function FieldRow({
  field,
  value,
  onChange,
  isMissing,
}: {
  field: SetupField;
  value: string;
  onChange: (value: string) => void;
  isMissing: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">{field.label}</p>
          {field.description && (
            <p className="text-xs text-muted-foreground">{field.description}</p>
          )}
        </div>
        {!isMissing && (
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600">
            Configured
          </span>
        )}
      </div>
      {isMissing && (
        <input
          type={field.type || 'text'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className="input w-full bg-background"
        />
      )}
    </div>
  );
}

export default function WorkspaceSetupPanel({
  activeService,
  needsWhatsAppPairing,
  needsSlackSetup,
  whatsappStatusError: _whatsappStatusError,
  onOpenWhatsAppSetup: _onOpenWhatsAppSetup,
  onOpenQrPage: _onOpenQrPage,
  onRefreshWhatsAppStatus,
  onSkipWhatsApp,
  onOpenSlackSetup,
  onOpenIntegrations,
  onSkipSlack,
}: WorkspaceSetupPanelProps) {
  // Determine which sections to show based on activeService
  const showWhatsApp = !activeService || activeService === 'whatsapp';
  const showSlack = !activeService || activeService === 'slack';
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [storedSecrets, setStoredSecrets] = useState<Set<string>>(new Set());

  const loadStoredSecrets = useCallback(async () => {
    try {
      const result = await listSecrets();
      setStoredSecrets(new Set(result.secrets.map((s: { key: string }) => s.key)));
    } catch (err) {
      console.error('Failed to load stored secrets:', err);
    }
  }, []);

  const loadStatus = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const next = await getSetupStatus();
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load setup status');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    loadStoredSecrets();
  }, [loadStoredSecrets]);

  const missingRequired = useMemo(() => new Set(status?.missingRequired ?? []), [status]);
  const missingOptional = useMemo(() => new Set(status?.missingOptional ?? []), [status]);
  const hasMissingEnv =
    (status?.missingRequired?.length || 0) > 0 || (status?.missingOptional?.length || 0) > 0;

  // Helper to check if a secret is configured (stored in database)
  const isSecretConfigured = useCallback((key: string) => storedSecrets.has(key), [storedSecrets]);

  // Render status badge for a secret key
  const renderStatusBadge = (key: string, isOptional = false) => {
    if (isSecretConfigured(key)) {
      return (
        <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 font-medium">
          Configured
        </span>
      );
    }
    if (isOptional) {
      return (
        <span className="text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-600 font-medium">
          Optional
        </span>
      );
    }
    return (
      <span className="text-xs px-2 py-1 rounded-full bg-amber-500/10 text-amber-600 font-medium">
        Missing
      </span>
    );
  };

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleApply = async () => {
    setError(null);
    setSuccess(null);
    setIsLoading(true);
    try {
      const result = await applySetup(values);
      setSuccess(
        result.needsRestart
          ? 'Saved. Restart server to connect bots.'
          : 'Saved environment settings.'
      );
      setValues({});
      await loadStatus();
      await loadStoredSecrets(); // Refresh secret status badges
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save environment settings');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card p-5 border-border bg-muted/20 mb-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
          <img
            src={assetUrl('/mascot/variations/setup-helper.png')}
            alt="Ori setup helper"
            className="w-10 h-10 object-contain"
          />
        </div>
        <div>
          <p className="text-lg font-semibold text-foreground">Workspace setup</p>
          <p className="text-xs text-muted-foreground">
            Connect services and configure environment variables in one place.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        {showWhatsApp && (
          <div
            id="workspace-whatsapp-setup"
            className="rounded-lg border border-border bg-background p-4"
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div>
                <p className="text-sm font-medium text-foreground">WhatsApp</p>
                <p className="text-xs text-muted-foreground">
                  {needsWhatsAppPairing
                    ? 'Pair your WhatsApp device to enable messaging.'
                    : 'Connected and ready.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {needsWhatsAppPairing && (
                  <button type="button" className="btn btn-ghost h-9" onClick={onSkipWhatsApp}>
                    Skip for now
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary h-9"
                  onClick={onRefreshWhatsAppStatus}
                >
                  Refresh
                </button>
              </div>
            </div>

            {/* Always show the pairing panel - it handles both pairing and connected states */}
            <WhatsAppPairingPanel onConnected={onRefreshWhatsAppStatus} />
          </div>
        )}

        {showSlack && (
          <div
            id="workspace-slack-setup"
            className="rounded-lg border border-border bg-background p-4"
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Slack</p>
                <p className="text-xs text-muted-foreground">
                  {needsSlackSetup
                    ? 'Connect Slack to view channels and set permissions.'
                    : 'Connected and ready.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary h-9" onClick={onOpenSlackSetup}>
                  Open Slack setup
                </button>
                <button
                  type="button"
                  className="btn btn-secondary h-9"
                  onClick={onOpenIntegrations}
                >
                  Integrations
                </button>
                {needsSlackSetup && (
                  <button type="button" className="btn btn-ghost h-9" onClick={onSkipSlack}>
                    Skip for now
                  </button>
                )}
              </div>
            </div>

            {needsSlackSetup && (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <p className="text-sm font-medium text-foreground mb-3">Configuration Required</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    To connect Slack, you need to create a Slack App and configure the following
                    environment variables in your{' '}
                    <code className="px-1 py-0.5 bg-muted rounded text-xs">.env</code> file:
                  </p>

                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-background border border-border">
                      <div className="flex items-center justify-between mb-2">
                        <code className="text-xs font-mono text-foreground font-medium">
                          SLACK_BOT_TOKEN
                        </code>
                        {renderStatusBadge('SLACK_BOT_TOKEN')}
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        Bot User OAuth Token (starts with{' '}
                        <code className="px-1 py-0.5 bg-muted rounded text-[10px]">xoxb-</code>)
                      </p>
                      <input
                        type="password"
                        value={values['SLACK_BOT_TOKEN'] || ''}
                        onChange={(e) => handleChange('SLACK_BOT_TOKEN', e.target.value)}
                        placeholder={
                          isSecretConfigured('SLACK_BOT_TOKEN') ? '••••••••' : 'xoxb-...'
                        }
                        className="input w-full text-sm"
                      />
                    </div>

                    <div className="p-3 rounded-lg bg-background border border-border">
                      <div className="flex items-center justify-between mb-2">
                        <code className="text-xs font-mono text-foreground font-medium">
                          SLACK_SIGNING_SECRET
                        </code>
                        {renderStatusBadge('SLACK_SIGNING_SECRET')}
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        Used to verify requests from Slack
                      </p>
                      <input
                        type="password"
                        value={values['SLACK_SIGNING_SECRET'] || ''}
                        onChange={(e) => handleChange('SLACK_SIGNING_SECRET', e.target.value)}
                        placeholder={
                          isSecretConfigured('SLACK_SIGNING_SECRET')
                            ? '••••••••'
                            : 'Signing secret from Basic Information'
                        }
                        className="input w-full text-sm"
                      />
                    </div>

                    <div className="p-3 rounded-lg bg-background border border-border">
                      <div className="flex items-center justify-between mb-2">
                        <code className="text-xs font-mono text-foreground font-medium">
                          SLACK_APP_TOKEN
                        </code>
                        {renderStatusBadge('SLACK_APP_TOKEN')}
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        App-level token for Socket Mode (starts with{' '}
                        <code className="px-1 py-0.5 bg-muted rounded text-[10px]">xapp-</code>)
                      </p>
                      <input
                        type="password"
                        value={values['SLACK_APP_TOKEN'] || ''}
                        onChange={(e) => handleChange('SLACK_APP_TOKEN', e.target.value)}
                        placeholder={
                          isSecretConfigured('SLACK_APP_TOKEN') ? '••••••••' : 'xapp-...'
                        }
                        className="input w-full text-sm"
                      />
                    </div>

                    <div className="p-3 rounded-lg bg-background border border-border">
                      <div className="flex items-center justify-between mb-2">
                        <code className="text-xs font-mono text-foreground font-medium">
                          SLACK_USER_TOKEN
                        </code>
                        {renderStatusBadge('SLACK_USER_TOKEN', true)}
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        User OAuth Token for posting as yourself (starts with{' '}
                        <code className="px-1 py-0.5 bg-muted rounded text-[10px]">xoxp-</code>)
                      </p>
                      <input
                        type="password"
                        value={values['SLACK_USER_TOKEN'] || ''}
                        onChange={(e) => handleChange('SLACK_USER_TOKEN', e.target.value)}
                        placeholder={
                          isSecretConfigured('SLACK_USER_TOKEN') ? '••••••••' : 'xoxp-...'
                        }
                        className="input w-full text-sm"
                      />
                    </div>

                    {(values['SLACK_BOT_TOKEN'] ||
                      values['SLACK_SIGNING_SECRET'] ||
                      values['SLACK_APP_TOKEN'] ||
                      values['SLACK_USER_TOKEN'] ||
                      error ||
                      success) && (
                      <div className="flex items-center gap-3 pt-2">
                        <button
                          type="button"
                          className="btn btn-primary h-9"
                          onClick={handleApply}
                          disabled={isLoading}
                        >
                          {isLoading ? 'Saving...' : 'Save Slack Configuration'}
                        </button>
                        {error && <span className="text-xs text-destructive">{error}</span>}
                        {success && <span className="text-xs text-emerald-600">{success}</span>}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
                    <p className="text-sm font-medium text-foreground mb-2">
                      How to set up your Slack App
                    </p>
                    <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
                      <li>
                        Go to{' '}
                        <a
                          href="https://api.slack.com/apps"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-violet-500 hover:underline"
                        >
                          api.slack.com/apps
                        </a>{' '}
                        and create a new app
                      </li>
                      <li>
                        Enable <strong>Socket Mode</strong> and generate an App-Level Token
                      </li>
                      <li>
                        Under <strong>OAuth & Permissions</strong>, add required scopes:
                        <code className="ml-1 px-1 py-0.5 bg-muted rounded">channels:history</code>,
                        <code className="ml-1 px-1 py-0.5 bg-muted rounded">channels:read</code>,
                        <code className="ml-1 px-1 py-0.5 bg-muted rounded">chat:write</code>,
                        <code className="ml-1 px-1 py-0.5 bg-muted rounded">groups:history</code>,
                        <code className="ml-1 px-1 py-0.5 bg-muted rounded">groups:read</code>,
                        <code className="ml-1 px-1 py-0.5 bg-muted rounded">im:history</code>,
                        <code className="ml-1 px-1 py-0.5 bg-muted rounded">im:read</code>,
                        <code className="ml-1 px-1 py-0.5 bg-muted rounded">users:read</code>
                      </li>
                      <li>
                        Install the app to your workspace and copy the{' '}
                        <strong>Bot User OAuth Token</strong>
                      </li>
                      <li>
                        Copy the <strong>Signing Secret</strong> from Basic Information
                      </li>
                      <li>
                        Add all three values to your{' '}
                        <code className="px-1 py-0.5 bg-muted rounded">.env</code> file and restart
                        the server
                      </li>
                    </ol>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Environment Variables</p>
              <p className="text-xs text-muted-foreground">
                {hasMissingEnv
                  ? 'Missing required values detected.'
                  : 'Environment values look configured.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-secondary h-9"
                onClick={() => setIsExpanded((prev) => !prev)}
              >
                {isExpanded ? 'Hide config' : 'Configure'}
              </button>
              <button
                type="button"
                className="btn btn-ghost h-9"
                onClick={loadStatus}
                disabled={isLoading}
              >
                Refresh
              </button>
            </div>
          </div>

          {isExpanded && (
            <div className="mt-4 space-y-4">
              {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}
              {success && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 px-4 py-3 rounded-lg text-sm">
                  {success}
                </div>
              )}

              {!status && !isLoading && (
                <div className="text-sm text-muted-foreground">
                  Setup status unavailable. Click refresh to retry.
                </div>
              )}

              {status && (
                <div className="space-y-4">
                  <div className="space-y-4">
                    {status.requiredFields.map((field) => (
                      <FieldRow
                        key={field.key}
                        field={field}
                        value={values[field.key] || ''}
                        onChange={(val) => handleChange(field.key, val)}
                        isMissing={missingRequired.has(field.key)}
                      />
                    ))}
                  </div>

                  {status.optionalFields.length > 0 && (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => setShowOptional((prev) => !prev)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {showOptional ? 'Hide optional settings' : 'Show optional settings'}
                      </button>
                      {showOptional && (
                        <div className="space-y-4">
                          {status.optionalFields.map((field) => (
                            <FieldRow
                              key={field.key}
                              field={field}
                              value={values[field.key] || ''}
                              onChange={(val) => handleChange(field.key, val)}
                              isMissing={missingOptional.has(field.key)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-primary h-9"
                      onClick={handleApply}
                      disabled={isLoading}
                    >
                      {isLoading ? 'Saving...' : 'Save environment'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
