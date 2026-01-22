/**
 * Route constants and helpers for dashboard URL routing
 */

export type Service = 'whatsapp' | 'slack';
export type WhatsAppView = 'chats' | 'discover' | 'audit';
export type GlobalView =
  | 'integrations'
  | 'automation'
  | 'agents'
  | 'apps'
  | 'operations'
  | 'settings';
export type IntegrationsView = 'catalog' | 'mcp-servers' | 'dual-mode' | 'secrets' | 'providers';
export type AutomationView = 'schedules' | 'webhooks';
export type OperationsView = 'billing' | 'monitoring' | 'storage';
export type SettingsView =
  | 'connections'
  | 'providers'
  | 'secrets'
  | 'appearance'
  | 'updates'
  | 'feature-flags';
export type ConnectionsSubView = 'catalog' | 'mcp' | 'modes';

/**
 * Route path constants (relative to basename /dashboard)
 */
export const ROUTES = {
  ROOT: '/',
  WHATSAPP: '/whatsapp',
  WHATSAPP_CHATS: '/whatsapp/chats',
  WHATSAPP_DISCOVER: '/whatsapp/discover',
  WHATSAPP_AUDIT: '/whatsapp/audit',
  SLACK: '/slack',
  AGENTS: '/agents',
  APPS: '/apps',
  INTEGRATIONS: '/integrations',
  INTEGRATIONS_CATALOG: '/integrations/catalog',
  INTEGRATIONS_MCP: '/integrations/mcp-servers',
  INTEGRATIONS_DUAL: '/integrations/dual-mode',
  INTEGRATIONS_SECRETS: '/integrations/secrets',
  INTEGRATIONS_PROVIDERS: '/integrations/providers',
  AUTOMATION: '/automation',
  AUTOMATION_SCHEDULES: '/automation/schedules',
  AUTOMATION_WEBHOOKS: '/automation/webhooks',
  OPERATIONS: '/operations',
  OPERATIONS_BILLING: '/operations/billing',
  OPERATIONS_MONITORING: '/operations/monitoring',
  OPERATIONS_STORAGE: '/operations/storage',
  // Legacy routes (for redirects)
  BILLING: '/billing',
  MONITORING: '/monitoring',
  STORAGE: '/storage',
  SETTINGS: '/settings',
  SETTINGS_CONNECTIONS: '/settings/connections',
  SETTINGS_CONNECTIONS_CATALOG: '/settings/connections/catalog',
  SETTINGS_CONNECTIONS_MCP: '/settings/connections/mcp',
  SETTINGS_CONNECTIONS_MODES: '/settings/connections/modes',
  SETTINGS_PROVIDERS: '/settings/providers',
  SETTINGS_SECRETS: '/settings/secrets',
  SETTINGS_APPEARANCE: '/settings/appearance',
  SETTINGS_UPDATES: '/settings/updates',
  SETTINGS_FEATURE_FLAGS: '/settings/feature-flags',
} as const;

export interface RouteState {
  globalView: GlobalView | null;
  activeService: Service;
  whatsappView: WhatsAppView;
  integrationsView: IntegrationsView;
  automationView: AutomationView;
  operationsView: OperationsView;
  settingsView: SettingsView;
  connectionsSubView: ConnectionsSubView;
}

export function getRouteState(pathname: string): RouteState {
  const defaultState: RouteState = {
    globalView: null,
    activeService: 'whatsapp',
    whatsappView: 'chats',
    integrationsView: 'mcp-servers',
    automationView: 'schedules',
    operationsView: 'billing',
    settingsView: 'connections',
    connectionsSubView: 'catalog',
  };

  if (pathname.startsWith('/agents')) {
    return { ...defaultState, globalView: 'agents' };
  }
  if (pathname.startsWith('/apps')) {
    return { ...defaultState, globalView: 'apps' };
  }
  if (pathname.startsWith('/integrations/catalog')) {
    return { ...defaultState, globalView: 'integrations', integrationsView: 'catalog' };
  }
  if (pathname.startsWith('/integrations/mcp-servers')) {
    return { ...defaultState, globalView: 'integrations', integrationsView: 'mcp-servers' };
  }
  if (pathname.startsWith('/integrations/dual-mode')) {
    return { ...defaultState, globalView: 'integrations', integrationsView: 'dual-mode' };
  }
  if (pathname.startsWith('/integrations/secrets')) {
    return { ...defaultState, globalView: 'integrations', integrationsView: 'secrets' };
  }
  if (pathname.startsWith('/integrations/providers')) {
    return { ...defaultState, globalView: 'integrations', integrationsView: 'providers' };
  }
  if (pathname.startsWith('/integrations')) {
    return { ...defaultState, globalView: 'integrations', integrationsView: 'catalog' };
  }
  if (pathname.startsWith('/automation/webhooks')) {
    return { ...defaultState, globalView: 'automation', automationView: 'webhooks' };
  }
  if (pathname.startsWith('/automation')) {
    return { ...defaultState, globalView: 'automation', automationView: 'schedules' };
  }
  // Operations sub-routes
  if (pathname.startsWith('/operations/monitoring')) {
    return { ...defaultState, globalView: 'operations', operationsView: 'monitoring' };
  }
  if (pathname.startsWith('/operations/storage')) {
    return { ...defaultState, globalView: 'operations', operationsView: 'storage' };
  }
  if (pathname.startsWith('/operations')) {
    return { ...defaultState, globalView: 'operations', operationsView: 'billing' };
  }
  // Legacy routes (still need to parse for redirects)
  if (pathname.startsWith('/billing')) {
    return { ...defaultState, globalView: 'operations', operationsView: 'billing' };
  }
  if (pathname.startsWith('/monitoring')) {
    return { ...defaultState, globalView: 'operations', operationsView: 'monitoring' };
  }
  if (pathname.startsWith('/storage')) {
    return { ...defaultState, globalView: 'operations', operationsView: 'storage' };
  }

  // Settings routes
  if (pathname.startsWith('/settings/connections/catalog')) {
    return {
      ...defaultState,
      globalView: 'settings',
      settingsView: 'connections',
      connectionsSubView: 'catalog',
    };
  }
  if (pathname.startsWith('/settings/connections/mcp')) {
    return {
      ...defaultState,
      globalView: 'settings',
      settingsView: 'connections',
      connectionsSubView: 'mcp',
    };
  }
  if (pathname.startsWith('/settings/connections/modes')) {
    return {
      ...defaultState,
      globalView: 'settings',
      settingsView: 'connections',
      connectionsSubView: 'modes',
    };
  }
  if (pathname.startsWith('/settings/connections')) {
    return {
      ...defaultState,
      globalView: 'settings',
      settingsView: 'connections',
      connectionsSubView: 'catalog',
    };
  }
  if (pathname.startsWith('/settings/providers')) {
    return { ...defaultState, globalView: 'settings', settingsView: 'providers' };
  }
  if (pathname.startsWith('/settings/secrets')) {
    return { ...defaultState, globalView: 'settings', settingsView: 'secrets' };
  }
  if (pathname.startsWith('/settings/appearance')) {
    return { ...defaultState, globalView: 'settings', settingsView: 'appearance' };
  }
  if (pathname.startsWith('/settings/updates')) {
    return { ...defaultState, globalView: 'settings', settingsView: 'updates' };
  }
  if (pathname.startsWith('/settings')) {
    return {
      ...defaultState,
      globalView: 'settings',
      settingsView: 'connections',
      connectionsSubView: 'catalog',
    };
  }

  if (pathname.startsWith('/slack')) {
    return { ...defaultState, activeService: 'slack' };
  }
  if (pathname.startsWith('/whatsapp/discover')) {
    return { ...defaultState, whatsappView: 'discover' };
  }
  if (pathname.startsWith('/whatsapp/audit')) {
    return { ...defaultState, whatsappView: 'audit' };
  }

  return defaultState;
}

export function getRoutePath(
  globalView: GlobalView | null,
  service: Service = 'whatsapp',
  subView?:
    | WhatsAppView
    | IntegrationsView
    | AutomationView
    | OperationsView
    | SettingsView
    | ConnectionsSubView
): string {
  if (globalView) {
    switch (globalView) {
      case 'integrations':
        if (subView === 'mcp-servers') return ROUTES.INTEGRATIONS_MCP;
        if (subView === 'dual-mode') return ROUTES.INTEGRATIONS_DUAL;
        if (subView === 'secrets') return ROUTES.INTEGRATIONS_SECRETS;
        if (subView === 'providers') return ROUTES.INTEGRATIONS_PROVIDERS;
        return ROUTES.INTEGRATIONS_CATALOG;
      case 'automation':
        if (subView === 'webhooks') return ROUTES.AUTOMATION_WEBHOOKS;
        return ROUTES.AUTOMATION_SCHEDULES;
      case 'operations':
        if (subView === 'monitoring') return ROUTES.OPERATIONS_MONITORING;
        if (subView === 'storage') return ROUTES.OPERATIONS_STORAGE;
        return ROUTES.OPERATIONS_BILLING;
      case 'settings':
        // Handle settings sub-views
        if (subView === 'providers') return ROUTES.SETTINGS_PROVIDERS;
        if (subView === 'secrets') return ROUTES.SETTINGS_SECRETS;
        if (subView === 'appearance') return ROUTES.SETTINGS_APPEARANCE;
        if (subView === 'updates') return ROUTES.SETTINGS_UPDATES;
        if (subView === 'feature-flags') return ROUTES.SETTINGS_FEATURE_FLAGS;
        // Handle connections sub-views
        if (subView === 'mcp') return ROUTES.SETTINGS_CONNECTIONS_MCP;
        if (subView === 'modes') return ROUTES.SETTINGS_CONNECTIONS_MODES;
        if (subView === 'catalog') return ROUTES.SETTINGS_CONNECTIONS_CATALOG;
        return ROUTES.SETTINGS_CONNECTIONS;
      case 'agents':
        return ROUTES.AGENTS;
      case 'apps':
        return ROUTES.APPS;
    }
  }

  if (service === 'slack') {
    return ROUTES.SLACK;
  }

  switch (subView) {
    case 'discover':
      return ROUTES.WHATSAPP_DISCOVER;
    case 'audit':
      return ROUTES.WHATSAPP_AUDIT;
    default:
      return ROUTES.WHATSAPP_CHATS;
  }
}
