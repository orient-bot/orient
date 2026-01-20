/**
 * Eval Schema Validation Tests
 *
 * These tests validate that all YAML eval files conform to the expected schema.
 * Can run in worktrees without the full eval runner setup.
 *
 * Usage: npx tsx evals/validate-evals.test.ts
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import * as yaml from 'js-yaml';

const EVALS_DIR = __dirname;

interface EvalCase {
  name: string;
  description?: string;
  type: 'tool_selection' | 'response_quality' | 'skill_invocation' | 'multi_step_workflow';
  agent: string;
  context?: {
    platform?: 'whatsapp' | 'slack' | 'opencode' | 'cursor';
    chatId?: string;
    channelId?: string;
  };
  input: {
    prompt: string;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  };
  mocks?: Record<string, Record<string, unknown>>;
  expect: {
    tool_calls?: {
      required?: Array<{ name: string; arguments?: Record<string, unknown> }>;
      forbidden?: string[];
      order?: 'strict' | 'any';
    };
    skills?: {
      activated?: string[];
      content_used?: Array<{ pattern: string; reason?: string }>;
    };
    workflow?: {
      steps: Array<{
        name: string;
        tools: string[];
        order?: 'strict' | 'any';
        depends_on?: string;
        arguments_contain?: Record<string, unknown>;
      }>;
    };
    assertions?: Array<{
      type:
        | 'tool_called'
        | 'tool_not_called'
        | 'tool_arguments'
        | 'skill_activated'
        | 'response_mentions'
        | 'response_matches'
        | 'workflow_completed';
      tool?: string;
      skill?: string;
      values?: string[];
      pattern?: string;
      steps?: string[];
    }>;
  };
  scoring?: {
    llm_judge?: {
      enabled: boolean;
      criteria?: Array<{ name: string; description: string; weight: number }>;
      threshold?: number;
      rubric?: string;
    };
  };
}

function findYamlFiles(dir: string): string[] {
  const files: string[] = [];
  const items = readdirSync(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory() && !item.startsWith('.') && item !== 'config' && item !== 'schemas') {
      files.push(...findYamlFiles(fullPath));
    } else if (item.endsWith('.yaml') && !item.includes('schema') && !item.includes('config')) {
      files.push(fullPath);
    }
  }

  return files;
}

function validateEvalCase(filePath: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const relativePath = relative(EVALS_DIR, filePath);

  try {
    const content = readFileSync(filePath, 'utf8');
    const evalCase = yaml.load(content) as EvalCase;

    // Required fields
    if (!evalCase.name) {
      errors.push(`Missing required field: name`);
    } else if (!/^[a-z0-9-]+$/.test(evalCase.name)) {
      errors.push(`Invalid name format: must be lowercase alphanumeric with hyphens`);
    }

    if (!evalCase.type) {
      errors.push(`Missing required field: type`);
    } else if (
      !['tool_selection', 'response_quality', 'skill_invocation', 'multi_step_workflow'].includes(
        evalCase.type
      )
    ) {
      errors.push(`Invalid type: ${evalCase.type}`);
    }

    if (!evalCase.agent) {
      errors.push(`Missing required field: agent`);
    }

    if (!evalCase.input) {
      errors.push(`Missing required field: input`);
    } else if (!evalCase.input.prompt) {
      errors.push(`Missing required field: input.prompt`);
    }

    if (!evalCase.expect) {
      errors.push(`Missing required field: expect`);
    }

    // Validate assertions if present
    if (evalCase.expect?.assertions) {
      for (const assertion of evalCase.expect.assertions) {
        const validTypes = [
          'tool_called',
          'tool_not_called',
          'tool_arguments',
          'skill_activated',
          'response_mentions',
          'response_matches',
          'workflow_completed',
        ];
        if (!validTypes.includes(assertion.type)) {
          errors.push(`Invalid assertion type: ${assertion.type}`);
        }
      }
    }

    // Validate tool_calls.forbidden is array of strings
    if (evalCase.expect?.tool_calls?.forbidden) {
      if (!Array.isArray(evalCase.expect.tool_calls.forbidden)) {
        errors.push(`tool_calls.forbidden must be an array`);
      } else {
        for (const item of evalCase.expect.tool_calls.forbidden) {
          if (typeof item !== 'string') {
            errors.push(`tool_calls.forbidden items must be strings`);
          }
        }
      }
    }

    // Validate tool_calls.required has correct structure
    if (evalCase.expect?.tool_calls?.required) {
      if (!Array.isArray(evalCase.expect.tool_calls.required)) {
        errors.push(`tool_calls.required must be an array`);
      } else {
        for (const item of evalCase.expect.tool_calls.required) {
          if (typeof item !== 'object' || !item.name) {
            errors.push(`tool_calls.required items must have a 'name' property`);
          }
        }
      }
    }
  } catch (e) {
    errors.push(`YAML parse error: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { valid: errors.length === 0, errors };
}

// Main execution
console.log('🔍 Validating eval YAML files...\n');

const yamlFiles = findYamlFiles(EVALS_DIR);
let passed = 0;
let failed = 0;

for (const file of yamlFiles) {
  const relativePath = relative(EVALS_DIR, file);
  const result = validateEvalCase(file);

  if (result.valid) {
    console.log(`✅ ${relativePath}`);
    passed++;
  } else {
    console.log(`❌ ${relativePath}`);
    for (const error of result.errors) {
      console.log(`   - ${error}`);
    }
    failed++;
  }
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${yamlFiles.length} files`);

if (failed > 0) {
  process.exit(1);
}
