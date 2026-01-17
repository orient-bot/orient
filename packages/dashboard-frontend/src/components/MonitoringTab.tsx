import { useState, useEffect, useCallback } from 'react';
import {
  getServerMetrics,
  getMonitoringConfig,
  updateMonitoringConfig,
  testMonitoringConnection,
  type ServerMetrics,
  type AlertThresholds,
  type ContainerMetrics,
} from '../api';

function formatBytes(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb.toFixed(0)} MB`;
}

function formatGB(gb: number): string {
  return `${gb.toFixed(1)} GB`;
}

function getStatusColor(percent: number, threshold: number): string {
  if (percent >= threshold) {
    return percent >= 95 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400';
  }
  return 'text-emerald-600 dark:text-emerald-400';
}

function getBarColor(percent: number, threshold: number): string {
  if (percent >= threshold) {
    return percent >= 95 ? 'bg-red-500' : 'bg-amber-500';
  }
  return 'bg-emerald-500';
}

function getContainerStatusColor(status: ContainerMetrics['status']): string {
  switch (status) {
    case 'running':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'exited':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'restarting':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    case 'paused':
      return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400';
  }
}

// Gauge component for metrics
function MetricGauge({
  label,
  value,
  threshold,
  subtitle,
  icon,
}: {
  label: string;
  value: number;
  threshold: number;
  subtitle?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
            {icon}
          </div>
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
        </div>
        <span className={`text-2xl font-bold font-mono ${getStatusColor(value, threshold)}`}>
          {value.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full ${getBarColor(value, threshold)} transition-all duration-500 ease-out rounded-full`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      {subtitle && (
        <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

export default function MonitoringTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [thresholds, setThresholds] = useState<AlertThresholds>({ cpu: 80, memory: 85, disk: 90 });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [configForm, setConfigForm] = useState<AlertThresholds>({ cpu: 80, memory: 85, disk: 90 });
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      setError(null);
      const [metricsData, configData] = await Promise.all([
        getServerMetrics(),
        getMonitoringConfig(),
      ]);
      setMetrics(metricsData);
      setThresholds(configData);
      setConfigForm(configData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchMetrics();
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchMetrics]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMetrics();
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      const result = await testMonitoringConnection();
      setConnectionResult(result);
    } catch (err) {
      setConnectionResult({
        success: false,
        message: err instanceof Error ? err.message : 'Connection test failed',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const result = await updateMonitoringConfig(configForm);
      setThresholds(result.thresholds);
      setShowConfig(false);
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setSavingConfig(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="spinner" />
          <p className="text-sm text-muted-foreground">Loading server metrics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 text-destructive">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-medium">Failed to load server metrics</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={handleRefresh} className="btn btn-secondary">
            Try Again
          </button>
          <button onClick={handleTestConnection} disabled={testingConnection} className="btn btn-outline">
            {testingConnection ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
        {connectionResult && (
          <div className={`mt-4 p-3 rounded-lg ${connectionResult.success ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
            <p className="text-sm font-medium">{connectionResult.message}</p>
            {connectionResult.latencyMs && (
              <p className="text-xs mt-1">Latency: {connectionResult.latencyMs}ms</p>
            )}
          </div>
        )}
      </div>
    );
  }

  const cpu = metrics?.host.cpu;
  const memory = metrics?.host.memory;
  const disks = metrics?.host.disk || [];
  const containers = metrics?.containers || [];
  const alerts = metrics?.alerts || [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Production Server Monitoring</h2>
          <p className="text-sm text-muted-foreground">
            {metrics?.timestamp && (
              <>Last updated: {new Date(metrics.timestamp).toLocaleTimeString()}</>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Auto-refresh toggle */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-muted-foreground">Auto-refresh</span>
          </label>

          {/* Config button */}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="btn btn-outline"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Thresholds
          </button>

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

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg flex items-center gap-3 ${
                alert.severity === 'critical'
                  ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                  : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
              }`}
            >
              <span className="text-lg">
                {alert.severity === 'critical' ? '🚨' : '⚠️'}
              </span>
              <span className={`text-sm font-medium ${
                alert.severity === 'critical'
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}>
                {alert.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Threshold Configuration */}
      {showConfig && (
        <div className="card p-5">
          <h3 className="font-semibold mb-4">Alert Thresholds</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                CPU Threshold (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={configForm.cpu}
                onChange={(e) => setConfigForm({ ...configForm, cpu: parseInt(e.target.value) || 0 })}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Memory Threshold (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={configForm.memory}
                onChange={(e) => setConfigForm({ ...configForm, memory: parseInt(e.target.value) || 0 })}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Disk Threshold (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={configForm.disk}
                onChange={(e) => setConfigForm({ ...configForm, disk: parseInt(e.target.value) || 0 })}
                className="input w-full"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSaveConfig}
              disabled={savingConfig}
              className="btn btn-primary"
            >
              {savingConfig ? 'Saving...' : 'Save Thresholds'}
            </button>
            <button
              onClick={() => {
                setShowConfig(false);
                setConfigForm(thresholds);
              }}
              className="btn btn-outline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Metric Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricGauge
          label="CPU Usage"
          value={cpu?.usagePercent || 0}
          threshold={thresholds.cpu}
          subtitle={cpu ? `Load: ${cpu.loadAverage.map(l => l.toFixed(2)).join(', ')}` : undefined}
          icon={
            <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          }
        />
        <MetricGauge
          label="Memory Usage"
          value={memory?.usedPercent || 0}
          threshold={thresholds.memory}
          subtitle={memory ? `${formatBytes(memory.usedMB)} / ${formatBytes(memory.totalMB)}` : undefined}
          icon={
            <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
          }
        />
        {disks.length > 0 && (
          <MetricGauge
            label={`Disk (${disks[0].path})`}
            value={disks[0].usedPercent}
            threshold={thresholds.disk}
            subtitle={`${formatGB(disks[0].usedGB)} / ${formatGB(disks[0].totalGB)}`}
            icon={
              <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            }
          />
        )}
      </div>

      {/* Additional Disks */}
      {disks.length > 1 && (
        <div className="card p-5">
          <h3 className="font-semibold mb-4">Additional Disk Volumes</h3>
          <div className="space-y-3">
            {disks.slice(1).map((disk, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <code className="text-sm bg-secondary px-2 py-1 rounded">{disk.path}</code>
                  <span className="text-sm text-muted-foreground">
                    {formatGB(disk.usedGB)} / {formatGB(disk.totalGB)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getBarColor(disk.usedPercent, thresholds.disk)} rounded-full`}
                      style={{ width: `${Math.min(disk.usedPercent, 100)}%` }}
                    />
                  </div>
                  <span className={`text-sm font-mono font-medium ${getStatusColor(disk.usedPercent, thresholds.disk)}`}>
                    {disk.usedPercent}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Containers */}
      {containers.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold mb-4">Docker Containers</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Container</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">CPU</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Memory</th>
                </tr>
              </thead>
              <tbody>
                {containers.map((container, index) => (
                  <tr key={index} className="border-b border-border last:border-0">
                    <td className="py-3 px-3">
                      <code className="text-sm">{container.name}</code>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getContainerStatusColor(container.status)}`}>
                        {container.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="font-mono text-sm">
                        {container.cpuPercent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="font-mono text-sm text-muted-foreground">
                        {container.memoryUsage}
                      </span>
                      <span className="font-mono text-sm ml-2">
                        ({container.memoryPercent.toFixed(1)}%)
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Connection test result */}
      {connectionResult && (
        <div className={`card p-4 ${connectionResult.success ? 'border-emerald-200 dark:border-emerald-800' : 'border-red-200 dark:border-red-800'}`}>
          <div className="flex items-center gap-2">
            {connectionResult.success ? (
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span className={`font-medium ${connectionResult.success ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
              {connectionResult.message}
            </span>
            {connectionResult.latencyMs && (
              <span className="text-sm text-muted-foreground ml-2">
                ({connectionResult.latencyMs}ms)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Help text */}
      <div className="card p-4 bg-secondary/50 border-dashed">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-muted-foreground mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm">
            <p className="font-medium text-foreground">Production Server Monitoring</p>
            <p className="text-muted-foreground mt-1">
              Metrics are collected via SSH from the production server. Alerts are sent via Slack DM when thresholds are exceeded.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
