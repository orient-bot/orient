import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { ROUTES, getRouteState } from './routes';
import {
  checkSetupRequired,
  getSetupStatus,
  getAuthToken,
  logout,
  getCurrentUser,
  getStats,
  getSlackStats,
  getSchedulerStats,
  getWebhookStats,
  assetUrl,
  type DashboardStats,
  type SlackDashboardStats,
  type SchedulerStats,
  type WebhookStats,
  type SetupStatus,
} from './api';
import LoginForm from './components/LoginForm';
import SetupForm from './components/SetupForm';
import SetupWizard from './components/SetupWizard';
import ChatList from './components/ChatList';
import SlackChannels from './components/SlackChannels';
import AuditLog from './components/AuditLog';
import BillingTab from './components/BillingTab';
import MCPServers from './components/MCPServers';
import AgentCapabilitiesSidebar from './components/AgentCapabilitiesSidebar';
import DualModeSettings from './components/DualModeSettings';
import SchedulesTab from './components/SchedulesTab';
import WebhooksTab from './components/WebhooksTab';
import SystemPrompts from './components/SystemPrompts';
import AgentsTab from './components/AgentsTab';
import AppsTab from './components/AppsTab';
import MonitoringTab from './components/MonitoringTab';
import WorkspaceSetupPanel from './components/WorkspaceSetupPanel';
import SecretsTab from './components/SecretsTab';
import ProvidersTab from './components/ProvidersTab';
import IntegrationCatalog from './components/IntegrationCatalog';
import OnboarderBubble from './components/OnboarderBubble';
import OnboarderChat from './components/OnboarderChat';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AppLayout } from './components/Layout/AppLayout';
import { CommandPalette, useCommandPalette, type Command } from './components/CommandPalette';
import { useOriActivation } from './hooks/useOriActivation';

interface CombinedStats {
  whatsapp: DashboardStats | null;
  slack: SlackDashboardStats | null;
  scheduler: SchedulerStats | null;
  webhook: WebhookStats | null;
}

interface WhatsAppQrStatus {
  needsQrScan: boolean;
  isConnected: boolean;
  qrCode?: string | null;
  qrDataUrl?: string | null;
  updatedAt?: string;
}

type SetupSkipState = {
  whatsapp: boolean;
  slack: boolean;
};

const SETUP_SKIP_KEY = 'dashboard_setup_skips';

function AppContent() {
  const [isLoading, setIsLoading] = useState(true);
  const [envSetupStatus, setEnvSetupStatus] = useState<SetupStatus | null>(null);
  const [needsEnvSetup, setNeedsEnvSetup] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [stats, setStats] = useState<CombinedStats>({
    whatsapp: null,
    slack: null,
    scheduler: null,
    webhook: null,
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [slackAvailable, setSlackAvailable] = useState(false);
  const [schedulerAvailable, setSchedulerAvailable] = useState(false);
  const [webhookAvailable, setWebhookAvailable] = useState(false);
  const [capabilitiesSidebarOpen, setCapabilitiesSidebarOpen] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppQrStatus | null>(null);
  const [whatsappStatusError, setWhatsappStatusError] = useState<string | null>(null);
  const [setupSkips, setSetupSkips] = useState<SetupSkipState>({ whatsapp: false, slack: false });
  const [servicesReady, setServicesReady] = useState(false);
  const [onboarderOpen, setOnboarderOpen] = useState(false);

  const { setTheme } = useTheme();
  const commandPalette = useCommandPalette();
  const navigate = useNavigate();
  const location = useLocation();
  useOriActivation();

  const { globalView, activeService, whatsappView, integrationsView, automationView } = useMemo(
    () => getRouteState(location.pathname),
    [location.pathname]
  );

  useEffect(() => {
    if (location.pathname.startsWith('/schedules')) {
      navigate(ROUTES.AUTOMATION_SCHEDULES, { replace: true });
      return;
    }
    if (location.pathname.startsWith('/webhooks')) {
      navigate(ROUTES.AUTOMATION_WEBHOOKS, { replace: true });
      return;
    }
    if (location.pathname === '/' || location.pathname === '') {
      navigate(ROUTES.WHATSAPP_CHATS, { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    async function checkAuth() {
      try {
        try {
          const setupStatus = await getSetupStatus();
          setEnvSetupStatus(setupStatus);
          if (setupStatus.needsSetup || setupStatus.setupOnly) {
            setNeedsEnvSetup(true);
            setIsLoading(false);
            return;
          }
          setNeedsEnvSetup(false);
        } catch (error) {
          console.warn('Setup status unavailable, continuing with auth check.', error);
          setEnvSetupStatus(null);
          setNeedsEnvSetup(false);
        }

        const { setupRequired } = await checkSetupRequired();
        if (setupRequired) {
          setNeedsSetup(true);
          setIsLoading(false);
          return;
        }

        const token = getAuthToken();
        if (token) {
          try {
            const { user } = await getCurrentUser();
            setIsAuthenticated(true);
            setUsername(user.username);
            await loadStats();
          } catch {
            setIsAuthenticated(false);
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setIsLoading(false);
      }
    }
    checkAuth();
  }, [refreshKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETUP_SKIP_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SetupSkipState>;
        setSetupSkips({
          whatsapp: Boolean(parsed.whatsapp),
          slack: Boolean(parsed.slack),
        });
      }
    } catch {
      setSetupSkips({ whatsapp: false, slack: false });
    }
  }, []);

  const updateSetupSkips = (next: SetupSkipState) => {
    setSetupSkips(next);
    localStorage.setItem(SETUP_SKIP_KEY, JSON.stringify(next));
  };

  const loadWhatsAppStatus = async (): Promise<void> => {
    try {
      const response = await fetch('/qr/status', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`QR status failed: ${response.status}`);
      }
      const data = (await response.json()) as WhatsAppQrStatus;
      setWhatsappStatus(data);
      setWhatsappStatusError(null);
    } catch (error) {
      console.warn('WhatsApp QR status unavailable', error);
      setWhatsappStatus(null);
      setWhatsappStatusError(
        error instanceof Error ? error.message : 'WhatsApp status unavailable'
      );
    }
  };

  const loadStats = async () => {
    try {
      const whatsappStatusPromise = loadWhatsAppStatus();

      // Load WhatsApp stats
      const whatsappStats = await getStats();

      // Try to load Slack stats (may fail if not configured)
      let slackStats: SlackDashboardStats | null = null;
      try {
        slackStats = await getSlackStats();
        setSlackAvailable(true);
      } catch {
        setSlackAvailable(false);
      }

      // Try to load Scheduler stats (may fail if not configured)
      let schedulerStats: SchedulerStats | null = null;
      try {
        schedulerStats = await getSchedulerStats();
        setSchedulerAvailable(true);
      } catch {
        setSchedulerAvailable(false);
      }

      // Try to load Webhook stats (may fail if not configured)
      let webhookStats: WebhookStats | null = null;
      try {
        webhookStats = await getWebhookStats();
        setWebhookAvailable(true);
      } catch {
        setWebhookAvailable(false);
      }

      setStats({
        whatsapp: whatsappStats,
        slack: slackStats,
        scheduler: schedulerStats,
        webhook: webhookStats,
      });
      await whatsappStatusPromise;
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setServicesReady(true);
    }
  };

  const handleLoginSuccess = async (user: string) => {
    setIsAuthenticated(true);
    setUsername(user);
    setNeedsSetup(false);
    await loadStats();
  };

  const handleLogout = () => {
    logout();
    setIsAuthenticated(false);
    setUsername(null);
    setStats({ whatsapp: null, slack: null, scheduler: null, webhook: null });
  };

  const handleRefresh = async () => {
    setRefreshKey((k) => k + 1);
    await loadStats();
  };

  const handleSetupWizardComplete = () => {
    setRefreshKey((k) => k + 1);
  };

  const scrollToWhatsAppSetup = (delay = 0) => {
    setTimeout(() => {
      const element = document.getElementById('workspace-whatsapp-setup');
      element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, delay);
  };

  const handleOpenWhatsAppSetup = () => {
    if (!location.pathname.startsWith('/whatsapp')) {
      navigate(ROUTES.WHATSAPP_CHATS);
      scrollToWhatsAppSetup(250);
      return;
    }
    scrollToWhatsAppSetup();
  };

  const handleOpenSlackSetup = () => {
    if (!location.pathname.startsWith('/slack')) {
      navigate(ROUTES.SLACK);
    }
  };

  const handleOpenIntegrations = () => {
    navigate(ROUTES.INTEGRATIONS_DUAL);
  };

  const handleOpenQrPage = () => {
    window.open('/qr/', '_blank', 'noopener,noreferrer');
  };
  // Command Palette commands
  const commands: Command[] = useMemo(() => {
    const cmds: Command[] = [];

    // Navigation commands
    cmds.push({
      id: 'nav-whatsapp',
      label: 'WhatsApp',
      description: 'View WhatsApp chats and permissions',
      category: 'navigation',
      keywords: ['chats', 'messages', 'wa'],
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.58 20 4 16.42 4 12C4 7.58 7.58 4 12 4C16.42 4 20 7.58 20 12C20 16.42 16.42 20 12 20Z" />
        </svg>
      ),
      action: () => navigate(ROUTES.WHATSAPP_CHATS),
    });

    cmds.push({
      id: 'nav-slack',
      label: 'Slack',
      description: slackAvailable
        ? 'View Slack channels and permissions'
        : 'Connect Slack to get started',
      category: 'navigation',
      keywords: ['channels', 'messages', 'setup'],
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" />
        </svg>
      ),
      action: () => navigate(ROUTES.SLACK),
    });

    cmds.push({
      id: 'nav-integrations',
      label: 'Integrations',
      description: 'MCP servers and dual mode settings',
      category: 'navigation',
      keywords: ['mcp', 'servers', 'oauth', 'connections'],
      icon: (
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
          <rect width="8" height="8" x="2" y="2" rx="2" />
          <path d="M14 2c.6 0 1.1.2 1.5.5L20 6.5c.3.4.5.9.5 1.5v9c0 1.1-.9 2-2 2h-6c-1.1 0-2-.9-2-2V3c0-1.1.9-2 2-2Z" />
        </svg>
      ),
      action: () => navigate(ROUTES.INTEGRATIONS),
    });

    if (schedulerAvailable) {
      cmds.push({
        id: 'nav-schedules',
        label: 'Schedules',
        description: 'Scheduled messages and jobs',
        category: 'navigation',
        keywords: ['cron', 'timer', 'recurring', 'jobs'],
        icon: (
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
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        ),
        action: () => navigate(ROUTES.AUTOMATION_SCHEDULES),
      });
    }

    if (webhookAvailable) {
      cmds.push({
        id: 'nav-webhooks',
        label: 'Webhooks',
        description: 'Incoming webhooks and events',
        category: 'navigation',
        keywords: ['github', 'events', 'notifications'],
        icon: (
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
            <path d="M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21" />
          </svg>
        ),
        action: () => navigate(ROUTES.AUTOMATION_WEBHOOKS),
      });
    }

    cmds.push({
      id: 'nav-prompts',
      label: 'System Prompts',
      description: 'Configure AI system prompts',
      category: 'navigation',
      keywords: ['ai', 'instructions', 'behavior'],
      icon: (
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
      ),
      action: () => navigate(ROUTES.PROMPTS),
    });

    cmds.push({
      id: 'nav-agents',
      label: 'Agents',
      description: 'Agent registry and configuration',
      category: 'navigation',
      keywords: ['bots', 'assistants', 'skills'],
      icon: (
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
      ),
      action: () => navigate(ROUTES.AGENTS),
    });

    cmds.push({
      id: 'nav-apps',
      label: 'Mini-Apps',
      description: 'View and manage mini applications',
      category: 'navigation',
      keywords: ['applications', 'forms', 'dashboards'],
      icon: (
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
      ),
      action: () => navigate(ROUTES.APPS),
    });

    cmds.push({
      id: 'nav-billing',
      label: 'Billing',
      description: 'View usage and costs',
      category: 'navigation',
      keywords: ['costs', 'usage', 'spending', 'money'],
      icon: (
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
      ),
      action: () => navigate(ROUTES.BILLING),
    });

    cmds.push({
      id: 'nav-monitoring',
      label: 'Monitoring',
      description: 'Server health and metrics',
      category: 'navigation',
      keywords: ['cpu', 'memory', 'disk', 'server', 'health', 'docker', 'containers'],
      icon: (
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
      ),
      action: () => navigate(ROUTES.MONITORING),
    });

    // Actions
    cmds.push({
      id: 'action-refresh',
      label: 'Refresh Data',
      description: 'Reload all workspace data',
      category: 'action',
      keywords: ['reload', 'update', 'sync'],
      shortcut: '⌘R',
      icon: (
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
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
          <path d="M16 21h5v-5" />
        </svg>
      ),
      action: handleRefresh,
    });

    cmds.push({
      id: 'action-capabilities',
      label: 'View Agent Capabilities',
      description: 'See available skills and tools',
      category: 'action',
      keywords: ['skills', 'tools', 'abilities'],
      icon: (
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
          <path d="M12 2v4" />
          <path d="m6.8 14-3.5 2" />
          <path d="m20.7 16-3.5-2" />
          <path d="M6.8 10 3.3 8" />
          <path d="m20.7 8-3.5 2" />
          <circle cx="12" cy="12" r="6" />
        </svg>
      ),
      action: () => setCapabilitiesSidebarOpen(true),
    });

    cmds.push({
      id: 'action-onboarder',
      label: 'Ask Ori',
      description: 'Open onboarding chat assistant',
      category: 'action',
      keywords: ['onboarding', 'help', 'setup', 'ori'],
      icon: (
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
          <path d="M21 15a4 4 0 0 1-4 4H7l-4 4V5a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
          <path d="M8 9h8" />
          <path d="M8 13h6" />
        </svg>
      ),
      action: () => setOnboarderOpen(true),
    });

    cmds.push({
      id: 'action-logout',
      label: 'Logout',
      description: 'Sign out of the workspace',
      category: 'action',
      keywords: ['sign out', 'exit'],
      icon: (
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
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" x2="9" y1="12" y2="12" />
        </svg>
      ),
      action: handleLogout,
    });

    // Settings
    cmds.push({
      id: 'settings-theme-light',
      label: 'Light Mode',
      description: 'Switch to light theme',
      category: 'settings',
      keywords: ['theme', 'appearance', 'bright'],
      icon: (
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
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
      ),
      action: () => setTheme('light'),
    });

    cmds.push({
      id: 'settings-theme-dark',
      label: 'Dark Mode',
      description: 'Switch to dark theme',
      category: 'settings',
      keywords: ['theme', 'appearance', 'night'],
      icon: (
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
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      ),
      action: () => setTheme('dark'),
    });

    cmds.push({
      id: 'settings-theme-system',
      label: 'System Theme',
      description: 'Use system theme preference',
      category: 'settings',
      keywords: ['theme', 'appearance', 'auto'],
      icon: (
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
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" x2="16" y1="21" y2="21" />
          <line x1="12" x2="12" y1="17" y2="21" />
        </svg>
      ),
      action: () => setTheme('system'),
    });

    return cmds;
  }, [
    slackAvailable,
    schedulerAvailable,
    webhookAvailable,
    handleRefresh,
    handleLogout,
    setTheme,
    navigate,
  ]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          {/* Ori Mascot - Loading/Thinking */}
          <div className="w-20 h-20 animate-pulse">
            <img
              src={assetUrl('/mascot/variations/loading.png')}
              alt="Ori is thinking..."
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 bg-primary rounded-full animate-bounce"
              style={{ animationDelay: '0ms' }}
            />
            <div
              className="w-2 h-2 bg-primary rounded-full animate-bounce"
              style={{ animationDelay: '150ms' }}
            />
            <div
              className="w-2 h-2 bg-primary rounded-full animate-bounce"
              style={{ animationDelay: '300ms' }}
            />
          </div>
          <p className="text-sm text-muted-foreground">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  if (needsEnvSetup && envSetupStatus) {
    return <SetupWizard status={envSetupStatus} onComplete={handleSetupWizardComplete} />;
  }

  if (needsSetup) {
    return <SetupForm onSuccess={handleLoginSuccess} />;
  }

  if (!isAuthenticated) {
    return <LoginForm onSuccess={handleLoginSuccess} />;
  }

  // Calculate combined stats for display - use optional chaining for nested properties
  const combinedTotals = {
    totalChats: (stats.whatsapp?.totalChats || 0) + (stats.slack?.totalChannels || 0),
    totalMessages: (stats.whatsapp?.totalMessages || 0) + (stats.slack?.totalMessages || 0),
    readWrite:
      (stats.whatsapp?.byPermission?.read_write || 0) +
      (stats.slack?.byPermission?.read_write || 0),
    unconfigured:
      (stats.whatsapp?.chatsWithoutPermissions || 0) +
      (stats.slack?.channelsWithoutPermissions || 0),
  };
  const needsWhatsAppPairing =
    servicesReady && (whatsappStatus ? !whatsappStatus.isConnected : true);
  const slackStats = stats.slack;
  const slackLooksUnconfigured =
    !!slackStats &&
    slackStats.totalChannels === 0 &&
    slackStats.totalMessages === 0 &&
    slackStats.channelsWithoutPermissions === 0 &&
    slackStats.byPermission.read_only === 0 &&
    slackStats.byPermission.read_write === 0 &&
    slackStats.byPermission.ignored === 0;
  const needsSlackSetup = servicesReady && (!slackAvailable || slackLooksUnconfigured);
  const needsWhatsAppPairingActive = needsWhatsAppPairing && !setupSkips.whatsapp;
  const needsSlackSetupActive = needsSlackSetup && !setupSkips.slack;
  const showSetupIndicators =
    servicesReady && (needsWhatsAppPairingActive || needsSlackSetupActive);
  const hasSkippedSetup = setupSkips.whatsapp || setupSkips.slack;

  return (
    <AppLayout
      username={username}
      slackAvailable={slackAvailable}
      needsWhatsAppPairing={needsWhatsAppPairingActive}
      needsSlackSetup={needsSlackSetupActive}
      stats={stats}
      onLogout={handleLogout}
      onRefresh={handleRefresh}
      onOpenCapabilities={() => setCapabilitiesSidebarOpen(true)}
      onOpenCommandPalette={commandPalette.open}
    >
      {showSetupIndicators && (
        <div className="card p-4 border-border bg-muted/40 mb-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
                <path d="M9.172 19.172a4 4 0 0 0 5.656 0l4.243-4.243a4 4 0 0 0 0-5.656l-4.243-4.243a4 4 0 0 0-5.656 0L4.929 9.273a4 4 0 0 0 0 5.656z" />
              </svg>
              Action required to finish setup
            </div>

            {needsWhatsAppPairingActive && (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">WhatsApp is not paired</p>
                    <p className="text-xs text-muted-foreground">
                      Open the WhatsApp setup view to scan the QR code and complete pairing.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-primary h-9"
                      onClick={handleOpenWhatsAppSetup}
                    >
                      Open WhatsApp setup
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary h-9"
                      onClick={handleOpenQrPage}
                    >
                      Open QR page
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost h-9"
                      onClick={() => updateSetupSkips({ ...setupSkips, whatsapp: true })}
                    >
                      Skip for now
                    </button>
                  </div>
                </div>
              </div>
            )}

            {needsSlackSetupActive && (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Slack is not configured</p>
                    <p className="text-xs text-muted-foreground">
                      Connect Slack to view channels and set permissions.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-primary h-9"
                      onClick={handleOpenSlackSetup}
                    >
                      Open Slack setup
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary h-9"
                      onClick={handleOpenIntegrations}
                    >
                      Integrations
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost h-9"
                      onClick={() => updateSetupSkips({ ...setupSkips, slack: true })}
                    >
                      Skip for now
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!showSetupIndicators && hasSkippedSetup && (
        <div className="card p-3 border-border bg-muted/30 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              Setup reminders are hidden for: {setupSkips.whatsapp ? 'WhatsApp' : ''}
              {setupSkips.whatsapp && setupSkips.slack ? ', ' : ''}
              {setupSkips.slack ? 'Slack' : ''}
            </span>
            <button
              type="button"
              className="btn btn-secondary h-8"
              onClick={() => updateSetupSkips({ whatsapp: false, slack: false })}
            >
              Show reminders
            </button>
          </div>
        </div>
      )}

      {!globalView && (
        <WorkspaceSetupPanel
          activeService={activeService}
          needsWhatsAppPairing={needsWhatsAppPairingActive}
          needsSlackSetup={needsSlackSetupActive}
          whatsappStatusError={whatsappStatusError}
          onOpenWhatsAppSetup={handleOpenWhatsAppSetup}
          onOpenQrPage={handleOpenQrPage}
          onRefreshWhatsAppStatus={handleRefresh}
          onSkipWhatsApp={() => updateSetupSkips({ ...setupSkips, whatsapp: true })}
          onOpenSlackSetup={handleOpenSlackSetup}
          onOpenIntegrations={handleOpenIntegrations}
          onSkipSlack={() => updateSetupSkips({ ...setupSkips, slack: true })}
        />
      )}

      {/* Combined Stats Cards - Visible on Service Pages Only */}
      {!globalView && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide mb-1 font-semibold">
              <span>Total Chats/Channels</span>
            </div>
            <p className="text-2xl font-bold font-mono tracking-tight">
              {combinedTotals.totalChats.toLocaleString()}
            </p>
            <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                {stats.whatsapp?.totalChats || 0}
              </span>
              {slackAvailable && (
                <span className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-500"></div>
                  {stats.slack?.totalChannels || 0}
                </span>
              )}
            </div>
          </div>
          <div className="card p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1 font-semibold">
              Total Messages
            </p>
            <p className="text-2xl font-bold font-mono tracking-tight">
              {combinedTotals.totalMessages.toLocaleString()}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1 font-semibold">
              Read + Write
            </p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
              {combinedTotals.readWrite}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1 font-semibold">
              Unconfigured
            </p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono tracking-tight">
              {combinedTotals.unconfigured}
            </p>
          </div>
        </div>
      )}

      {/* Service-specific sub-tabs */}
      {!globalView && activeService === 'whatsapp' && (
        <div className="flex gap-1 mb-6 p-1 bg-secondary rounded-lg w-fit border border-border">
          <Link
            to={ROUTES.WHATSAPP_CHATS}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${whatsappView === 'chats' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Configured Chats
          </Link>
          <Link
            to={ROUTES.WHATSAPP_DISCOVER}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${whatsappView === 'discover' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Discover New
            {stats.whatsapp && stats.whatsapp.chatsWithoutPermissions > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full">
                {stats.whatsapp.chatsWithoutPermissions}
              </span>
            )}
          </Link>
          <Link
            to={ROUTES.WHATSAPP_AUDIT}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${whatsappView === 'audit' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Audit Log
          </Link>
        </div>
      )}

      {/* Integrations Sub-tabs */}
      {globalView === 'integrations' && (
        <div className="flex gap-1 mb-6 p-1 bg-secondary rounded-lg w-fit border border-border">
          <Link
            to={ROUTES.INTEGRATIONS_CATALOG}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${integrationsView === 'catalog' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Catalog
          </Link>
          <Link
            to={ROUTES.INTEGRATIONS_MCP}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${integrationsView === 'mcp-servers' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            MCP Servers
          </Link>
          <Link
            to={ROUTES.INTEGRATIONS_DUAL}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${integrationsView === 'dual-mode' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Dual Mode
          </Link>
          <Link
            to={ROUTES.INTEGRATIONS_SECRETS}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${integrationsView === 'secrets' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Secrets
          </Link>
          <Link
            to={ROUTES.INTEGRATIONS_PROVIDERS}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${integrationsView === 'providers' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Providers
          </Link>
        </div>
      )}

      {/* Automation Sub-tabs */}
      {globalView === 'automation' && (
        <div className="flex gap-1 mb-6 p-1 bg-secondary rounded-lg w-fit border border-border">
          <Link
            to={ROUTES.AUTOMATION_SCHEDULES}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${automationView === 'schedules' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Schedules
            {stats.scheduler && stats.scheduler.enabledJobs > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full">
                {stats.scheduler.enabledJobs}
              </span>
            )}
          </Link>
          <Link
            to={ROUTES.AUTOMATION_WEBHOOKS}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${automationView === 'webhooks' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Webhooks
            {stats.webhook && stats.webhook.enabledWebhooks > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
                {stats.webhook.enabledWebhooks}
              </span>
            )}
          </Link>
        </div>
      )}

      {/* Content */}
      <div className="animate-fade-in space-y-6">
        {globalView === 'integrations' && integrationsView === 'catalog' && <IntegrationCatalog />}

        {globalView === 'integrations' && integrationsView === 'mcp-servers' && (
          <MCPServers onUpdate={handleRefresh} />
        )}

        {globalView === 'integrations' && integrationsView === 'dual-mode' && (
          <DualModeSettings onUpdate={handleRefresh} />
        )}

        {globalView === 'integrations' && integrationsView === 'secrets' && <SecretsTab />}

        {globalView === 'integrations' && integrationsView === 'providers' && <ProvidersTab />}

        {globalView === 'billing' && <BillingTab />}

        {globalView === 'automation' && automationView === 'schedules' && (
          <SchedulesTab onUpdate={handleRefresh} />
        )}

        {globalView === 'automation' && automationView === 'webhooks' && (
          <WebhooksTab onRefresh={handleRefresh} />
        )}

        {globalView === 'prompts' && <SystemPrompts onUpdate={handleRefresh} />}

        {globalView === 'agents' && <AgentsTab onUpdate={handleRefresh} />}

        {globalView === 'apps' && <AppsTab />}

        {globalView === 'monitoring' && <MonitoringTab />}

        {!globalView && activeService === 'whatsapp' && (
          <>
            {!needsWhatsAppPairingActive && whatsappView === 'chats' && (
              <ChatList discover={false} onUpdate={handleRefresh} />
            )}
            {!needsWhatsAppPairingActive && whatsappView === 'discover' && (
              <ChatList discover={true} onUpdate={handleRefresh} />
            )}
            {!needsWhatsAppPairingActive && whatsappView === 'audit' && <AuditLog />}
          </>
        )}

        {!globalView && activeService === 'slack' && (
          <>
            {slackAvailable ? (
              <SlackChannels onUpdate={handleRefresh} />
            ) : (
              <SlackChannels onUpdate={handleRefresh} />
            )}
          </>
        )}
      </div>

      <AgentCapabilitiesSidebar
        isOpen={capabilitiesSidebarOpen}
        onClose={() => setCapabilitiesSidebarOpen(false)}
      />

      <CommandPalette
        isOpen={commandPalette.isOpen}
        onClose={commandPalette.close}
        commands={commands}
      />

      <OnboarderChat isOpen={onboarderOpen} onClose={() => setOnboarderOpen(false)} />
      <OnboarderBubble
        isOpen={onboarderOpen}
        onClick={() => setOnboarderOpen((prev) => !prev)}
        showPulse={!onboarderOpen}
      />
    </AppLayout>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="ui-theme">
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
