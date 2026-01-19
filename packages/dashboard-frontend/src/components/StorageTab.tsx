import { useState, useEffect, useCallback } from 'react';
import {
  getStorageSummary,
  type StorageSummary,
  type DatabaseStorageStats,
  type MediaStorageStats,
  type SessionStorageStats,
  type CloudStorageStats,
} from '../api';
import { DatabaseStorageCard } from './Storage/DatabaseStorageCard';
import { MediaStorageCard } from './Storage/MediaStorageCard';
import { SessionStorageCard } from './Storage/SessionStorageCard';
import { CloudStorageCard } from './Storage/CloudStorageCard';
import { StorageManagementPanel } from './Storage/StorageManagementPanel';

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

// Summary card component
function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  status,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  status?: 'success' | 'warning' | 'error' | 'neutral';
}) {
  const statusColors = {
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    error: 'text-red-600 dark:text-red-400',
    neutral: 'text-foreground',
  };

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
          {icon}
        </div>
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
      </div>
      <p className={`text-2xl font-bold font-mono ${statusColors[status || 'neutral']}`}>{value}</p>
      {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export default function StorageTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<StorageSummary | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSummary = useCallback(async () => {
    try {
      setError(null);
      const data = await getStorageSummary();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch storage summary');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Auto-refresh every 60 seconds when enabled
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchSummary();
    }, 60000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchSummary]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSummary();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="spinner" />
          <p className="text-sm text-muted-foreground">Loading storage information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 text-destructive">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <p className="font-medium">Failed to load storage information</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
        <button onClick={handleRefresh} className="btn btn-secondary mt-4">
          Try Again
        </button>
      </div>
    );
  }

  const database: DatabaseStorageStats = summary?.database || {
    tables: [],
    totalRows: 0,
    connectionStatus: 'error',
  };
  const media: MediaStorageStats = summary?.media || {
    totalFiles: 0,
    byType: { image: 0, audio: 0, video: 0, document: 0 },
  };
  const session: SessionStorageStats = summary?.session || {
    status: 'unknown',
    path: '',
    sizeMB: 0,
    exists: false,
  };
  const cloud: CloudStorageStats = summary?.cloud || {
    cloudflare: { available: false },
    google: { available: false },
  };

  // Calculate total cloud storage
  const totalCloudGB = (cloud.cloudflare.storageGB || 0) + (cloud.google.storageGB || 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Storage Overview</h2>
          <p className="text-sm text-muted-foreground">
            {summary?.fetchedAt && (
              <>Last updated: {new Date(summary.fetchedAt).toLocaleTimeString()}</>
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

          {/* Refresh button */}
          <button onClick={handleRefresh} disabled={refreshing} className="btn btn-secondary">
            {refreshing ? (
              <span className="spinner w-4 h-4" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            )}
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          title="Database"
          value={formatNumber(database.totalRows)}
          subtitle={`${database.tables.length} tables`}
          status={database.connectionStatus === 'connected' ? 'success' : 'error'}
          icon={
            <svg
              className="w-4 h-4 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M3 5V19A9 3 0 0 0 21 19V5" />
              <path d="M3 12A9 3 0 0 0 21 12" />
            </svg>
          }
        />
        <SummaryCard
          title="Media"
          value={formatNumber(media.totalFiles)}
          subtitle="files stored"
          status="neutral"
          icon={
            <svg
              className="w-4 h-4 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
          }
        />
        <SummaryCard
          title="Session"
          value={`${session.sizeMB.toFixed(1)} MB`}
          subtitle={session.status === 'connected' ? 'Connected' : session.status}
          status={
            session.status === 'connected'
              ? 'success'
              : session.status === 'disconnected'
                ? 'warning'
                : 'neutral'
          }
          icon={
            <svg
              className="w-4 h-4 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7 14h2m6 0h2" />
            </svg>
          }
        />
        <SummaryCard
          title="Cloud"
          value={totalCloudGB > 0 ? `${totalCloudGB.toFixed(1)} GB` : 'N/A'}
          subtitle={
            cloud.cloudflare.available || cloud.google.available ? 'configured' : 'not configured'
          }
          status={cloud.cloudflare.available || cloud.google.available ? 'success' : 'neutral'}
          icon={
            <svg
              className="w-4 h-4 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
            </svg>
          }
        />
      </div>

      {/* Category Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DatabaseStorageCard stats={database} />
        <MediaStorageCard stats={media} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SessionStorageCard stats={session} />
        <CloudStorageCard stats={cloud} />
      </div>

      {/* Management Panel */}
      <StorageManagementPanel onRefresh={handleRefresh} />

      {/* Help text */}
      <div className="card p-4 bg-secondary/50 border-dashed">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-muted-foreground mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="text-sm">
            <p className="font-medium text-foreground">Storage Management</p>
            <p className="text-muted-foreground mt-1">
              View and manage database tables, media files, session data, and cloud storage. Use the
              management panel to clean up old data when needed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
