import { createServiceLogger } from '../logger/index.js';
import { getConfigVersion, invalidateConfigCache } from './loader.js';

const logger = createServiceLogger('config-poller');

let poller: NodeJS.Timeout | null = null;
let lastSeenVersion = getConfigVersion();

type PollerOptions = {
  url: string;
  intervalMs?: number;
};

export function startConfigPoller(options: PollerOptions): void {
  if (poller) return;

  const intervalMs = options.intervalMs ?? 30000;

  const poll = async () => {
    try {
      const response = await fetch(options.url, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Config poll failed with status ${response.status}`);
      }
      const data = (await response.json()) as { version?: number };
      if (typeof data.version === 'number' && data.version !== lastSeenVersion) {
        lastSeenVersion = data.version;
        invalidateConfigCache();
      }
    } catch (error) {
      logger.warn('Config poll failed', { error: String(error) });
    }
  };

  poll().catch(() => undefined);
  poller = setInterval(poll, intervalMs);
}

export function stopConfigPoller(): void {
  if (poller) {
    clearInterval(poller);
    poller = null;
  }
}
