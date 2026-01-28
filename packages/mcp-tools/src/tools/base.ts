/**
 * Base Tool Class
 *
 * Abstract base class for all MCP tools.
 * Provides common structure for tool definition, metadata, and execution.
 */

import { z, ZodSchema } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolCategory, ToolContext, ToolMetadata, ToolResult } from '../types.js';
import { createServiceLogger } from '@orientbot/core';

/**
 * Convert a Zod schema to JSON Schema format for MCP
 */
function zodToJsonSchema(schema: ZodSchema): Record<string, unknown> {
  const description = schema.description;

  // Check if it's an object schema
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const fieldSchema = value as ZodSchema;
      const fieldDef: Record<string, unknown> = {};

      // Try to determine the type
      if (fieldSchema instanceof z.ZodString) {
        fieldDef.type = 'string';
      } else if (fieldSchema instanceof z.ZodNumber) {
        fieldDef.type = 'number';
      } else if (fieldSchema instanceof z.ZodBoolean) {
        fieldDef.type = 'boolean';
      } else if (fieldSchema instanceof z.ZodArray) {
        fieldDef.type = 'array';
      } else if (fieldSchema instanceof z.ZodOptional) {
        // Optional field - get the inner type
        const innerSchema = fieldSchema._def.innerType;
        if (innerSchema instanceof z.ZodString) {
          fieldDef.type = 'string';
        } else if (innerSchema instanceof z.ZodNumber) {
          fieldDef.type = 'number';
        } else if (innerSchema instanceof z.ZodBoolean) {
          fieldDef.type = 'boolean';
        }
      } else {
        fieldDef.type = 'string'; // Default fallback
      }

      if (fieldSchema.description) {
        fieldDef.description = fieldSchema.description;
      }

      properties[key] = fieldDef;

      // Check if required (not optional)
      if (!(fieldSchema instanceof z.ZodOptional)) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required,
      ...(description && { description }),
    };
  }

  // Fallback for non-object schemas
  return {
    type: 'object',
    properties: {},
    required: [],
  };
}

/**
 * Abstract base class for MCP tools
 *
 * Extend this class to create new tools with:
 * - Type-safe input/output
 * - Automatic logging
 * - Error handling
 * - Registry integration
 */
export abstract class MCPTool<TInput = unknown, TOutput = unknown> {
  /** Unique tool name (e.g., "system_health_check") */
  abstract readonly name: string;

  /** Human-readable description */
  abstract readonly description: string;

  /** Tool category for organization */
  abstract readonly category: ToolCategory;

  /** Zod schema for input validation */
  abstract readonly inputSchema: ZodSchema<TInput>;

  /** Keywords for search discovery */
  abstract readonly keywords: string[];

  /** Use case descriptions */
  abstract readonly useCases: string[];

  /** Optional usage examples */
  readonly examples?: Array<{
    description: string;
    input: Record<string, unknown>;
  }>;

  /** Logger instance */
  protected logger = createServiceLogger('tool');

  /**
   * Execute the tool with the given input
   * Override this in subclasses to implement tool logic
   */
  abstract execute(input: TInput, context: ToolContext): Promise<TOutput>;

  /**
   * Validate input and execute with error handling
   */
  async run(rawInput: unknown, context: ToolContext): Promise<ToolResult<TOutput>> {
    const op = this.logger.startOperation(this.name, {
      correlationId: context.correlationId,
    });

    try {
      // Validate input
      const parseResult = this.inputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        const errors = parseResult.error.issues
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', ');
        op.failure(new Error(`Invalid input: ${errors}`));
        return {
          success: false,
          error: `Invalid input: ${errors}`,
        };
      }

      // Execute
      const result = await this.execute(parseResult.data, context);

      op.success('Tool executed successfully');
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      op.failure(error instanceof Error ? error : new Error(errorMessage));
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Convert to MCP Tool definition
   */
  toMCPTool(): Tool {
    return {
      name: this.name,
      description: this.description,
      inputSchema: zodToJsonSchema(this.inputSchema) as Tool['inputSchema'],
    };
  }

  /**
   * Convert to tool metadata for registry
   */
  toMetadata(): ToolMetadata {
    return {
      tool: this.toMCPTool(),
      category: this.category,
      keywords: this.keywords,
      useCases: this.useCases,
      examples: this.examples,
    };
  }
}

/**
 * Create a simple tool without extending the class
 * Useful for quick tool definitions
 */
export function createTool<TInput, TOutput>(options: {
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: ZodSchema<TInput>;
  keywords: string[];
  useCases: string[];
  examples?: Array<{ description: string; input: Record<string, unknown> }>;
  execute: (input: TInput, context: ToolContext) => Promise<TOutput>;
}): MCPTool<TInput, TOutput> {
  return new (class extends MCPTool<TInput, TOutput> {
    readonly name = options.name;
    readonly description = options.description;
    readonly category = options.category;
    readonly inputSchema = options.inputSchema;
    readonly keywords = options.keywords;
    readonly useCases = options.useCases;
    readonly examples = options.examples;

    execute = options.execute;
  })();
}
