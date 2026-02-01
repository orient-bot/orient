/**
 * App Generator Service
 *
 * AI-powered code generation for Mini-Apps.
 * Takes a user prompt and generates a complete React application
 * that follows the design system and can use the available tools.
 *
 * Exported via @orient-bot/apps package.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServiceLogger } from '@orient-bot/core';
import { AppManifest, AppPermissions, generateAppManifestTemplate } from '../types.js';

const logger = createServiceLogger('app-generator');

// ============================================
// TYPES
// ============================================

export interface GenerateAppRequest {
  /** User's description of what the app should do */
  prompt: string;
  /** Suggested app name (optional, will be generated if not provided) */
  name?: string;
  /** Author email */
  author?: string;
}

export interface GeneratedApp {
  /** Generated app manifest */
  manifest: AppManifest;
  /** Generated React component code */
  componentCode: string;
  /** Brief explanation of what was generated */
  explanation: string;
}

export interface AppGeneratorConfig {
  /** Anthropic API key */
  apiKey: string;
  /** Model to use (default: claude-sonnet-4-20250514) */
  model?: string;
  /** Max tokens for generation (default: 8000) */
  maxTokens?: number;
}

// ============================================
// SYSTEM PROMPTS
// ============================================

const SYSTEM_PROMPT = `You are an expert React developer specializing in creating Mini-Apps.
Your task is to generate complete, production-ready React applications based on user requests.

## Design System Requirements
All apps MUST follow this design system:
- Use semantic color tokens: bg-background, text-foreground, bg-card, border-border, bg-muted, text-muted-foreground, bg-primary, text-primary-foreground
- Typography: font-sans (Inter) for UI, font-mono (JetBrains Mono) for data/IDs/dates
- Buttons: h-9 rounded-md text-sm font-medium
- Cards: rounded-xl border border-border bg-card shadow-sm
- Inputs: h-9 rounded-md border border-input bg-transparent px-3

## Available Shared Components
Import from '../../_shared/ui':
- Button (props: variant='primary'|'secondary'|'ghost', size='sm'|'md'|'lg', loading, disabled)
- Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
- Input (props: label, error, helperText, checks, validateOn)
- Select (props: label, options, placeholder)
- DateTimePicker (props: label, value, onChange, minDate, maxDate)

## Available Hooks
Import from '../../_shared/hooks':
- useBridge() returns { bridge, isReady, error }
- useVisibility(rule, data) returns boolean for conditional rendering

## Available Utilities
Import from '../../_shared/utils':
- required(), email(), minLength(), maxLength(), pattern() for input validation
- validateValue(value, checks) to run validation manually

## Bridge API
The bridge provides access to backend tools:
- bridge.calendar.listEvents(startDate, endDate) → CalendarEvent[]
- bridge.calendar.createEvent({ summary, description, start, duration, attendees, createMeetLink }) → CalendarEvent
- bridge.scheduler.createJob({ name, scheduleType, runAt, provider, target, messageTemplate }) → ScheduledJob
- bridge.scheduler.listJobs() → ScheduledJob[]
- bridge.slack.sendDM({ target, message })
- bridge.slack.sendChannel({ target, message })
- bridge.webhooks.getEndpointUrl(endpointName) → string
- bridge.app.getManifest() → manifest
- bridge.app.getShareUrl() → string

## Action Helpers
Import from '../../_shared/actions':
- createAction(action, options) → wraps async actions with validation, confirmation, and callbacks
- confirmAction({ title, message }) → boolean

## Code Style
- Use TypeScript with proper types
- Use functional components with hooks
- Handle loading and error states gracefully
- Include helpful user feedback (success messages, loading indicators)
- Make the UI responsive and mobile-friendly
- Use useState and useEffect appropriately

## Response Format
You must respond with valid JSON in this exact format:
{
  "manifest": {
    "name": "app-name-lowercase-hyphens",
    "version": "1.0.0",
    "title": "Human Readable Title",
    "description": "At least 20 characters describing what the app does",
    "permissions": {
      "calendar": { "read": true, "write": false },
      "slack": { "read": false, "write": true }
    },
    "capabilities": {
      "scheduler": { "enabled": true, "max_jobs": 5 },
      "webhooks": { "enabled": false, "max_endpoints": 3 }
    },
    "sharing": { "mode": "secret_link" },
    "build": { "entry": "src/App.tsx", "output": "dist/" }
  },
  "componentCode": "// The complete App.tsx code here",
  "explanation": "Brief explanation of the generated app"
}

Only include permissions for capabilities you actually use. For example:
- If the app reads calendar events: calendar.read = true
- If the app creates events: calendar.write = true
- If the app sends Slack messages: slack.write = true
- If the app schedules reminders: capabilities.scheduler.enabled = true`;

const SHARED_UI_COMPONENTS = [
  'Button',
  'Card',
  'CardHeader',
  'CardTitle',
  'CardDescription',
  'CardContent',
  'CardFooter',
  'Input',
  'Select',
  'DateTimePicker',
];

const SHARED_HOOKS = ['useBridge', 'useVisibility'];

const SHARED_ACTIONS = ['createAction', 'confirmAction'];

// ============================================
// APP GENERATOR SERVICE
// ============================================

export class AppGeneratorService {
  private client: Anthropic;
  private config: Required<AppGeneratorConfig>;

  constructor(config: AppGeneratorConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model || 'claude-sonnet-4-20250514',
      maxTokens: config.maxTokens || 8000,
    };

    this.client = new Anthropic({
      apiKey: this.config.apiKey,
    });

    logger.info('App generator service initialized', { model: this.config.model });
  }

  /**
   * Generate an app from a user prompt
   */
  async generateApp(request: GenerateAppRequest): Promise<GeneratedApp> {
    const op = logger.startOperation('generateApp', { promptLength: request.prompt.length });

    try {
      const userMessage = this.buildUserPrompt(request);

      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      });

      // Extract text content
      const textContent = response.content.find((c) => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in response');
      }

      // Parse the JSON response
      const generated = this.parseGeneratedApp(textContent.text);

      // Set author if provided
      if (request.author) {
        generated.manifest.author = request.author;
      }

      // Override name if provided
      if (request.name) {
        generated.manifest.name = request.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      }

      op.success('App generated', { appName: generated.manifest.name });

      return generated;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Update an existing app based on user feedback
   */
  async updateApp(
    existingManifest: AppManifest,
    existingCode: string,
    updateRequest: string
  ): Promise<GeneratedApp> {
    const op = logger.startOperation('updateApp', { appName: existingManifest.name });

    try {
      const userMessage = `## Current App

### Manifest
\`\`\`json
${JSON.stringify(existingManifest, null, 2)}
\`\`\`

### Current Code (src/App.tsx)
\`\`\`tsx
${existingCode}
\`\`\`

## Update Request
${updateRequest}

Please update the app according to the request. Keep the same app name and maintain any existing functionality unless explicitly asked to remove it. Return the complete updated manifest and code in the required JSON format.`;

      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      });

      const textContent = response.content.find((c) => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in response');
      }

      const generated = this.parseGeneratedApp(textContent.text);

      // Preserve the original name
      generated.manifest.name = existingManifest.name;
      // Increment version
      generated.manifest.version = this.incrementVersion(existingManifest.version);
      // Preserve author
      if (existingManifest.author) {
        generated.manifest.author = existingManifest.author;
      }

      op.success('App updated', { appName: generated.manifest.name });

      return generated;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Build the user prompt for generation
   */
  private buildUserPrompt(request: GenerateAppRequest): string {
    let prompt = `Create a Mini-App based on this request:

${request.prompt}`;

    if (request.name) {
      prompt += `\n\nSuggested app name: ${request.name}`;
    }

    prompt += `

Remember to:
1. Use the shared UI components from '@shared/ui'
2. Use the bridge hook from '@shared/hooks' for tool access
3. Use '@shared/actions' for confirmation and action error handling when needed
4. Use Input validation checks from '@shared/utils' for forms
5. Handle loading states while bridge is initializing
6. Show success/error feedback to users
7. Follow the design system strictly
8. Only request permissions for tools you actually use`;

    return prompt;
  }

  /**
   * Parse the generated JSON response
   */
  private parseGeneratedApp(responseText: string): GeneratedApp {
    // Try to extract JSON from the response
    let jsonStr = responseText;

    // Handle case where response is wrapped in markdown code blocks
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    try {
      const parsed = JSON.parse(jsonStr.trim());

      // Validate required fields
      if (!parsed.manifest || !parsed.componentCode) {
        throw new Error('Missing required fields: manifest and componentCode');
      }

      // Validate manifest structure
      const manifest = this.validateManifest(parsed.manifest);

      // Validate component usage in generated code
      this.validateComponentCode(parsed.componentCode);

      return {
        manifest,
        componentCode: parsed.componentCode,
        explanation: parsed.explanation || 'App generated successfully',
      };
    } catch (error) {
      logger.error('Failed to parse generated app', {
        error: error instanceof Error ? error.message : String(error),
        responsePreview: responseText.substring(0, 500),
      });
      throw new Error(
        `Failed to parse generated app: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Validate and normalize the manifest
   */
  private validateManifest(manifest: Record<string, unknown>): AppManifest {
    // Ensure name is valid
    if (typeof manifest.name !== 'string' || !manifest.name) {
      throw new Error('Invalid manifest: name is required');
    }
    const name = manifest.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    // Ensure version
    const version = typeof manifest.version === 'string' ? manifest.version : '1.0.0';

    // Ensure title and description
    if (typeof manifest.title !== 'string' || !manifest.title) {
      throw new Error('Invalid manifest: title is required');
    }
    if (typeof manifest.description !== 'string' || manifest.description.length < 20) {
      throw new Error('Invalid manifest: description must be at least 20 characters');
    }

    // Build permissions
    const permissions: AppPermissions = {};
    if (manifest.permissions && typeof manifest.permissions === 'object') {
      const perms = manifest.permissions as Record<string, unknown>;
      for (const key of ['calendar', 'slack', 'jira', 'google', 'docs', 'system'] as const) {
        if (perms[key] && typeof perms[key] === 'object') {
          const perm = perms[key] as Record<string, unknown>;
          (permissions as Record<string, { read: boolean; write: boolean }>)[key] = {
            read: Boolean(perm.read),
            write: Boolean(perm.write),
          };
        }
      }
    }

    // Build capabilities
    const capabilities: AppManifest['capabilities'] = {};
    if (manifest.capabilities && typeof manifest.capabilities === 'object') {
      const caps = manifest.capabilities as Record<string, unknown>;
      if (caps.scheduler && typeof caps.scheduler === 'object') {
        const sched = caps.scheduler as Record<string, unknown>;
        capabilities.scheduler = {
          enabled: Boolean(sched.enabled),
          max_jobs: typeof sched.max_jobs === 'number' ? sched.max_jobs : 10,
        };
      }
      if (caps.webhooks && typeof caps.webhooks === 'object') {
        const hooks = caps.webhooks as Record<string, unknown>;
        capabilities.webhooks = {
          enabled: Boolean(hooks.enabled),
          max_endpoints: typeof hooks.max_endpoints === 'number' ? hooks.max_endpoints : 3,
        };
      }
    }

    // Build sharing
    const sharing: AppManifest['sharing'] = {
      mode: 'secret_link',
    };
    if (manifest.sharing && typeof manifest.sharing === 'object') {
      const share = manifest.sharing as Record<string, unknown>;
      if (share.mode === 'public' || share.mode === 'authenticated') {
        sharing.mode = share.mode;
      }
      if (typeof share.expires_after_days === 'number') {
        sharing.expires_after_days = share.expires_after_days;
      }
      if (typeof share.max_uses === 'number') {
        sharing.max_uses = share.max_uses;
      }
    }

    return {
      name,
      format: 'react' as const,
      version,
      title: manifest.title,
      description: manifest.description,
      permissions,
      capabilities,
      sharing,
      build: {
        entry: 'src/App.tsx',
        output: 'dist/',
      },
    };
  }

  /**
   * Validate shared component and hook usage in generated code
   */
  private validateComponentCode(componentCode: string): void {
    const uiImports = this.extractNamedImports(componentCode, [
      '@shared/ui',
      '../../_shared/ui',
      '../_shared/ui',
    ]);
    const hookImports = this.extractNamedImports(componentCode, [
      '@shared/hooks',
      '../../_shared/hooks',
      '../_shared/hooks',
    ]);
    const actionImports = this.extractNamedImports(componentCode, [
      '@shared/actions',
      '../../_shared/actions',
      '../_shared/actions',
    ]);

    const invalidUiImports = uiImports.filter((name) => !SHARED_UI_COMPONENTS.includes(name));
    const invalidHookImports = hookImports.filter((name) => !SHARED_HOOKS.includes(name));
    const invalidActionImports = actionImports.filter((name) => !SHARED_ACTIONS.includes(name));

    if (invalidUiImports.length > 0) {
      throw new Error(
        `Unsupported shared UI components: ${invalidUiImports.join(
          ', '
        )}. Use only: ${SHARED_UI_COMPONENTS.join(', ')}`
      );
    }

    if (invalidHookImports.length > 0) {
      throw new Error(
        `Unsupported shared hooks: ${invalidHookImports.join(', ')}. Use only: ${SHARED_HOOKS.join(
          ', '
        )}`
      );
    }

    if (invalidActionImports.length > 0) {
      throw new Error(
        `Unsupported shared actions: ${invalidActionImports.join(
          ', '
        )}. Use only: ${SHARED_ACTIONS.join(', ')}`
      );
    }
  }

  private extractNamedImports(componentCode: string, modulePaths: string[]): string[] {
    const imports: string[] = [];

    for (const modulePath of modulePaths) {
      const regex = new RegExp(`import\\s+\\{([^}]+)\\}\\s+from\\s+['"]${modulePath}['"]`, 'g');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(componentCode)) !== null) {
        const names = match[1]
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean)
          .map((name) => name.split(/\s+as\s+/)[0].trim());
        imports.push(...names);
      }
    }

    return imports;
  }

  /**
   * Increment version number
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.');
    if (parts.length !== 3) return '1.0.1';

    const patch = parseInt(parts[2], 10);
    if (isNaN(patch)) return '1.0.1';

    return `${parts[0]}.${parts[1]}.${patch + 1}`;
  }
}

/**
 * Create an AppGeneratorService instance
 */
export function createAppGeneratorService(config: AppGeneratorConfig): AppGeneratorService {
  return new AppGeneratorService(config);
}

/**
 * Create an AppGeneratorService from environment variables
 */
export function createAppGeneratorServiceFromEnv(): AppGeneratorService | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    logger.warn('App generator service not configured (missing ANTHROPIC_API_KEY)');
    return null;
  }

  return createAppGeneratorService({
    apiKey,
    model: process.env.APP_GENERATOR_MODEL || 'claude-sonnet-4-20250514',
  });
}
