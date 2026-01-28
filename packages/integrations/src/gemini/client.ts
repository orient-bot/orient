/**
 * Gemini API Client
 *
 * Wrapper for Google's Gemini API using the @google/genai SDK.
 * Provides image generation capabilities via Nano Banana models.
 */

import { GoogleGenAI } from '@google/genai';
import { createServiceLogger, getEnvWithSecrets } from '@orientbot/core';
import type { GeminiConfig } from './types.js';

const logger = createServiceLogger('gemini-client');

let clientInstance: GoogleGenAI | null = null;
let currentConfig: GeminiConfig | null = null;

/**
 * Default model for image generation (Nano Banana)
 * gemini-2.0-flash-exp supports image generation
 */
export const DEFAULT_IMAGE_MODEL = 'gemini-2.0-flash-exp';

/**
 * Initialize the Gemini client
 */
export function initializeGeminiClient(config: GeminiConfig): GoogleGenAI {
  if (!config.apiKey) {
    throw new Error('Gemini API key is required');
  }

  clientInstance = new GoogleGenAI({ apiKey: config.apiKey });
  currentConfig = config;

  logger.info('Gemini client initialized', {
    model: config.imageModel || DEFAULT_IMAGE_MODEL,
  });

  return clientInstance;
}

/**
 * Get the current Gemini client instance
 */
export function getGeminiClient(): GoogleGenAI {
  if (!clientInstance) {
    const apiKey =
      getEnvWithSecrets('GOOGLE_GEMINI_API_KEY') || getEnvWithSecrets('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('Gemini client not initialized. Set GOOGLE_GEMINI_API_KEY first.');
    }
    initializeGeminiClient({ apiKey });
  }
  // After initializeGeminiClient, clientInstance is guaranteed to be non-null
  return clientInstance!;
}

/**
 * Get the configured image model
 */
export function getImageModel(): string {
  return currentConfig?.imageModel || DEFAULT_IMAGE_MODEL;
}

/**
 * Check if client is initialized
 */
export function isGeminiInitialized(): boolean {
  return clientInstance !== null;
}

/**
 * Reset the client (for testing)
 */
export function resetGeminiClient(): void {
  clientInstance = null;
  currentConfig = null;
  logger.debug('Gemini client reset');
}
