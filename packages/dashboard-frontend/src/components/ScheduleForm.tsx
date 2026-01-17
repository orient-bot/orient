import { useState, useEffect } from 'react';
import {
  createScheduledJob,
  updateScheduledJob,
  validateCronExpression,
  CRON_PRESETS,
  COMMON_TIMEZONES,
  type ScheduledJob,
  type CreateScheduledJobInput,
  type ScheduleType,
  type ScheduleProvider,
} from '../api';

interface ScheduleFormProps {
  job?: ScheduledJob;
  onSuccess: (job: ScheduledJob) => void;
  onCancel: () => void;
}

export default function ScheduleForm({ job, onSuccess, onCancel }: ScheduleFormProps) {
  const isEditing = !!job;

  // Form state
  const [name, setName] = useState(job?.name || '');
  const [description, setDescription] = useState(job?.description || '');
  const [scheduleType, setScheduleType] = useState<ScheduleType>(job?.scheduleType || 'cron');
  const [cronExpression, setCronExpression] = useState(job?.cronExpression || '0 9 * * 1-5');
  const [runAt, setRunAt] = useState(job?.runAt ? new Date(job.runAt).toISOString().slice(0, 16) : '');
  const [intervalMinutes, setIntervalMinutes] = useState(job?.intervalMinutes || 60);
  const [timezone, setTimezone] = useState(job?.timezone || 'Asia/Jerusalem');
  const [provider, setProvider] = useState<ScheduleProvider>(job?.provider || 'whatsapp');
  const [target, setTarget] = useState(job?.target || '');
  const [messageTemplate, setMessageTemplate] = useState(job?.messageTemplate || '');
  const [enabled, setEnabled] = useState(job?.enabled !== false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cronValid, setCronValid] = useState(true);
  const [cronDescription, setCronDescription] = useState<string | null>(null);

  // Validate cron expression when it changes
  useEffect(() => {
    if (scheduleType !== 'cron' || !cronExpression) {
      setCronValid(true);
      setCronDescription(null);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const result = await validateCronExpression(cronExpression);
        setCronValid(result.valid);
        setCronDescription(result.description);
      } catch {
        setCronValid(false);
        setCronDescription(null);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [cronExpression, scheduleType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!target.trim()) {
      setError('Target is required');
      return;
    }
    if (!messageTemplate.trim()) {
      setError('Message template is required');
      return;
    }
    if (scheduleType === 'cron' && !cronValid) {
      setError('Invalid cron expression');
      return;
    }
    if (scheduleType === 'once' && !runAt) {
      setError('Run at time is required for one-time schedule');
      return;
    }

    try {
      setLoading(true);

      const input: CreateScheduledJobInput = {
        name: name.trim(),
        description: description.trim() || undefined,
        scheduleType,
        provider,
        target: target.trim(),
        messageTemplate: messageTemplate.trim(),
        timezone,
        enabled,
      };

      // Add schedule-type specific fields
      if (scheduleType === 'cron') {
        input.cronExpression = cronExpression;
      } else if (scheduleType === 'once') {
        input.runAt = runAt;
      } else if (scheduleType === 'recurring') {
        input.intervalMinutes = intervalMinutes;
      }

      let result: ScheduledJob;
      if (isEditing) {
        result = await updateScheduledJob(job.id, input);
      } else {
        result = await createScheduledJob(input);
      }

      onSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="btn btn-ghost p-2 rounded-full">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <h2 className="text-lg font-semibold text-foreground">
            {isEditing ? 'Edit Schedule' : 'Create Schedule'}
          </h2>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive">
            {error}
          </div>
        )}

        <div className="card p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Daily Standup Reminder"
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Remind team about daily standup"
                className="input"
              />
            </div>
          </div>

          {/* Schedule Type */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Schedule Type <span className="text-destructive">*</span>
            </label>
            <div className="flex gap-4">
              {(['cron', 'recurring', 'once'] as ScheduleType[]).map((type) => (
                <label key={type} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scheduleType"
                    value={type}
                    checked={scheduleType === type}
                    onChange={() => setScheduleType(type)}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="text-sm text-foreground capitalize">{type}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Schedule Config based on type */}
          {scheduleType === 'cron' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Cron Expression <span className="text-destructive">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    placeholder="0 9 * * 1-5"
                    className={`flex-1 input font-mono ${
                      cronValid ? '' : 'border-destructive'
                    }`}
                  />
                  <div className="relative">
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          setCronExpression(e.target.value);
                        }
                      }}
                      className="input w-auto appearance-none pr-8 cursor-pointer"
                    >
                      <option value="">Presets...</option>
                      {Object.entries(CRON_PRESETS).map(([label, expr]) => (
                        <option key={expr} value={expr}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <svg className="w-4 h-4 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                {cronDescription && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {cronDescription}
                  </p>
                )}
                {!cronValid && (
                  <p className="text-sm text-destructive mt-1">
                    Invalid cron expression
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Timezone
                </label>
                <div className="relative">
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="input w-full appearance-none pr-8 cursor-pointer"
                  >
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                  <svg className="w-4 h-4 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {scheduleType === 'recurring' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Interval (minutes) <span className="text-destructive">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="10080"
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(parseInt(e.target.value) || 60)}
                className="input"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Runs every {intervalMinutes} minute{intervalMinutes !== 1 ? 's' : ''} 
                ({intervalMinutes >= 60 ? `${Math.floor(intervalMinutes / 60)}h ${intervalMinutes % 60}m` : ''})
              </p>
            </div>
          )}

          {scheduleType === 'once' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Run At <span className="text-destructive">*</span>
              </label>
              <input
                type="datetime-local"
                value={runAt}
                onChange={(e) => setRunAt(e.target.value)}
                className="input"
              />
            </div>
          )}
        </div>

        {/* Delivery Configuration */}
        <div className="card p-6 space-y-6">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Delivery
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Provider <span className="text-destructive">*</span>
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="provider"
                    value="whatsapp"
                    checked={provider === 'whatsapp'}
                    onChange={() => setProvider('whatsapp')}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="flex items-center gap-1.5 text-sm text-foreground">
                    <svg className="w-4 h-4 text-emerald-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    </svg>
                    WhatsApp
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="provider"
                    value="slack"
                    checked={provider === 'slack'}
                    onChange={() => setProvider('slack')}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="flex items-center gap-1.5 text-sm text-foreground">
                    <svg className="w-4 h-4 text-violet-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                    </svg>
                    Slack
                  </span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Target <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={provider === 'whatsapp' ? 'Phone number (e.g., 972501234567@s.whatsapp.net)' : 'Channel ID (e.g., C123ABC456)'}
                className="input"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {provider === 'whatsapp' 
                  ? 'JID format: phone@s.whatsapp.net or groupid@g.us' 
                  : 'Slack channel ID'}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Message Template <span className="text-destructive">*</span>
            </label>
            <textarea
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              rows={4}
              placeholder="Enter the message to send..."
              className="input font-mono text-sm h-auto resize-none"
            />
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-1">Available variables:</p>
              <div className="flex flex-wrap gap-2">
                {['{{date}}', '{{time}}', '{{datetime}}', '{{day}}', '{{job.name}}', '{{job.runCount}}'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMessageTemplate(messageTemplate + v)}
                    className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs font-mono hover:bg-muted/80 transition-colors"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Enable/Disable Toggle */}
        <div className="card p-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="font-medium text-foreground">Enabled</p>
              <p className="text-sm text-muted-foreground">
                {enabled ? 'This schedule is active and will run as configured' : 'This schedule is disabled and will not run'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enabled ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                  enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-secondary"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {isEditing ? 'Save Changes' : 'Create Schedule'}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
