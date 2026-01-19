/**
 * JIRA Integration Tests
 */
import { describe, it, expect } from 'vitest';

describe('JIRA Integration Types', () => {
  it('should export JIRA types', async () => {
    const { JiraServiceConfig } = await import('../src/jira/types.js');
    // Type-only test - just verify the import works
    expect(JiraServiceConfig).toBeUndefined(); // Types don't exist at runtime
  });

  it('should export JIRA service functions', async () => {
    const jira = await import('../src/jira/service.js');
    expect(jira.initializeJiraClient).toBeDefined();
    expect(jira.getJiraClient).toBeDefined();
    expect(jira.testConnection).toBeDefined();
    expect(jira.getAllIssues).toBeDefined();
    expect(jira.getInProgressIssues).toBeDefined();
    expect(jira.getBlockerIssues).toBeDefined();
  }, 30000);
});

describe('Google Integration Types', () => {
  it('should export Google types', async () => {
    const google = await import('../src/google/index.js');
    // Migration is complete, so this should now be false
    expect(google.GOOGLE_SERVICES_MIGRATION_PENDING).toBe(false);
  }, 30000);
});
