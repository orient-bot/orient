-- Migration: Fix feature flag IDs for operations hierarchy
-- Description: Align existing IDs with operations.* hierarchy used by frontend

UPDATE feature_flags SET id = 'operations.storage' WHERE id = 'storage';
UPDATE feature_flags SET id = 'operations.billing' WHERE id = 'billing';
UPDATE feature_flags SET id = 'operations.monitoring' WHERE id = 'monitoring';
UPDATE feature_flags SET id = 'operations.monitoring.server_health' WHERE id = 'monitoring.server_health';

UPDATE user_feature_flag_overrides SET flag_id = 'operations.storage' WHERE flag_id = 'storage';
UPDATE user_feature_flag_overrides SET flag_id = 'operations.billing' WHERE flag_id = 'billing';
UPDATE user_feature_flag_overrides SET flag_id = 'operations.monitoring' WHERE flag_id = 'monitoring';
UPDATE user_feature_flag_overrides SET flag_id = 'operations.monitoring.server_health' WHERE flag_id = 'monitoring.server_health';
