import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { SlidesService, TextReplacement } from '@orient-bot/integrations/google';

export interface SlidesToolDeps {
  getSlidesService: () => SlidesService;
  resolvePresentationId: (input: { presentationUrl?: string }) => string | undefined;
  parseSlideUrl: (url: string) => { presentationId: string; slideId?: string };
  getCompletedThisWeek: () => Promise<
    Array<{ key: string; summary: string; storyPoints?: number | null }>
  >;
  getInProgressIssues: () => Promise<
    Array<{ key: string; summary: string; assignee?: { displayName?: string | null } | null }>
  >;
  getBlockerIssues: () => Promise<
    Array<{ key: string; summary: string; assignee?: { displayName?: string | null } | null }>
  >;
}

export interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

export const googleSlidesTools: Tool[] = [
  {
    name: 'slides_get_presentation',
    description:
      'Get presentation metadata and list of all slides with their titles. Can work with any Google Slides presentation by providing a URL or ID.',
    inputSchema: {
      type: 'object',
      properties: {
        presentationUrl: {
          type: 'string',
          description:
            'The Google Slides URL (e.g., https://docs.google.com/presentation/d/PRESENTATION_ID/edit). Can also be just the presentation ID.',
        },
      },
      required: [],
    },
  },
  {
    name: 'slides_get_slide',
    description:
      'Get the content of a specific slide by its ID. The slide ID can be found in the presentation URL fragment (e.g., #slide=id.SLIDE_ID) or from the slides list.',
    inputSchema: {
      type: 'object',
      properties: {
        slideId: {
          type: 'string',
          description: 'The unique ID of the slide to retrieve',
        },
        presentationUrl: {
          type: 'string',
          description:
            'The Google Slides URL or presentation ID. If provided with a slide fragment (#slide=id.XXX), the slideId parameter is optional.',
        },
      },
      required: [],
    },
  },
  {
    name: 'slides_update_text',
    description:
      'Update text placeholders on ALL slides globally. Placeholders should be in format {{PLACEHOLDER_NAME}}.',
    inputSchema: {
      type: 'object',
      properties: {
        presentationUrl: {
          type: 'string',
          description: 'The Google Slides URL or presentation ID.',
        },
        replacements: {
          type: 'array',
          description: 'Array of placeholder-replacement pairs',
          items: {
            type: 'object',
            properties: {
              placeholder: {
                type: 'string',
                description: 'The placeholder text to replace (e.g., {{WEEK_ENDING}})',
              },
              replacement: {
                type: 'string',
                description: 'The text to replace the placeholder with',
              },
            },
            required: ['placeholder', 'replacement'],
          },
        },
      },
      required: ['replacements'],
    },
  },
  {
    name: 'slides_update_slide_text',
    description:
      'Update text on a SPECIFIC slide only (not globally). Use this to modify content on a single slide.',
    inputSchema: {
      type: 'object',
      properties: {
        slideId: {
          type: 'string',
          description: 'The ID of the slide to update',
        },
        presentationUrl: {
          type: 'string',
          description:
            'The Google Slides URL or presentation ID. If provided with a slide fragment (#slide=id.XXX), the slideId parameter is optional.',
        },
        replacements: {
          type: 'array',
          description: 'Array of text replacement pairs (finds text and replaces it)',
          items: {
            type: 'object',
            properties: {
              placeholder: {
                type: 'string',
                description: 'The text to find and replace',
              },
              replacement: {
                type: 'string',
                description: 'The text to replace it with',
              },
            },
            required: ['placeholder', 'replacement'],
          },
        },
      },
      required: ['replacements'],
    },
  },
  {
    name: 'slides_duplicate_template',
    description:
      'Duplicate a template slide and optionally replace placeholders. Useful for creating new slides based on a template.',
    inputSchema: {
      type: 'object',
      properties: {
        templateSlideId: {
          type: 'string',
          description: 'The ID of the template slide to duplicate',
        },
        replacements: {
          type: 'array',
          description: 'Optional placeholder replacements for the new slide',
          items: {
            type: 'object',
            properties: {
              placeholder: { type: 'string' },
              replacement: { type: 'string' },
            },
            required: ['placeholder', 'replacement'],
          },
        },
        insertAtIndex: {
          type: 'number',
          description: 'Optional index to insert the new slide at',
        },
        presentationUrl: {
          type: 'string',
          description: 'The Google Slides URL or presentation ID.',
        },
      },
      required: ['templateSlideId'],
    },
  },
  {
    name: 'slides_update_weekly',
    description:
      'Update weekly status slide placeholders with Jira data. Optionally duplicates a template slide first.',
    inputSchema: {
      type: 'object',
      properties: {
        templateSlideId: {
          type: 'string',
          description: 'Optional template slide ID to duplicate',
        },
        insertAtIndex: {
          type: 'number',
          description: 'Optional index to insert the new slide at',
        },
        presentationUrl: {
          type: 'string',
          description: 'The Google Slides URL or presentation ID.',
        },
      },
      required: [],
    },
  },
  {
    name: 'slides_delete_slide',
    description: 'Delete a slide by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        slideId: { type: 'string', description: 'The ID of the slide to delete' },
        presentationUrl: {
          type: 'string',
          description: 'The Google Slides URL or presentation ID.',
        },
      },
      required: ['slideId'],
    },
  },
  {
    name: 'slides_create_table',
    description: 'Create a table on a slide with provided data.',
    inputSchema: {
      type: 'object',
      properties: {
        slideId: {
          type: 'string',
          description: 'The ID of the slide to create the table on',
        },
        presentationUrl: {
          type: 'string',
          description: 'The Google Slides URL or presentation ID.',
        },
        data: {
          type: 'array',
          description: '2D array of table cell values',
          items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        headerRow: {
          type: 'boolean',
          description: 'Whether to treat the first row as a header',
        },
        position: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
          },
        },
        size: {
          type: 'object',
          properties: {
            width: { type: 'number' },
            height: { type: 'number' },
          },
        },
      },
      required: ['slideId', 'data'],
    },
  },
];

export function isGoogleSlidesTool(name: string): boolean {
  return googleSlidesTools.some((tool) => tool.name === name);
}

export async function handleGoogleSlidesToolCall(
  name: string,
  args: unknown,
  deps: SlidesToolDeps
): Promise<ToolResponse> {
  switch (name) {
    case 'slides_get_presentation': {
      const { presentationUrl } = args as { presentationUrl?: string };
      const slides = deps.getSlidesService();
      const presentationId = deps.resolvePresentationId({ presentationUrl });
      const presentation = await slides.getPresentation(presentationId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(presentation, null, 2),
          },
        ],
      };
    }

    case 'slides_get_slide': {
      const { slideId: providedSlideId, presentationUrl } = args as {
        slideId?: string;
        presentationUrl?: string;
      };
      const slides = deps.getSlidesService();

      // Try to extract slide ID from URL if not provided directly
      let slideId = providedSlideId;
      let presentationId: string | undefined;

      if (presentationUrl) {
        const parsed = deps.parseSlideUrl(presentationUrl);
        presentationId = parsed.presentationId;
        if (!slideId && parsed.slideId) {
          slideId = parsed.slideId;
        }
      }

      if (!slideId) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error:
                  'slideId is required. Provide it directly or in the URL fragment (#slide=id.XXX)',
              }),
            },
          ],
          isError: true,
        };
      }

      const slideContent = await slides.getSlideContent(slideId, presentationId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(slideContent, null, 2),
          },
        ],
      };
    }

    case 'slides_update_text': {
      const { replacements, presentationUrl } = args as {
        replacements: TextReplacement[];
        presentationUrl?: string;
      };
      const slides = deps.getSlidesService();
      const presentationId = deps.resolvePresentationId({ presentationUrl });
      await slides.updateSlideText(replacements, presentationId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                presentationId: presentationId || slides.getPresentationId(),
                message: `Updated ${replacements.length} placeholder(s)`,
                replacements: replacements.map((r) => r.placeholder),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'slides_update_slide_text': {
      const {
        slideId: providedSlideId,
        replacements,
        presentationUrl,
      } = args as {
        slideId?: string;
        replacements: TextReplacement[];
        presentationUrl?: string;
      };
      const slides = deps.getSlidesService();

      // Try to extract slide ID from URL if not provided directly
      let slideId = providedSlideId;
      let presentationId: string | undefined;

      if (presentationUrl) {
        const parsed = deps.parseSlideUrl(presentationUrl);
        presentationId = parsed.presentationId;
        if (!slideId && parsed.slideId) {
          slideId = parsed.slideId;
        }
      }

      if (!slideId) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error:
                  'slideId is required. Provide it directly or in the URL fragment (#slide=id.XXX)',
              }),
            },
          ],
          isError: true,
        };
      }

      await slides.updateSlideTextOnSlide(slideId, replacements, presentationId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                presentationId: presentationId || slides.getPresentationId(),
                slideId,
                message: `Updated ${replacements.length} text replacement(s) on slide`,
                replacements: replacements.map((r) => ({ from: r.placeholder, to: r.replacement })),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'slides_duplicate_template': {
      const { templateSlideId, replacements, insertAtIndex, presentationUrl } = args as {
        templateSlideId: string;
        replacements?: TextReplacement[];
        insertAtIndex?: number;
        presentationUrl?: string;
      };
      const slides = deps.getSlidesService();
      const presentationId = deps.resolvePresentationId({ presentationUrl });
      const newSlideId = await slides.addSlideFromTemplate(
        templateSlideId,
        replacements || [],
        insertAtIndex,
        presentationId
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                presentationId: presentationId || slides.getPresentationId(),
                newSlideId,
                message: 'Slide duplicated successfully',
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'slides_update_weekly': {
      const { templateSlideId, insertAtIndex, presentationUrl } = args as {
        templateSlideId?: string;
        insertAtIndex?: number;
        presentationUrl?: string;
      };

      // Fetch Jira data
      const [completed, inProgress, blockers] = await Promise.all([
        deps.getCompletedThisWeek(),
        deps.getInProgressIssues(),
        deps.getBlockerIssues(),
      ]);

      const velocityPoints = completed.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
      const weekEnding = new Date().toISOString().split('T')[0];

      const slides = deps.getSlidesService();
      const presentationId = deps.resolvePresentationId({ presentationUrl });
      const replacements = slides.formatWeeklyUpdate({
        weekEnding,
        completed: completed.map((i) => ({
          key: i.key,
          summary: i.summary,
          points: i.storyPoints,
        })),
        inProgress: inProgress.map((i) => ({
          key: i.key,
          summary: i.summary,
          assignee: i.assignee?.displayName || 'Unassigned',
        })),
        blockers: blockers.map((b) => ({
          key: b.key,
          summary: b.summary,
          assignee: b.assignee?.displayName || 'Unassigned',
        })),
        velocityPoints,
      });

      let newSlideId: string | undefined;

      if (templateSlideId) {
        // Create new slide from template
        newSlideId = await slides.addSlideFromTemplate(
          templateSlideId,
          replacements,
          insertAtIndex,
          presentationId
        );
      } else {
        // Update existing placeholders in the presentation
        await slides.updateSlideText(replacements, presentationId);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                presentationId: presentationId || slides.getPresentationId(),
                weekEnding,
                newSlideId,
                stats: {
                  completedCount: completed.length,
                  inProgressCount: inProgress.length,
                  blockersCount: blockers.length,
                  velocityPoints,
                },
                message: templateSlideId
                  ? 'Created new weekly update slide from template'
                  : 'Updated weekly placeholders in presentation',
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'slides_delete_slide': {
      const { slideId, presentationUrl } = args as { slideId: string; presentationUrl?: string };
      const slides = deps.getSlidesService();
      const presentationId = deps.resolvePresentationId({ presentationUrl });
      await slides.deleteSlide(slideId, presentationId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                presentationId: presentationId || slides.getPresentationId(),
                message: `Slide ${slideId} deleted successfully`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'slides_create_table': {
      const {
        slideId,
        presentationUrl,
        data,
        headerRow = true,
        position,
        size,
      } = args as {
        slideId: string;
        presentationUrl?: string;
        data: string[][];
        headerRow?: boolean;
        position?: { x: number; y: number };
        size?: { width: number; height: number };
      };
      const slides = deps.getSlidesService();
      const presentationId = deps.resolvePresentationId({ presentationUrl });

      const tableId = await slides.createTable(
        slideId,
        data,
        { position, size, headerRow },
        presentationId
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                presentationId: presentationId || slides.getPresentationId(),
                slideId,
                tableId,
                rows: data.length,
                columns: data[0]?.length || 0,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: `Unknown slides tool: ${name}` }),
      },
    ],
    isError: true,
  };
}
