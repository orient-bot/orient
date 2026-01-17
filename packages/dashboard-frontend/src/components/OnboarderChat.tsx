import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Markdown from 'react-markdown';
import { useOnboarder } from '../hooks/useOnboarder';
import { assetUrl } from '../api';

interface OnboarderChatProps {
  isOpen: boolean;
  onClose: () => void;
}

function buildActionUrl(route: string, params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) {
    return route;
  }
  const query = new URLSearchParams(params).toString();
  return `${route}?${query}`;
}

function formatSessionDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return 'Today';
  } else if (days === 1) {
    return 'Yesterday';
  } else if (days < 7) {
    return `${days} days ago`;
  }
  return date.toLocaleDateString();
}

export default function OnboarderChat({ isOpen, onClose }: OnboarderChatProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    messages,
    suggestions,
    sessionList,
    isLoading,
    sendMessage,
    refreshSuggestions,
    refreshSessionList,
    resetConversation,
    startNewSession,
    switchSession,
    sessionId,
  } = useOnboarder({ route: location.pathname });
  const [input, setInput] = useState('');
  const [showSessionList, setShowSessionList] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      refreshSuggestions();
      refreshSessionList();
    }
  }, [isOpen, refreshSuggestions, refreshSessionList]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, isLoading]);

  const suggestionsToShow = useMemo(() => {
    if (messages.length > 0) return [];
    return suggestions;
  }, [messages.length, suggestions]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput('');
    await sendMessage(trimmed);
  };

  const handleAction = (route: string, params?: Record<string, string>) => {
    const url = buildActionUrl(route, params);
    if (url.startsWith('http') || url.startsWith('/qr/')) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate(url);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleNewSession = async () => {
    try {
      await startNewSession();
      setShowSessionList(false);
    } catch {
      // Error already logged in hook
    }
  };

  const handleSwitchSession = async (targetSessionId: string) => {
    try {
      await switchSession(targetSessionId);
      setShowSessionList(false);
    } catch {
      // Error already logged in hook
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[420px] max-w-[calc(100vw-2rem)] max-h-[80vh] rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/80">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
            <img
              src={assetUrl('/mascot/variations/agents.png')}
              alt="Ori"
              className="w-7 h-7 object-contain"
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Ori Onboarding</p>
            <p className="text-xs text-muted-foreground">Ask me anything about setup</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Session selector */}
          <div className="relative">
            <button
              type="button"
              className="btn btn-ghost h-8 w-8 p-0"
              onClick={() => setShowSessionList(!showSessionList)}
              aria-label="View session history"
              title="Session history"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 8v4l3 3" />
                <circle cx="12" cy="12" r="10" />
              </svg>
            </button>

            {showSessionList && (
              <div className="absolute right-0 top-10 w-64 bg-card border border-border rounded-lg shadow-lg z-50">
                <div className="p-2 border-b border-border">
                  <button
                    type="button"
                    className="w-full btn btn-primary h-8 text-xs flex items-center justify-center gap-1"
                    onClick={handleNewSession}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                    New Session
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {sessionList.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground text-center">
                      No previous sessions
                    </div>
                  ) : (
                    sessionList.map((session) => (
                      <button
                        key={session.sessionId}
                        type="button"
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 border-b border-border last:border-b-0 ${
                          session.sessionId === sessionId ? 'bg-primary/10' : ''
                        }`}
                        onClick={() => handleSwitchSession(session.sessionId)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate flex-1 text-foreground">
                            {session.title}
                          </span>
                          {session.sessionId === sessionId && (
                            <span className="ml-2 text-primary text-[10px] font-semibold">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground mt-0.5">
                          {formatSessionDate(session.updatedAt)}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn btn-ghost h-8 w-8 p-0"
            onClick={onClose}
            aria-label="Close onboarder chat"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.length === 0 && suggestionsToShow.length === 0 && (
          <div className="text-xs text-muted-foreground">
            Ask Ori about setup, integrations, or permissions.
          </div>
        )}

        {suggestionsToShow.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Suggested</p>
            <div className="flex flex-wrap gap-2">
              {suggestionsToShow.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  className="btn btn-secondary h-8 text-xs"
                  onClick={() => sendMessage(suggestion.prompt)}
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground whitespace-pre-wrap'
                  : 'bg-muted text-foreground'
              }`}
            >
              {message.role === 'user' ? (
                message.content
              ) : (
                <Markdown
                  components={{
                    h1: ({ children }) => (
                      <h1 className="text-base font-bold mb-2 mt-1">{children}</h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-sm font-bold mb-2 mt-1">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-sm font-semibold mb-1 mt-1">{children}</h3>
                    ),
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                    ul: ({ children }) => (
                      <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>
                    ),
                    li: ({ children }) => <li className="ml-1">{children}</li>,
                    code: ({ children, className }) => {
                      // Check if it's a code block (has language class) or inline code
                      const isBlock = className?.includes('language-');
                      if (isBlock) {
                        return (
                          <code className="block bg-background/50 p-2 rounded text-xs font-mono my-2 overflow-x-auto whitespace-pre-wrap">
                            {children}
                          </code>
                        );
                      }
                      return (
                        <code className="bg-background/50 px-1 py-0.5 rounded text-xs font-mono">
                          {children}
                        </code>
                      );
                    },
                    pre: ({ children }) => <pre className="my-2">{children}</pre>,
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-2 border-primary/50 pl-3 my-2 italic text-muted-foreground">
                        {children}
                      </blockquote>
                    ),
                    hr: () => <hr className="my-3 border-border" />,
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        className="text-primary underline hover:no-underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {children}
                      </a>
                    ),
                  }}
                >
                  {message.content}
                </Markdown>
              )}
              {message.actions && message.actions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.actions.map((action, index) => (
                    <button
                      key={`${message.id}-action-${index}`}
                      type="button"
                      className="btn btn-outline h-7 text-xs border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                      onClick={() => handleAction(action.route, action.params)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-3 py-2 text-sm bg-muted text-muted-foreground">
              Ori is typing...
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border p-3 bg-background/80 space-y-2">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Ori about setup, integrations, or permissions..."
          className="w-full h-20 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="flex items-center justify-between">
          <button type="button" className="btn btn-ghost h-8 text-xs" onClick={resetConversation}>
            Reset chat
          </button>
          <button
            type="button"
            className="btn btn-primary h-8 text-xs"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
