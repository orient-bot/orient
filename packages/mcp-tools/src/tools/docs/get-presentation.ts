/**
 * Get Presentation Tool
 * Get presentation metadata and list of all slides.
 */

import { z } from 'zod';
import { MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';

interface Input {
  presentationUrl?: string;
}

interface SlideInfo {
  slideId: string;
  title: string;
  index: number;
}

interface Output {
  success: boolean;
  title?: string;
  slideCount?: number;
  slides?: SlideInfo[];
  error?: string;
}

export class GetPresentationTool extends MCPTool<Input, Output> {
  name = 'ai_first_slides_get_presentation';
  description = 'Get presentation metadata and list of all slides with their titles.';
  category = 'docs' as const;
  keywords = ['slides', 'presentation', 'google', 'get', 'list'];
  useCases = ['Get information about a presentation', 'List slides in a deck'];

  inputSchema = z.object({
    presentationUrl: z.string().optional().describe('The Google Slides URL or presentation ID'),
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

      if (!slidesService || typeof (slidesService as any).getPresentation !== 'function') {
        return {
          success: false,
          error: 'Slides service not properly initialized',
        };
      }

      const presentation = await (slidesService as any).getPresentation(input.presentationUrl);

      const slides: SlideInfo[] =
        presentation.slides?.map((slide: any, index: number) => ({
          slideId: slide.objectId,
          title: slide.title || `Slide ${index + 1}`,
          index,
        })) || [];

      return {
        success: true,
        title: presentation.title,
        slideCount: slides.length,
        slides,
      };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  }
}

export const getPresentationTool = new GetPresentationTool();
