import { useState, useEffect } from 'react';
import {
  getWebhookStats,
  getWebhooks,
  deleteWebhook,
  toggleWebhook,
  testWebhook,
  getWebhookEvents,
  assetUrl,
  type Webhook,
  type WebhookEvent,
  type WebhookStats,
} from '../api';
import WebhookForm from './WebhookForm';

interface WebhooksTabProps {
  onRefresh?: () => void;
}

export default function WebhooksTab({ onRefresh }: WebhooksTabProps) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [stats, setStats] = useState<WebhookStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<number | null>(null);
  const [eventHistory, setEventHistory] = useState<WebhookEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{
    id: number;
    success: boolean;
    message?: string;
  } | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [statsData, webhooksData] = await Promise.all([getWebhookStats(), getWebhooks()]);
      setStats(statsData);
      setWebhooks(webhooksData.webhooks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggle = async (webhook: Webhook) => {
    try {
      const updated = await toggleWebhook(webhook.id, !webhook.enabled);
      setWebhooks(webhooks.map((w) => (w.id === updated.id ? updated : w)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle webhook');
    }
  };

  const handleDelete = async (webhook: Webhook) => {
    if (!confirm(`Delete webhook "${webhook.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteWebhook(webhook.id);
      setWebhooks(webhooks.filter((w) => w.id !== webhook.id));
      loadData(); // Refresh stats
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete webhook');
    }
  };

  const handleTest = async (webhook: Webhook) => {
    try {
      setTestingId(webhook.id);
      setTestResult(null);
      const result = await testWebhook(webhook.id);
      setTestResult({
        id: webhook.id,
        success: result.success,
        message: result.error || result.message,
      });
      setTimeout(() => setTestResult(null), 5000);
    } catch (err) {
      setTestResult({
        id: webhook.id,
        success: false,
        message: err instanceof Error ? err.message : 'Test failed',
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleViewHistory = async (webhookId: number) => {
    if (expandedHistory === webhookId) {
      setExpandedHistory(null);
      setEventHistory([]);
      return;
    }

    try {
      setHistoryLoading(true);
      setExpandedHistory(webhookId);
      const { events } = await getWebhookEvents(webhookId, 20);
      setEventHistory(events);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load event history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingWebhook(null);
    loadData();
    onRefresh?.();
  };

  const handleEdit = (webhook: Webhook) => {
    setEditingWebhook(webhook);
    setShowForm(true);
  };

  const getSourceIcon = (sourceType: string) => {
    switch (sourceType) {
      case 'github':
        return '🐙';
      case 'calendar':
        return '📅';
      case 'jira':
        return '🎫';
      default:
        return '🔗';
    }
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'whatsapp':
        return '💬';
      case 'slack':
        return '💼';
      default:
        return '📨';
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = 'px-2 py-0.5 rounded text-xs font-medium border';
    switch (status) {
      case 'processed':
        return (
          <span
            className={`${baseClasses} bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20`}
          >
            Processed
          </span>
        );
      case 'filtered':
        return (
          <span
            className={`${baseClasses} bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20`}
          >
            Filtered
          </span>
        );
      case 'failed':
        return (
          <span
            className={`${baseClasses} bg-red-100 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20`}
          >
            Failed
          </span>
        );
      default:
        return (
          <span className={`${baseClasses} bg-muted text-muted-foreground border-border`}>
            {status}
          </span>
        );
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const getWebhookUrl = (webhookName: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/webhooks/${encodeURIComponent(webhookName)}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (showForm) {
    return (
      <WebhookForm
        webhook={editingWebhook}
        onSuccess={handleFormSuccess}
        onCancel={() => {
          setShowForm(false);
          setEditingWebhook(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Webhooks</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Receive events from GitHub, Calendar, and other services
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Webhook
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-2 text-destructive hover:text-destructive/80"
          >
            ×
          </button>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4 hover:border-primary/50 transition-colors">
            <div className="text-2xl font-bold text-foreground">{stats.totalWebhooks}</div>
            <div className="text-sm text-muted-foreground">Total Webhooks</div>
          </div>
          <div className="card p-4 hover:border-emerald-500/50 transition-colors">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {stats.enabledWebhooks}
            </div>
            <div className="text-sm text-muted-foreground">Enabled</div>
          </div>
          <div className="card p-4 hover:border-blue-500/50 transition-colors">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {stats.last24Hours.processed}
            </div>
            <div className="text-sm text-muted-foreground">Processed (24h)</div>
          </div>
          <div className="card p-4 hover:border-red-500/50 transition-colors">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {stats.last24Hours.failed}
            </div>
            <div className="text-sm text-muted-foreground">Failed (24h)</div>
          </div>
        </div>
      )}

      {/* Webhooks List */}
      {webhooks.length === 0 ? (
        <div className="text-center py-16 card flex flex-col items-center justify-center">
          <img
            src={assetUrl('/mascot/variations/webhook-mascot-transparent.png')}
            alt="Ori mascot"
            className="w-32 h-32 mb-4 object-contain"
          />
          <h3 className="text-lg font-medium text-foreground">No webhooks configured</h3>
          <p className="text-muted-foreground mt-1 max-w-sm mx-auto">
            Create your first webhook to start receiving events from external services like GitHub
            or JIRA.
          </p>
          <button onClick={() => setShowForm(true)} className="mt-6 btn btn-primary">
            Create Webhook
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {webhooks.map((webhook) => (
            <div key={webhook.id} className="card overflow-hidden transition-all hover:shadow-md">
              {/* Webhook Header */}
              <div className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="text-3xl p-2 bg-muted/50 rounded-lg">
                      {getSourceIcon(webhook.sourceType)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-medium text-foreground">{webhook.name}</h3>
                        {!webhook.enabled && (
                          <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs border border-border">
                            Disabled
                          </span>
                        )}
                      </div>
                      {webhook.description && (
                        <p className="text-sm text-muted-foreground mt-1">{webhook.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1.5 px-2 py-1 bg-muted/50 rounded-md border border-border/50">
                          {getProviderIcon(webhook.provider)}{' '}
                          <span className="capitalize">{webhook.provider}</span>
                        </span>
                        <span className="font-mono text-xs opacity-70">
                          →{' '}
                          {webhook.target.length > 20
                            ? webhook.target.substring(0, 20) + '...'
                            : webhook.target}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                          {webhook.triggerCount} triggers
                        </span>
                        {webhook.lastTriggeredAt && (
                          <span>Last: {formatDate(webhook.lastTriggeredAt)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-start">
                    <button
                      onClick={() => handleToggle(webhook)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background ${
                        webhook.enabled ? 'bg-emerald-500' : 'bg-muted'
                      }`}
                      title={webhook.enabled ? 'Disable' : 'Enable'}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          webhook.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <div className="h-6 w-px bg-border mx-1"></div>
                    <button
                      onClick={() => handleTest(webhook)}
                      disabled={testingId === webhook.id || !webhook.enabled}
                      className="btn btn-outline h-8 text-xs px-2.5"
                    >
                      {testingId === webhook.id ? 'Testing...' : 'Test'}
                    </button>
                    <button
                      onClick={() => handleViewHistory(webhook.id)}
                      className={`btn h-8 text-xs px-2.5 ${expandedHistory === webhook.id ? 'btn-secondary' : 'btn-outline'}`}
                    >
                      {expandedHistory === webhook.id ? 'Hide History' : 'History'}
                    </button>
                    <button
                      onClick={() => handleEdit(webhook)}
                      className="btn btn-outline h-8 text-xs px-2.5"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(webhook)}
                      className="btn btn-outline h-8 text-xs px-2.5 text-destructive hover:bg-destructive hover:text-destructive-foreground border-destructive/30"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Test Result */}
                {testResult?.id === webhook.id && (
                  <div
                    className={`mt-4 p-3 rounded-lg border text-sm animate-in slide-in-from-top-2 ${
                      testResult.success
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                        : 'bg-destructive/10 text-destructive border-destructive/20'
                    }`}
                  >
                    {testResult.success
                      ? '✓ Test message sent successfully'
                      : `✗ ${testResult.message}`}
                  </div>
                )}

                {/* Webhook URL */}
                <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border group">
                  <div className="flex items-center justify-between">
                    <div className="overflow-hidden">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                        Webhook URL
                      </span>
                      <div className="flex items-center mt-1">
                        <code className="text-sm font-mono text-foreground truncate">
                          {getWebhookUrl(webhook.name)}
                        </code>
                      </div>
                    </div>
                    <button
                      onClick={() => copyToClipboard(getWebhookUrl(webhook.name))}
                      className="ml-4 p-2 text-muted-foreground hover:text-foreground hover:bg-background rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                      title="Copy URL"
                    >
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
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                    </button>
                  </div>
                  {webhook.sourceType === 'github' && (
                    <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                      <svg
                        className="w-3 h-3"
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
                      Configure this URL in your GitHub repository settings → Webhooks
                    </div>
                  )}
                </div>

                {/* Event Filter */}
                {webhook.eventFilter && webhook.eventFilter.length > 0 && (
                  <div className="mt-4 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground font-medium">
                      Listening for:
                    </span>
                    {webhook.eventFilter.map((event) => (
                      <span
                        key={event}
                        className="px-2 py-0.5 bg-background border border-border text-muted-foreground rounded text-xs font-mono"
                      >
                        {event}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Event History */}
              {expandedHistory === webhook.id && (
                <div className="border-t border-border bg-muted/30 p-4 sm:p-6 animate-in slide-in-from-top-4">
                  <h4 className="font-medium text-foreground mb-4 flex items-center gap-2">
                    <span className="w-1 h-4 bg-primary rounded-full"></span>
                    Recent Events
                  </h4>
                  {historyLoading ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                      Loading history...
                    </div>
                  ) : eventHistory.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground bg-background/50 rounded-lg border border-dashed border-border">
                      No events recorded yet
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {eventHistory.map((event) => (
                        <div
                          key={event.id}
                          className="card p-3 sm:p-4 hover:border-primary/30 transition-colors"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                              {getStatusBadge(event.status)}
                              <span className="text-sm font-medium text-foreground">
                                {event.eventType || 'Unknown Event'}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>{formatDate(event.receivedAt)}</span>
                              {event.processingTimeMs && (
                                <span className="font-mono bg-muted px-1.5 py-0.5 rounded">
                                  {event.processingTimeMs}ms
                                </span>
                              )}
                            </div>
                          </div>
                          {event.error && (
                            <div className="mt-3 text-sm text-destructive bg-destructive/5 p-2 rounded border border-destructive/10 font-mono break-all">
                              {event.error}
                            </div>
                          )}
                          {event.messageSent && (
                            <div className="mt-3 text-sm text-muted-foreground bg-muted/50 p-3 rounded border border-border font-mono whitespace-pre-wrap text-xs">
                              {event.messageSent}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
