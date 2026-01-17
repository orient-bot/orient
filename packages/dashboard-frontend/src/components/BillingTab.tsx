import { useState, useEffect, useCallback } from 'react';
import {
  getBillingSummary,
  getBillingConfig,
  clearBillingCache,
  setSecret,
  type BillingSummary,
  type BillingConfigStatus,
} from '../api';
import ProviderCostCard from './ProviderCostCard';

function formatCost(cost: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cost);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// Simple bar chart component
const EMPTY_PROVIDER = {
  provider: 'unknown',
  cost: 0,
  available: false,
  error: 'Not configured',
};

function getProvider(summary: BillingSummary, key: keyof BillingSummary['providers']) {
  return summary.providers[key] ?? { ...EMPTY_PROVIDER, provider: key };
}

function CostDistributionChart({ summary }: { summary: BillingSummary }) {
  const providers = [
    { key: 'google', name: 'Google', color: 'bg-sky-500' },
    { key: 'anthropic', name: 'Anthropic', color: 'bg-violet-500' },
    { key: 'openai', name: 'OpenAI', color: 'bg-emerald-500' },
  ] as const;
  
  const total =
    providers.reduce((sum, provider) => {
      const data = getProvider(summary, provider.key);
      return sum + (data.available ? data.cost : 0);
    }, 0) || 1; // Avoid division by zero
  
  return (
    <div className="space-y-3">
      {providers.map(({ key, name, color }) => {
        const provider = getProvider(summary, key);
        const cost = provider.available ? provider.cost : 0;
        const percentage = (cost / total) * 100;
        
        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-surface-600">{name}</span>
              <span className="font-medium text-surface-900">
                {provider.available ? formatCost(cost) : '—'}
              </span>
            </div>
            <div className="h-2 bg-surface-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${color} transition-all duration-500 ease-out rounded-full`}
                style={{ width: `${Math.max(percentage, provider.available ? 1 : 0)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function BillingTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [config, setConfig] = useState<BillingConfigStatus | null>(null);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [refreshing, setRefreshing] = useState(false);
  const [savingSecrets, setSavingSecrets] = useState(false);
  const [secretError, setSecretError] = useState<string | null>(null);
  const [secretInputs, setSecretInputs] = useState({
    googleProjectId: '',
    googleServiceAccountKey: '',
    anthropicAdminKey: '',
    openaiBillingKey: '',
  });

  const fetchData = useCallback(async (noCache = false) => {
    try {
      setError(null);
      if (noCache) {
        setRefreshing(true);
      }
      
      const [summaryData, configData] = await Promise.all([
        getBillingSummary({
          start: dateRange.start,
          end: dateRange.end,
          noCache,
        }),
        getBillingConfig(),
      ]);
      
      setSummary(summaryData);
      setConfig(configData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch billing data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async () => {
    await clearBillingCache();
    await fetchData(true);
  };

  const handleDateChange = (field: 'start' | 'end', value: string) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
  };

  const handleSecretChange = (field: keyof typeof secretInputs) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSecretInputs((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSaveSecrets = async () => {
    setSavingSecrets(true);
    setSecretError(null);
    try {
      const updates: Array<Promise<{ success: boolean }>> = [];
      if (secretInputs.googleProjectId.trim()) {
        updates.push(setSecret('GOOGLE_BILLING_PROJECT_ID', {
          value: secretInputs.googleProjectId.trim(),
          category: 'billing',
          description: 'Google Cloud project ID for Gemini/Veo billing',
        }));
      }
      if (secretInputs.googleServiceAccountKey.trim()) {
        updates.push(setSecret('GOOGLE_SERVICE_ACCOUNT_KEY', {
          value: secretInputs.googleServiceAccountKey.trim(),
          category: 'billing',
          description: 'Service account JSON for Google Cloud Billing API',
        }));
      }
      if (secretInputs.anthropicAdminKey.trim()) {
        updates.push(setSecret('ANTHROPIC_ADMIN_KEY', {
          value: secretInputs.anthropicAdminKey.trim(),
          category: 'billing',
          description: 'Anthropic admin key for billing',
        }));
      }
      if (secretInputs.openaiBillingKey.trim()) {
        updates.push(setSecret('OPENAI_BILLING_KEY', {
          value: secretInputs.openaiBillingKey.trim(),
          category: 'billing',
          description: 'OpenAI billing key with usage.read scope',
        }));
      }

      if (updates.length === 0) {
        setSecretError('Enter at least one secret value to save.');
        return;
      }

      await Promise.all(updates);
      setSecretInputs({
        googleProjectId: '',
        googleServiceAccountKey: '',
        anthropicAdminKey: '',
        openaiBillingKey: '',
      });
      await fetchData(true);
    } catch (err) {
      setSecretError(err instanceof Error ? err.message : 'Failed to save secrets');
    } finally {
      setSavingSecrets(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="spinner" />
          <p className="text-sm text-surface-500">Loading billing data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 text-status-error">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-medium">Failed to load billing data</p>
            <p className="text-sm text-surface-500">{error}</p>
          </div>
        </div>
        <button
          onClick={() => fetchData()}
          className="btn btn-secondary mt-4"
        >
          Try Again
        </button>
      </div>
    );
  }

  const primaryProviders = ['google', 'openai', 'anthropic'] as const;
  const configuredCount = config
    ? primaryProviders.filter((provider) => config.providers?.[provider]).length
    : 0;
  
  const projectName = config?.projectScope?.projectName || 'All Resources';
  const hasFilters = config?.projectScope?.filters && (
    (config.projectScope.filters.anthropicKeyIds?.length ?? 0) > 0 ||
    config.projectScope.filters.openaiKeyConfigured ||
    Boolean(config.projectScope.filters.googleBillingProjectId)
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-surface-900">Billing Overview</h2>
            {hasFilters && (
              <span className="px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded-full">
                {projectName}
              </span>
            )}
          </div>
          <p className="text-sm text-surface-500">
            {configuredCount}/3 providers configured
            {summary?.fetchedAt && (
              <span className="ml-2">
                · Last updated {formatDate(summary.fetchedAt)}
              </span>
            )}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Date range */}
          <div className="flex items-center gap-2 text-sm">
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => handleDateChange('start', e.target.value)}
              className="input py-1.5 px-2 w-32"
            />
            <span className="text-surface-400">to</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => handleDateChange('end', e.target.value)}
              className="input py-1.5 px-2 w-32"
            />
          </div>
          
          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn btn-secondary"
          >
            {refreshing ? (
              <span className="spinner w-4 h-4" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            Refresh
          </button>
        </div>
      </div>

      {/* Total cost card */}
      <div className="card p-6 bg-gradient-to-r from-primary-600 to-primary-700">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-primary-100">Total Cost</p>
            <p className="text-3xl font-bold text-white mt-1">
              {summary ? formatCost(summary.totalCost) : '—'}
            </p>
            <p className="text-sm text-primary-200 mt-1">
              {summary?.dateRange.start && summary?.dateRange.end && (
                <>
                  {formatDate(summary.dateRange.start)} — {formatDate(summary.dateRange.end)}
                </>
              )}
            </p>
          </div>
          <div className="w-16 h-16 bg-white/10 rounded-xl flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Cost distribution */}
      {summary && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-surface-900 mb-4">Cost Distribution</h3>
          <CostDistributionChart summary={summary} />
        </div>
      )}

      {/* Provider cards grid */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ProviderCostCard
            name="Google (Gemini/Veo)"
            billing={getProvider(summary, 'google')}
            colorClass="bg-sky-50"
            icon={
              <svg className="w-5 h-5 text-sky-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3.75c2.27 0 4.3.87 5.84 2.29l-2.36 2.29C14.63 7.43 13.37 6.9 12 6.9c-2.63 0-4.86 1.77-5.63 4.15h-2.6V8.2C4.84 5.6 8.12 3.75 12 3.75z"/>
                <path d="M20.25 12c0-.74-.07-1.45-.2-2.13h-8.05v4.05h4.6c-.2 1.1-.84 2.03-1.79 2.65l2.72 2.1c1.58-1.46 2.72-3.62 2.72-6.67z"/>
                <path d="M6.37 14.95a6.7 6.7 0 0 1 0-4.9l-2.6-2.01a9.99 9.99 0 0 0 0 8.92l2.6-2.01z"/>
                <path d="M12 20.25c2.16 0 3.98-.72 5.3-1.95l-2.72-2.1c-.74.5-1.7.8-2.58.8-2.63 0-4.86-1.77-5.63-4.15h-2.6v2.86c1.63 3.2 4.94 5.54 8.23 5.54z"/>
              </svg>
            }
          />

          <ProviderCostCard
            name="Anthropic (Claude)"
            billing={getProvider(summary, 'anthropic')}
            colorClass="bg-violet-50"
            icon={
              <svg className="w-5 h-5 text-violet-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.09 3H6.91L3 12l3.91 9h10.18L21 12l-3.91-9zM12 17.5c-3.03 0-5.5-2.47-5.5-5.5S8.97 6.5 12 6.5s5.5 2.47 5.5 5.5-2.47 5.5-5.5 5.5zm0-9a3.5 3.5 0 100 7 3.5 3.5 0 000-7z"/>
              </svg>
            }
          />
          
          <ProviderCostCard
            name="OpenAI (GPT)"
            billing={getProvider(summary, 'openai')}
            colorClass="bg-emerald-50"
            icon={
              <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
              </svg>
            }
          />
          
        </div>
      )}

      {/* Other providers */}
      {summary && (
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-medium text-surface-700">
            Other Providers
          </summary>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <ProviderCostCard
              name="Cloudflare (R2)"
              billing={getProvider(summary, 'cloudflare')}
              colorClass="bg-orange-50"
              icon={
                <svg className="w-5 h-5 text-orange-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.5088 16.8447c.1475-.5068.0908-.9707-.1553-1.2678-.2246-.2793-.5928-.4238-.9992-.4238H6.5332c-.0908 0-.1631-.0752-.1631-.165 0-.0596.0312-.1123.0908-.1426.5088-.2861.8574-.8369.9209-1.4883.0109-.1123.0976-.1924.2051-.1924h8.7373c1.3584 0 2.5674-.8193 3.0156-2.0508.3857-1.0615.3242-2.2061-.165-3.2188-.8716-1.8076-2.6846-3.0508-4.709-3.1299C13.1932 3.3721 11.2303 2 9.0137 2c-2.8828 0-5.2793 2.1533-5.6406 4.9395-.1992-.0703-.4122-.1084-.6455-.1084-1.1152 0-2.0156.9004-2.0156 2.0156 0 .292.0605.5684.1748.8193l.0029.0068C.3223 10.2393 0 11.1201 0 12.0713c0 2.1504 1.6074 3.9502 3.752 4.2285.0791.0137.1582.0186.2393.0186h11.1533c.2188 0 .4102-.1465.4697-.3535l.8935-3.1202z"/>
                </svg>
              }
            />
            
            <ProviderCostCard
              name="Oracle Cloud"
              billing={getProvider(summary, 'oracle')}
              colorClass="bg-red-50"
              icon={
                <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7.1 8.6C5.3 8.6 3.8 10 3.8 12s1.5 3.4 3.3 3.4h9.8c1.8 0 3.3-1.5 3.3-3.4s-1.5-3.4-3.3-3.4H7.1zM16.9 14c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5zm-9.8 0c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5z"/>
                </svg>
              }
            />
          </div>
        </details>
      )}

      {/* Configuration help */}
      {config && configuredCount < 3 && (
        <div className="card p-4 bg-surface-50 border-dashed space-y-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-surface-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm">
              <p className="font-medium text-surface-700">Configure more providers</p>
              <p className="text-surface-500 mt-1">
                Add secrets in the dashboard to enable billing tracking:
              </p>
              <ul className="mt-2 space-y-1 text-surface-500">
                {!config.providers.google && (
                  <li>
                    • <code className="text-xs bg-surface-200 px-1 py-0.5 rounded">GOOGLE_BILLING_PROJECT_ID</code> +{' '}
                    <code className="text-xs bg-surface-200 px-1 py-0.5 rounded">GOOGLE_SERVICE_ACCOUNT_KEY</code>
                  </li>
                )}
                {!config.providers.anthropic && (
                  <li>• <code className="text-xs bg-surface-200 px-1 py-0.5 rounded">ANTHROPIC_ADMIN_KEY</code></li>
                )}
                {!config.providers.openai && (
                  <li>• <code className="text-xs bg-surface-200 px-1 py-0.5 rounded">OPENAI_BILLING_KEY</code></li>
                )}
              </ul>
            </div>
          </div>

          <div className="rounded-lg border border-surface-200 bg-white p-4">
            <p className="text-sm font-medium text-surface-700">Add billing secrets</p>
            <p className="text-xs text-surface-500 mt-1">
              Values are stored securely. Leave blank fields unchanged.
            </p>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-surface-500 uppercase">Google Billing Project ID</label>
                <input
                  className="mt-2 input w-full font-mono"
                  placeholder="my-gcp-project"
                  value={secretInputs.googleProjectId}
                  onChange={handleSecretChange('googleProjectId')}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-500 uppercase">OpenAI Billing Key</label>
                <input
                  type="password"
                  className="mt-2 input w-full font-mono"
                  placeholder="sk-..."
                  value={secretInputs.openaiBillingKey}
                  onChange={handleSecretChange('openaiBillingKey')}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-500 uppercase">Anthropic Admin Key</label>
                <input
                  type="password"
                  className="mt-2 input w-full font-mono"
                  placeholder="sk-ant-admin..."
                  value={secretInputs.anthropicAdminKey}
                  onChange={handleSecretChange('anthropicAdminKey')}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-surface-500 uppercase">Google Service Account JSON</label>
                <textarea
                  className="mt-2 input w-full font-mono min-h-[120px]"
                  placeholder='{"type":"service_account",...}'
                  value={secretInputs.googleServiceAccountKey}
                  onChange={handleSecretChange('googleServiceAccountKey')}
                />
              </div>
            </div>
            {secretError && (
              <p className="text-xs text-status-error mt-3">{secretError}</p>
            )}
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleSaveSecrets}
                disabled={savingSecrets}
                className="btn btn-primary"
              >
                {savingSecrets ? 'Saving...' : 'Save Secrets'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

