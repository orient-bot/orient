/**
 * Skill Files Validation Test
 *
 * Validates that all SKILL.md files in .claude/skills/ and .opencode/skill/
 * have valid YAML frontmatter that can be parsed by OpenCode.
 *
 * This test catches issues like:
 * - Invalid YAML syntax (unquoted strings with special characters)
 * - Missing required fields (name, description)
 * - Malformed frontmatter delimiters
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve, relative } from 'path';
import { glob } from 'glob';
import * as yaml from 'yaml';

const PROJECT_ROOT = resolve(__dirname, '../..');

// Directories that may contain skill files
const SKILL_DIRECTORIES = ['.claude/skills', '.opencode/skill'];

interface SkillFrontmatter {
  name?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * Parse YAML frontmatter from a markdown file
 */
function parseFrontmatter(content: string): {
  frontmatter: SkillFrontmatter | null;
  error: string | null;
} {
  // Check for frontmatter delimiters
  if (!content.startsWith('---')) {
    return { frontmatter: null, error: 'File does not start with frontmatter delimiter (---)' };
  }

  // Find the closing delimiter
  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) {
    return { frontmatter: null, error: 'Missing closing frontmatter delimiter (---)' };
  }

  // Extract the YAML content
  const yamlContent = content.slice(4, endIndex).trim();

  if (!yamlContent) {
    return { frontmatter: null, error: 'Empty frontmatter' };
  }

  try {
    const parsed = yaml.parse(yamlContent) as SkillFrontmatter;
    return { frontmatter: parsed, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { frontmatter: null, error: `YAML parse error: ${message}` };
  }
}

/**
 * Find all SKILL.md files in the project
 */
async function findSkillFiles(): Promise<string[]> {
  const allFiles: string[] = [];

  for (const dir of SKILL_DIRECTORIES) {
    const fullPath = resolve(PROJECT_ROOT, dir);
    if (!existsSync(fullPath)) {
      continue;
    }

    const pattern = resolve(fullPath, '**/SKILL.md');
    const files = await glob(pattern, { nodir: true });
    allFiles.push(...files);
  }

  return allFiles;
}

describe('Skill Files Validation', () => {
  it('should find skill files to validate', async () => {
    const files = await findSkillFiles();
    // It's okay if there are no skill files, but log it
    if (files.length === 0) {
      console.log('No SKILL.md files found in:', SKILL_DIRECTORIES);
    }
    expect(files).toBeDefined();
  });

  it('should have valid YAML frontmatter in all SKILL.md files', async () => {
    const files = await findSkillFiles();
    const errors: Array<{ file: string; error: string }> = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const relativePath = relative(PROJECT_ROOT, file);
      const { frontmatter, error } = parseFrontmatter(content);

      if (error) {
        errors.push({ file: relativePath, error });
        continue;
      }

      // Validate required fields
      if (!frontmatter?.name) {
        errors.push({ file: relativePath, error: 'Missing required field: name' });
      }
      if (!frontmatter?.description) {
        errors.push({ file: relativePath, error: 'Missing required field: description' });
      }

      // Validate field types
      if (frontmatter?.name && typeof frontmatter.name !== 'string') {
        errors.push({ file: relativePath, error: 'Field "name" must be a string' });
      }
      if (frontmatter?.description && typeof frontmatter.description !== 'string') {
        errors.push({ file: relativePath, error: 'Field "description" must be a string' });
      }
    }

    if (errors.length > 0) {
      const errorMessages = errors.map(({ file, error }) => `  - ${file}: ${error}`).join('\n');

      throw new Error(
        `Found ${errors.length} SKILL.md file(s) with invalid frontmatter:\n${errorMessages}\n\n` +
          'Fix: Ensure YAML frontmatter is properly quoted and contains required fields (name, description).\n' +
          'Example:\n' +
          '---\n' +
          'name: my-skill\n' +
          'description: "Description with special chars: like colons and `backticks`"\n' +
          '---'
      );
    }
  });

  it('should have properly quoted descriptions with special characters', async () => {
    const files = await findSkillFiles();
    const warnings: Array<{ file: string; warning: string }> = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const relativePath = relative(PROJECT_ROOT, file);

      // Extract the raw YAML content
      if (!content.startsWith('---')) continue;
      const endIndex = content.indexOf('\n---', 3);
      if (endIndex === -1) continue;

      const yamlContent = content.slice(4, endIndex);

      // Check for common problematic patterns in unquoted strings
      const lines = yamlContent.split('\n');
      for (const line of lines) {
        // Check for description with special characters that should be quoted
        if (line.startsWith('description:') && !line.includes('"') && !line.includes("'")) {
          // Check for problematic characters
          const value = line.slice('description:'.length).trim();
          if (value.includes('`') || value.includes(': ') || value.includes('#')) {
            warnings.push({
              file: relativePath,
              warning: `Unquoted description contains special characters that may break YAML parsing: ${value.slice(0, 50)}...`,
            });
          }
        }
      }
    }

    if (warnings.length > 0) {
      const warningMessages = warnings
        .map(({ file, warning }) => `  - ${file}: ${warning}`)
        .join('\n');

      console.warn(
        `Found ${warnings.length} SKILL.md file(s) with potentially problematic frontmatter:\n${warningMessages}`
      );
    }
  });

  it('should have unique skill names within each platform directory', async () => {
    // Skills can be duplicated across platforms (.claude/skills vs .opencode/skill)
    // but should be unique within each platform
    for (const dir of SKILL_DIRECTORIES) {
      const fullPath = resolve(PROJECT_ROOT, dir);
      if (!existsSync(fullPath)) {
        continue;
      }

      const pattern = resolve(fullPath, '**/SKILL.md');
      const files = await glob(pattern, { nodir: true });
      const nameToFiles = new Map<string, string[]>();

      for (const file of files) {
        const content = readFileSync(file, 'utf-8');
        const relativePath = relative(PROJECT_ROOT, file);
        const { frontmatter } = parseFrontmatter(content);

        if (frontmatter?.name) {
          const existing = nameToFiles.get(frontmatter.name) || [];
          existing.push(relativePath);
          nameToFiles.set(frontmatter.name, existing);
        }
      }

      const duplicates = Array.from(nameToFiles.entries()).filter(([, files]) => files.length > 1);

      if (duplicates.length > 0) {
        const duplicateMessages = duplicates
          .map(([name, files]) => `  - "${name}" defined in: ${files.join(', ')}`)
          .join('\n');

        throw new Error(
          `Found duplicate skill names in ${dir}:\n${duplicateMessages}\n\n` +
            'Each skill should have a unique name within its platform directory.'
        );
      }
    }
  });
});
