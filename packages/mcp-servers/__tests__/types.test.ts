/**
 * MCP Servers Package Tests
 */
import { describe, it, expect } from 'vitest';
import { MCP_SERVERS_MIGRATION_STATUS } from '../src/index.js';

describe('MCP Servers Package', () => {
  it('should export migration status', () => {
    expect(MCP_SERVERS_MIGRATION_STATUS).toBeDefined();
    expect(MCP_SERVERS_MIGRATION_STATUS.types).toBe('migrated');
  });

  it('should have pending migration for servers', () => {
    expect(MCP_SERVERS_MIGRATION_STATUS.coreServer).toBe('pending');
    expect(MCP_SERVERS_MIGRATION_STATUS.codingServer).toBe('pending');
  });
});
