/**
 * Skills Service - Discovers and reads skills from .claude/skills/
 *
 * Skills are specialized knowledge modules that provide domain-specific
 * guidance. Each skill is a directory containing a SKILL.md file with
 * YAML frontmatter (name, description) and markdown content.
 */

import fs from 'fs';
import path from 'path';
import { createServiceLogger, getBuiltinSkillsPath, getUserSkillsPath } from '@orient-bot/core';

const logger = createServiceLogger('skills-service');

/**
 * Skill metadata parsed from SKILL.md frontmatter
 */
export interface SkillMetadata {
  name: string;
  description: string;
}

/**
 * Full skill information including content
 */
export interface Skill {
  name: string;
  description: string;
  content: string;
  path: string;
  source: 'builtin' | 'user';
}

/**
 * Summary information for listing skills
 */
export interface SkillSummary {
  name: string;
  description: string;
  source: 'builtin' | 'user';
}

/**
 * Parse YAML frontmatter from SKILL.md content
 * Expected format:
 * ---
 * name: skill-name
 * description: Skill description here
 * ---
 * # Content starts here
 */
function parseFrontmatter(content: string): { metadata: SkillMetadata; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return {
      metadata: { name: 'unknown', description: 'No description available' },
      body: content,
    };
  }

  const frontmatterText = match[1];
  const body = content.slice(match[0].length);

  // Simple YAML parsing for name and description
  const nameMatch = frontmatterText.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatterText.match(/^description:\s*(.+)$/m);

  return {
    metadata: {
      name: nameMatch ? nameMatch[1].trim() : 'unknown',
      description: descMatch ? descMatch[1].trim() : 'No description available',
    },
    body: body.trim(),
  };
}

export class SkillsService {
  private builtinSkillsPath: string;
  private userSkillsPath: string;
  private skillsCache: Map<string, Skill> = new Map();
  private initialized: boolean = false;

  constructor(projectRoot?: string) {
    this.builtinSkillsPath = getBuiltinSkillsPath(projectRoot);
    this.userSkillsPath = getUserSkillsPath();

    logger.info('Skills service created', {
      builtinSkillsPath: this.builtinSkillsPath,
      userSkillsPath: this.userSkillsPath,
    });
  }

  /**
   * Initialize the service by discovering available skills
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const op = logger.startOperation('initializeSkills');

    try {
      if (!fs.existsSync(this.userSkillsPath)) {
        fs.mkdirSync(this.userSkillsPath, { recursive: true });
      }

      this.scanDirectory(this.builtinSkillsPath, 'builtin');
      this.scanDirectory(this.userSkillsPath, 'user');

      this.initialized = true;
      op.success('Skills initialized', { count: this.skillsCache.size });
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Get list of all available skills with their descriptions
   */
  listSkills(): SkillSummary[] {
    if (!this.initialized) {
      logger.warn('Skills service not initialized, returning empty list');
      return [];
    }

    return Array.from(this.skillsCache.values()).map((skill) => ({
      name: skill.name,
      description: skill.description,
      source: skill.source,
    }));
  }

  /**
   * Read a specific skill by name
   * @param skillName - The name of the skill to read
   * @returns The skill content or null if not found
   */
  readSkill(skillName: string): Skill | null {
    if (!this.initialized) {
      logger.warn('Skills service not initialized');
      return null;
    }

    const skill = this.skillsCache.get(skillName);

    if (!skill) {
      // Try case-insensitive match
      for (const [name, s] of this.skillsCache.entries()) {
        if (name.toLowerCase() === skillName.toLowerCase()) {
          return s;
        }
      }

      logger.debug('Skill not found', { skillName });
      return null;
    }

    return skill;
  }

  /**
   * Check if a skill exists
   */
  hasSkill(skillName: string): boolean {
    return this.readSkill(skillName) !== null;
  }

  /**
   * Get the number of loaded skills
   */
  get skillCount(): number {
    return this.skillsCache.size;
  }

  /**
   * Force reload all skills from disk
   * Clears cache and re-initializes
   */
  async reload(): Promise<{ previous: number; current: number }> {
    const op = logger.startOperation('reloadSkills');
    const previousCount = this.skillsCache.size;

    try {
      // Clear cache and reset initialized flag
      this.skillsCache.clear();
      this.initialized = false;

      // Re-initialize
      await this.initialize();

      const currentCount = this.skillsCache.size;
      op.success('Skills reloaded', { previous: previousCount, current: currentCount });

      return { previous: previousCount, current: currentCount };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Validate skill content before creating a PR
   * @param content - The full SKILL.md content including frontmatter
   * @returns Validation result with any errors
   */
  validateSkillContent(content: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for frontmatter
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      errors.push('Missing YAML frontmatter (must start with --- and end with ---)');
      return { valid: false, errors };
    }

    const frontmatter = match[1];
    const body = content.slice(match[0].length);

    // Check for required fields
    if (!/^name:\s*.+$/m.test(frontmatter)) {
      errors.push('Missing required field: name');
    }

    if (!/^description:\s*.+$/m.test(frontmatter)) {
      errors.push('Missing required field: description');
    }

    // Check name format
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    if (nameMatch) {
      const name = nameMatch[1].trim();
      if (!/^[a-z0-9-]+$/.test(name)) {
        errors.push('Skill name must be lowercase with hyphens only (e.g., "my-skill-name")');
      }
    }

    // Check description length
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    if (descMatch) {
      const desc = descMatch[1].trim();
      if (desc.length < 50) {
        errors.push('Description should be at least 50 characters for good discoverability');
      }
    }

    // Check body content
    if (body.trim().length < 100) {
      errors.push('Skill body content is too short (should be at least 100 characters)');
    }

    // Check for progressive disclosure (warn if too long)
    const lineCount = body.split('\n').length;
    if (lineCount > 500) {
      errors.push(
        `Skill body is ${lineCount} lines (recommended max: 500). Consider using references/ for detailed content.`
      );
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Generate a SKILL.md template with frontmatter
   */
  generateSkillTemplate(name: string, description: string, bodyContent: string): string {
    return `---
name: ${name}
description: ${description}
---

${bodyContent}`;
  }

  /**
   * Get the skills directory path
   */
  getSkillsPath(): string {
    return this.userSkillsPath;
  }

  private scanDirectory(dir: string, source: 'builtin' | 'user'): void {
    if (!fs.existsSync(dir)) {
      logger.debug('Skills directory not found', { path: dir, source });
      return;
    }

    const skillFiles: string[] = [];

    const collectSkillFiles = (currentDir: string): void => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      const hasSkillFile = entries.some(
        (entry) => entry.isFile() && entry.name.toLowerCase() === 'skill.md'
      );

      if (hasSkillFile) {
        skillFiles.push(path.join(currentDir, 'SKILL.md'));
        return;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        collectSkillFiles(path.join(currentDir, entry.name));
      }
    };

    collectSkillFiles(dir);

    for (const skillFile of skillFiles) {
      try {
        const content = fs.readFileSync(skillFile, 'utf-8');
        const { metadata, body } = parseFrontmatter(content);

        const skill: Skill = {
          name: metadata.name,
          description: metadata.description,
          content: body,
          path: skillFile,
          source,
        };

        this.skillsCache.set(metadata.name, skill);
        logger.debug('Loaded skill', { name: metadata.name, source });
      } catch (error) {
        logger.warn('Failed to load skill', {
          path: skillFile,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

/**
 * Create and initialize a SkillsService instance
 */
export async function createSkillsService(projectRoot?: string): Promise<SkillsService> {
  const service = new SkillsService(projectRoot);
  await service.initialize();
  return service;
}
