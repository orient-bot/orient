/**
 * Progressive Responder
 *
 * Provides progressive feedback to users during long-running operations.
 * This module is self-contained within @orientbot/agents to avoid cross-package
 * import issues in dev mode.
 */

import { createServiceLogger } from '@orientbot/core';

const logger = createServiceLogger('progressive-responder');

/**
 * Configuration for progressive responses
 */
export interface ProgressConfig {
  /** Delay before sending initial acknowledgment (ms) */
  initialDelayMs: number;
  /** Interval between progress updates (ms) */
  progressIntervalMs: number;
  /** Maximum total time before giving up (ms) */
  maxWaitMs: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_PROGRESS_CONFIG: ProgressConfig = {
  initialDelayMs: 2500,
  progressIntervalMs: 10000,
  maxWaitMs: 120000,
};

/**
 * Load progress configuration with environment overrides
 */
export function loadProgressConfig(): ProgressConfig {
  return {
    ...DEFAULT_PROGRESS_CONFIG,
    initialDelayMs:
      parseInt(process.env.PROGRESS_INITIAL_DELAY_MS || '') ||
      DEFAULT_PROGRESS_CONFIG.initialDelayMs,
    progressIntervalMs:
      parseInt(process.env.PROGRESS_INTERVAL_MS || '') ||
      DEFAULT_PROGRESS_CONFIG.progressIntervalMs,
    maxWaitMs:
      parseInt(process.env.PROGRESS_MAX_WAIT_MS || '') || DEFAULT_PROGRESS_CONFIG.maxWaitMs,
  };
}

// Random message selections for variety
const INITIAL_MESSAGES = [
  'Let me check on that...',
  'Working on it...',
  "I'm looking into this...",
  'One moment please...',
  'Let me find that for you...',
];

const MID_PROGRESS_MESSAGES = [
  'Still working on this...',
  'Almost there...',
  'This is taking a bit longer than expected...',
  'Hang tight, nearly done...',
  'Processing your request...',
];

function pickRandom(messages: string[]): string {
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Get a random initial progress message
 */
export function getInitialMessage(): string {
  return pickRandom(INITIAL_MESSAGES);
}

/**
 * Get a random mid-progress message
 */
export function getMidProgressMessage(): string {
  return pickRandom(MID_PROGRESS_MESSAGES);
}

/**
 * Callbacks for progress messaging
 */
export interface ProgressCallbacks {
  /** Called to send a progress message to the user */
  sendMessage: (message: string) => Promise<void>;
  /** Called to send a reaction (optional) */
  sendReaction?: (emoji: string) => Promise<void>;
}

/**
 * Result of a progressive operation
 */
export interface ProgressResult<T> {
  /** The result from the processor */
  result: T;
  /** Whether progress messages were sent */
  progressSent: boolean;
  /** Number of progress messages sent */
  messageCount: number;
}

/**
 * Progressive responder that provides feedback during long operations
 */
export class ProgressiveResponder {
  private config: ProgressConfig;

  constructor(config?: Partial<ProgressConfig>) {
    this.config = { ...DEFAULT_PROGRESS_CONFIG, ...config };
    logger.debug('ProgressiveResponder initialized', { config: this.config });
  }

  /**
   * Execute a processor with progressive feedback
   */
  async executeWithProgress<T>(
    processor: () => Promise<T>,
    callbacks: ProgressCallbacks
  ): Promise<ProgressResult<T>> {
    let progressSent = false;
    let messageCount = 0;
    let processorComplete = false;

    const sendProgress = async (getMessage: () => string) => {
      if (processorComplete) return;
      try {
        await callbacks.sendMessage(getMessage());
        progressSent = true;
        messageCount++;
      } catch (error) {
        logger.warn('Failed to send progress message', { error: String(error) });
      }
    };

    // Set up initial delay timer - first send reaction, then progress message
    const initialTimer = setTimeout(async () => {
      // Send reaction first (quick acknowledgment)
      if (callbacks.sendReaction && !processorComplete) {
        try {
          await callbacks.sendReaction('🐕');
        } catch (error) {
          logger.warn('Failed to send reaction', { error: String(error) });
        }
      }
      // Then send progress message
      await sendProgress(getInitialMessage);
    }, this.config.initialDelayMs);

    // Set up periodic progress updates
    const progressInterval = setInterval(async () => {
      await sendProgress(getMidProgressMessage);
    }, this.config.progressIntervalMs);

    try {
      const result = await Promise.race([
        processor(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Operation timed out')), this.config.maxWaitMs)
        ),
      ]);

      processorComplete = true;
      return { result, progressSent, messageCount };
    } finally {
      clearTimeout(initialTimer);
      clearInterval(progressInterval);
    }
  }
}

/**
 * Factory function to create a ProgressiveResponder instance
 */
export function createProgressiveResponder(config?: Partial<ProgressConfig>): ProgressiveResponder {
  return new ProgressiveResponder(config);
}
