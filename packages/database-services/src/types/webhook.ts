/**
 * Webhook Types
 *
 * Type definitions for the webhook integration system that receives
 * events from external services (GitHub, Calendar, etc.) and forwards
 * them to WhatsApp/Slack.
 */

// ============================================
// ENUMS AND LITERALS
// ============================================

/**
 * Supported webhook source types
 */
export type WebhookSourceType = 'github' | 'calendar' | 'jira' | 'custom';

/**
 * Delivery provider for webhook notifications
 */
export type WebhookProvider = 'whatsapp' | 'slack';

/**
 * Status of a webhook event processing
 */
export type WebhookEventStatus = 'processed' | 'filtered' | 'failed' | 'pending';

// ============================================
// WEBHOOK CONFIGURATION
// ============================================

/**
 * Webhook configuration stored in the database
 */
export interface Webhook {
  id: number;
  name: string; // Unique identifier: "github-prs", "google-calendar"
  description?: string;

  // Authentication
  token: string; // Secret token for webhook verification
  signatureHeader?: string; // Header name: "X-Hub-Signature-256" for GitHub

  // Source configuration
  sourceType: WebhookSourceType;
  eventFilter?: string[]; // ["pull_request", "issues"] for GitHub

  // Delivery configuration
  provider: WebhookProvider;
  target: string; // Phone number/JID or channel ID
  messageTemplate?: string; // Handlebars-style template for formatting

  // Status
  enabled: boolean;
  lastTriggeredAt?: Date;
  triggerCount: number;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new webhook
 */
export interface CreateWebhookInput {
  name: string;
  description?: string;
  token?: string; // Auto-generated if not provided
  signatureHeader?: string;
  sourceType: WebhookSourceType;
  eventFilter?: string[];
  provider: WebhookProvider;
  target: string;
  messageTemplate?: string;
  enabled?: boolean;
}

/**
 * Input for updating an existing webhook
 */
export interface UpdateWebhookInput {
  name?: string;
  description?: string;
  token?: string;
  signatureHeader?: string;
  sourceType?: WebhookSourceType;
  eventFilter?: string[];
  provider?: WebhookProvider;
  target?: string;
  messageTemplate?: string;
  enabled?: boolean;
}

// ============================================
// WEBHOOK EVENTS
// ============================================

/**
 * Record of a webhook event received and processed
 */
export interface WebhookEvent {
  id: number;
  webhookId: number;
  receivedAt: Date;
  eventType?: string; // "pull_request", "push", etc.
  payload: Record<string, unknown>;
  status: WebhookEventStatus;
  error?: string;
  messageSent?: string;
  processingTimeMs?: number;

  // Joined data for display
  webhookName?: string;
}

// ============================================
// GITHUB-SPECIFIC TYPES
// ============================================

/**
 * Supported GitHub webhook events
 */
export type GitHubEventType =
  | 'pull_request'
  | 'push'
  | 'issues'
  | 'issue_comment'
  | 'workflow_run'
  | 'release'
  | 'create'
  | 'delete'
  | 'fork'
  | 'star'
  | 'watch';

/**
 * GitHub Pull Request actions
 */
export type GitHubPRAction =
  | 'opened'
  | 'closed'
  | 'reopened'
  | 'edited'
  | 'assigned'
  | 'unassigned'
  | 'review_requested'
  | 'review_request_removed'
  | 'labeled'
  | 'unlabeled'
  | 'synchronize'
  | 'ready_for_review'
  | 'converted_to_draft'
  | 'merged';

/**
 * GitHub Issue actions
 */
export type GitHubIssueAction =
  | 'opened'
  | 'closed'
  | 'reopened'
  | 'edited'
  | 'assigned'
  | 'unassigned'
  | 'labeled'
  | 'unlabeled'
  | 'deleted'
  | 'transferred'
  | 'pinned'
  | 'unpinned';

/**
 * Parsed GitHub webhook payload (common fields)
 */
export interface GitHubWebhookPayload {
  action?: string;
  sender?: {
    login: string;
    avatar_url: string;
    html_url: string;
  };
  repository?: {
    name: string;
    full_name: string;
    html_url: string;
    private: boolean;
  };
  organization?: {
    login: string;
  };
}

/**
 * GitHub Pull Request webhook payload
 */
export interface GitHubPRPayload extends GitHubWebhookPayload {
  action: GitHubPRAction;
  number: number;
  pull_request: {
    title: string;
    html_url: string;
    state: string;
    draft: boolean;
    merged: boolean;
    user: {
      login: string;
    };
    head: {
      ref: string;
    };
    base: {
      ref: string;
    };
    additions?: number;
    deletions?: number;
    changed_files?: number;
  };
}

/**
 * GitHub Issues webhook payload
 */
export interface GitHubIssuePayload extends GitHubWebhookPayload {
  action: GitHubIssueAction;
  issue: {
    number: number;
    title: string;
    html_url: string;
    state: string;
    user: {
      login: string;
    };
    labels?: Array<{ name: string; color: string }>;
    assignees?: Array<{ login: string }>;
  };
}

/**
 * GitHub Push webhook payload
 */
export interface GitHubPushPayload extends GitHubWebhookPayload {
  ref: string;
  before: string;
  after: string;
  created: boolean;
  deleted: boolean;
  forced: boolean;
  commits: Array<{
    id: string;
    message: string;
    author: {
      name: string;
      email: string;
    };
    url: string;
    added: string[];
    removed: string[];
    modified: string[];
  }>;
  pusher: {
    name: string;
    email: string;
  };
  compare: string;
}

/**
 * GitHub Workflow Run webhook payload
 */
export interface GitHubWorkflowRunPayload extends GitHubWebhookPayload {
  action: 'requested' | 'completed' | 'in_progress';
  workflow_run: {
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    html_url: string;
    head_branch: string;
    event: string;
    run_number: number;
    run_attempt: number;
    created_at: string;
    updated_at: string;
  };
  workflow: {
    name: string;
    path: string;
  };
}

/**
 * GitHub Release webhook payload
 */
export interface GitHubReleasePayload extends GitHubWebhookPayload {
  action:
    | 'published'
    | 'unpublished'
    | 'created'
    | 'edited'
    | 'deleted'
    | 'prereleased'
    | 'released';
  release: {
    tag_name: string;
    name: string;
    body: string;
    html_url: string;
    draft: boolean;
    prerelease: boolean;
    author: {
      login: string;
    };
  };
}

// ============================================
// CALENDAR-SPECIFIC TYPES
// ============================================

/**
 * Calendar event notification
 */
export interface CalendarEventNotification {
  eventId: string;
  calendarId: string;
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  attendees?: string[];
  meetingLink?: string;
  organizer?: string;
  reminderMinutes?: number;
}

// ============================================
// WEBHOOK STATS
// ============================================

/**
 * Webhook statistics for dashboard
 */
export interface WebhookStats {
  totalWebhooks: number;
  enabledWebhooks: number;
  bySourceType: {
    github: number;
    calendar: number;
    jira: number;
    custom: number;
  };
  byProvider: {
    whatsapp: number;
    slack: number;
  };
  totalEvents: number;
  last24Hours: {
    processed: number;
    filtered: number;
    failed: number;
  };
}

// ============================================
// MESSAGE TEMPLATE CONTEXT
// ============================================

/**
 * Variables available in webhook message templates
 */
export interface WebhookTemplateContext {
  // Common fields
  event_type: string;
  webhook_name: string;
  timestamp: string;
  date: string;
  time: string;

  // GitHub PR fields
  pr_title?: string;
  pr_number?: number;
  pr_url?: string;
  pr_author?: string;
  pr_action?: string;
  pr_state?: string;
  pr_branch?: string;
  pr_base?: string;
  pr_additions?: number;
  pr_deletions?: number;

  // GitHub Issue fields
  issue_title?: string;
  issue_number?: number;
  issue_url?: string;
  issue_author?: string;
  issue_action?: string;
  issue_state?: string;

  // GitHub Push fields
  push_branch?: string;
  push_commits?: number;
  push_author?: string;
  push_compare_url?: string;

  // GitHub common
  repo_name?: string;
  repo_full_name?: string;
  repo_url?: string;
  sender?: string;

  // Calendar fields
  event_summary?: string;
  event_location?: string;
  event_start?: string;
  event_end?: string;
  event_organizer?: string;
  meeting_link?: string;

  // Raw payload access
  payload?: Record<string, unknown>;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Default message templates for different event types
 */
export const DEFAULT_TEMPLATES: Record<string, string> = {
  'github:pull_request': `🔀 **PR {{pr_action}}**: {{pr_title}}
by @{{pr_author}} in {{repo_name}}
{{pr_branch}} → {{pr_base}}
{{pr_url}}`,

  'github:push': `📤 **Push to {{push_branch}}**
{{push_commits}} commit(s) by {{push_author}}
{{push_compare_url}}`,

  'github:issues': `🐛 **Issue {{issue_action}}**: {{issue_title}}
by @{{issue_author}} in {{repo_name}}
{{issue_url}}`,

  'github:workflow_run': `⚙️ **Workflow {{action}}**: {{workflow_name}}
Status: {{status}} {{conclusion}}
{{workflow_url}}`,

  'github:release': `🎉 **Release {{action}}**: {{release_name}}
Tag: {{tag_name}}
{{release_url}}`,

  'calendar:reminder': `📅 **Meeting in {{reminder_minutes}} minutes**
{{event_summary}}
📍 {{event_location}}
🔗 {{meeting_link}}`,

  custom: `📨 Webhook received: {{event_type}}
{{timestamp}}`,
};

/**
 * GitHub signature header name
 */
export const GITHUB_SIGNATURE_HEADER = 'x-hub-signature-256';

/**
 * GitHub event type header name
 */
export const GITHUB_EVENT_HEADER = 'x-github-event';

/**
 * Supported GitHub events with descriptions
 */
export const GITHUB_EVENTS: Record<GitHubEventType, string> = {
  pull_request: 'Pull request opened, closed, merged, etc.',
  push: 'Commits pushed to a branch',
  issues: 'Issue opened, closed, labeled, etc.',
  issue_comment: 'Comment on an issue or PR',
  workflow_run: 'GitHub Actions workflow status',
  release: 'Release published or updated',
  create: 'Branch or tag created',
  delete: 'Branch or tag deleted',
  fork: 'Repository forked',
  star: 'Repository starred',
  watch: 'Repository watched',
};
