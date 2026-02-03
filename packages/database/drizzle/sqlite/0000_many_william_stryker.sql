CREATE TABLE `agent_skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` text NOT NULL,
	`skill_name` text NOT NULL,
	`enabled` integer DEFAULT true,
	`created_at` integer,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_agent_skills_agent` ON `agent_skills` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_agent_skills_skill` ON `agent_skills` (`skill_name`);--> statement-breakpoint
CREATE TABLE `agent_tools` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` text NOT NULL,
	`pattern` text NOT NULL,
	`type` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_agent_tools_agent` ON `agent_tools` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_agent_tools_type` ON `agent_tools` (`type`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`mode` text DEFAULT 'primary',
	`model_default` text,
	`model_fallback` text,
	`base_prompt` text,
	`enabled` integer DEFAULT true,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `app_storage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`app_name` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_app_storage_app_name` ON `app_storage` (`app_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_app_storage_unique` ON `app_storage` (`app_name`,`key`);--> statement-breakpoint
CREATE TABLE `approval_grants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`grant_type` text NOT NULL,
	`grant_value` text NOT NULL,
	`expires_at` integer,
	`created_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_approval_grants_session` ON `approval_grants` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_approval_grants_user` ON `approval_grants` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_approval_grants_type` ON `approval_grants` (`grant_type`);--> statement-breakpoint
CREATE TABLE `approval_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`platform` text NOT NULL,
	`user_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`policy_id` text,
	`tool_name` text NOT NULL,
	`tool_input` text NOT NULL,
	`status` text NOT NULL,
	`platform_message_id` text,
	`created_at` integer,
	`resolved_at` integer,
	`resolved_by` text,
	`expires_at` integer,
	FOREIGN KEY (`policy_id`) REFERENCES `permission_policies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_approval_requests_status` ON `approval_requests` (`status`);--> statement-breakpoint
CREATE INDEX `idx_approval_requests_platform` ON `approval_requests` (`platform`);--> statement-breakpoint
CREATE INDEX `idx_approval_requests_session` ON `approval_requests` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_approval_requests_policy` ON `approval_requests` (`policy_id`);--> statement-breakpoint
CREATE TABLE `chat_context` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` text NOT NULL,
	`platform` text NOT NULL,
	`context_json` text NOT NULL,
	`version` integer DEFAULT 1,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_chat_context_lookup` ON `chat_context` (`platform`,`chat_id`);--> statement-breakpoint
CREATE TABLE `chat_permissions` (
	`chat_id` text PRIMARY KEY NOT NULL,
	`chat_type` text NOT NULL,
	`permission` text DEFAULT 'read_only' NOT NULL,
	`display_name` text,
	`notes` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_chat_permissions_type` ON `chat_permissions` (`chat_type`);--> statement-breakpoint
CREATE INDEX `idx_chat_permissions_permission` ON `chat_permissions` (`permission`);--> statement-breakpoint
CREATE TABLE `context_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`context_type` text NOT NULL,
	`context_id` text,
	`agent_id` text,
	`skill_overrides` text,
	`priority` integer DEFAULT 0,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_context_rules_type` ON `context_rules` (`context_type`);--> statement-breakpoint
CREATE INDEX `idx_context_rules_context` ON `context_rules` (`context_type`,`context_id`);--> statement-breakpoint
CREATE INDEX `idx_context_rules_agent` ON `context_rules` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_context_rules_priority` ON `context_rules` (`priority`);--> statement-breakpoint
CREATE TABLE `dashboard_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text,
	`google_id` text,
	`google_email` text,
	`auth_method` text DEFAULT 'password' NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dashboard_users_username_unique` ON `dashboard_users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `dashboard_users_google_id_unique` ON `dashboard_users` (`google_id`);--> statement-breakpoint
CREATE TABLE `demo_github_monitors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repo_url` text NOT NULL,
	`slack_channel` text NOT NULL,
	`schedule_time` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_checked` integer,
	`created_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_demo_github_monitors_repo` ON `demo_github_monitors` (`repo_url`);--> statement-breakpoint
CREATE INDEX `idx_demo_github_monitors_active` ON `demo_github_monitors` (`is_active`);--> statement-breakpoint
CREATE TABLE `demo_meetings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`attendees` text,
	`start_time` integer NOT NULL,
	`duration_minutes` integer NOT NULL,
	`send_reminder` integer DEFAULT true NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_demo_meetings_start_time` ON `demo_meetings` (`start_time`);--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`enabled` integer DEFAULT true,
	`category` text DEFAULT 'ui',
	`sort_order` integer DEFAULT 0,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_feature_flags_category` ON `feature_flags` (`category`);--> statement-breakpoint
CREATE INDEX `idx_feature_flags_sort_order` ON `feature_flags` (`sort_order`);--> statement-breakpoint
CREATE TABLE `groups` (
	`group_id` text PRIMARY KEY NOT NULL,
	`group_name` text,
	`group_subject` text,
	`participant_count` integer,
	`last_updated` integer
);
--> statement-breakpoint
CREATE INDEX `idx_groups_name` ON `groups` (`group_name`);--> statement-breakpoint
CREATE INDEX `idx_groups_subject` ON `groups` (`group_subject`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` text,
	`direction` text NOT NULL,
	`jid` text NOT NULL,
	`phone` text NOT NULL,
	`text` text NOT NULL,
	`is_group` integer DEFAULT false NOT NULL,
	`group_id` text,
	`timestamp` integer NOT NULL,
	`created_at` integer,
	`media_type` text,
	`media_path` text,
	`media_mime_type` text,
	`transcribed_text` text,
	`transcribed_language` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_message_id_unique` ON `messages` (`message_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_phone` ON `messages` (`phone`);--> statement-breakpoint
CREATE INDEX `idx_messages_timestamp` ON `messages` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_messages_direction` ON `messages` (`direction`);--> statement-breakpoint
CREATE INDEX `idx_messages_is_group` ON `messages` (`is_group`);--> statement-breakpoint
CREATE INDEX `idx_messages_group_id` ON `messages` (`group_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_media_type` ON `messages` (`media_type`);--> statement-breakpoint
CREATE TABLE `oauth_proxy_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`code_challenge` text NOT NULL,
	`scopes` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`user_email` text,
	`encrypted_tokens` text,
	`tokens_iv` text,
	`tokens_auth_tag` text,
	`created_at` integer,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_proxy_sessions_session_id_unique` ON `oauth_proxy_sessions` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_oauth_proxy_session_id` ON `oauth_proxy_sessions` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_oauth_proxy_status` ON `oauth_proxy_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_oauth_proxy_expires` ON `oauth_proxy_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `onboarder_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`session_id` text NOT NULL,
	`title` text NOT NULL,
	`is_active` integer DEFAULT false,
	`created_at` integer,
	`last_active_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `dashboard_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onboarder_sessions_session_id_unique` ON `onboarder_sessions` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_onboarder_sessions_user` ON `onboarder_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_onboarder_sessions_active` ON `onboarder_sessions` (`user_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `permission_audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` text NOT NULL,
	`old_permission` text,
	`new_permission` text NOT NULL,
	`changed_by` text,
	`changed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_permission_audit_chat` ON `permission_audit_log` (`chat_id`);--> statement-breakpoint
CREATE INDEX `idx_permission_audit_time` ON `permission_audit_log` (`changed_at`);--> statement-breakpoint
CREATE TABLE `permission_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`tool_patterns` text NOT NULL,
	`agent_ids` text,
	`platforms` text,
	`action` text NOT NULL,
	`granularity` text NOT NULL,
	`timeout` integer,
	`prompt_template` text,
	`risk_level` text NOT NULL,
	`priority` integer DEFAULT 0,
	`enabled` integer DEFAULT true,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_permission_policies_action` ON `permission_policies` (`action`);--> statement-breakpoint
CREATE INDEX `idx_permission_policies_priority` ON `permission_policies` (`priority`);--> statement-breakpoint
CREATE INDEX `idx_permission_policies_enabled` ON `permission_policies` (`enabled`);--> statement-breakpoint
CREATE TABLE `scheduled_job_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`status` text,
	`error` text,
	`message_sent` text,
	FOREIGN KEY (`job_id`) REFERENCES `scheduled_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_scheduled_job_runs_job_id` ON `scheduled_job_runs` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_scheduled_job_runs_started_at` ON `scheduled_job_runs` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_scheduled_job_runs_status` ON `scheduled_job_runs` (`status`);--> statement-breakpoint
CREATE TABLE `scheduled_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`schedule_type` text NOT NULL,
	`cron_expression` text,
	`run_at` integer,
	`interval_minutes` integer,
	`timezone` text DEFAULT 'UTC',
	`provider` text NOT NULL,
	`target` text NOT NULL,
	`message_template` text NOT NULL,
	`enabled` integer DEFAULT true,
	`last_run_at` integer,
	`next_run_at` integer,
	`run_count` integer DEFAULT 0,
	`last_error` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_scheduled_jobs_enabled` ON `scheduled_jobs` (`enabled`);--> statement-breakpoint
CREATE INDEX `idx_scheduled_jobs_next_run` ON `scheduled_jobs` (`next_run_at`);--> statement-breakpoint
CREATE INDEX `idx_scheduled_jobs_provider` ON `scheduled_jobs` (`provider`);--> statement-breakpoint
CREATE TABLE `scheduled_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`cron_expression` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`message` text NOT NULL,
	`is_active` integer DEFAULT true,
	`last_run` integer,
	`next_run` integer,
	`created_by` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_scheduled_messages_active` ON `scheduled_messages` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_scheduled_messages_next_run` ON `scheduled_messages` (`next_run`);--> statement-breakpoint
CREATE TABLE `secrets` (
	`key` text PRIMARY KEY NOT NULL,
	`encrypted_value` text NOT NULL,
	`iv` text NOT NULL,
	`auth_tag` text NOT NULL,
	`category` text,
	`description` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_secrets_category` ON `secrets` (`category`);--> statement-breakpoint
CREATE TABLE `secrets_audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`action` text NOT NULL,
	`changed_by` text,
	`changed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_secrets_audit_key` ON `secrets_audit_log` (`key`);--> statement-breakpoint
CREATE INDEX `idx_secrets_audit_time` ON `secrets_audit_log` (`changed_at`);--> statement-breakpoint
CREATE TABLE `slack_channel_permissions` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`permission` text DEFAULT 'read_only' NOT NULL,
	`respond_to_mentions` integer DEFAULT true,
	`respond_to_dms` integer DEFAULT true,
	`notes` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_slack_permissions_permission` ON `slack_channel_permissions` (`permission`);--> statement-breakpoint
CREATE TABLE `slack_channels` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`channel_name` text,
	`channel_type` text,
	`is_member` integer DEFAULT true,
	`last_updated` integer
);
--> statement-breakpoint
CREATE INDEX `idx_slack_channels_name` ON `slack_channels` (`channel_name`);--> statement-breakpoint
CREATE INDEX `idx_slack_channels_type` ON `slack_channels` (`channel_type`);--> statement-breakpoint
CREATE TABLE `slack_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` text,
	`channel_id` text NOT NULL,
	`thread_ts` text,
	`user_id` text NOT NULL,
	`user_name` text,
	`text` text NOT NULL,
	`direction` text NOT NULL,
	`timestamp` integer NOT NULL,
	`created_at` integer,
	`has_files` integer DEFAULT false,
	`file_types` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `slack_messages_message_id_unique` ON `slack_messages` (`message_id`);--> statement-breakpoint
CREATE INDEX `idx_slack_messages_channel` ON `slack_messages` (`channel_id`);--> statement-breakpoint
CREATE INDEX `idx_slack_messages_timestamp` ON `slack_messages` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_slack_messages_direction` ON `slack_messages` (`direction`);--> statement-breakpoint
CREATE INDEX `idx_slack_messages_thread` ON `slack_messages` (`thread_ts`);--> statement-breakpoint
CREATE INDEX `idx_slack_messages_user` ON `slack_messages` (`user_id`);--> statement-breakpoint
CREATE TABLE `slack_permission_audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_id` text NOT NULL,
	`old_permission` text,
	`new_permission` text NOT NULL,
	`changed_by` text,
	`changed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_slack_audit_channel` ON `slack_permission_audit_log` (`channel_id`);--> statement-breakpoint
CREATE INDEX `idx_slack_audit_time` ON `slack_permission_audit_log` (`changed_at`);--> statement-breakpoint
CREATE TABLE `system_prompts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` text NOT NULL,
	`platform` text NOT NULL,
	`prompt_text` text NOT NULL,
	`is_active` integer DEFAULT true,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_system_prompts_lookup` ON `system_prompts` (`platform`,`chat_id`);--> statement-breakpoint
CREATE INDEX `idx_system_prompts_platform` ON `system_prompts` (`platform`);--> statement-breakpoint
CREATE TABLE `user_feature_flag_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`flag_id` text NOT NULL,
	`enabled` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `dashboard_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`flag_id`) REFERENCES `feature_flags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_flag_overrides_user_flag` ON `user_feature_flag_overrides` (`user_id`,`flag_id`);--> statement-breakpoint
CREATE INDEX `idx_user_flag_overrides_user` ON `user_feature_flag_overrides` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_user_flag_overrides_flag` ON `user_feature_flag_overrides` (`flag_id`);--> statement-breakpoint
CREATE TABLE `user_version_preferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`notifications_enabled` integer DEFAULT true,
	`dismissed_versions` text DEFAULT '[]',
	`remind_later_until` integer,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `dashboard_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_version_preferences_user_id_unique` ON `user_version_preferences` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_user_version_prefs_user` ON `user_version_preferences` (`user_id`);--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`webhook_id` integer NOT NULL,
	`received_at` integer,
	`event_type` text,
	`payload` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`message_sent` text,
	`processing_time_ms` integer,
	FOREIGN KEY (`webhook_id`) REFERENCES `webhooks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_webhook_events_webhook_id` ON `webhook_events` (`webhook_id`);--> statement-breakpoint
CREATE INDEX `idx_webhook_events_received_at` ON `webhook_events` (`received_at`);--> statement-breakpoint
CREATE INDEX `idx_webhook_events_status` ON `webhook_events` (`status`);--> statement-breakpoint
CREATE TABLE `webhook_forwards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`source_path_prefix` text NOT NULL,
	`target_url` text NOT NULL,
	`is_active` integer DEFAULT true,
	`verify_signature` integer DEFAULT false,
	`signature_header` text,
	`signature_secret` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_webhook_forwards_active` ON `webhook_forwards` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_webhook_forwards_path` ON `webhook_forwards` (`source_path_prefix`);--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`token` text NOT NULL,
	`signature_header` text,
	`source_type` text NOT NULL,
	`event_filter` text,
	`provider` text NOT NULL,
	`target` text NOT NULL,
	`message_template` text,
	`enabled` integer DEFAULT true,
	`last_triggered_at` integer,
	`trigger_count` integer DEFAULT 0,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhooks_name_unique` ON `webhooks` (`name`);--> statement-breakpoint
CREATE INDEX `idx_webhooks_name` ON `webhooks` (`name`);--> statement-breakpoint
CREATE INDEX `idx_webhooks_enabled` ON `webhooks` (`enabled`);--> statement-breakpoint
CREATE INDEX `idx_webhooks_source_type` ON `webhooks` (`source_type`);