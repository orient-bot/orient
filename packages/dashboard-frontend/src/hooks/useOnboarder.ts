import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getOnboarderSession,
  getOnboarderSuggestions,
  getOnboarderSessions,
  createNewOnboarderSession,
  activateOnboarderSession,
  resetOnboarderSession,
  sendOnboarderMessage,
  triggerRefresh,
  type OnboarderAction,
  type OnboarderSuggestion,
  type OnboarderSessionInfo,
} from '../api';

interface OnboarderMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  actions?: OnboarderAction[];
  isError?: boolean;
}

interface UseOnboarderOptions {
  route?: string | null;
}

const MESSAGES_KEY = 'onboarder_messages';
const SESSION_KEY = 'onboarder_session_id';

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function readStoredMessages(): OnboarderMessage[] {
  try {
    const raw = sessionStorage.getItem(MESSAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OnboarderMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readStoredSession(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

// Keywords in responses that indicate data was modified
const PROMPT_CHANGE_KEYWORDS = ['prompt updated', 'prompt set', 'successfully updated', 'successfully set custom prompt'];
const PERMISSION_CHANGE_KEYWORDS = ['permission updated', 'permission set', 'access granted', 'access revoked'];
const AGENT_CHANGE_KEYWORDS = ['agent updated', 'agent configured', 'agent enabled', 'agent disabled'];

function detectRefreshNeeded(content: string): { prompts: boolean; permissions: boolean; agents: boolean } {
  const lower = content.toLowerCase();
  return {
    prompts: PROMPT_CHANGE_KEYWORDS.some((kw) => lower.includes(kw)),
    permissions: PERMISSION_CHANGE_KEYWORDS.some((kw) => lower.includes(kw)),
    agents: AGENT_CHANGE_KEYWORDS.some((kw) => lower.includes(kw)),
  };
}

export function useOnboarder({ route }: UseOnboarderOptions = {}) {
  const [messages, setMessages] = useState<OnboarderMessage[]>(() => readStoredMessages());
  const [sessionId, setSessionId] = useState<string | null>(() => readStoredSession());
  const [sessionList, setSessionList] = useState<OnboarderSessionInfo[]>([]);
  const [suggestions, setSuggestions] = useState<OnboarderSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    sessionStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (sessionId) {
      sessionStorage.setItem(SESSION_KEY, sessionId);
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, [sessionId]);

  const refreshSuggestions = useCallback(async () => {
    try {
      const data = await getOnboarderSuggestions(route);
      setSuggestions(data.suggestions || []);
    } catch {
      setSuggestions([]);
    }
  }, [route]);

  const refreshSessionList = useCallback(async () => {
    try {
      const data = await getOnboarderSessions();
      setSessionList(data.sessions || []);
    } catch {
      setSessionList([]);
    }
  }, []);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionId) return sessionId;
    const session = await getOnboarderSession();
    setSessionId(session.sessionId);
    return session.sessionId;
  }, [sessionId]);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      const userMessage: OnboarderMessage = {
        id: createId(),
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        const session = await ensureSession();
        const response = await sendOnboarderMessage({
          message: trimmed,
          sessionId: session,
          route,
        });

        if (response.sessionId && response.sessionId !== sessionId) {
          setSessionId(response.sessionId);
        }

        const assistantMessage: OnboarderMessage = {
          id: createId(),
          role: 'assistant',
          content: response.message,
          actions: response.actions,
          timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // Detect if the response indicates data changes and trigger refreshes
        const refreshNeeded = detectRefreshNeeded(response.message);
        if (refreshNeeded.prompts) {
          console.log('[Onboarder] Detected prompt change, triggering refresh');
          triggerRefresh('prompts');
        }
        if (refreshNeeded.permissions) {
          console.log('[Onboarder] Detected permission change, triggering refresh');
          triggerRefresh('permissions');
        }
        if (refreshNeeded.agents) {
          console.log('[Onboarder] Detected agent change, triggering refresh');
          triggerRefresh('agents');
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Sorry, I ran into an issue. Please try again.';
        const assistantMessage: OnboarderMessage = {
          id: createId(),
          role: 'assistant',
          content: errorMessage,
          timestamp: new Date().toISOString(),
          isError: true,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        console.error('Onboarder send failed', error);
      } finally {
        setIsLoading(false);
      }
    },
    [ensureSession, route, sessionId]
  );

  const resetConversation = useCallback(async () => {
    try {
      await resetOnboarderSession();
    } catch {
      // Ignore network errors while resetting UI state
    }
    setSessionId(null);
    setMessages([]);
    await refreshSessionList();
  }, [refreshSessionList]);

  const startNewSession = useCallback(async () => {
    try {
      const result = await createNewOnboarderSession();
      setSessionId(result.sessionId);
      setMessages([]);
      await refreshSessionList();
      return result;
    } catch (error) {
      console.error('Failed to create new session', error);
      throw error;
    }
  }, [refreshSessionList]);

  const switchSession = useCallback(async (targetSessionId: string) => {
    try {
      await activateOnboarderSession(targetSessionId);
      setSessionId(targetSessionId);
      // Clear messages since we're switching sessions - the UI might want to fetch history
      setMessages([]);
      await refreshSessionList();
    } catch (error) {
      console.error('Failed to switch session', error);
      throw error;
    }
  }, [refreshSessionList]);

  const hasMessages = useMemo(() => messages.length > 0, [messages.length]);

  return {
    messages,
    suggestions,
    sessionList,
    isLoading,
    hasMessages,
    sendMessage,
    refreshSuggestions,
    refreshSessionList,
    resetConversation,
    startNewSession,
    switchSession,
    sessionId,
  };
}
