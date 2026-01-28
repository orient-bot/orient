/**
 * App Types
 *
 * Types for the Mini-Apps feature - AI-generated React applications
 * that can access configured tools and be shared via secret links.
 */

import { z } from 'zod';

// ============================================
// PERMISSION SCHEMAS
// ============================================

/**
 * Tool permission for a specific category (read/write access)
 */
export const ToolPermissionSchema = z.object({
  read: z.boolean().default(false),
  write: z.boolean().default(false),
});

export type ToolPermission = z.infer<typeof ToolPermissionSchema>;

/**
 * All tool permissions by category
 */
export const AppPermissionsSchema = z.object({
  calendar: ToolPermissionSchema.optional(),
  slack: ToolPermissionSchema.optional(),
  jira: ToolPermissionSchema.optional(),
  google: ToolPermissionSchema.optional(),
  docs: ToolPermissionSchema.optional(),
  system: ToolPermissionSchema.optional(),
  tools: z.array(z.string()).optional(),
});

export type AppPermissions = z.infer<typeof AppPermissionsSchema>;

// ============================================
// CAPABILITY SCHEMAS
// ============================================

/**
 * Scheduler capability configuration
 */
export const SchedulerCapabilitySchema = z.object({
  enabled: z.boolean().default(false),
  max_jobs: z.number().int().positive().default(10),
  allowed_types: z.array(z.enum(['once', 'recurring', 'cron'])).optional(),
});

export type SchedulerCapability = z.infer<typeof SchedulerCapabilitySchema>;

/**
 * Webhook endpoint configuration
 */
export const WebhookEndpointSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/, 'Endpoint name must be lowercase with hyphens'),
  description: z.string().min(10),
  methods: z.array(z.enum(['GET', 'POST', 'PUT', 'DELETE'])).default(['POST']),
});

export type WebhookEndpoint = z.infer<typeof WebhookEndpointSchema>;

/**
 * Webhook capability configuration
 */
export const WebhookCapabilitySchema = z.object({
  enabled: z.boolean().default(false),
  max_endpoints: z.number().int().positive().default(3),
  endpoints: z.array(WebhookEndpointSchema).optional(),
});

export type WebhookCapability = z.infer<typeof WebhookCapabilitySchema>;

/**
 * Storage capability configuration
 */
export const StorageCapabilitySchema = z.object({
  enabled: z.boolean().default(false),
});

export type StorageCapability = z.infer<typeof StorageCapabilitySchema>;

/**
 * All app capabilities
 */
export const AppCapabilitiesSchema = z.object({
  scheduler: SchedulerCapabilitySchema.optional(),
  webhooks: WebhookCapabilitySchema.optional(),
  storage: StorageCapabilitySchema.optional(),
});

export type AppCapabilities = z.infer<typeof AppCapabilitiesSchema>;

// ============================================
// SHARING SCHEMAS
// ============================================

export const SharingModeSchema = z.enum(['secret_link', 'authenticated', 'public']);
export type SharingMode = z.infer<typeof SharingModeSchema>;

export const AppSharingConfigSchema = z.object({
  mode: SharingModeSchema.default('secret_link'),
  expires_after_days: z.number().int().positive().optional(),
  max_uses: z.number().int().positive().optional(),
});

export type AppSharingConfig = z.infer<typeof AppSharingConfigSchema>;

// ============================================
// BUILD SCHEMAS
// ============================================

export const AppBuildConfigSchema = z.object({
  entry: z.string().default('src/App.tsx'),
  output: z.string().default('dist/'),
});

export type AppBuildConfig = z.infer<typeof AppBuildConfigSchema>;

// ============================================
// APP MANIFEST SCHEMA
// ============================================

export const AppManifestSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'App name must be lowercase with hyphens only')
    .min(3)
    .max(50),
  format: z.enum(['react', 'declarative']).default('react'),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'Version must be semver format')
    .default('1.0.0'),
  title: z.string().min(3).max(100),
  description: z.string().min(20).max(500),
  author: z.string().email().optional(),
  permissions: AppPermissionsSchema.default({}),
  capabilities: AppCapabilitiesSchema.default({}),
  sharing: AppSharingConfigSchema.default({ mode: 'secret_link' }),
  build: AppBuildConfigSchema.default({ entry: 'src/App.tsx', output: 'dist/' }),
});

export type AppManifest = z.infer<typeof AppManifestSchema>;

// ============================================
// APP STATUS
// ============================================

export type AppStatus = 'draft' | 'pending_review' | 'published' | 'archived';

// ============================================
// APP ENTITY
// ============================================

export interface App {
  manifest: AppManifest;
  path: string;
  srcPath: string;
  distPath: string;
  isBuilt: boolean;
  shareToken?: string;
  status: AppStatus;
  source: 'builtin' | 'user';
  createdAt?: Date;
  updatedAt?: Date;
  publishedAt?: Date;
}

export interface AppSummary {
  name: string;
  title: string;
  description: string;
  version: string;
  status: AppStatus;
  isBuilt: boolean;
  author?: string;
  source: 'builtin' | 'user';
}

// ============================================
// APP EXECUTION
// ============================================

export interface AppExecution {
  id: number;
  appName: string;
  shareToken: string;
  toolName: string;
  toolParams: Record<string, unknown>;
  result: 'success' | 'error' | 'denied';
  errorMessage?: string;
  executedAt: Date;
  durationMs: number;
  userAgent?: string;
  ipAddress?: string;
}

// ============================================
// APP SHARE TOKEN
// ============================================

export interface AppShareToken {
  id: number;
  appName: string;
  token: string;
  createdAt: Date;
  expiresAt?: Date;
  maxUses?: number;
  useCount: number;
  isActive: boolean;
  createdBy?: string;
}

// ============================================
// EDIT SESSION TYPES
// ============================================

export interface EditSession {
  id: string;
  appName: string;
  sessionId: string;
  branchName: string;
  worktreePath: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  prUrl?: string;
}

export interface EditCommit {
  id: string;
  sessionId: string;
  commitHash: string;
  message: string;
  filesChanged: string[];
  createdAt: Date;
  buildSuccess: boolean;
}

// ============================================
// VALIDATION HELPERS
// ============================================

export function validateAppManifest(manifest: unknown): {
  valid: boolean;
  data?: AppManifest;
  errors?: string[];
} {
  const result = AppManifestSchema.safeParse(manifest);

  if (result.success) {
    return { valid: true, data: result.data };
  }

  const errors = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);

  return { valid: false, errors };
}

export function generateAppManifestTemplate(
  name: string,
  title: string,
  description: string
): AppManifest {
  return {
    name,
    version: '1.0.0',
    title,
    description,
    permissions: {
      calendar: { read: true, write: false },
    },
    capabilities: {
      scheduler: { enabled: false, max_jobs: 10 },
      webhooks: { enabled: false, max_endpoints: 3 },
      storage: { enabled: false },
    },
    sharing: {
      mode: 'secret_link',
    },
    build: {
      entry: 'src/App.tsx',
      output: 'dist/',
    },
  };
}

/**
 * Serialize an AppManifest to YAML string
 */
export function serializeManifestToYaml(manifest: AppManifest): string {
  const lines: string[] = [];

  lines.push(`name: ${manifest.name}`);
  lines.push(`version: "${manifest.version}"`);
  lines.push(`title: "${manifest.title}"`);
  lines.push(`description: "${manifest.description}"`);

  if (manifest.author) {
    lines.push(`author: "${manifest.author}"`);
  }

  if (manifest.permissions) {
    lines.push('permissions:');
    for (const [key, value] of Object.entries(manifest.permissions)) {
      if (key === 'tools' && Array.isArray(value)) {
        lines.push(`  tools:`);
        for (const tool of value) {
          lines.push(`    - ${tool}`);
        }
      } else if (value && typeof value === 'object') {
        const perm = value as ToolPermission;
        lines.push(`  ${key}:`);
        lines.push(`    read: ${perm.read ?? false}`);
        lines.push(`    write: ${perm.write ?? false}`);
      }
    }
  }

  if (manifest.capabilities) {
    lines.push('capabilities:');
    if (manifest.capabilities.scheduler) {
      lines.push('  scheduler:');
      lines.push(`    enabled: ${manifest.capabilities.scheduler.enabled}`);
      lines.push(`    max_jobs: ${manifest.capabilities.scheduler.max_jobs}`);
    }
    if (manifest.capabilities.webhooks) {
      lines.push('  webhooks:');
      lines.push(`    enabled: ${manifest.capabilities.webhooks.enabled}`);
      lines.push(`    max_endpoints: ${manifest.capabilities.webhooks.max_endpoints}`);
    }
    if (manifest.capabilities.storage) {
      lines.push('  storage:');
      lines.push(`    enabled: ${manifest.capabilities.storage.enabled}`);
    }
  }

  if (manifest.sharing) {
    lines.push('sharing:');
    lines.push(`  mode: ${manifest.sharing.mode}`);
    if (manifest.sharing.expires_after_days) {
      lines.push(`  expires_after_days: ${manifest.sharing.expires_after_days}`);
    }
    if (manifest.sharing.max_uses) {
      lines.push(`  max_uses: ${manifest.sharing.max_uses}`);
    }
  }

  if (manifest.build) {
    lines.push('build:');
    lines.push(`  entry: "${manifest.build.entry}"`);
    lines.push(`  output: "${manifest.build.output}"`);
  }

  return lines.join('\n');
}
