/**
 * Prompts Routes
 *
 * API endpoints for system prompt management.
 */

import { Router, Request, Response } from 'express';
import { createServiceLogger } from '@orientbot/core';
import { PromptService } from '../../services/promptService.js';
import { AuthenticatedRequest } from '../../auth.js';
import { PromptPlatform } from '../../types/index.js';

const logger = createServiceLogger('prompts-routes');

/**
 * Create Prompts routes
 */
export function createPromptsRoutes(
  promptService: PromptService,
  requireAuth: (req: Request, res: Response, next: () => void) => void
): Router {
  const router = Router();

  // List all system prompts
  router.get('/', requireAuth, async (req: Request, res: Response) => {
    try {
      const platform = req.query.platform as PromptPlatform | undefined;
      const prompts = await promptService.listPrompts(platform);
      res.json(prompts);
    } catch (error) {
      logger.error('Failed to list prompts', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to list prompts' });
    }
  });

  // Get default prompts for all platforms
  router.get('/defaults', requireAuth, async (_req: Request, res: Response) => {
    try {
      const defaults = await promptService.getAllDefaultPrompts();
      res.json(defaults);
    } catch (error) {
      logger.error('Failed to get default prompts', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get default prompts' });
    }
  });

  // Get embedded default prompts (for reference/reset)
  router.get('/embedded-defaults', requireAuth, (_req: Request, res: Response) => {
    res.json({
      whatsapp: promptService.getEmbeddedDefault('whatsapp'),
      slack: promptService.getEmbeddedDefault('slack'),
    });
  });

  // Update platform default prompt
  router.put(
    '/defaults/:platform',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const platform = req.params.platform as PromptPlatform;
        const { promptText } = req.body;

        if (!promptText || typeof promptText !== 'string') {
          res.status(400).json({ error: 'promptText is required' });
          return;
        }

        if (platform !== 'whatsapp' && platform !== 'slack') {
          res.status(400).json({ error: 'Invalid platform. Must be whatsapp or slack' });
          return;
        }

        const result = await promptService.setDefaultPrompt(platform, promptText);
        res.json(result);
      } catch (error) {
        logger.error('Failed to update default prompt', {
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ error: 'Failed to update default prompt' });
      }
    }
  );

  // Get prompt for a specific chat
  router.get('/:platform/:chatId', requireAuth, async (req: Request, res: Response) => {
    try {
      const platform = req.params.platform as PromptPlatform;
      const chatId = decodeURIComponent(req.params.chatId);

      if (platform !== 'whatsapp' && platform !== 'slack') {
        res.status(400).json({ error: 'Invalid platform. Must be whatsapp or slack' });
        return;
      }

      const promptText = await promptService.getPromptForChat(platform, chatId);
      const hasCustom = await promptService.hasCustomPrompt(platform, chatId);

      res.json({
        platform,
        chatId,
        promptText,
        isCustom: hasCustom,
      });
    } catch (error) {
      logger.error('Failed to get prompt', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get prompt' });
    }
  });

  // Set/update prompt for a specific chat
  router.put(
    '/:platform/:chatId',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const platform = req.params.platform as PromptPlatform;
        const chatId = decodeURIComponent(req.params.chatId);
        const { promptText } = req.body;

        if (!promptText || typeof promptText !== 'string') {
          res.status(400).json({ error: 'promptText is required' });
          return;
        }

        if (platform !== 'whatsapp' && platform !== 'slack') {
          res.status(400).json({ error: 'Invalid platform. Must be whatsapp or slack' });
          return;
        }

        const result = await promptService.setPrompt(platform, chatId, promptText);
        res.json(result);
      } catch (error) {
        logger.error('Failed to set prompt', {
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ error: 'Failed to set prompt' });
      }
    }
  );

  // Delete custom prompt (revert to default)
  router.delete(
    '/:platform/:chatId',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const platform = req.params.platform as PromptPlatform;
        const chatId = decodeURIComponent(req.params.chatId);

        if (platform !== 'whatsapp' && platform !== 'slack') {
          res.status(400).json({ error: 'Invalid platform. Must be whatsapp or slack' });
          return;
        }

        const deleted = await promptService.deletePrompt(platform, chatId);
        if (!deleted) {
          res.status(404).json({ error: 'Prompt not found or cannot be deleted' });
          return;
        }

        res.json({ success: true, message: 'Prompt deleted, will use default' });
      } catch (error) {
        logger.error('Failed to delete prompt', {
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ error: 'Failed to delete prompt' });
      }
    }
  );

  logger.info('Prompts routes initialized');

  return router;
}
