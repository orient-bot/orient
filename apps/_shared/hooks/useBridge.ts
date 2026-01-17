/**
 * useBridge Hook
 *
 * React hook for accessing the App Runtime Bridge.
 * The bridge provides access to tools (calendar, slack, etc.) and
 * built-in capabilities (scheduler, webhooks).
 */

import { useEffect, useState } from 'react';

// ============================================
// BRIDGE TYPES
// ============================================

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  attendees?: string[];
  location?: string;
  meetLink?: string;
}

export interface CreateEventParams {
  summary: string;
  description?: string;
  start: Date;
  duration: number; // minutes
  attendees?: string[];
  location?: string;
  createMeetLink?: boolean;
}

export interface ScheduledJob {
  id: number;
  name: string;
  scheduleType: 'once' | 'recurring' | 'cron';
  nextRunAt?: Date;
  enabled: boolean;
}

export interface CreateJobParams {
  name: string;
  scheduleType: 'once' | 'recurring' | 'cron';
  runAt?: Date;
  cronExpression?: string;
  intervalMinutes?: number;
  provider: 'whatsapp' | 'slack';
  target: string;
  messageTemplate: string;
}

export interface SendMessageParams {
  target: string;
  message: string;
  [key: string]: unknown;
}

// ============================================
// BRIDGE INTERFACE
// ============================================

export interface AppBridge {
  // Calendar operations
  calendar: {
    listEvents(startDate: Date, endDate: Date): Promise<CalendarEvent[]>;
    createEvent(params: CreateEventParams): Promise<CalendarEvent>;
    updateEvent(eventId: string, params: Partial<CreateEventParams>): Promise<CalendarEvent>;
    deleteEvent(eventId: string): Promise<void>;
  };

  // Scheduler operations (built-in capability)
  scheduler: {
    createJob(params: CreateJobParams): Promise<ScheduledJob>;
    listJobs(): Promise<ScheduledJob[]>;
    cancelJob(jobId: number): Promise<void>;
  };

  // Webhook operations (built-in capability)
  webhooks: {
    getEndpointUrl(endpointName: string): Promise<string>;
    onWebhookReceived(endpointName: string, callback: (data: unknown) => void): () => void;
  };

  // Messaging
  slack: {
    sendDM(params: SendMessageParams): Promise<void>;
    sendChannel(params: SendMessageParams): Promise<void>;
  };

  // App metadata
  app: {
    getManifest(): Promise<Record<string, unknown>>;
    getShareUrl(): Promise<string>;
  };
}

// ============================================
// BRIDGE IMPLEMENTATION
// ============================================

let requestId = 0;
const pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
const webhookListeners = new Map<string, Set<(data: unknown) => void>>();

// Detect if running in standalone mode (not in iframe with bridge)
const isStandaloneMode = typeof window !== 'undefined' && window.parent === window;

// Get app name from URL path (e.g., /apps/meeting-scheduler/ -> meeting-scheduler)
function getAppNameFromUrl(): string {
  if (typeof window === 'undefined') return 'unknown';
  const match = window.location.pathname.match(/\/apps\/([^/]+)/);
  return match ? match[1] : 'unknown';
}

// Cached app manifest for permission checking
let cachedManifest: Record<string, unknown> | null = null;

// Initialize message listener
if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    // Validate origin (will be configured per deployment)
    const data = event.data;

    if (data.type === 'bridge-response') {
      const pending = pendingRequests.get(data.requestId);
      if (pending) {
        pendingRequests.delete(data.requestId);
        if (data.error) {
          pending.reject(new Error(data.error));
        } else {
          pending.resolve(data.result);
        }
      }
    }

    if (data.type === 'webhook-event') {
      const listeners = webhookListeners.get(data.endpointName);
      if (listeners) {
        listeners.forEach((callback) => callback(data.payload));
      }
    }
  });
}

// Permission checking
interface Permissions {
  calendar?: { read?: boolean; write?: boolean };
  slack?: { read?: boolean; write?: boolean };
}

interface Capabilities {
  scheduler?: { enabled?: boolean; max_jobs?: number };
  webhooks?: { enabled?: boolean };
}

function checkPermission(method: string): void {
  if (!cachedManifest) return; // Skip if manifest not loaded yet

  const permissions = cachedManifest.permissions as Permissions | undefined;
  const capabilities = cachedManifest.capabilities as Capabilities | undefined;

  // Calendar permissions
  if (method.startsWith('calendar.')) {
    const calendarPerms = permissions?.calendar;
    if (method === 'calendar.listEvents' && !calendarPerms?.read) {
      throw new Error('Permission denied: calendar.read not enabled in APP.yaml');
    }
    if (['calendar.createEvent', 'calendar.updateEvent', 'calendar.deleteEvent'].includes(method)) {
      if (!calendarPerms?.write) {
        throw new Error('Permission denied: calendar.write not enabled in APP.yaml');
      }
    }
  }

  // Slack permissions
  if (method.startsWith('slack.')) {
    const slackPerms = permissions?.slack;
    if (!slackPerms?.write) {
      throw new Error('Permission denied: slack.write not enabled in APP.yaml');
    }
  }

  // Scheduler capability
  if (method.startsWith('scheduler.')) {
    if (!capabilities?.scheduler?.enabled) {
      throw new Error('Capability denied: scheduler not enabled in APP.yaml');
    }
  }

  // Webhooks capability
  if (method.startsWith('webhooks.')) {
    if (!capabilities?.webhooks?.enabled) {
      throw new Error('Capability denied: webhooks not enabled in APP.yaml');
    }
  }
}

// Call backend API directly (for standalone/preview mode)
async function callBackendApi<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const appName = getAppNameFromUrl();
  console.log(`[Bridge API] ${method}`, params);

  const response = await fetch('/api/apps/bridge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      appName,
      method,
      params,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Bridge call failed: ${response.status}`);
  }

  const result = await response.json();
  return result.data as T;
}

function callBridge<T>(method: string, params: Record<string, unknown>): Promise<T> {
  // Check permissions before calling
  checkPermission(method);

  // In standalone mode, call backend API directly
  if (isStandaloneMode) {
    return callBackendApi<T>(method, params);
  }

  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject });

    // Send message to parent frame (app runner)
    window.parent.postMessage(
      {
        type: 'bridge-request',
        requestId: id,
        method,
        params,
      },
      '*' // Origin will be restricted in production
    );

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Bridge request timed out: ${method}`));
      }
    }, 30000);
  });
}

// Create the bridge singleton
const bridge: AppBridge = {
  calendar: {
    listEvents: (startDate, endDate) =>
      callBridge('calendar.listEvents', { startDate: startDate.toISOString(), endDate: endDate.toISOString() }),
    createEvent: (params) =>
      callBridge('calendar.createEvent', { ...params, start: params.start.toISOString() }),
    updateEvent: (eventId, params) =>
      callBridge('calendar.updateEvent', {
        eventId,
        ...params,
        start: params.start?.toISOString(),
      }),
    deleteEvent: (eventId) => callBridge('calendar.deleteEvent', { eventId }),
  },

  scheduler: {
    createJob: (params) =>
      callBridge('scheduler.createJob', {
        ...params,
        runAt: params.runAt?.toISOString(),
      }),
    listJobs: () => callBridge('scheduler.listJobs', {}),
    cancelJob: (jobId) => callBridge('scheduler.cancelJob', { jobId }),
  },

  webhooks: {
    getEndpointUrl: (endpointName) =>
      callBridge('webhooks.getEndpointUrl', { endpointName }),
    onWebhookReceived: (endpointName, callback) => {
      if (!webhookListeners.has(endpointName)) {
        webhookListeners.set(endpointName, new Set());
      }
      webhookListeners.get(endpointName)!.add(callback);

      // Return cleanup function
      return () => {
        webhookListeners.get(endpointName)?.delete(callback);
      };
    },
  },

  slack: {
    sendDM: (params) => callBridge('slack.sendDM', params),
    sendChannel: (params) => callBridge('slack.sendChannel', params),
  },

  app: {
    getManifest: () => callBridge('app.getManifest', {}),
    getShareUrl: () => callBridge('app.getShareUrl', {}),
  },
};

// ============================================
// REACT HOOK
// ============================================

export interface UseBridgeResult {
  bridge: AppBridge;
  isReady: boolean;
  isPreviewMode: boolean;
  error: Error | null;
}

/**
 * Hook to access the App Runtime Bridge
 *
 * @example
 * ```tsx
 * function MyApp() {
 *   const { bridge, isReady } = useBridge();
 *
 *   const handleSchedule = async () => {
 *     await bridge.calendar.createEvent({
 *       summary: 'Team Meeting',
 *       start: new Date(),
 *       duration: 60,
 *     });
 *   };
 *
 *   if (!isReady) return <div>Loading...</div>;
 *
 *   return <button onClick={handleSchedule}>Schedule</button>;
 * }
 * ```
 */
export function useBridge(): UseBridgeResult {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Check if we're in an iframe (app runner context)
    if (typeof window === 'undefined') {
      setError(new Error('Bridge is only available in browser'));
      return;
    }

    // Load manifest for permission checking
    const loadManifest = async () => {
      try {
        const appName = getAppNameFromUrl();
        const response = await fetch(`/api/apps/${appName}`);
        if (response.ok) {
          const data = await response.json();
          if (data.app) {
            cachedManifest = {
              name: data.app.name,
              permissions: data.app.permissions,
              capabilities: data.app.capabilities,
            };
            console.log('[Bridge] Loaded manifest:', cachedManifest);
          }
        }
      } catch (err) {
        console.warn('[Bridge] Failed to load manifest:', err);
      }
    };

    if (window.parent === window) {
      // Running standalone (preview mode) - load manifest and mark ready
      console.log('[Bridge] Running in standalone/preview mode with real backend calls');
      loadManifest().finally(() => setIsReady(true));
      return;
    }

    // Running in iframe - ping the parent to verify connection
    const pingTimeout = setTimeout(() => {
      console.warn('Bridge ping timed out, running in development mode');
      setIsReady(true);
    }, 2000);

    callBridge<{ ready: boolean }>('bridge.ping', {})
      .then(() => {
        clearTimeout(pingTimeout);
        setIsReady(true);
      })
      .catch((err) => {
        clearTimeout(pingTimeout);
        // In development, just mark as ready but log warning
        console.warn('Bridge ping failed, running in development mode:', err.message);
        setIsReady(true);
      });
  }, []);

  return { bridge, isReady, isPreviewMode: isStandaloneMode, error };
}

/**
 * Hook to listen for webhook events
 *
 * @example
 * ```tsx
 * function MyApp() {
 *   const { bridge } = useBridge();
 *
 *   useWebhookListener('form-submit', (data) => {
 *     console.log('Received form submission:', data);
 *   });
 *
 *   return <div>Listening for webhooks...</div>;
 * }
 * ```
 */
export function useWebhookListener(
  endpointName: string,
  callback: (data: unknown) => void
): void {
  const { bridge } = useBridge();

  useEffect(() => {
    const cleanup = bridge.webhooks.onWebhookReceived(endpointName, callback);
    return cleanup;
  }, [bridge, endpointName, callback]);
}

export default useBridge;
