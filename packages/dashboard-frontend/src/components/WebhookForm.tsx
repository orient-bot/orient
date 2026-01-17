import { useState, useEffect } from 'react';
import {
  createWebhook,
  updateWebhook,
  getWebhook,
  type Webhook,
  type CreateWebhookInput,
  type UpdateWebhookInput,
  type WebhookSourceType,
  type WebhookProvider,
  GITHUB_EVENTS,
  DEFAULT_WEBHOOK_TEMPLATES,
} from '../api';

interface WebhookFormProps {
  webhook?: Webhook | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function WebhookForm({ webhook, onSuccess, onCancel }: WebhookFormProps) {
  const isEditing = !!webhook;
  
  const [name, setName] = useState(webhook?.name || '');
  const [description, setDescription] = useState(webhook?.description || '');
  const [sourceType, setSourceType] = useState<WebhookSourceType>(webhook?.sourceType || 'github');
  const [provider, setProvider] = useState<WebhookProvider>(webhook?.provider || 'whatsapp');
  const [target, setTarget] = useState(webhook?.target || '');
  const [messageTemplate, setMessageTemplate] = useState(webhook?.messageTemplate || '');
  const [eventFilter, setEventFilter] = useState<string[]>(webhook?.eventFilter || []);
  const [signatureHeader, setSignatureHeader] = useState(webhook?.signatureHeader || '');
  const [enabled, setEnabled] = useState(webhook?.enabled !== false);
  const [showToken, setShowToken] = useState(false);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load full webhook details if editing (to get token)
  useEffect(() => {
    if (webhook?.id) {
      getWebhook(webhook.id).then(w => {
        setCurrentToken(w.token);
      }).catch(() => {
        // Ignore - token was masked in list
      });
    }
  }, [webhook?.id]);

  // Set default signature header and template when source type changes
  useEffect(() => {
    if (!isEditing) {
      if (sourceType === 'github') {
        setSignatureHeader('x-hub-signature-256');
      } else if (sourceType === 'jira') {
        setSignatureHeader('');
      } else {
        setSignatureHeader('');
      }
    }
  }, [sourceType, isEditing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isEditing && webhook) {
        const input: UpdateWebhookInput = {
          name: name !== webhook.name ? name : undefined,
          description,
          sourceType,
          provider,
          target,
          messageTemplate: messageTemplate || undefined,
          eventFilter: eventFilter.length > 0 ? eventFilter : undefined,
          signatureHeader: signatureHeader || undefined,
          enabled,
        };
        await updateWebhook(webhook.id, input);
      } else {
        const input: CreateWebhookInput = {
          name,
          description,
          sourceType,
          provider,
          target,
          messageTemplate: messageTemplate || undefined,
          eventFilter: eventFilter.length > 0 ? eventFilter : undefined,
          signatureHeader: signatureHeader || undefined,
          enabled,
        };
        await createWebhook(input);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save webhook');
    } finally {
      setLoading(false);
    }
  };

  const handleEventFilterChange = (event: string, checked: boolean) => {
    if (checked) {
      setEventFilter([...eventFilter, event]);
    } else {
      setEventFilter(eventFilter.filter(e => e !== event));
    }
  };

  const handleSelectAllEvents = () => {
    setEventFilter(Object.keys(GITHUB_EVENTS));
  };

  const handleClearEvents = () => {
    setEventFilter([]);
  };

  const handleUseDefaultTemplate = () => {
    const templateKey = eventFilter.length === 1 
      ? `${sourceType}:${eventFilter[0]}`
      : sourceType;
    const template = DEFAULT_WEBHOOK_TEMPLATES[templateKey] || DEFAULT_WEBHOOK_TEMPLATES['custom'];
    setMessageTemplate(template);
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'github': return '🐙';
      case 'calendar': return '📅';
      case 'jira': return '🎫';
      default: return '🔗';
    }
  };

  return (
    <div className="max-w-3xl mx-auto animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            {isEditing ? 'Edit Webhook' : 'New Webhook'}
          </h2>
          <p className="text-muted-foreground mt-1">
            Configure how your webhook receives and processes events
          </p>
        </div>
        <button
          onClick={onCancel}
          className="btn btn-ghost"
        >
          ← Back
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Info */}
        <div className="card p-6 space-y-6">
          <div className="border-b border-border pb-4 mb-4">
            <h3 className="font-medium text-lg text-foreground">Basic Information</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Webhook Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="github-prs"
                pattern="[a-zA-Z0-9_-]{3,50}"
                title="3-50 characters, letters, numbers, hyphens, underscores"
                required
                disabled={isEditing}
                className="input"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Unique identifier. Used in the webhook URL.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Notifications for PR events"
                className="input"
              />
            </div>
          </div>
        </div>

        {/* Source Configuration */}
        <div className="card p-6 space-y-6">
          <div className="border-b border-border pb-4 mb-4">
            <h3 className="font-medium text-lg text-foreground">Source Configuration</h3>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-foreground mb-3">
              Source Type *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(['github', 'calendar', 'jira', 'custom'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSourceType(type)}
                  className={`p-4 border rounded-xl text-center transition-all ${
                    sourceType === type
                      ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary/20'
                      : 'border-input hover:border-primary/50 hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  <div className="text-3xl mb-2">{getSourceIcon(type)}</div>
                  <div className="text-sm font-medium capitalize">{type}</div>
                </button>
              ))}
            </div>
          </div>

          {/* GitHub Event Filter */}
          {sourceType === 'github' && (
            <div className="animate-in slide-in-from-top-2">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-foreground">
                  Event Filter
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllEvents}
                    className="text-xs text-primary hover:text-primary/80 hover:underline"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={handleClearEvents}
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(GITHUB_EVENTS).map(([event, desc]) => (
                  <label
                    key={event}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      eventFilter.includes(event)
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-input hover:border-border hover:bg-accent/50'
                    }`}
                  >
                    <div className="flex h-5 items-center">
                      <input
                        type="checkbox"
                        checked={eventFilter.includes(event)}
                        onChange={(e) => handleEventFilterChange(event, e.target.checked)}
                        className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{event}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                    </div>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Leave empty to receive all events from this source
              </p>
            </div>
          )}

          {/* Signature Header */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Signature Header
            </label>
            <input
              type="text"
              value={signatureHeader}
              onChange={(e) => setSignatureHeader(e.target.value)}
              placeholder="x-hub-signature-256"
              className="input font-mono"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Header containing the HMAC signature. Leave empty to skip verification.
            </p>
          </div>

          {/* Token (read-only for editing) */}
          {isEditing && currentToken && (
            <div className="animate-in slide-in-from-top-2">
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Secret Token
              </label>
              <div className="flex items-center gap-2">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={currentToken}
                  readOnly
                  className="flex-1 input bg-muted/50 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="btn btn-outline"
                >
                  {showToken ? 'Hide' : 'Show'}
                </button>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(currentToken)}
                  className="btn btn-outline"
                >
                  Copy
                </button>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Use this token when configuring the webhook in {sourceType === 'github' ? 'GitHub' : 'the source service'}
              </p>
            </div>
          )}
        </div>

        {/* Delivery Configuration */}
        <div className="card p-6 space-y-6">
          <div className="border-b border-border pb-4 mb-4">
            <h3 className="font-medium text-lg text-foreground">Delivery Configuration</h3>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-foreground mb-3">
              Deliver To *
            </label>
            <div className="flex gap-4">
              {(['whatsapp', 'slack'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProvider(p)}
                  className={`flex-1 p-4 border rounded-xl text-center transition-all ${
                    provider === p
                      ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary/20'
                      : 'border-input hover:border-primary/50 hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  <span className="text-2xl mr-2 align-middle">{p === 'whatsapp' ? '💬' : '💼'}</span>
                  <span className="font-medium capitalize align-middle">{p}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Target {provider === 'whatsapp' ? '(JID)' : '(Channel ID)'} *
            </label>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={provider === 'whatsapp' ? '120363000000000001@g.us' : '#channel-name'}
              required
              className="input font-mono"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {provider === 'whatsapp'
                ? 'WhatsApp JID (group or contact)'
                : 'Slack channel ID or name'}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-foreground">
                Message Template
              </label>
              <button
                type="button"
                onClick={handleUseDefaultTemplate}
                className="text-xs text-primary hover:text-primary/80 hover:underline"
              >
                Use Default Template
              </button>
            </div>
            <textarea
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              placeholder="Leave empty for default template..."
              rows={6}
              className="input font-mono text-sm h-auto"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Use {'{{variable}}'} syntax. Available: repo_name, pr_title, pr_url, pr_author, issue_title, etc.
            </p>
          </div>
        </div>

        {/* Enable/Disable */}
        <div className="card p-6 flex items-center justify-between">
          <div>
            <h4 className="font-medium text-foreground">Webhook Status</h4>
            <p className="text-sm text-muted-foreground">
              {enabled ? 'Webhook is active and will process events' : 'Webhook is disabled and will ignore events'}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-input peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-outline"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary min-w-[140px]"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                Saving...
              </>
            ) : isEditing ? 'Update Webhook' : 'Create Webhook'}
          </button>
        </div>
      </form>
    </div>
  );
}
