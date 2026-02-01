/**
 * Progressive Responder Service
 *
 * Provides timer-based progress updates during AI processing to make
 * bot conversations feel more alive and responsive. Instead of users
 * waiting in silence for a response, they receive acknowledgment and
 * progress messages.
 *
 * Exported via @orient-bot/bot-whatsapp package.
 */

import { createServiceLogger } from '@orient-bot/core';

const logger = createServiceLogger('progressive-responder');

/**
 * Configuration for progress timing
 */
export interface ProgressConfig {
  /** Delay before sending initial acknowledgment (ms) */
  initialDelayMs: number;
  /** Delay before sending mid-progress update (ms) */
  midProgressDelayMs: number;
  /** Whether progress updates are enabled */
  enabled: boolean;
  /** Emoji to use for initial reaction (default: 🐕 - Ori the dog) */
  reactionEmoji: string;
  /** Whether to send an immediate reaction before processing */
  reactionEnabled: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_PROGRESS_CONFIG: ProgressConfig = {
  initialDelayMs: 2500, // 2.5 seconds before first message
  midProgressDelayMs: 12000, // 12 seconds before mid-progress
  enabled: true,
  reactionEmoji: '🐕', // Ori the dog mascot
  reactionEnabled: true,
};

/**
 * Load configuration from environment variables
 */
export function loadProgressConfig(): ProgressConfig {
  return {
    initialDelayMs: parseInt(process.env.PROGRESS_INITIAL_DELAY_MS || '2500', 10),
    midProgressDelayMs: parseInt(process.env.PROGRESS_MID_DELAY_MS || '12000', 10),
    enabled: process.env.PROGRESS_ENABLED !== 'false',
    reactionEmoji: process.env.PROGRESS_REACTION_EMOJI || '🐕',
    reactionEnabled: process.env.PROGRESS_REACTION_ENABLED !== 'false',
  };
}

/**
 * Message templates for progress updates
 */
const INITIAL_MESSAGES = [
  'Got it! Looking into that...',
  'On it! Give me a sec...',
  'Let me check that for you...',
  'Working on it...',
  'Looking into that now...',
  'One moment, checking...',
];

const MID_PROGRESS_MESSAGES = [
  'Still working on this - found some info, analyzing...',
  'Almost there! Just double-checking a few things...',
  "This one's a bit complex - hang tight...",
  'Still gathering the details...',
  'Getting close, just wrapping things up...',
  'Processing what I found...',
];

/**
 * Pick a random message from an array
 */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Get a random initial acknowledgment message
 */
export function getInitialMessage(): string {
  return pickRandom(INITIAL_MESSAGES);
}

/**
 * Get a random mid-progress update message
 */
export function getMidProgressMessage(): string {
  return pickRandom(MID_PROGRESS_MESSAGES);
}

/**
 * Callbacks for sending progress messages
 */
export interface ProgressCallbacks {
  /** Called to send a progress message to the user */
  onSendMessage: (text: string) => Promise<void>;
  /** Optional: Called to update/edit an existing message (for Slack) */
  onUpdateMessage?: (text: string) => Promise<void>;
  /** Optional: Called to react to the original message with an emoji (immediate acknowledgment) */
  onReact?: (emoji: string) => Promise<void>;
}

/**
 * Result of a progress-wrapped process
 */
export interface ProgressResult<T> {
  /** The result from the processor */
  result: T;
  /** Number of progress messages sent */
  progressMessagesSent: number;
  /** Total processing time in ms */
  processingTimeMs: number;
  /** Whether a reaction was sent */
  reactionSent: boolean;
}

/**
 * State for tracking progress during processing
 */
interface ProgressState {
  reactionSent: boolean;
  initialSent: boolean;
  midProgressSent: boolean;
  completed: boolean;
  startTime: number;
}

/**
 * Progressive Responder class
 *
 * Wraps async processing with timer-based progress updates.
 * Sends an initial acknowledgment after a short delay, and
 * a mid-progress update if processing takes longer.
 */
export class ProgressiveResponder {
  private config: ProgressConfig;

  constructor(config?: Partial<ProgressConfig>) {
    this.config = { ...DEFAULT_PROGRESS_CONFIG, ...config };
    logger.debug('ProgressiveResponder initialized', { config: this.config });
  }

  /**
   * Process an async operation with progress updates
   *
   * @param processor - The async function to execute
   * @param callbacks - Callbacks for sending progress messages
   * @returns The result of the processor along with progress stats
   */
  async processWithProgress<T>(
    processor: () => Promise<T>,
    callbacks: ProgressCallbacks
  ): Promise<ProgressResult<T>> {
    const state: ProgressState = {
      reactionSent: false,
      initialSent: false,
      midProgressSent: false,
      completed: false,
      startTime: Date.now(),
    };

    // If progress is disabled, just run the processor
    if (!this.config.enabled) {
      const result = await processor();
      return {
        result,
        progressMessagesSent: 0,
        processingTimeMs: Date.now() - state.startTime,
        reactionSent: false,
      };
    }

    // Send immediate reaction if enabled and callback provided
    if (this.config.reactionEnabled && callbacks.onReact) {
      try {
        logger.info('Sending immediate reaction', {
          emoji: this.config.reactionEmoji,
        });
        await callbacks.onReact(this.config.reactionEmoji);
        state.reactionSent = true;
        logger.info('Reaction sent successfully');
      } catch (error) {
        logger.error('Failed to send reaction', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Set up timers for progress messages
    const timers: NodeJS.Timeout[] = [];

    // Initial acknowledgment timer
    const initialTimer = setTimeout(async () => {
      if (state.completed) return;

      try {
        const message = getInitialMessage();
        logger.info('Triggering initial progress message', {
          message,
          elapsedMs: Date.now() - state.startTime,
        });
        await callbacks.onSendMessage(message);
        state.initialSent = true;
        logger.info('Initial progress message callback completed');
      } catch (error) {
        logger.error('Failed to send initial progress message', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.config.initialDelayMs);
    timers.push(initialTimer);

    // Mid-progress timer
    const midTimer = setTimeout(async () => {
      if (state.completed) return;

      try {
        const message = getMidProgressMessage();
        logger.info('Triggering mid-progress message', {
          message,
          elapsedMs: Date.now() - state.startTime,
          willUpdate: !!(callbacks.onUpdateMessage && state.initialSent),
        });
        // Use update if available (for Slack message editing), otherwise send new
        if (callbacks.onUpdateMessage && state.initialSent) {
          await callbacks.onUpdateMessage(message);
        } else {
          await callbacks.onSendMessage(message);
        }
        state.midProgressSent = true;
        logger.info('Mid-progress message callback completed');
      } catch (error) {
        logger.error('Failed to send mid-progress message', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.config.midProgressDelayMs);
    timers.push(midTimer);

    try {
      // Run the actual processor
      const result = await processor();
      state.completed = true;

      // Clear all timers
      timers.forEach((timer) => clearTimeout(timer));

      const progressMessagesSent = (state.initialSent ? 1 : 0) + (state.midProgressSent ? 1 : 0);

      const processingTimeMs = Date.now() - state.startTime;

      logger.info('Processing completed with progress updates', {
        progressMessagesSent,
        processingTimeMs,
        reactionSent: state.reactionSent,
        initialSent: state.initialSent,
        midProgressSent: state.midProgressSent,
      });

      return {
        result,
        progressMessagesSent,
        processingTimeMs,
        reactionSent: state.reactionSent,
      };
    } catch (error) {
      state.completed = true;
      timers.forEach((timer) => clearTimeout(timer));
      throw error;
    }
  }

  /**
   * Get the current configuration
   */
  getConfig(): ProgressConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ProgressConfig>): void {
    this.config = { ...this.config, ...config };
    logger.debug('ProgressiveResponder config updated', { config: this.config });
  }
}

/**
 * Create a new ProgressiveResponder with optional config
 */
export function createProgressiveResponder(config?: Partial<ProgressConfig>): ProgressiveResponder {
  // Merge with environment-loaded config
  const envConfig = loadProgressConfig();
  return new ProgressiveResponder({ ...envConfig, ...config });
}

/**
 * Singleton instance for shared use
 */
let defaultResponder: ProgressiveResponder | null = null;

/**
 * Get the default ProgressiveResponder instance
 */
export function getDefaultProgressiveResponder(): ProgressiveResponder {
  if (!defaultResponder) {
    defaultResponder = createProgressiveResponder();
  }
  return defaultResponder;
}
