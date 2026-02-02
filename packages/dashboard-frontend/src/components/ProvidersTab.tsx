import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getProviders,
  setProviderKey,
  getProviderDefaults,
  setProviderDefaults,
  restartOpenCode,
  type ProviderDefaults,
  type ProviderId,
  type ProviderStatus,
} from '../api';

type ProviderDefinition = {
  id: ProviderId;
  name: string;
  description: string;
  capabilities: string[];
};

const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Audio transcription and image generation with GPT models.',
    capabilities: ['Audio transcription', 'Image analysis', 'Image generation'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Vision-capable models for image analysis.',
    capabilities: ['Image analysis'],
  },
  {
    id: 'google',
    name: 'Google Gemini',
    description: 'Gemini Nano Banana for fast image generation.',
    capabilities: ['Image generation'],
  },
  {
    id: 'opencode_zen',
    name: 'OpenCode Zen',
    description: 'AI agent chat backend for conversational processing.',
    capabilities: ['Agent chat'],
  },
];

const DEFAULTS_FALLBACK: ProviderDefaults = {
  transcription: 'openai',
  vision: 'anthropic',
  imageGeneration: 'openai',
  agentChat: 'opencode_zen',
};

export default function ProvidersTab() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [defaults, setDefaults] = useState<ProviderDefaults>(DEFAULTS_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState<ProviderId | null>(null);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [restartingOpenCode, setRestartingOpenCode] = useState(false);
  const [restartMessage, setRestartMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyInputs, setKeyInputs] = useState<Record<ProviderId, string>>({
    openai: '',
    anthropic: '',
    google: '',
    opencode_zen: '',
  });

  const providerStatusMap = useMemo(() => {
    const map = new Map<ProviderId, ProviderStatus>();
    providers.forEach((provider) => map.set(provider.id, provider));
    return map;
  }, [providers]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [providersResult, defaultsResult] = await Promise.all([
        getProviders(),
        getProviderDefaults(),
      ]);
      setProviders(providersResult.providers);
      setDefaults(defaultsResult.defaults ?? DEFAULTS_FALLBACK);
      setError(null);
    } catch (err) {
      console.error('Failed to load providers', err);
      setError('Failed to load provider settings. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleKeyChange =
    (providerId: ProviderId) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setKeyInputs((prev) => ({ ...prev, [providerId]: value }));
    };

  const handleSaveKey = async (providerId: ProviderId) => {
    const value = keyInputs[providerId].trim();
    if (!value) {
      setError('API key is required.');
      return;
    }
    setSavingProvider(providerId);
    try {
      await setProviderKey(providerId, { value });
      setKeyInputs((prev) => ({ ...prev, [providerId]: '' }));
      await loadData();
      setError(null);
    } catch (err) {
      console.error('Failed to save provider key', err);
      setError('Failed to save provider key. Please try again.');
    } finally {
      setSavingProvider(null);
    }
  };

  const handleDefaultsChange =
    (field: keyof ProviderDefaults) => (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value as ProviderId;
      setDefaults((prev) => ({ ...prev, [field]: value }));
    };

  const handleSaveDefaults = async () => {
    setSavingDefaults(true);
    try {
      await setProviderDefaults(defaults);
      setError(null);
    } catch (err) {
      console.error('Failed to save provider defaults', err);
      setError('Failed to save provider defaults. Please try again.');
    } finally {
      setSavingDefaults(false);
    }
  };

  const handleRestartOpenCode = async () => {
    setRestartingOpenCode(true);
    setRestartMessage(null);
    setError(null);
    try {
      const result = await restartOpenCode();
      if (result.success) {
        setRestartMessage(
          `OpenCode restarted successfully. ${result.secretsLoaded || 0} secrets loaded.`
        );
      } else {
        setError(result.error || 'Failed to restart OpenCode');
      }
    } catch (err) {
      console.error('Failed to restart OpenCode', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      // Check if this is a "dev mode only" error
      if (message.includes('development mode') || message.includes('PID file')) {
        setError('Restart only available in development mode. Use PM2 in production.');
      } else {
        setError('Failed to restart OpenCode. Please try again.');
      }
    } finally {
      setRestartingOpenCode(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Loading provider settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">AI Providers</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure API keys and choose which provider to use for each capability.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {PROVIDERS.map((provider) => {
          const status = providerStatusMap.get(provider.id);
          const configured = status?.configured ?? false;
          return (
            <div key={provider.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{provider.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{provider.description}</p>
                </div>
                <span
                  className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${
                    configured
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {configured ? 'Configured' : 'Not set'}
                </span>
              </div>

              <div className="mt-4">
                <label className="text-[11px] font-medium text-muted-foreground uppercase">
                  API Key
                </label>
                <input
                  type="password"
                  className="mt-2 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring font-mono"
                  placeholder="Enter API key"
                  value={keyInputs[provider.id]}
                  onChange={handleKeyChange(provider.id)}
                />
                <button
                  type="button"
                  onClick={() => handleSaveKey(provider.id)}
                  disabled={savingProvider === provider.id}
                  className="mt-3 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {savingProvider === provider.id ? 'Saving...' : 'Save Key'}
                </button>
              </div>

              <div className="mt-4 border-t border-border pt-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase">
                  Capabilities
                </p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {provider.capabilities.map((capability) => (
                    <li key={capability}>• {capability}</li>
                  ))}
                </ul>
                {status?.updatedAt && (
                  <p className="mt-3 text-[11px] text-muted-foreground font-mono">
                    Updated {new Date(status.updatedAt).toISOString()}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Apply Changes to OpenCode</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Restart OpenCode to use newly configured API keys. Changes to provider keys only take
              effect after restart.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRestartOpenCode}
            disabled={restartingOpenCode}
            className="h-9 px-4 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {restartingOpenCode ? 'Restarting...' : 'Restart OpenCode'}
          </button>
        </div>
        {restartMessage && (
          <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{restartMessage}</p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Default Providers</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Choose which provider should handle each capability.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase">
              Audio Transcription
            </label>
            <select
              className="mt-2 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
              value={defaults.transcription}
              onChange={handleDefaultsChange('transcription')}
            >
              <option value="openai">OpenAI</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase">
              Image Analysis
            </label>
            <select
              className="mt-2 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
              value={defaults.vision}
              onChange={handleDefaultsChange('vision')}
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase">
              Image Generation
            </label>
            <select
              className="mt-2 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
              value={defaults.imageGeneration}
              onChange={handleDefaultsChange('imageGeneration')}
            >
              <option value="openai">OpenAI</option>
              <option value="google">Google Gemini</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase">
              Agent Chat
            </label>
            <select
              className="mt-2 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
              value={defaults.agentChat}
              onChange={handleDefaultsChange('agentChat')}
            >
              <option value="opencode_zen">OpenCode Zen</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="button"
            onClick={handleSaveDefaults}
            disabled={savingDefaults}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {savingDefaults ? 'Saving...' : 'Save Defaults'}
          </button>
        </div>
      </div>
    </div>
  );
}
