/**
 * API Key Detector Service
 *
 * Detects whether any AI provider API keys are configured.
 * Used by the ModelSelector to determine if free models should be used.
 */

import { createServiceLogger } from '@orient-bot/core';

const logger = createServiceLogger('api-key-detector');

// Known AI provider API key names
const AI_PROVIDER_KEYS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_GEMINI_API_KEY',
  'XAI_API_KEY', // Grok
];

/**
 * Result of API key detection
 */
export interface ApiKeyDetectionResult {
  /** Whether any paid provider API key is configured */
  hasAnyApiKeys: boolean;
  /** List of configured providers */
  configuredProviders: string[];
  /** Whether detection was successful (false if database error) */
  detectionSuccessful: boolean;
}

/**
 * Check if any AI provider API keys are configured
 * Checks both environment variables and database secrets
 */
export async function detectApiKeys(): Promise<ApiKeyDetectionResult> {
  const configuredProviders: string[] = [];

  try {
    // First check environment variables
    for (const keyName of AI_PROVIDER_KEYS) {
      const envValue = process.env[keyName];
      if (envValue && envValue.trim().length > 0) {
        const provider = getProviderFromKeyName(keyName);
        if (!configuredProviders.includes(provider)) {
          configuredProviders.push(provider);
        }
      }
    }

    // Then check database secrets (if available)
    try {
      // Dynamic import to avoid circular dependencies
      const { SecretsService } = await import('@orient-bot/database-services');
      const secretsService = new SecretsService();

      for (const keyName of AI_PROVIDER_KEYS) {
        // Skip if already found in env
        const provider = getProviderFromKeyName(keyName);
        if (configuredProviders.includes(provider)) {
          continue;
        }

        const secretValue = await secretsService.getSecret(keyName);
        if (secretValue && secretValue.trim().length > 0) {
          configuredProviders.push(provider);
        }
      }
    } catch (dbError) {
      // Database might not be available yet during startup
      logger.debug('Could not check database secrets, using env vars only', {
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
    }

    logger.debug('API key detection complete', {
      hasAnyApiKeys: configuredProviders.length > 0,
      configuredProviders,
    });

    return {
      hasAnyApiKeys: configuredProviders.length > 0,
      configuredProviders,
      detectionSuccessful: true,
    };
  } catch (error) {
    logger.warn('API key detection failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      hasAnyApiKeys: false,
      configuredProviders: [],
      detectionSuccessful: false,
    };
  }
}

/**
 * Get provider name from API key name
 */
function getProviderFromKeyName(keyName: string): string {
  switch (keyName) {
    case 'OPENAI_API_KEY':
      return 'openai';
    case 'ANTHROPIC_API_KEY':
      return 'anthropic';
    case 'GOOGLE_GEMINI_API_KEY':
      return 'google';
    case 'XAI_API_KEY':
      return 'xai';
    default:
      return 'unknown';
  }
}

// Cached result with expiration
let cachedResult: ApiKeyDetectionResult | null = null;
let cacheExpiresAt: number = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

/**
 * Get cached API key detection result
 * Uses a short cache to avoid repeated database queries
 */
export async function getCachedApiKeyStatus(): Promise<ApiKeyDetectionResult> {
  const now = Date.now();

  if (cachedResult && now < cacheExpiresAt) {
    return cachedResult;
  }

  cachedResult = await detectApiKeys();
  cacheExpiresAt = now + CACHE_TTL_MS;

  return cachedResult;
}

/**
 * Clear the API key detection cache
 * Call this when API keys are added/removed
 */
export function clearApiKeyCache(): void {
  cachedResult = null;
  cacheExpiresAt = 0;
  logger.debug('API key detection cache cleared');
}
