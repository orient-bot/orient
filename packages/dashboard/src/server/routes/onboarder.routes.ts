/**
 * Onboarder Routes
 *
 * API endpoints for the onboarding assistant (Ori) backed by OpenCode.
 * Sessions are persisted to the database for cross-restart persistence
 * and session history browsing.
 */

import { Router, Request, Response as ExpressResponse } from 'express';
import { createServiceLogger, DEFAULT_AGENT } from '@orientbot/core';
import { createSecretsService } from '@orientbot/database-services';
import type { AuthenticatedRequest } from '../../auth.js';
import type { MessageDatabase } from '@orientbot/database-services';

const logger = createServiceLogger('onboarder-routes');
const secretsService = createSecretsService();

const ACTION_REGEX = /\[action:([^|\]]+)\|([^\]]+)\]/g;

type OnboarderAction = {
  label: string;
  route: string;
  params?: Record<string, string>;
};

type OnboarderSuggestion = {
  id: string;
  label: string;
  prompt: string;
  actions?: OnboarderAction[];
};

function getOpenCodeUrl(): string | null {
  return process.env.OPENCODE_SERVER_URL || process.env.OPENCODE_URL || 'http://localhost:4099';
}

function parseActions(content: string): { cleanContent: string; actions: OnboarderAction[] } {
  const actions: OnboarderAction[] = [];
  const cleanContent = content
    .replace(ACTION_REGEX, (_match, label, url) => {
      const [route, queryString] = String(url).split('?');
      const params = queryString ? Object.fromEntries(new URLSearchParams(queryString)) : undefined;
      actions.push({ label: String(label).trim(), route, params });
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { cleanContent, actions };
}

type FetchResponse = globalThis.Response;

function getAuthHeaders(): Record<string, string> {
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  if (!password) return {};
  const credentials = Buffer.from(`opencode:${password}`).toString('base64');
  return { Authorization: `Basic ${credentials}` };
}

async function opencodeFetch(path: string, options?: RequestInit): Promise<FetchResponse> {
  const baseUrl = getOpenCodeUrl();
  if (!baseUrl) {
    throw new Error('AI service is not configured. Please check your OpenCode settings.');
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  try {
    return await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        ...options?.headers,
        ...getAuthHeaders(),
      },
      signal: controller.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Provide user-friendly error messages
    if (message.includes('abort') || message.includes('timeout')) {
      throw new Error('The AI service is taking too long to respond. Please try again.');
    }
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      throw new Error('Could not connect to the AI service. Please check if OpenCode is running.');
    }
    throw new Error(`AI service error: ${message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function createSession(title: string): Promise<string> {
  const response = await opencodeFetch('/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `OpenCode session create failed (${response.status}): ${error || 'Unknown error'}`
    );
  }

  const raw = await response.text();
  if (!raw) {
    throw new Error('OpenCode returned an empty response. The AI service may be unavailable.');
  }
  let session: { id?: string };
  try {
    session = JSON.parse(raw) as { id?: string };
  } catch {
    // Log the raw response for debugging (truncated)
    logger.error('Failed to parse OpenCode session response', {
      raw: raw.slice(0, 200),
      status: response.status,
    });
    throw new Error('OpenCode returned an invalid response. Please try again.');
  }
  if (!session.id) {
    throw new Error('OpenCode did not return a session ID. Please try again.');
  }
  return session.id;
}

async function sendMessage(
  sessionId: string,
  message: string,
  agent: string | undefined
): Promise<string> {
  const body: Record<string, unknown> = {
    parts: [{ type: 'text', text: message }],
  };
  if (agent) {
    body.agent = agent;
  }

  const response = await opencodeFetch(`/session/${sessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send message: ${error || `Server returned ${response.status}`}`);
  }

  const raw = await response.text();
  if (!raw) {
    throw new Error('The AI service returned an empty response. Please try again.');
  }
  let result: { parts?: Array<{ type: string; text?: string }> };
  try {
    result = JSON.parse(raw) as { parts?: Array<{ type: string; text?: string }> };
  } catch {
    // Log the raw response for debugging (truncated)
    logger.error('Failed to parse OpenCode message response', {
      raw: raw.slice(0, 200),
      status: response.status,
      sessionId,
    });
    throw new Error('The AI service returned an invalid response. Please try again.');
  }

  const textParts = (result.parts || [])
    .filter((part) => part.type === 'text' && part.text)
    .map((part) => part.text as string);

  if (textParts.length === 0) {
    return "I couldn't generate a response. Please try again or rephrase your question.";
  }

  return textParts.join('\n');
}

function getSuggestions(route?: string | null): OnboarderSuggestion[] {
  const normalized = route || '';

  if (normalized.startsWith('/whatsapp')) {
    return [
      {
        id: 'wa-setup',
        label: 'Set up WhatsApp',
        prompt: 'How do I set up WhatsApp and pair the QR code?',
        actions: [
          {
            label: 'Go to WhatsApp Setup',
            route: '/whatsapp/chats',
            params: {
              ori_scroll: '#workspace-whatsapp-setup',
              ori_highlight: '#workspace-whatsapp-setup',
            },
          },
        ],
      },
      {
        id: 'wa-permissions',
        label: 'Configure permissions',
        prompt: 'How do permissions work for WhatsApp chats?',
        actions: [{ label: 'Discover New Chats', route: '/whatsapp/discover' }],
      },
    ];
  }

  if (normalized.startsWith('/slack')) {
    return [
      {
        id: 'slack-setup',
        label: 'Connect Slack',
        prompt: 'How do I connect Slack and configure channels?',
        actions: [{ label: 'Open Slack', route: '/slack' }],
      },
    ];
  }

  if (normalized.startsWith('/integrations')) {
    return [
      {
        id: 'mcp-servers',
        label: 'MCP servers',
        prompt: 'What MCP servers are available and how do I connect them?',
        actions: [{ label: 'Open MCP Servers', route: '/integrations' }],
      },
    ];
  }

  return [
    {
      id: 'getting-started',
      label: 'Getting started',
      prompt: 'How do I get started with Orient?',
    },
    {
      id: 'agents',
      label: 'Agents and skills',
      prompt: 'How do agents and skills work?',
      actions: [{ label: 'Open Agents', route: '/agents' }],
    },
  ];
}

export function createOnboarderRoutes(
  db: MessageDatabase,
  requireAuth: (req: Request, res: ExpressResponse, next: () => void) => void
): Router {
  const router = Router();

  // Get or create active session
  router.get('/session', requireAuth, async (req: AuthenticatedRequest, res: ExpressResponse) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Check for existing active session in database
      const existing = await db.getActiveOnboarderSession(req.user.userId);
      if (existing) {
        await db.touchOnboarderSession(existing.sessionId);
        res.json({ sessionId: existing.sessionId, title: existing.title });
        return;
      }

      // Create new session in OpenCode
      const title = `Onboarder: ${req.user.username}`;
      const sessionId = await createSession(title);

      // Store in database
      await db.createOnboarderSession(req.user.userId, sessionId, title);

      res.json({ sessionId, title, isNew: true });
    } catch (error) {
      logger.error('Failed to create onboarder session', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to create session' });
    }
  });

  // List all sessions for current user
  router.get('/sessions', requireAuth, async (req: AuthenticatedRequest, res: ExpressResponse) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const sessions = await db.getOnboarderSessions(req.user.userId);
      res.json({ sessions });
    } catch (error) {
      logger.error('Failed to list onboarder sessions', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to list sessions' });
    }
  });

  // Switch to a different session
  router.post(
    '/sessions/:sessionId/activate',
    requireAuth,
    async (req: AuthenticatedRequest, res: ExpressResponse) => {
      try {
        if (!req.user) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }

        const { sessionId } = req.params;
        const success = await db.setActiveOnboarderSession(req.user.userId, sessionId);

        if (!success) {
          res.status(404).json({ error: 'Session not found' });
          return;
        }

        res.json({ success: true, sessionId });
      } catch (error) {
        logger.error('Failed to activate onboarder session', {
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ error: 'Failed to activate session' });
      }
    }
  );

  // Create a new session (start fresh)
  router.post(
    '/sessions/new',
    requireAuth,
    async (req: AuthenticatedRequest, res: ExpressResponse) => {
      try {
        if (!req.user) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }

        const title = `Onboarder: ${req.user.username} (${new Date().toLocaleDateString()})`;
        const sessionId = await createSession(title);

        await db.createOnboarderSession(req.user.userId, sessionId, title);

        res.json({ sessionId, title, isNew: true });
      } catch (error) {
        logger.error('Failed to create new onboarder session', {
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ error: 'Failed to create session' });
      }
    }
  );

  // Delete current active session and start fresh
  router.delete(
    '/session',
    requireAuth,
    async (req: AuthenticatedRequest, res: ExpressResponse) => {
      try {
        if (!req.user) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }

        // Clear all sessions for this user
        const cleared = await db.clearOnboarderSessions(req.user.userId);
        logger.info('Cleared onboarder sessions', { userId: req.user.userId, count: cleared });

        res.json({ success: true, cleared });
      } catch (error) {
        logger.error('Failed to delete onboarder session', {
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ error: 'Failed to reset session' });
      }
    }
  );

  router.get('/suggestions', requireAuth, async (req: Request, res: ExpressResponse) => {
    try {
      const route = typeof req.query.route === 'string' ? req.query.route : null;
      const suggestions = getSuggestions(route);
      res.json({ suggestions });
    } catch (error) {
      logger.error('Failed to get onboarder suggestions', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get suggestions' });
    }
  });

  router.post('/chat', requireAuth, async (req: AuthenticatedRequest, res: ExpressResponse) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { message, agent, sessionId: providedSessionId, route } = req.body || {};
      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'message is required' });
        return;
      }

      const contextPrefix = route ? `Context: ${route}\n\n` : '';
      const prompt = `${contextPrefix}${message}`;
      const agentId = typeof agent === 'string' ? agent : DEFAULT_AGENT;

      let sessionId = providedSessionId as string | undefined;
      if (!sessionId) {
        const existing = await db.getActiveOnboarderSession(req.user.userId);
        sessionId = existing?.sessionId;
      }

      if (!sessionId) {
        const title = `Onboarder: ${req.user.username}`;
        sessionId = await createSession(title);
        await db.createOnboarderSession(req.user.userId, sessionId, title);
      }

      let responseText: string;
      try {
        responseText = await sendMessage(sessionId, prompt, agentId);
        // Touch session to update last activity
        await db.touchOnboarderSession(sessionId);
      } catch (error) {
        logger.warn('OpenCode message failed, retrying with new session', {
          error: error instanceof Error ? error.message : String(error),
        });
        const title = `Onboarder: ${req.user.username}`;
        sessionId = await createSession(title);
        await db.createOnboarderSession(req.user.userId, sessionId, title);
        responseText = await sendMessage(sessionId, prompt, agentId);
      }

      const { cleanContent, actions } = parseActions(responseText);
      res.json({
        sessionId,
        message: cleanContent,
        actions,
      });
    } catch (error) {
      logger.error('Failed to process onboarder chat', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to process chat message',
      });
    }
  });

  // Check for pending onboarding notifications
  router.get('/pending', requireAuth, async (req: AuthenticatedRequest, res: ExpressResponse) => {
    try {
      const slackOnboarded = await db.checkOnboardingCompleted('slack');

      // Check if Slack configured but onboarding not yet acknowledged in dashboard
      const slackConfigured = await hasSlackSecrets();

      if (slackConfigured && !slackOnboarded) {
        res.json({ hasPending: true, type: 'slack' });
        return;
      }

      res.json({ hasPending: false });
    } catch (error) {
      logger.error('Failed to check pending onboarding', { error: String(error) });
      res.status(500).json({ error: 'Failed to check onboarding status' });
    }
  });

  return router;
}

async function hasSlackSecrets(): Promise<boolean> {
  try {
    const secrets = await secretsService.listSecrets();
    const slackKeys = ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'SLACK_APP_TOKEN'];
    return slackKeys.every((key) => secrets.some((s) => s.key === key));
  } catch (error) {
    logger.error('Failed to check Slack secrets', { error: String(error) });
    return false;
  }
}
