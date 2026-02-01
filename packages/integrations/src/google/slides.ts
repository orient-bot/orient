/**
 * Google Slides Service
 *
 * Provides functionality to interact with Google Slides presentations
 * using Service Account authentication.
 */

import { google, slides_v1 } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { createServiceLogger } from '@orient-bot/core';

// Create a service-specific logger
const slidesLogger = createServiceLogger('slides-service');

export interface SlideInfo {
  slideId: string;
  title: string;
  slideIndex: number;
}

export interface SlideContent {
  slideId: string;
  title: string;
  textContent: string[];
  tables: TableContent[];
}

export interface TableContent {
  rows: number;
  columns: number;
  cells: string[][];
}

export interface TextReplacement {
  placeholder: string;
  replacement: string;
}

export interface SlidesConfig {
  presentationId?: string;
  credentialsPath: string;
  templateSlides?: {
    weeklyUpdate?: string;
  };
}

/**
 * Parse a Google Slides URL or ID and return the presentation ID
 * Supports formats:
 * - https://docs.google.com/presentation/d/PRESENTATION_ID/edit
 * - https://docs.google.com/presentation/d/PRESENTATION_ID/edit#slide=id.SLIDE_ID
 * - https://docs.google.com/presentation/d/PRESENTATION_ID
 * - PRESENTATION_ID (direct ID)
 */
export function parsePresentationId(urlOrId: string): string {
  if (!urlOrId) {
    throw new Error('Presentation URL or ID is required');
  }

  // If it's already just an ID (no slashes), return it
  if (!urlOrId.includes('/')) {
    return urlOrId.trim();
  }

  // Try to extract from URL
  const patterns = [/\/presentation\/d\/([a-zA-Z0-9_-]+)/, /\/d\/([a-zA-Z0-9_-]+)/];

  for (const pattern of patterns) {
    const match = urlOrId.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  throw new Error(`Could not parse presentation ID from: ${urlOrId}`);
}

/**
 * Parse a Google Slides URL to extract both presentation ID and optional slide ID
 */
export function parseSlideUrl(url: string): { presentationId: string; slideId?: string } {
  const presentationId = parsePresentationId(url);

  // Try to extract slide ID from URL fragment
  const slideMatch = url.match(/#slide=id\.([a-zA-Z0-9_-]+)/);
  const slideId = slideMatch ? slideMatch[1] : undefined;

  return { presentationId, slideId };
}

export class SlidesService {
  private slides: slides_v1.Slides | null = null;
  private config: SlidesConfig;
  private initialized = false;
  private currentPresentationId: string | null = null;

  constructor(config: SlidesConfig) {
    this.config = config;
    this.currentPresentationId = config.presentationId || null;
    slidesLogger.debug('SlidesService instance created', {
      presentationId: this.currentPresentationId,
      credentialsPath: config.credentialsPath,
    });
  }

  /**
   * Get the current presentation ID
   */
  getPresentationId(): string {
    if (!this.currentPresentationId) {
      throw new Error(
        'No presentation ID set. Provide a presentationId or presentationUrl parameter.'
      );
    }
    return this.currentPresentationId;
  }

  /**
   * Set the presentation ID for subsequent operations
   * Accepts either a direct ID or a Google Slides URL
   */
  setPresentationId(urlOrId: string): string {
    const presentationId = parsePresentationId(urlOrId);
    this.currentPresentationId = presentationId;
    slidesLogger.debug('Presentation ID set', { presentationId });
    return presentationId;
  }

  /**
   * Use a specific presentation for an operation
   * Returns a context object that can be used with the provided presentation
   */
  withPresentation(urlOrId?: string): { presentationId: string } {
    if (urlOrId) {
      const presentationId = parsePresentationId(urlOrId);
      slidesLogger.debug('Using specified presentation', { presentationId });
      return { presentationId };
    }
    return { presentationId: this.getPresentationId() };
  }

  /**
   * Initialize the Google Slides client with Service Account credentials
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      slidesLogger.debug('Slides service already initialized, skipping');
      return;
    }

    const op = slidesLogger.startOperation('initialize');
    const credentialsPath = path.resolve(this.config.credentialsPath);

    slidesLogger.debug('Checking for credentials file', { credentialsPath });

    if (!fs.existsSync(credentialsPath)) {
      op.failure(`Service account credentials not found at: ${credentialsPath}`);
      throw new Error(
        `Service account credentials not found at: ${credentialsPath}\n` +
          'Please download your service account JSON from Google Cloud Console ' +
          'and place it in the credentials directory.'
      );
    }

    try {
      const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));

      slidesLogger.debug('Credentials loaded', {
        clientEmail: credentials.client_email,
        projectId: credentials.project_id,
      });

      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: [
          'https://www.googleapis.com/auth/presentations',
          'https://www.googleapis.com/auth/drive',
        ],
      });

      this.slides = google.slides({ version: 'v1', auth });
      this.initialized = true;

      op.success('Google Slides client initialized', {
        presentationId: this.config.presentationId,
        clientEmail: credentials.client_email,
      });
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Ensure the service is initialized before making API calls
   */
  private async ensureInitialized(): Promise<slides_v1.Slides> {
    if (!this.initialized || !this.slides) {
      slidesLogger.debug('Service not initialized, initializing now');
      await this.initialize();
    }
    return this.slides!;
  }

  /**
   * Get the presentation metadata and list of slides
   * @param presentationUrlOrId - Optional presentation URL or ID. If not provided, uses the configured default.
   */
  async getPresentation(presentationUrlOrId?: string): Promise<{
    title: string;
    slides: SlideInfo[];
    presentationId: string;
    url: string;
  }> {
    const op = slidesLogger.startOperation('getPresentation');
    const slides = await this.ensureInitialized();
    const { presentationId } = this.withPresentation(presentationUrlOrId);

    slidesLogger.debug('Fetching presentation', {
      presentationId,
    });

    try {
      const response = await slides.presentations.get({
        presentationId,
      });

      const presentation = response.data;
      const slidesList: SlideInfo[] = [];

      if (presentation.slides) {
        presentation.slides.forEach((slide, index) => {
          const title = this.extractSlideTitle(slide);
          slidesList.push({
            slideId: slide.objectId || '',
            title: title || `Slide ${index + 1}`,
            slideIndex: index,
          });
        });
      }

      op.success('Presentation fetched', {
        title: presentation.title,
        slideCount: slidesList.length,
        slideIds: slidesList.map((s) => s.slideId),
      });

      return {
        title: presentation.title || 'Untitled Presentation',
        slides: slidesList,
        presentationId,
        url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
      };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Get the content of a specific slide
   * @param slideId - The ID of the slide to retrieve
   * @param presentationUrlOrId - Optional presentation URL or ID. If not provided, uses the configured default.
   */
  async getSlideContent(slideId: string, presentationUrlOrId?: string): Promise<SlideContent> {
    const op = slidesLogger.startOperation('getSlideContent', { slideId });
    const slides = await this.ensureInitialized();
    const { presentationId } = this.withPresentation(presentationUrlOrId);

    slidesLogger.debug('Fetching slide content', { slideId, presentationId });

    try {
      const response = await slides.presentations.get({
        presentationId,
      });

      const presentation = response.data;
      const slide = presentation.slides?.find((s) => s.objectId === slideId);

      if (!slide) {
        op.failure(`Slide with ID ${slideId} not found`);
        throw new Error(`Slide with ID ${slideId} not found in presentation ${presentationId}`);
      }

      const textContent: string[] = [];
      const tables: TableContent[] = [];

      // Extract text and tables from page elements
      if (slide.pageElements) {
        slidesLogger.debug('Processing page elements', {
          slideId,
          elementCount: slide.pageElements.length,
        });

        for (const element of slide.pageElements) {
          if (element.shape?.text) {
            const text = this.extractTextFromTextElements(element.shape.text.textElements);
            if (text.trim()) {
              textContent.push(text);
            }
          }

          if (element.table) {
            const tableContent = this.extractTableContent(element.table);
            tables.push(tableContent);
          }
        }
      }

      const result: SlideContent = {
        slideId,
        title: this.extractSlideTitle(slide) || 'Untitled Slide',
        textContent,
        tables,
      };

      op.success('Slide content extracted', {
        slideId,
        title: result.title,
        textElementCount: textContent.length,
        tableCount: tables.length,
      });

      return result;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error), { slideId });
      throw error;
    }
  }

  /**
   * Update text placeholders on all slides globally
   * Placeholders should be in format {{PLACEHOLDER_NAME}}
   * @param replacements - Array of text replacements to apply
   * @param presentationUrlOrId - Optional presentation URL or ID. If not provided, uses the configured default.
   */
  async updateSlideText(
    replacements: TextReplacement[],
    presentationUrlOrId?: string
  ): Promise<void> {
    const op = slidesLogger.startOperation('updateSlideText', {
      replacementCount: replacements.length,
    });
    const slides = await this.ensureInitialized();
    const { presentationId } = this.withPresentation(presentationUrlOrId);

    slidesLogger.debug('Preparing global text replacements', {
      presentationId,
      placeholders: replacements.map((r) => r.placeholder),
    });

    const requests: slides_v1.Schema$Request[] = replacements.map((r) => ({
      replaceAllText: {
        containsText: {
          text: r.placeholder,
          matchCase: true,
        },
        replaceText: r.replacement,
      },
    }));

    if (requests.length > 0) {
      try {
        slidesLogger.debug('Executing batch update', {
          presentationId,
          requestCount: requests.length,
        });

        const response = await slides.presentations.batchUpdate({
          presentationId,
          requestBody: {
            requests,
          },
        });

        op.success('Text replacements applied globally', {
          presentationId,
          replacementCount: replacements.length,
          repliesCount: response.data.replies?.length,
        });
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        throw error;
      }
    } else {
      op.success('No replacements to apply');
    }
  }

  /**
   * Update text on a specific slide only (not globally)
   * @param slideId - The ID of the slide to update
   * @param replacements - Array of text replacements to apply
   * @param presentationUrlOrId - Optional presentation URL or ID. If not provided, uses the configured default.
   */
  async updateSlideTextOnSlide(
    slideId: string,
    replacements: TextReplacement[],
    presentationUrlOrId?: string
  ): Promise<void> {
    const op = slidesLogger.startOperation('updateSlideTextOnSlide', {
      slideId,
      replacementCount: replacements.length,
    });
    const slides = await this.ensureInitialized();
    const { presentationId } = this.withPresentation(presentationUrlOrId);

    slidesLogger.debug('Preparing slide-specific text replacements', {
      presentationId,
      slideId,
      placeholders: replacements.map((r) => r.placeholder),
    });

    const requests: slides_v1.Schema$Request[] = replacements.map((r) => ({
      replaceAllText: {
        containsText: {
          text: r.placeholder,
          matchCase: true,
        },
        replaceText: r.replacement,
        pageObjectIds: [slideId],
      },
    }));

    if (requests.length > 0) {
      try {
        slidesLogger.debug('Executing slide-specific batch update', {
          presentationId,
          slideId,
          requestCount: requests.length,
        });

        const response = await slides.presentations.batchUpdate({
          presentationId,
          requestBody: {
            requests,
          },
        });

        op.success('Text replacements applied to slide', {
          presentationId,
          slideId,
          replacementCount: replacements.length,
          repliesCount: response.data.replies?.length,
        });
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error), { slideId });
        throw error;
      }
    } else {
      op.success('No replacements to apply', { slideId });
    }
  }

  /**
   * Duplicate a slide and return the new slide ID
   * @param slideId - The ID of the slide to duplicate
   * @param presentationUrlOrId - Optional presentation URL or ID. If not provided, uses the configured default.
   */
  async duplicateSlide(slideId: string, presentationUrlOrId?: string): Promise<string> {
    const op = slidesLogger.startOperation('duplicateSlide', { slideId });
    const slides = await this.ensureInitialized();
    const { presentationId } = this.withPresentation(presentationUrlOrId);

    slidesLogger.debug('Duplicating slide', { presentationId, slideId });

    try {
      const response = await slides.presentations.batchUpdate({
        presentationId,
        requestBody: {
          requests: [
            {
              duplicateObject: {
                objectId: slideId,
              },
            },
          ],
        },
      });

      const duplicateResponse = response.data.replies?.[0]?.duplicateObject;
      if (!duplicateResponse?.objectId) {
        op.failure('Failed to duplicate slide - no objectId in response');
        throw new Error('Failed to duplicate slide');
      }

      op.success('Slide duplicated', {
        presentationId,
        originalSlideId: slideId,
        newSlideId: duplicateResponse.objectId,
      });

      return duplicateResponse.objectId;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error), { slideId });
      throw error;
    }
  }

  /**
   * Add a new slide from a template with content replacements
   * @param templateSlideId - The ID of the template slide to duplicate
   * @param replacements - Array of text replacements to apply
   * @param insertAtIndex - Optional position to insert the new slide
   * @param presentationUrlOrId - Optional presentation URL or ID. If not provided, uses the configured default.
   */
  async addSlideFromTemplate(
    templateSlideId: string,
    replacements: TextReplacement[],
    insertAtIndex?: number,
    presentationUrlOrId?: string
  ): Promise<string> {
    const op = slidesLogger.startOperation('addSlideFromTemplate', {
      templateSlideId,
      replacementCount: replacements.length,
      insertAtIndex,
    });
    const slides = await this.ensureInitialized();
    const { presentationId } = this.withPresentation(presentationUrlOrId);

    slidesLogger.debug('Creating slide from template', {
      presentationId,
      templateSlideId,
      insertAtIndex,
      placeholders: replacements.map((r) => r.placeholder),
    });

    try {
      // First duplicate the template (passing the presentation ID)
      const newSlideId = await this.duplicateSlide(templateSlideId, presentationId);

      // Move to specified position if provided
      if (insertAtIndex !== undefined) {
        slidesLogger.debug('Moving slide to position', {
          presentationId,
          newSlideId,
          insertAtIndex,
        });

        await slides.presentations.batchUpdate({
          presentationId,
          requestBody: {
            requests: [
              {
                updateSlidesPosition: {
                  slideObjectIds: [newSlideId],
                  insertionIndex: insertAtIndex,
                },
              },
            ],
          },
        });
      }

      // Apply text replacements to the new slide
      if (replacements.length > 0) {
        slidesLogger.debug('Applying replacements to new slide', {
          presentationId,
          newSlideId,
          replacementCount: replacements.length,
        });

        const requests: slides_v1.Schema$Request[] = replacements.map((r) => ({
          replaceAllText: {
            containsText: {
              text: r.placeholder,
              matchCase: true,
            },
            replaceText: r.replacement,
            pageObjectIds: [newSlideId],
          },
        }));

        await slides.presentations.batchUpdate({
          presentationId,
          requestBody: {
            requests,
          },
        });
      }

      op.success('Slide created from template', {
        presentationId,
        templateSlideId,
        newSlideId,
        insertAtIndex,
        replacementsApplied: replacements.length,
      });

      return newSlideId;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error), { templateSlideId });
      throw error;
    }
  }

  /**
   * Delete a slide by ID
   * @param slideId - The ID of the slide to delete
   * @param presentationUrlOrId - Optional presentation URL or ID. If not provided, uses the configured default.
   */
  async deleteSlide(slideId: string, presentationUrlOrId?: string): Promise<void> {
    const op = slidesLogger.startOperation('deleteSlide', { slideId });
    const slides = await this.ensureInitialized();
    const { presentationId } = this.withPresentation(presentationUrlOrId);

    slidesLogger.debug('Deleting slide', { presentationId, slideId });

    try {
      await slides.presentations.batchUpdate({
        presentationId,
        requestBody: {
          requests: [
            {
              deleteObject: {
                objectId: slideId,
              },
            },
          ],
        },
      });

      op.success('Slide deleted', { presentationId, slideId });
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error), { slideId });
      throw error;
    }
  }

  /**
   * Create a new blank slide
   * @param insertAtIndex - Optional position to insert the new slide
   * @param presentationUrlOrId - Optional presentation URL or ID. If not provided, uses the configured default.
   */
  async createBlankSlide(insertAtIndex?: number, presentationUrlOrId?: string): Promise<string> {
    const op = slidesLogger.startOperation('createBlankSlide', { insertAtIndex });
    const slides = await this.ensureInitialized();
    const { presentationId } = this.withPresentation(presentationUrlOrId);

    slidesLogger.debug('Creating blank slide', { presentationId, insertAtIndex });

    try {
      const requests: slides_v1.Schema$Request[] = [
        {
          createSlide: {
            insertionIndex: insertAtIndex,
            slideLayoutReference: {
              predefinedLayout: 'BLANK',
            },
          },
        },
      ];

      const response = await slides.presentations.batchUpdate({
        presentationId,
        requestBody: {
          requests,
        },
      });

      const createSlideResponse = response.data.replies?.[0]?.createSlide;
      if (!createSlideResponse?.objectId) {
        op.failure('Failed to create slide - no objectId in response');
        throw new Error('Failed to create slide');
      }

      op.success('Blank slide created', {
        presentationId,
        newSlideId: createSlideResponse.objectId,
        insertAtIndex,
      });

      return createSlideResponse.objectId;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Create a table on a slide with data
   * @param slideId - The ID of the slide to add the table to
   * @param data - 2D array of cell values (rows x columns)
   * @param options - Optional table configuration
   * @param presentationUrlOrId - Optional presentation URL or ID
   */
  async createTable(
    slideId: string,
    data: string[][],
    options?: {
      position?: { x: number; y: number };
      size?: { width: number; height: number };
      headerRow?: boolean;
    },
    presentationUrlOrId?: string
  ): Promise<string> {
    const op = slidesLogger.startOperation('createTable', {
      slideId,
      rows: data.length,
      columns: data[0]?.length || 0,
    });
    const slides = await this.ensureInitialized();
    const { presentationId } = this.withPresentation(presentationUrlOrId);

    const rows = data.length;
    const columns = data[0]?.length || 0;

    if (rows === 0 || columns === 0) {
      op.failure('Table must have at least 1 row and 1 column');
      throw new Error('Table must have at least 1 row and 1 column');
    }

    const tableId = `table_${Date.now()}`;
    const position = options?.position || { x: 50, y: 120 };
    const size = options?.size || { width: 620, height: rows * 30 };

    slidesLogger.debug('Creating table', {
      presentationId,
      slideId,
      tableId,
      rows,
      columns,
      position,
      size,
    });

    try {
      // Step 1: Create the table
      const createTableRequests: slides_v1.Schema$Request[] = [
        {
          createTable: {
            objectId: tableId,
            elementProperties: {
              pageObjectId: slideId,
              size: {
                width: { magnitude: size.width, unit: 'PT' },
                height: { magnitude: size.height, unit: 'PT' },
              },
              transform: {
                scaleX: 1,
                scaleY: 1,
                translateX: position.x,
                translateY: position.y,
                unit: 'PT',
              },
            },
            rows,
            columns,
          },
        },
      ];

      await slides.presentations.batchUpdate({
        presentationId,
        requestBody: {
          requests: createTableRequests,
        },
      });

      // Step 2: Insert text into each cell
      const insertTextRequests: slides_v1.Schema$Request[] = [];

      for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
        for (let colIndex = 0; colIndex < columns; colIndex++) {
          const cellText = data[rowIndex]?.[colIndex] || '';
          if (cellText) {
            insertTextRequests.push({
              insertText: {
                objectId: tableId,
                cellLocation: {
                  rowIndex,
                  columnIndex: colIndex,
                },
                text: cellText,
                insertionIndex: 0,
              },
            });
          }
        }
      }

      // Step 3: Style header row if requested
      if (options?.headerRow && rows > 0) {
        for (let colIndex = 0; colIndex < columns; colIndex++) {
          insertTextRequests.push({
            updateTextStyle: {
              objectId: tableId,
              cellLocation: {
                rowIndex: 0,
                columnIndex: colIndex,
              },
              style: {
                bold: true,
                fontSize: { magnitude: 10, unit: 'PT' },
              },
              textRange: { type: 'ALL' },
              fields: 'bold,fontSize',
            },
          });
        }

        // Set header row background color
        insertTextRequests.push({
          updateTableCellProperties: {
            objectId: tableId,
            tableRange: {
              location: { rowIndex: 0, columnIndex: 0 },
              rowSpan: 1,
              columnSpan: columns,
            },
            tableCellProperties: {
              tableCellBackgroundFill: {
                solidFill: {
                  color: {
                    rgbColor: { red: 0.2, green: 0.4, blue: 0.6 },
                  },
                },
              },
            },
            fields: 'tableCellBackgroundFill',
          },
        });

        // Set header text color to white
        for (let colIndex = 0; colIndex < columns; colIndex++) {
          insertTextRequests.push({
            updateTextStyle: {
              objectId: tableId,
              cellLocation: {
                rowIndex: 0,
                columnIndex: colIndex,
              },
              style: {
                foregroundColor: {
                  opaqueColor: {
                    rgbColor: { red: 1, green: 1, blue: 1 },
                  },
                },
              },
              textRange: { type: 'ALL' },
              fields: 'foregroundColor',
            },
          });
        }
      }

      if (insertTextRequests.length > 0) {
        await slides.presentations.batchUpdate({
          presentationId,
          requestBody: {
            requests: insertTextRequests,
          },
        });
      }

      op.success('Table created', {
        presentationId,
        slideId,
        tableId,
        rows,
        columns,
        cellsPopulated: data.flat().filter((c) => c).length,
      });

      return tableId;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error), { slideId });
      throw error;
    }
  }

  /**
   * Add a text box to a slide
   * @param slideId - The ID of the slide to add the text box to
   * @param text - The text content
   * @param position - The position and size of the text box
   * @param presentationUrlOrId - Optional presentation URL or ID. If not provided, uses the configured default.
   */
  async addTextBox(
    slideId: string,
    text: string,
    position: { x: number; y: number; width: number; height: number },
    presentationUrlOrId?: string
  ): Promise<string> {
    const op = slidesLogger.startOperation('addTextBox', {
      slideId,
      textLength: text.length,
      position,
    });
    const slides = await this.ensureInitialized();
    const { presentationId } = this.withPresentation(presentationUrlOrId);

    const elementId = `textbox_${Date.now()}`;

    slidesLogger.debug('Adding text box', {
      presentationId,
      slideId,
      elementId,
      position,
      textPreview: text.slice(0, 50),
    });

    try {
      await slides.presentations.batchUpdate({
        presentationId,
        requestBody: {
          requests: [
            {
              createShape: {
                objectId: elementId,
                shapeType: 'TEXT_BOX',
                elementProperties: {
                  pageObjectId: slideId,
                  size: {
                    width: { magnitude: position.width, unit: 'PT' },
                    height: { magnitude: position.height, unit: 'PT' },
                  },
                  transform: {
                    scaleX: 1,
                    scaleY: 1,
                    translateX: position.x,
                    translateY: position.y,
                    unit: 'PT',
                  },
                },
              },
            },
            {
              insertText: {
                objectId: elementId,
                insertionIndex: 0,
                text,
              },
            },
          ],
        },
      });

      op.success('Text box added', {
        presentationId,
        slideId,
        elementId,
        textLength: text.length,
      });

      return elementId;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error), { slideId });
      throw error;
    }
  }

  /**
   * Format weekly update data for presentation
   */
  formatWeeklyUpdate(data: {
    weekEnding: string;
    completed: Array<{ key: string; summary: string; points?: number | null }>;
    inProgress: Array<{ key: string; summary: string; assignee: string }>;
    blockers: Array<{ key: string; summary: string; assignee: string }>;
    velocityPoints: number;
  }): TextReplacement[] {
    slidesLogger.debug('Formatting weekly update data', {
      weekEnding: data.weekEnding,
      completedCount: data.completed.length,
      inProgressCount: data.inProgress.length,
      blockersCount: data.blockers.length,
      velocityPoints: data.velocityPoints,
    });

    const completedText =
      data.completed.length > 0
        ? data.completed
            .map((i) => `• ${i.key}: ${i.summary}${i.points ? ` (${i.points}pts)` : ''}`)
            .join('\n')
        : '• No items completed this week';

    const inProgressText =
      data.inProgress.length > 0
        ? data.inProgress.map((i) => `• ${i.key}: ${i.summary} (${i.assignee})`).join('\n')
        : '• No items in progress';

    const blockersText =
      data.blockers.length > 0
        ? data.blockers.map((b) => `• ${b.key}: ${b.summary} (${b.assignee})`).join('\n')
        : '• No blockers';

    const replacements: TextReplacement[] = [
      { placeholder: '{{WEEK_ENDING}}', replacement: data.weekEnding },
      { placeholder: '{{COMPLETED_ITEMS}}', replacement: completedText },
      { placeholder: '{{IN_PROGRESS_ITEMS}}', replacement: inProgressText },
      { placeholder: '{{BLOCKERS}}', replacement: blockersText },
      { placeholder: '{{VELOCITY_POINTS}}', replacement: String(data.velocityPoints) },
      { placeholder: '{{COMPLETED_COUNT}}', replacement: String(data.completed.length) },
      { placeholder: '{{IN_PROGRESS_COUNT}}', replacement: String(data.inProgress.length) },
      { placeholder: '{{BLOCKERS_COUNT}}', replacement: String(data.blockers.length) },
    ];

    slidesLogger.debug('Weekly update formatted', {
      placeholderCount: replacements.length,
      placeholders: replacements.map((r) => r.placeholder),
    });

    return replacements;
  }

  // Private helper methods

  private extractSlideTitle(slide: slides_v1.Schema$Page): string | null {
    if (!slide.pageElements) return null;

    // Look for a title placeholder or the first text element
    for (const element of slide.pageElements) {
      if (
        element.shape?.placeholder?.type === 'TITLE' ||
        element.shape?.placeholder?.type === 'CENTERED_TITLE'
      ) {
        const text = this.extractTextFromTextElements(element.shape.text?.textElements);
        if (text.trim()) return text.trim();
      }
    }

    // Fallback: get first text element
    for (const element of slide.pageElements) {
      if (element.shape?.text?.textElements) {
        const text = this.extractTextFromTextElements(element.shape.text.textElements);
        if (text.trim()) return text.trim().split('\n')[0];
      }
    }

    return null;
  }

  private extractTextFromTextElements(textElements?: slides_v1.Schema$TextElement[]): string {
    if (!textElements) return '';

    return textElements
      .filter((el) => el.textRun?.content)
      .map((el) => el.textRun!.content)
      .join('')
      .trim();
  }

  private extractTableContent(table: slides_v1.Schema$Table): TableContent {
    const rows = table.rows || 0;
    const columns = table.columns || 0;
    const cells: string[][] = [];

    if (table.tableRows) {
      for (const row of table.tableRows) {
        const rowCells: string[] = [];
        if (row.tableCells) {
          for (const cell of row.tableCells) {
            const text = this.extractTextFromTextElements(cell.text?.textElements);
            rowCells.push(text);
          }
        }
        cells.push(rowCells);
      }
    }

    return { rows, columns, cells };
  }
}

// Export a factory function for creating the service
export function createSlidesService(config: SlidesConfig): SlidesService {
  slidesLogger.info('Creating new SlidesService instance', {
    presentationId: config.presentationId || '(not set - will be provided per-operation)',
  });
  return new SlidesService(config);
}
