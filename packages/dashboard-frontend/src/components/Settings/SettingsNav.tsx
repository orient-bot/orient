import { Link, useLocation } from 'react-router-dom';
import { ROUTES, type SettingsView } from '../../routes';

interface SettingsNavProps {
  currentView: SettingsView;
}

export function SettingsNav({ currentView }: SettingsNavProps) {
  const location = useLocation();

  const navItems = [
    {
      view: 'connections' as SettingsView,
      label: 'Connections',
      description: 'Integrations, MCP servers, and service modes',
      to: ROUTES.SETTINGS_CONNECTIONS,
      icon: (
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
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      ),
    },
    {
      view: 'providers' as SettingsView,
      label: 'AI Providers',
      description: 'Configure AI model providers',
      to: ROUTES.SETTINGS_PROVIDERS,
      icon: (
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
          <path d="M12 2v4" />
          <path d="m6.8 14-3.5 2" />
          <path d="m20.7 16-3.5-2" />
          <path d="M6.8 10 3.3 8" />
          <path d="m20.7 8-3.5 2" />
          <circle cx="12" cy="12" r="6" />
        </svg>
      ),
    },
    {
      view: 'secrets' as SettingsView,
      label: 'Secrets',
      description: 'Manage API keys and credentials',
      to: ROUTES.SETTINGS_SECRETS,
      icon: (
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
          <circle cx="7.5" cy="15.5" r="5.5" />
          <path d="m21 2-9.6 9.6" />
          <path d="m15.5 7.5 3 3L22 7l-3-3" />
        </svg>
      ),
    },
    {
      view: 'appearance' as SettingsView,
      label: 'Appearance',
      description: 'Theme and display settings',
      to: ROUTES.SETTINGS_APPEARANCE,
      icon: (
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
    },
    {
      view: 'updates' as SettingsView,
      label: 'Updates',
      description: 'Version notifications',
      to: ROUTES.SETTINGS_UPDATES,
      icon: (
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
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
          <path d="M16 16h5v5" />
        </svg>
      ),
    },
  ];

  const isActive = (view: SettingsView) => {
    if (view === 'connections') {
      return (
        location.pathname.startsWith('/settings/connections') || location.pathname === '/settings'
      );
    }
    return currentView === view;
  };

  return (
    <nav className="w-64 flex-shrink-0 space-y-1">
      {navItems.map((item) => (
        <Link
          key={item.view}
          to={item.to}
          className={`flex items-start gap-3 px-3 py-3 rounded-lg transition-colors ${
            isActive(item.view)
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          }`}
        >
          <div className="flex-shrink-0 mt-0.5">{item.icon}</div>
          <div className="min-w-0">
            <div className="text-sm font-medium">{item.label}</div>
            <div
              className={`text-xs mt-0.5 ${isActive(item.view) ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}
            >
              {item.description}
            </div>
          </div>
        </Link>
      ))}
    </nav>
  );
}
