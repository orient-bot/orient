import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ROUTES } from '../../routes';
import { getOpenCodeUrl, assetUrl, type OpenCodeConfig } from '../../api';

type GlobalView =
  | 'billing'
  | 'integrations'
  | 'automation'
  | 'prompts'
  | 'agents'
  | 'apps'
  | 'monitoring'
  | 'settings';

interface SidebarProps {
  slackAvailable: boolean;
  needsWhatsAppPairing?: boolean;
  needsSlackSetup?: boolean;
  stats: {
    whatsapp?: { chatsWithoutPermissions: number };
    slack?: { channelsWithoutPermissions: number };
    scheduler?: { enabledJobs: number };
    webhook?: { enabledWebhooks: number };
  };
}

export function Sidebar({
  slackAvailable,
  needsWhatsAppPairing,
  needsSlackSetup,
  stats,
}: SidebarProps) {
  const location = useLocation();
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

  const isServiceActive = (service: 'whatsapp' | 'slack') => {
    if (service === 'whatsapp') {
      return location.pathname.startsWith('/whatsapp') || location.pathname === '/';
    }
    return location.pathname.startsWith('/slack');
  };

  const isGlobalActive = (view: GlobalView) => {
    return location.pathname.startsWith(`/${view}`);
  };

  return (
    <aside className="w-64 border-r border-border bg-card flex flex-col h-screen fixed left-0 top-0 z-40 transition-transform">
      <div className="h-16 flex items-center px-6 border-b border-border">
        <div className="flex items-center gap-3">
          {/* Ori Mascot - Brand Logo */}
          <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-600">
            <img src={assetUrl('/mascot/base.png')} alt="Ori" className="w-9 h-9 object-contain" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-lg leading-tight">Orient</span>
            <span className="text-[10px] text-muted-foreground leading-tight">AI Workspace</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {/* Services */}
        <div>
          <h3 className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Services
          </h3>
          <div className="space-y-1">
            <Link
              to={ROUTES.WHATSAPP_CHATS}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isServiceActive('whatsapp')
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.58 20 4 16.42 4 12C4 7.58 7.58 4 12 4C16.42 4 20 7.58 20 12C20 16.42 16.42 20 12 20Z" />
                  <path d="M12 6C8.69 6 6 8.69 6 12C6 15.31 8.69 18 12 18C15.31 18 18 15.31 18 12C18 8.69 15.31 6 12 6ZM12 16C9.79 16 8 14.21 8 12C8 9.79 9.79 8 12 8C14.21 8 16 9.79 16 12C16 14.21 14.21 16 12 16Z" />
                </svg>
                WhatsApp
                {needsWhatsAppPairing && (
                  <span
                    className="w-2 h-2 rounded-full bg-amber-500"
                    aria-label="WhatsApp setup required"
                  />
                )}
              </div>
            </Link>

            <Link
              to={ROUTES.SLACK}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isServiceActive('slack')
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
                </svg>
                Slack
                {needsSlackSetup && (
                  <span
                    className="w-2 h-2 rounded-full bg-amber-500"
                    aria-label="Slack setup required"
                  />
                )}
              </div>
              {stats.slack && stats.slack.channelsWithoutPermissions > 0 && (
                <span className="flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full">
                  {stats.slack.channelsWithoutPermissions}
                </span>
              )}
              {!slackAvailable && (
                <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-muted text-muted-foreground border border-border">
                  Setup
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Management */}
        <div>
          <h3 className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Management
          </h3>
          <div className="space-y-1">
            <Link
              to={ROUTES.SETTINGS}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isGlobalActive('settings')
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
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
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Settings
            </Link>

            <Link
              to={ROUTES.AUTOMATION}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isGlobalActive('automation')
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <div className="flex items-center gap-2">
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
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v3" />
                  <path d="M12 19v3" />
                  <path d="M4.22 4.22l2.12 2.12" />
                  <path d="M17.66 17.66l2.12 2.12" />
                  <path d="M2 12h3" />
                  <path d="M19 12h3" />
                  <path d="M4.22 19.78l2.12-2.12" />
                  <path d="M17.66 6.34l2.12-2.12" />
                </svg>
                Automation
              </div>
              {(stats.scheduler?.enabledJobs || 0) + (stats.webhook?.enabledWebhooks || 0) > 0 && (
                <span className="flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-secondary text-secondary-foreground rounded-full">
                  {(stats.scheduler?.enabledJobs || 0) + (stats.webhook?.enabledWebhooks || 0)}
                </span>
              )}
            </Link>

            <Link
              to={ROUTES.PROMPTS}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isGlobalActive('prompts')
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
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
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              System Prompts
            </Link>

            <Link
              to={ROUTES.AGENTS}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isGlobalActive('agents')
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
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
                <path d="M12 8V4H8" />
                <rect width="16" height="12" x="4" y="8" rx="2" />
                <path d="M2 14h2" />
                <path d="M20 14h2" />
                <path d="M15 13v2" />
                <path d="M9 13v2" />
              </svg>
              Agents
            </Link>

            <Link
              to={ROUTES.APPS}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isGlobalActive('apps')
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
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
                <rect width="7" height="7" x="3" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="14" rx="1" />
                <rect width="7" height="7" x="3" y="14" rx="1" />
              </svg>
              Mini-Apps
            </Link>

            <Link
              to={ROUTES.BILLING}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isGlobalActive('billing')
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
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
                <rect width="20" height="14" x="2" y="5" rx="2" />
                <line x1="2" x2="22" y1="10" y2="10" />
              </svg>
              Billing
            </Link>

            <Link
              to={ROUTES.MONITORING}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isGlobalActive('monitoring')
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
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
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              Monitoring
            </Link>
          </div>
        </div>

        {/* Tools */}
        {openCodeConfig?.available && (
          <div>
            <h3 className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Tools
            </h3>
            <div className="space-y-1">
              <button
                onClick={handleOpenCode}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors text-muted-foreground hover:bg-accent hover:text-accent-foreground"
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
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
                OpenCode
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="ml-auto opacity-50"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" x2="21" y1="14" y2="3" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
