import { createServiceLogger, getRawConfig } from '@orientbot/core';
import { getGoogleOAuthService } from '@orientbot/integrations/google';
import { createOAuthProvider } from './oauthClientProvider.js';

export type IntegrationName = 'atlassian' | 'google' | 'slack' | 'github' | 'linear';
export type ToolCategoryIntegration = IntegrationName | 'always';

export const CATEGORY_INTEGRATION_MAP: Record<string, ToolCategoryIntegration> = {
  google: 'google',
  docs: 'google',
  messaging: 'slack',
  // Always-available categories (no external auth required)
  whatsapp: 'always',
  apps: 'always',
  agents: 'always',
  context: 'always',
  system: 'always',
  media: 'always',
};

const ATLASSIAN_MCP_URL = 'https://mcp.atlassian.com/v1/sse';
const logger = createServiceLogger('integration-connection');

export class IntegrationConnectionService {
  async getConnectedIntegrations(): Promise<Set<IntegrationName>> {
    const [atlassian, google, slack] = await Promise.all([
      this.isIntegrationConnected('atlassian'),
      this.isIntegrationConnected('google'),
      this.isIntegrationConnected('slack'),
    ]);

    const connected = new Set<IntegrationName>();
    if (atlassian) connected.add('atlassian');
    if (google) connected.add('google');
    if (slack) connected.add('slack');
    return connected;
  }

  async isIntegrationConnected(name: IntegrationName): Promise<boolean> {
    switch (name) {
      case 'atlassian':
        return this.hasAtlassianTokens();
      case 'google':
        return this.hasGoogleAccounts();
      case 'slack':
        return this.hasSlackConfig();
      default:
        return false;
    }
  }

  async isCategoryAvailable(category: string): Promise<boolean> {
    if (category === 'docs') {
      return this.hasGoogleAccounts() || this.hasGoogleSlidesServiceAccount();
    }

    const integration = CATEGORY_INTEGRATION_MAP[category] ?? 'always';
    if (integration === 'always') {
      return true;
    }
    return this.isIntegrationConnected(integration);
  }

  private async hasAtlassianTokens(): Promise<boolean> {
    try {
      const provider = createOAuthProvider(ATLASSIAN_MCP_URL, 'atlassian');
      const tokens = await provider.tokens();
      return !!tokens?.access_token;
    } catch (error) {
      logger.debug('Failed to read Atlassian tokens', { error });
      return false;
    }
  }

  private hasGoogleAccounts(): boolean {
    try {
      const oauthService = getGoogleOAuthService();
      return oauthService.getConnectedAccounts().length > 0;
    } catch (error) {
      logger.debug('Failed to read Google OAuth accounts', { error });
      return false;
    }
  }

  private hasGoogleSlidesServiceAccount(): boolean {
    try {
      const config = getRawConfig() as {
        googleSlides?: { credentialsPath?: string };
      };
      return Boolean(config.googleSlides?.credentialsPath);
    } catch (error) {
      logger.debug('Failed to read Google Slides config', { error });
      return false;
    }
  }

  private hasSlackConfig(): boolean {
    try {
      const config = getRawConfig() as {
        integrations?: {
          slack?: {
            botToken?: string;
            signingSecret?: string;
            appToken?: string;
            bot?: { token?: string };
          };
        };
        slack?: {
          botToken?: string;
          signingSecret?: string;
          appToken?: string;
          bot?: { token?: string };
        };
      };

      const slackConfig = config.integrations?.slack ?? config.slack;
      return Boolean(
        slackConfig &&
        (slackConfig.botToken ||
          slackConfig.signingSecret ||
          slackConfig.appToken ||
          slackConfig.bot?.token)
      );
    } catch (error) {
      logger.debug('Failed to read Slack config', { error });
      return false;
    }
  }
}
