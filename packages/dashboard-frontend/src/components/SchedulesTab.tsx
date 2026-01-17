import { useState, useEffect } from 'react';
import {
  getScheduledJobs,
  getSchedulerStats,
  deleteScheduledJob,
  toggleScheduledJob,
  runScheduledJobNow,
  getScheduledJobRuns,
  assetUrl,
  type ScheduledJob,
  type SchedulerStats,
  type ScheduledJobRun,
} from '../api';
import ScheduleForm from './ScheduleForm';

interface SchedulesTabProps {
  onUpdate?: () => void;
}

export default function SchedulesTab({ onUpdate }: SchedulesTabProps) {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [stats, setStats] = useState<SchedulerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedJobRuns, setSelectedJobRuns] = useState<{
    job: ScheduledJob;
    runs: ScheduledJobRun[];
  } | null>(null);
  const [runningJobs, setRunningJobs] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [jobsResult, statsResult] = await Promise.all([
        getScheduledJobs(),
        getSchedulerStats(),
      ]);
      setJobs(jobsResult.jobs);
      setStats(statsResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (job: ScheduledJob) => {
    try {
      const updated = await toggleScheduledJob(job.id, !job.enabled);
      setJobs(jobs.map((j) => (j.id === updated.id ? updated : j)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle job');
    }
  };

  const handleDelete = async (job: ScheduledJob) => {
    if (!confirm(`Delete schedule "${job.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteScheduledJob(job.id);
      setJobs(jobs.filter((j) => j.id !== job.id));
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete job');
    }
  };

  const handleRunNow = async (job: ScheduledJob) => {
    try {
      setRunningJobs((prev) => new Set(prev).add(job.id));
      const result = await runScheduledJobNow(job.id);
      if (result.success) {
        // Reload job to get updated run count
        await loadData();
      } else {
        setError(result.error || 'Failed to run job');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run job');
    } finally {
      setRunningJobs((prev) => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  };

  const handleViewRuns = async (job: ScheduledJob) => {
    try {
      const result = await getScheduledJobRuns(job.id, 20);
      setSelectedJobRuns({ job, runs: result.runs });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load job runs');
    }
  };

  const handleFormSuccess = (job: ScheduledJob) => {
    if (editingJob) {
      setJobs(jobs.map((j) => (j.id === job.id ? job : j)));
    } else {
      setJobs([job, ...jobs]);
    }
    setShowForm(false);
    setEditingJob(null);
    loadData(); // Reload stats
    onUpdate?.();
  };

  const formatSchedule = (job: ScheduledJob): string => {
    switch (job.scheduleType) {
      case 'cron':
        return job.cronExpression || 'Invalid cron';
      case 'once':
        return job.runAt ? new Date(job.runAt).toLocaleString() : 'Not set';
      case 'recurring':
        return `Every ${job.intervalMinutes} minutes`;
      default:
        return 'Unknown';
    }
  };

  const formatRelativeTime = (dateStr: string | undefined): string => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
        <span className="ml-3 text-muted-foreground">Loading schedules...</span>
      </div>
    );
  }

  if (showForm || editingJob) {
    return (
      <ScheduleForm
        job={editingJob || undefined}
        onSuccess={handleFormSuccess}
        onCancel={() => {
          setShowForm(false);
          setEditingJob(null);
        }}
      />
    );
  }

  if (selectedJobRuns) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedJobRuns(null)} className="btn btn-ghost p-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
            </button>
            <h2 className="text-lg font-semibold">Run History: {selectedJobRuns.job.name}</h2>
          </div>
        </div>

        <div className="card overflow-hidden">
          {selectedJobRuns.runs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No runs yet</div>
          ) : (
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Started
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Message/Error
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {selectedJobRuns.runs.map((run) => (
                  <tr key={run.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono">
                      {new Date(run.startedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
                      {run.completedAt
                        ? `${Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s`
                        : 'Running...'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border border-transparent ${
                          run.status === 'success'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : run.status === 'failed'
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                        }`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate font-mono">
                      {run.error || run.messageSent?.substring(0, 100) || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide font-semibold">
              Total Jobs
            </p>
            <p className="text-2xl font-bold font-mono tracking-tight mt-1">{stats.totalJobs}</p>
            <p className="text-xs text-muted-foreground mt-1">{stats.enabledJobs} enabled</p>
          </div>
          <div className="card p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide font-semibold">
              By Provider
            </p>
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-sm font-mono">{stats.byProvider.whatsapp} WhatsApp</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-violet-500"></span>
                <span className="text-sm font-mono">{stats.byProvider.slack} Slack</span>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide font-semibold">
              Last 24 Hours
            </p>
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-sm font-mono">{stats.last24Hours.success} success</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-destructive"></span>
                <span className="text-sm font-mono">{stats.last24Hours.failed} failed</span>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide font-semibold">
              Total Runs
            </p>
            <p className="text-2xl font-bold font-mono tracking-tight mt-1">{stats.totalRuns}</p>
          </div>
        </div>
      )}

      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Scheduled Jobs</h2>
        <button onClick={() => setShowForm(true)} className="btn btn-primary">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Schedule
        </button>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 hover:opacity-80">
            ×
          </button>
        </div>
      )}

      {/* Jobs list */}
      <div className="card overflow-hidden">
        {jobs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <img
              src={assetUrl('/mascot/variations/integrations.png')}
              alt="Ori mascot"
              className="w-32 h-32 mx-auto mb-4 object-contain"
            />
            <p className="text-lg font-medium">No scheduled jobs yet</p>
            <p className="text-sm mt-1">Create your first schedule to automate notifications</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Job
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Schedule
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Provider
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Last Run
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Runs
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((job) => (
                <tr
                  key={job.id}
                  className={`hover:bg-muted/30 transition-colors ${!job.enabled ? 'opacity-60 grayscale' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{job.name}</p>
                      {job.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">
                          {job.description}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border border-transparent ${
                          job.scheduleType === 'cron'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                            : job.scheduleType === 'recurring'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                        }`}
                      >
                        {job.scheduleType}
                      </span>
                      <span className="text-sm font-mono text-muted-foreground">
                        {formatSchedule(job)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">{job.timezone}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border border-transparent ${
                        job.provider === 'whatsapp'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400'
                      }`}
                    >
                      {job.provider === 'whatsapp' ? (
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                        </svg>
                      ) : (
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
                        </svg>
                      )}
                      {job.provider}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
                    {formatRelativeTime(job.lastRunAt)}
                    {job.lastError && (
                      <p
                        className="text-xs text-destructive truncate max-w-xs"
                        title={job.lastError}
                      >
                        Error: {job.lastError}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleViewRuns(job)}
                      className="text-sm font-mono text-primary hover:underline"
                    >
                      {job.runCount}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(job)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        job.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-background transition-transform ${
                          job.enabled ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleRunNow(job)}
                        disabled={runningJobs.has(job.id)}
                        className="btn btn-ghost h-8 w-8 p-0"
                        title="Run now"
                      >
                        {runningJobs.has(job.id) ? (
                          <svg
                            className="w-4 h-4 animate-spin"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                        ) : (
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
                              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => setEditingJob(job)}
                        className="btn btn-ghost h-8 w-8 p-0"
                        title="Edit"
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
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(job)}
                        className="btn btn-ghost h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="Delete"
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
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
