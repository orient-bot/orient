/**
 * Route constants and helpers for dashboard URL routing
 */

export type Service = 'whatsapp' | 'slack';
export type WhatsAppView = 'chats' | 'discover' | 'audit';
export type GlobalView = 'billing' | 'integrations' | 'automation' | 'prompts' | 'agents' | 'apps' | 'monitoring';
export type IntegrationsView = 'catalog' | 'mcp-servers' | 'dual-mode' | 'secrets' | 'providers';
export type AutomationView = 'schedules' | 'webhooks';

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
  PROMPTS: '/prompts',
  BILLING: '/billing',
  MONITORING: '/monitoring',
} as const;

export interface RouteState {
  globalView: GlobalView | null;
  activeService: Service;
  whatsappView: WhatsAppView;
  integrationsView: IntegrationsView;
  automationView: AutomationView;
}

export function getRouteState(pathname: string): RouteState {
  const defaultState: RouteState = {
    globalView: null,
    activeService: 'whatsapp',
    whatsappView: 'chats',
    integrationsView: 'mcp-servers',
    automationView: 'schedules',
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
  if (pathname.startsWith('/prompts')) {
    return { ...defaultState, globalView: 'prompts' };
  }
  if (pathname.startsWith('/billing')) {
    return { ...defaultState, globalView: 'billing' };
  }
  if (pathname.startsWith('/monitoring')) {
    return { ...defaultState, globalView: 'monitoring' };
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
  subView?: WhatsAppView | IntegrationsView | AutomationView
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
      case 'agents':
        return ROUTES.AGENTS;
      case 'apps':
        return ROUTES.APPS;
      case 'prompts':
        return ROUTES.PROMPTS;
      case 'billing':
        return ROUTES.BILLING;
      case 'monitoring':
        return ROUTES.MONITORING;
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
