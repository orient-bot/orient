import { useEffect, useState } from 'react';
import { ThemeToggle } from '../ThemeToggle';
import { getOpenCodeUrl, type OpenCodeConfig } from '../../api';

interface HeaderProps {
  username: string | null;
  onLogout: () => void;
  onRefresh: () => void;
  onOpenCapabilities: () => void;
  onOpenCommandPalette?: () => void;
}

export function Header({ username, onLogout, onRefresh, onOpenCapabilities, onOpenCommandPalette }: HeaderProps) {
  const [openCodeConfig, setOpenCodeConfig] = useState<OpenCodeConfig | null>(null);

  useEffect(() => {
    getOpenCodeUrl()
      .then(setOpenCodeConfig)
      .catch(() => setOpenCodeConfig(null));
  }, []);

  const handleOpenCode = () => {
    if (openCodeConfig?.url) {
      window.open(openCodeConfig.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <header className="h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 px-6 flex items-center justify-between ml-64">
      <div className="flex items-center gap-4">
        {/* Command Palette Trigger */}
        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            className="flex items-center gap-2 h-9 px-3 text-sm text-muted-foreground bg-secondary/50 hover:bg-secondary border border-border rounded-lg transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <span className="hidden sm:inline">Search commands...</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-background border border-border rounded">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* OpenCode Server */}
        {openCodeConfig?.available && (
          <button
            onClick={handleOpenCode}
            className="btn btn-ghost p-2 rounded-full"
            title="Open OpenCode Server"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </button>
        )}

        {/* Agent Capabilities */}
        <button
          onClick={onOpenCapabilities}
          className="btn btn-ghost p-2 rounded-full"
          title="Agent Capabilities"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
            <path d="m6.34 17.66-1.41 1.41" />
            <path d="m19.07 4.93-1.41 1.41" />
          </svg>
        </button>

        {/* WhatsApp QR link */}
        <a
          href="/qr/"
          className="btn btn-ghost p-2 rounded-full"
          title="WhatsApp QR Code"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="5" height="5" x="3" y="3" rx="1" />
            <rect width="5" height="5" x="16" y="3" rx="1" />
            <rect width="5" height="5" x="3" y="16" rx="1" />
            <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
            <path d="M21 21v.01" />
            <path d="M12 7v3a2 2 0 0 1-2 2H7" />
            <path d="M3 12h.01" />
            <path d="M12 3h.01" />
            <path d="M12 16v.01" />
            <path d="M16 12h1" />
            <path d="M21 12v.01" />
            <path d="M12 21v-1" />
          </svg>
        </a>

        <button
          onClick={onRefresh}
          className="btn btn-ghost p-2 rounded-full"
          title="Refresh"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
        </button>

        <ThemeToggle />

        <div className="h-6 w-px bg-border mx-2" />

        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-sm font-medium">{username}</span>
          </div>
          <button
            onClick={onLogout}
            className="btn btn-outline text-xs h-8"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
