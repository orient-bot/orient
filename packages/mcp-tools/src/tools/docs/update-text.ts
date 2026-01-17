/**
 * Update Text Tool
 * Update text placeholders on ALL slides globally.
 */

import { z } from 'zod';
import { MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';

interface Replacement {
  placeholder: string;
  replacement: string;
}

interface Input {
  presentationUrl?: string;
  replacements: Replacement[];
}

interface Output {
  success: boolean;
  replacementsApplied?: number;
  error?: string;
}

export class UpdateTextTool extends MCPTool<Input, Output> {
  name = 'ai_first_slides_update_text';
  description =
    'Update text placeholders on ALL slides globally. Placeholders should be in format {{PLACEHOLDER_NAME}}.';
  category = 'docs' as const;
  keywords = ['slides', 'update', 'text', 'replace', 'placeholder'];
  useCases = ['Update placeholders in a presentation', 'Replace text in slides'];

  inputSchema = z.object({
    presentationUrl: z.string().optional().describe('The Google Slides URL or presentation ID'),
    replacements: z
      .array(
        z.object({
          placeholder: z.string(),
          replacement: z.string(),
        })
      )
      .describe('Array of placeholder-replacement pairs'),
  });

  async execute(input: Input, context: ToolContext): Promise<Output> {
    const getSlidesService = context.getSlidesService;

    if (!getSlidesService) {
      return {
        success: false,
        error: 'Google Slides service not available',
      };
    }

    try {
      const slidesService = await getSlidesService();

      if (!slidesService || typeof (slidesService as any).updateText !== 'function') {
        return {
          success: false,
          error: 'Slides service not properly initialized',
        };
      }

      await (slidesService as any).updateText(input.presentationUrl, input.replacements);

      return {
        success: true,
        replacementsApplied: input.replacements.length,
      };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  }
}

export const updateTextTool = new UpdateTextTool();
