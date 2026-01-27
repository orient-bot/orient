/**
 * Providers Routes
 *
 * API endpoints for configuring AI provider credentials and defaults.
 */

import { Router, Request, Response } from 'express';
import { createServiceLogger, invalidateConfigCache, setSecretOverrides } from '@orientbot/core';
import { createSecretsService } from '@orientbot/database-services';

const logger = createServiceLogger('providers-routes');

type ProviderId = 'openai' | 'anthropic' | 'google' | 'opencode_zen';
type ProviderDefaults = {
  transcription: ProviderId;
  vision: ProviderId;
  imageGeneration: ProviderId;
  agentChat: ProviderId;
};

const PROVIDER_SECRETS: Record<ProviderId, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GEMINI_API_KEY',
  opencode_zen: 'OPENCODE_ZEN_API_KEY',
};

const PROVIDER_DESCRIPTIONS: Record<ProviderId, string> = {
  openai: 'OpenAI API key for transcription, vision, and image generation',
  anthropic: 'Anthropic API key for vision models',
  google: 'Google Gemini API key for image generation',
  opencode_zen: 'OpenCode Zen API key for agent chat',
};

const DEFAULTS_SECRET_KEY = 'AI_PROVIDER_DEFAULTS';
const DEFAULTS_FALLBACK: ProviderDefaults = {
  transcription: 'openai',
  vision: 'anthropic',
  imageGeneration: 'openai',
  agentChat: 'opencode_zen',
};

const VALID_DEFAULTS: Record<keyof ProviderDefaults, ProviderId[]> = {
  transcription: ['openai'],
  vision: ['anthropic', 'openai'],
  imageGeneration: ['openai', 'google'],
  agentChat: ['opencode_zen'],
};

function isProviderId(value: string): value is ProviderId {
  return (
    value === 'openai' || value === 'anthropic' || value === 'google' || value === 'opencode_zen'
  );
}

function normalizeDefaults(input?: Partial<ProviderDefaults>): ProviderDefaults {
  return {
    transcription: VALID_DEFAULTS.transcription.includes(input?.transcription as ProviderId)
      ? (input?.transcription as ProviderId)
      : DEFAULTS_FALLBACK.transcription,
    vision: VALID_DEFAULTS.vision.includes(input?.vision as ProviderId)
      ? (input?.vision as ProviderId)
      : DEFAULTS_FALLBACK.vision,
    imageGeneration: VALID_DEFAULTS.imageGeneration.includes(input?.imageGeneration as ProviderId)
      ? (input?.imageGeneration as ProviderId)
      : DEFAULTS_FALLBACK.imageGeneration,
    agentChat: VALID_DEFAULTS.agentChat.includes(input?.agentChat as ProviderId)
      ? (input?.agentChat as ProviderId)
      : DEFAULTS_FALLBACK.agentChat,
  };
}

export function createProvidersRoutes(
  requireAuth: (req: Request, res: Response, next: () => void) => void
): Router {
  const router = Router();
  const secretsService = createSecretsService();

  router.get('/', requireAuth, async (_req: Request, res: Response) => {
    try {
      const secrets = await secretsService.listSecrets();
      const providers = (Object.keys(PROVIDER_SECRETS) as ProviderId[]).map((providerId) => {
        const secretKey = PROVIDER_SECRETS[providerId];
        const secret = secrets.find((item) => item.key === secretKey);
        return {
          id: providerId,
          name:
            providerId === 'openai'
              ? 'OpenAI'
              : providerId === 'anthropic'
                ? 'Anthropic'
                : providerId === 'google'
                  ? 'Google Gemini'
                  : 'OpenCode Zen',
          configured: Boolean(secret),
          updatedAt: secret?.updatedAt ?? null,
        };
      });
      res.json({ providers });
    } catch (error) {
      logger.error('Failed to list providers', { error: String(error) });
      res.status(500).json({ error: 'Failed to list providers' });
    }
  });

  router.put('/:provider/key', requireAuth, async (req: Request, res: Response) => {
    try {
      const { provider } = req.params;
      const { value, changedBy } = req.body || {};

      if (!isProviderId(provider)) {
        return res.status(400).json({ error: 'Unknown provider' });
      }
      if (!value || typeof value !== 'string') {
        return res.status(400).json({ error: 'API key value is required' });
      }

      const secretKey = PROVIDER_SECRETS[provider];
      await secretsService.setSecret(secretKey, value, {
        category: 'ai-providers',
        description: PROVIDER_DESCRIPTIONS[provider],
        changedBy: typeof changedBy === 'string' ? changedBy : undefined,
      });

      setSecretOverrides({ [secretKey]: value });
      invalidateConfigCache();

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to set provider key', { error: String(error) });
      res.status(500).json({ error: 'Failed to set provider key' });
    }
  });

  router.get('/defaults', requireAuth, async (_req: Request, res: Response) => {
    try {
      const defaultsRaw = await secretsService.getSecret(DEFAULTS_SECRET_KEY);
      let parsed: Partial<ProviderDefaults> | undefined;
      if (defaultsRaw) {
        try {
          parsed = JSON.parse(defaultsRaw) as Partial<ProviderDefaults>;
        } catch (parseError) {
          logger.warn('Failed to parse provider defaults', { error: String(parseError) });
        }
      }
      res.json({ defaults: normalizeDefaults(parsed) });
    } catch (error) {
      logger.error('Failed to get provider defaults', { error: String(error) });
      res.status(500).json({ error: 'Failed to get provider defaults' });
    }
  });

  router.put('/defaults', requireAuth, async (req: Request, res: Response) => {
    try {
      const defaults = normalizeDefaults(req.body);
      const payload = JSON.stringify(defaults);

      await secretsService.setSecret(DEFAULTS_SECRET_KEY, payload, {
        category: 'ai-providers',
        description: 'Default providers for AI capabilities',
      });

      setSecretOverrides({ [DEFAULTS_SECRET_KEY]: payload });
      invalidateConfigCache();

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to set provider defaults', { error: String(error) });
      res.status(500).json({ error: 'Failed to set provider defaults' });
    }
  });

  return router;
}
