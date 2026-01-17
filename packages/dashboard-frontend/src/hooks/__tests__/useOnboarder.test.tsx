import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnboarder } from '../useOnboarder';

vi.mock('../../api', () => ({
  getOnboarderSession: vi.fn().mockResolvedValue({ sessionId: 'session-1' }),
  resetOnboarderSession: vi.fn().mockResolvedValue({ success: true, cleared: 1 }),
  getOnboarderSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
  getOnboarderSessions: vi.fn().mockResolvedValue({ sessions: [] }),
  createNewOnboarderSession: vi.fn().mockResolvedValue({ sessionId: 'session-2', title: 'New', isNew: true }),
  activateOnboarderSession: vi.fn().mockResolvedValue({ success: true, sessionId: 'session-1' }),
  triggerRefresh: vi.fn(),
  sendOnboarderMessage: vi.fn().mockResolvedValue({
    sessionId: 'session-1',
    message: 'Hello from Ori',
    actions: [{ label: 'Open Agents', route: '/agents' }],
  }),
}));

describe('useOnboarder', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('sends a message and stores the response', async () => {
    const { result } = renderHook(() => useOnboarder());

    await act(async () => {
      await result.current.sendMessage('Hi Ori');
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      content: 'Hi Ori',
    });
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Hello from Ori',
    });
    expect(result.current.messages[1].actions).toEqual([
      { label: 'Open Agents', route: '/agents' },
    ]);
  });

  it('fetches suggestions for a route', async () => {
    const { result } = renderHook(() => useOnboarder({ route: '/whatsapp/chats' }));

    await act(async () => {
      await result.current.refreshSuggestions();
    });

    const { getOnboarderSuggestions } = await import('../../api');
    expect(getOnboarderSuggestions).toHaveBeenCalledWith('/whatsapp/chats');
  });
});
