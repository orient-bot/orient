/**
 * Dual Mode Settings Component
 * 
 * Allows configuration of:
 * - WhatsApp dual-mode (Baileys personal vs Cloud API bot)
 * - Slack dual-mode (Bot vs User token)
 * - Notification preferences
 */

import { useState, useEffect } from 'react';

interface DualModeStatus {
  whatsapp: {
    personal: { available: boolean; ready: boolean };
    bot: { available: boolean; ready: boolean; configured: boolean };
    defaultMode: 'personal' | 'bot';
    notificationMode: 'personal' | 'bot';
  };
  slack: {
    bot: { available: boolean };
    user: { available: boolean; configured: boolean };
    defaultMode: 'bot' | 'user';
  };
  notifications: {
    enabled: boolean;
    remindersEnabled: boolean;
    slaAlertsEnabled: boolean;
    dailyDigestEnabled: boolean;
    preferredChannel: 'whatsapp' | 'slack';
  };
}

interface DualModeSettingsProps {
  onUpdate?: () => void;
}

export default function DualModeSettings({ onUpdate: _onUpdate }: DualModeSettingsProps) {
  const [status, setStatus] = useState<DualModeStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [_isSaving, _setIsSaving] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // TODO: Replace with actual API call when backend is ready
      // For now, simulate loading status
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Mock status - will be replaced with actual API
      setStatus({
        whatsapp: {
          personal: { available: true, ready: true },
          bot: { available: false, ready: false, configured: false },
          defaultMode: 'personal',
          notificationMode: 'bot',
        },
        slack: {
          bot: { available: true },
          user: { available: false, configured: false },
          defaultMode: 'bot',
        },
        notifications: {
          enabled: true,
          remindersEnabled: true,
          slaAlertsEnabled: true,
          dailyDigestEnabled: true,
          preferredChannel: 'whatsapp',
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSlackOAuthStart = async () => {
    // TODO: Implement OAuth flow
    window.open('/api/slack/oauth/start', '_blank', 'width=600,height=800');
  };

  const StatusBadge = ({ available, ready, configured }: { 
    available: boolean; 
    ready?: boolean; 
    configured?: boolean;
  }) => {
    if (!available && !configured) {
      return (
        <span className="px-2 py-1 bg-surface-100 text-surface-500 text-xs rounded-full">
          Not Configured
        </span>
      );
    }
    if (ready) {
      return (
        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-full flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          Connected
        </span>
      );
    }
    if (configured) {
      return (
        <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full">
          Configured
        </span>
      );
    }
    return (
      <span className="px-2 py-1 bg-surface-100 text-surface-500 text-xs rounded-full">
        Disconnected
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="card p-6">
        <div className="flex items-center justify-center py-8">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6">
        <div className="text-center py-8">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={loadStatus} className="btn btn-secondary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!status) return null;

  return (
    <div className="space-y-6">
      {/* WhatsApp Dual Mode */}
      <div className="card">
        <div className="p-6 border-b border-surface-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-surface-900">WhatsApp Dual Mode</h3>
              <p className="text-sm text-surface-500">Choose between personal phone or dedicated bot number</p>
            </div>
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          {/* Personal Mode (Baileys) */}
          <div className="flex items-center justify-between p-4 bg-surface-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm">
                <svg className="w-4 h-4 text-surface-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-surface-900">Personal Mode (Baileys)</p>
                <p className="text-xs text-surface-500">Messages appear from your phone number</p>
              </div>
            </div>
            <StatusBadge 
              available={status.whatsapp.personal.available} 
              ready={status.whatsapp.personal.ready} 
            />
          </div>

          {/* Bot Mode (Cloud API) */}
          <div className="flex items-center justify-between p-4 bg-surface-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm">
                <svg className="w-4 h-4 text-surface-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-surface-900">Bot Mode (Cloud API)</p>
                <p className="text-xs text-surface-500">Dedicated bot number for notifications</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge 
                available={status.whatsapp.bot.available} 
                ready={status.whatsapp.bot.ready}
                configured={status.whatsapp.bot.configured}
              />
              {!status.whatsapp.bot.configured && (
                <a 
                  href="https://business.facebook.com" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary text-xs py-1 px-2"
                >
                  Setup
                </a>
              )}
            </div>
          </div>

          {/* Mode Selection */}
          <div className="pt-4 border-t border-surface-200">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">
                  Conversations Via
                </label>
                <select 
                  className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm"
                  value={status.whatsapp.defaultMode}
                  disabled
                >
                  <option value="personal">Personal (Baileys)</option>
                  <option value="bot">Bot (Cloud API)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">
                  Notifications Via
                </label>
                <select 
                  className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm"
                  value={status.whatsapp.notificationMode}
                  disabled={!status.whatsapp.bot.configured}
                >
                  <option value="personal">Personal (Baileys)</option>
                  <option value="bot">Bot (Cloud API)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Slack Dual Mode */}
      <div className="card">
        <div className="p-6 border-b border-surface-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-violet-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-surface-900">Slack Dual Mode</h3>
              <p className="text-sm text-surface-500">Post as bot or as yourself</p>
            </div>
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          {/* Bot Mode */}
          <div className="flex items-center justify-between p-4 bg-surface-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm">
                <svg className="w-4 h-4 text-surface-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-surface-900">Bot Mode</p>
                <p className="text-xs text-surface-500">Messages show "APP" label</p>
              </div>
            </div>
            <StatusBadge available={status.slack.bot.available} ready={true} />
          </div>

          {/* User Mode */}
          <div className="flex items-center justify-between p-4 bg-surface-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm">
                <svg className="w-4 h-4 text-surface-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-surface-900">User Mode</p>
                <p className="text-xs text-surface-500">Messages appear as from you</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge 
                available={status.slack.user.available} 
                configured={status.slack.user.configured}
              />
              {!status.slack.user.configured && (
                <button 
                  onClick={handleSlackOAuthStart}
                  className="btn btn-secondary text-xs py-1 px-2"
                >
                  Connect
                </button>
              )}
            </div>
          </div>

          {/* Default Mode */}
          <div className="pt-4 border-t border-surface-200">
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Default Posting Mode
            </label>
            <select 
              className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm"
              value={status.slack.defaultMode}
              disabled={!status.slack.user.configured}
            >
              <option value="bot">Bot (with APP label)</option>
              <option value="user">User (as myself)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="card">
        <div className="p-6 border-b border-surface-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-surface-900">Notifications</h3>
              <p className="text-sm text-surface-500">Reminders, alerts, and digests</p>
            </div>
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          {/* Enable/Disable */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-surface-900">Enable Notifications</p>
              <p className="text-xs text-surface-500">Proactive messages from the bot</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={status.notifications.enabled}
                disabled
              />
              <div className="w-11 h-6 bg-surface-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          <div className="border-t border-surface-200 pt-4 space-y-3">
            <label className="flex items-center gap-3">
              <input 
                type="checkbox" 
                className="w-4 h-4 text-emerald-600 rounded" 
                checked={status.notifications.remindersEnabled}
                disabled
              />
              <span className="text-sm text-surface-700">Reminders</span>
            </label>
            <label className="flex items-center gap-3">
              <input 
                type="checkbox" 
                className="w-4 h-4 text-emerald-600 rounded" 
                checked={status.notifications.slaAlertsEnabled}
                disabled
              />
              <span className="text-sm text-surface-700">SLA Breach Alerts</span>
            </label>
            <label className="flex items-center gap-3">
              <input 
                type="checkbox" 
                className="w-4 h-4 text-emerald-600 rounded" 
                checked={status.notifications.dailyDigestEnabled}
                disabled
              />
              <span className="text-sm text-surface-700">Daily Digest</span>
            </label>
          </div>

          <div className="pt-4 border-t border-surface-200">
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Preferred Channel
            </label>
            <select 
              className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm"
              value={status.notifications.preferredChannel}
              disabled
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="slack">Slack</option>
            </select>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">WhatsApp Bot Mode Setup</p>
            <p className="text-blue-700">
              To enable bot mode, you need to:
            </p>
            <ol className="list-decimal list-inside mt-1 space-y-1 text-blue-700">
              <li>Create a Twilio account and buy a US phone number (~$1.15/mo)</li>
              <li>Set up Meta Business Manager and WhatsApp Business API</li>
              <li>Register your Twilio number with WhatsApp</li>
              <li>Create message templates and wait for approval</li>
            </ol>
            <p className="mt-2 text-blue-700">
              See the setup guide in the plan for detailed instructions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
