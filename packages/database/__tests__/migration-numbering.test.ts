/**
 * Migration File Numbering Tests
 *
 * Ensures migration files follow proper naming conventions and have unique prefixes.
 * This prevents issues with non-deterministic migration execution order.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '../../../data/migrations');

describe('Migration File Numbering', () => {
  it('should have no duplicate migration number prefixes', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

    const prefixMap = new Map<string, string[]>();

    for (const file of files) {
      const match = file.match(/^(\d+)_/);
      if (match) {
        const prefix = match[1];
        const existing = prefixMap.get(prefix) || [];
        existing.push(file);
        prefixMap.set(prefix, existing);
      }
    }

    const duplicates: string[] = [];
    for (const [prefix, fileList] of prefixMap) {
      if (fileList.length > 1) {
        duplicates.push(`Prefix ${prefix}: ${fileList.join(', ')}`);
      }
    }

    expect(
      duplicates,
      `Duplicate migration prefixes found:\n${duplicates.join('\n')}`
    ).toHaveLength(0);
  });

  it('should have sequential migration numbers starting from 001', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

    const prefixes = files
      .map((f) => {
        const match = f.match(/^(\d+)_/);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);

    // Check starts at 1
    expect(prefixes[0]).toBe(1);

    // Check no gaps (each number should be previous + 1)
    for (let i = 1; i < prefixes.length; i++) {
      expect(prefixes[i], `Gap in migration sequence: missing ${prefixes[i - 1] + 1}`).toBe(
        prefixes[i - 1] + 1
      );
    }
  });

  it('should follow naming convention: NNN_description.sql', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

    const invalidFiles: string[] = [];
    const pattern = /^\d{3}_[a-z][a-z0-9_]*\.sql$/;

    for (const file of files) {
      if (!pattern.test(file)) {
        invalidFiles.push(file);
      }
    }

    expect(
      invalidFiles,
      `Invalid migration filenames (expected NNN_snake_case.sql):\n${invalidFiles.join('\n')}`
    ).toHaveLength(0);
  });

  it('should list all migrations in order', () => {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    // This test serves as documentation - prints the current migration list
    expect(files.length).toBeGreaterThan(0);

    // Log for visibility in test output
    console.log('Current migrations:');
    files.forEach((f) => console.log(`  - ${f}`));
  });
});
