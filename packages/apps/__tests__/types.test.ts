/**
 * Apps Package Tests
 */
import { describe, it, expect } from 'vitest';
import {
  AppManifestSchema,
  validateAppManifest,
  generateAppManifestTemplate,
} from '../src/types.js';

describe('App Types', () => {
  it('should validate a valid app manifest', () => {
    const manifest = {
      name: 'test-app',
      version: '1.0.0',
      title: 'Test Application',
      description: 'A test application for validation purposes.',
    };

    const result = validateAppManifest(manifest);
    expect(result.valid).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('should reject invalid app name', () => {
    const manifest = {
      name: 'Test App', // Invalid - has spaces and uppercase
      version: '1.0.0',
      title: 'Test Application',
      description: 'A test application for validation purposes.',
    };

    const result = validateAppManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('should generate app manifest template', () => {
    const template = generateAppManifestTemplate(
      'my-app',
      'My Application',
      'This is a sample application description.'
    );

    expect(template.name).toBe('my-app');
    expect(template.title).toBe('My Application');
    expect(template.version).toBe('1.0.0');
  });
});
