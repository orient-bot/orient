/**
 * Agents Package Tests
 */
import { describe, it, expect } from 'vitest';
import { AGENTS_MIGRATION_STATUS } from '../src/index.js';

describe('Agents Package', () => {
  it('should export migration status', () => {
    expect(AGENTS_MIGRATION_STATUS).toBeDefined();
    expect(AGENTS_MIGRATION_STATUS.types).toBe('migrated');
  });

  it('should have re-exported services', () => {
    expect(AGENTS_MIGRATION_STATUS.agentService).toBe('re-exported');
    expect(AGENTS_MIGRATION_STATUS.toolCallingService).toBe('re-exported');
  });
});
