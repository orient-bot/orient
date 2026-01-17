/**
 * Tests for Frontend URL Routing
 * Tests the route matching logic, redirects, and URL state derivation
 */

import { describe, it, expect } from 'vitest';
import { getRouteState, getRoutePath, ROUTES } from '../src/routes';

describe('Frontend URL Routing', () => {
  describe('ROUTES constants', () => {
    it('should have all expected route paths', () => {
      expect(ROUTES.ROOT).toBe('/');
      expect(ROUTES.WHATSAPP).toBe('/whatsapp');
      expect(ROUTES.WHATSAPP_CHATS).toBe('/whatsapp/chats');
      expect(ROUTES.WHATSAPP_DISCOVER).toBe('/whatsapp/discover');
      expect(ROUTES.WHATSAPP_AUDIT).toBe('/whatsapp/audit');
      expect(ROUTES.SLACK).toBe('/slack');
      expect(ROUTES.AGENTS).toBe('/agents');
      expect(ROUTES.APPS).toBe('/apps');
      expect(ROUTES.INTEGRATIONS).toBe('/integrations');
      expect(ROUTES.INTEGRATIONS_CATALOG).toBe('/integrations/catalog');
      expect(ROUTES.INTEGRATIONS_MCP).toBe('/integrations/mcp-servers');
      expect(ROUTES.INTEGRATIONS_DUAL).toBe('/integrations/dual-mode');
      expect(ROUTES.INTEGRATIONS_SECRETS).toBe('/integrations/secrets');
      expect(ROUTES.INTEGRATIONS_PROVIDERS).toBe('/integrations/providers');
      expect(ROUTES.AUTOMATION).toBe('/automation');
      expect(ROUTES.AUTOMATION_SCHEDULES).toBe('/automation/schedules');
      expect(ROUTES.AUTOMATION_WEBHOOKS).toBe('/automation/webhooks');
      expect(ROUTES.PROMPTS).toBe('/prompts');
      expect(ROUTES.BILLING).toBe('/billing');
      expect(ROUTES.MONITORING).toBe('/monitoring');
    });
  });

  describe('getRouteState', () => {
    describe('default state', () => {
      it('should return default state for root path', () => {
        const state = getRouteState('/');
        expect(state.globalView).toBeNull();
        expect(state.activeService).toBe('whatsapp');
        expect(state.whatsappView).toBe('chats');
        expect(state.integrationsView).toBe('mcp-servers');
      });

      it('should return default state for empty path', () => {
        const state = getRouteState('');
        expect(state.globalView).toBeNull();
        expect(state.activeService).toBe('whatsapp');
      });

      it('should return default state for unknown path', () => {
        const state = getRouteState('/unknown/path');
        expect(state.globalView).toBeNull();
        expect(state.activeService).toBe('whatsapp');
        expect(state.whatsappView).toBe('chats');
      });
    });

    describe('WhatsApp routes', () => {
      it('should match /whatsapp path', () => {
        const state = getRouteState('/whatsapp');
        expect(state.globalView).toBeNull();
        expect(state.activeService).toBe('whatsapp');
        expect(state.whatsappView).toBe('chats');
      });

      it('should match /whatsapp/chats path', () => {
        const state = getRouteState('/whatsapp/chats');
        expect(state.globalView).toBeNull();
        expect(state.activeService).toBe('whatsapp');
        expect(state.whatsappView).toBe('chats');
      });

      it('should match /whatsapp/discover path', () => {
        const state = getRouteState('/whatsapp/discover');
        expect(state.globalView).toBeNull();
        expect(state.activeService).toBe('whatsapp');
        expect(state.whatsappView).toBe('discover');
      });

      it('should match /whatsapp/audit path', () => {
        const state = getRouteState('/whatsapp/audit');
        expect(state.globalView).toBeNull();
        expect(state.activeService).toBe('whatsapp');
        expect(state.whatsappView).toBe('audit');
      });
    });

    describe('Slack routes', () => {
      it('should match /slack path', () => {
        const state = getRouteState('/slack');
        expect(state.globalView).toBeNull();
        expect(state.activeService).toBe('slack');
      });
    });

    describe('Global view routes', () => {
      it('should match /agents path', () => {
        const state = getRouteState('/agents');
        expect(state.globalView).toBe('agents');
      });

      it('should match /apps path', () => {
        const state = getRouteState('/apps');
        expect(state.globalView).toBe('apps');
      });

      it('should match /billing path', () => {
        const state = getRouteState('/billing');
        expect(state.globalView).toBe('billing');
      });

      it('should match /monitoring path', () => {
        const state = getRouteState('/monitoring');
        expect(state.globalView).toBe('monitoring');
      });

      it('should match /automation path', () => {
        const state = getRouteState('/automation');
        expect(state.globalView).toBe('automation');
        expect(state.automationView).toBe('schedules');
      });

      it('should match /automation/webhooks path', () => {
        const state = getRouteState('/automation/webhooks');
        expect(state.globalView).toBe('automation');
        expect(state.automationView).toBe('webhooks');
      });

      it('should match /prompts path', () => {
        const state = getRouteState('/prompts');
        expect(state.globalView).toBe('prompts');
      });
    });

    describe('Integrations routes', () => {
      it('should match /integrations path with catalog default', () => {
        const state = getRouteState('/integrations');
        expect(state.globalView).toBe('integrations');
        expect(state.integrationsView).toBe('catalog');
      });

      it('should match /integrations/catalog path', () => {
        const state = getRouteState('/integrations/catalog');
        expect(state.globalView).toBe('integrations');
        expect(state.integrationsView).toBe('catalog');
      });

      it('should match /integrations/mcp-servers path', () => {
        const state = getRouteState('/integrations/mcp-servers');
        expect(state.globalView).toBe('integrations');
        expect(state.integrationsView).toBe('mcp-servers');
      });

      it('should match /integrations/dual-mode path', () => {
        const state = getRouteState('/integrations/dual-mode');
        expect(state.globalView).toBe('integrations');
        expect(state.integrationsView).toBe('dual-mode');
      });

      it('should match /integrations/secrets path', () => {
        const state = getRouteState('/integrations/secrets');
        expect(state.globalView).toBe('integrations');
        expect(state.integrationsView).toBe('secrets');
      });

      it('should match /integrations/providers path', () => {
        const state = getRouteState('/integrations/providers');
        expect(state.globalView).toBe('integrations');
        expect(state.integrationsView).toBe('providers');
      });
    });

    describe('path prefix matching', () => {
      it('should match paths with trailing content', () => {
        const state = getRouteState('/agents/123');
        expect(state.globalView).toBe('agents');
      });

      it('should match paths with query strings conceptually', () => {
        const state = getRouteState('/billing');
        expect(state.globalView).toBe('billing');
      });
    });
  });

  describe('getRoutePath', () => {
    describe('global views', () => {
      it('should return correct path for agents', () => {
        expect(getRoutePath('agents')).toBe('/agents');
      });

      it('should return correct path for apps', () => {
        expect(getRoutePath('apps')).toBe('/apps');
      });

      it('should return correct path for billing', () => {
        expect(getRoutePath('billing')).toBe('/billing');
      });

      it('should return correct path for monitoring', () => {
        expect(getRoutePath('monitoring')).toBe('/monitoring');
      });

      it('should return correct path for automation', () => {
        expect(getRoutePath('automation')).toBe('/automation/schedules');
      });

      it('should return correct path for webhooks', () => {
        expect(getRoutePath('automation', 'whatsapp', 'webhooks')).toBe('/automation/webhooks');
      });

      it('should return correct path for prompts', () => {
        expect(getRoutePath('prompts')).toBe('/prompts');
      });
    });

    describe('integrations sub-routes', () => {
      it('should return catalog path by default for integrations', () => {
        expect(getRoutePath('integrations')).toBe('/integrations/catalog');
      });

      it('should return secrets path when specified', () => {
        expect(getRoutePath('integrations', 'whatsapp', 'secrets')).toBe('/integrations/secrets');
      });

      it('should return providers path when specified', () => {
        expect(getRoutePath('integrations', 'whatsapp', 'providers')).toBe(
          '/integrations/providers'
        );
      });

      it('should return dual-mode path when specified', () => {
        expect(getRoutePath('integrations', 'whatsapp', 'dual-mode')).toBe(
          '/integrations/dual-mode'
        );
      });

      it('should return mcp-servers path when specified', () => {
        expect(getRoutePath('integrations', 'whatsapp', 'mcp-servers')).toBe(
          '/integrations/mcp-servers'
        );
      });
    });

    describe('service routes', () => {
      it('should return slack path', () => {
        expect(getRoutePath(null, 'slack')).toBe('/slack');
      });

      it('should return whatsapp chats path by default', () => {
        expect(getRoutePath(null, 'whatsapp')).toBe('/whatsapp/chats');
      });

      it('should return whatsapp discover path', () => {
        expect(getRoutePath(null, 'whatsapp', 'discover')).toBe('/whatsapp/discover');
      });

      it('should return whatsapp audit path', () => {
        expect(getRoutePath(null, 'whatsapp', 'audit')).toBe('/whatsapp/audit');
      });

      it('should return whatsapp chats path explicitly', () => {
        expect(getRoutePath(null, 'whatsapp', 'chats')).toBe('/whatsapp/chats');
      });
    });
  });

  describe('route consistency', () => {
    it('should have matching getRouteState and getRoutePath for agents', () => {
      const path = getRoutePath('agents');
      const state = getRouteState(path);
      expect(state.globalView).toBe('agents');
    });

    it('should have matching getRouteState and getRoutePath for integrations/dual-mode', () => {
      const path = getRoutePath('integrations', 'whatsapp', 'dual-mode');
      const state = getRouteState(path);
      expect(state.globalView).toBe('integrations');
      expect(state.integrationsView).toBe('dual-mode');
    });

    it('should have matching getRouteState and getRoutePath for whatsapp/discover', () => {
      const path = getRoutePath(null, 'whatsapp', 'discover');
      const state = getRouteState(path);
      expect(state.globalView).toBeNull();
      expect(state.activeService).toBe('whatsapp');
      expect(state.whatsappView).toBe('discover');
    });

    it('should have matching getRouteState and getRoutePath for slack', () => {
      const path = getRoutePath(null, 'slack');
      const state = getRouteState(path);
      expect(state.globalView).toBeNull();
      expect(state.activeService).toBe('slack');
    });
  });
});
