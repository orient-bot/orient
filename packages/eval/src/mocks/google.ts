/**
 * Google APIs Mock Service
 *
 * Provides mock responses for Google Slides, Calendar, and other Google tools.
 */

import { BaseMockService } from './registry.js';
import { MockResponse } from '../types.js';

/**
 * Mock Google Slide
 */
export interface MockSlide {
  slideId: string;
  title?: string;
  pageElements?: unknown[];
}

/**
 * Mock Calendar Event
 */
export interface MockCalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  attendees?: string[];
  location?: string;
  description?: string;
}

/**
 * Create a mock slide
 */
export function createMockSlide(overrides: Partial<MockSlide> = {}): MockSlide {
  return {
    slideId: `slide-${Date.now()}`,
    title: 'Test Slide',
    pageElements: [],
    ...overrides,
  };
}

/**
 * Create a mock calendar event
 */
export function createMockCalendarEvent(
  overrides: Partial<MockCalendarEvent> = {}
): MockCalendarEvent {
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour later

  return {
    id: `event-${Date.now()}`,
    summary: 'Test Meeting',
    start: now.toISOString(),
    end: later.toISOString(),
    attendees: [],
    ...overrides,
  };
}

/**
 * Google mock service implementation
 */
export class GoogleMockService extends BaseMockService {
  name = 'google';

  constructor() {
    super();
    this.setupDefaults();
  }

  private setupDefaults(): void {
    // ========== Google Slides Tools ==========

    // ai_first_slides_get_presentation - Get presentation
    this.defaultResponses.set('ai_first_slides_get_presentation', () => ({
      response: {
        presentationId: 'presentation-123',
        title: 'Test Presentation',
        slides: [createMockSlide({ slideId: 'slide-1', title: 'Slide 1' })],
      },
    }));

    // ai_first_slides_duplicate_template - Duplicate template slide
    this.defaultResponses.set('ai_first_slides_duplicate_template', () => ({
      response: {
        success: true,
        newSlideId: `slide-${Date.now()}`,
      },
    }));

    // ai_first_slides_update_slide_text - Update slide text
    this.defaultResponses.set('ai_first_slides_update_slide_text', () => ({
      response: {
        success: true,
        updatedElements: 1,
      },
    }));

    // ai_first_slides_create_table - Create table on slide
    this.defaultResponses.set('ai_first_slides_create_table', () => ({
      response: {
        success: true,
        tableId: `table-${Date.now()}`,
      },
    }));

    // ai_first_slides_list_slides - List all slides
    this.defaultResponses.set('ai_first_slides_list_slides', () => ({
      response: {
        slides: [
          createMockSlide({ slideId: 'slide-1', title: 'Title Slide' }),
          createMockSlide({ slideId: 'slide-2', title: 'Content Slide' }),
        ],
      },
    }));

    // ai_first_slides_get_slide_content - Get slide content
    this.defaultResponses.set('ai_first_slides_get_slide_content', () => ({
      response: {
        slideId: 'slide-1',
        title: 'Test Slide',
        textContent: ['Bullet 1', 'Bullet 2'],
        shapes: [],
        tables: [],
      },
    }));

    // ========== Google Calendar Tools ==========

    // ai_first_calendar_list_events - List calendar events
    this.defaultResponses.set('ai_first_calendar_list_events', () => ({
      response: {
        events: [],
      },
    }));

    // ai_first_calendar_create_event - Create calendar event
    this.defaultResponses.set('ai_first_calendar_create_event', () => ({
      response: {
        success: true,
        event: createMockCalendarEvent(),
      },
    }));

    // ai_first_calendar_get_event - Get event details
    this.defaultResponses.set('ai_first_calendar_get_event', () => ({
      response: createMockCalendarEvent(),
    }));

    // ai_first_calendar_update_event - Update event
    this.defaultResponses.set('ai_first_calendar_update_event', () => ({
      response: {
        success: true,
        event: createMockCalendarEvent(),
      },
    }));

    // ai_first_calendar_delete_event - Delete event
    this.defaultResponses.set('ai_first_calendar_delete_event', () => ({
      response: {
        success: true,
      },
    }));

    // ========== Google Tasks Tools ==========

    // ai_first_tasks_list - List tasks
    this.defaultResponses.set('ai_first_tasks_list', () => ({
      response: {
        tasks: [],
      },
    }));

    // ai_first_tasks_create - Create task
    this.defaultResponses.set('ai_first_tasks_create', () => ({
      response: {
        success: true,
        taskId: `task-${Date.now()}`,
      },
    }));

    // ========== Google Sheets Tools ==========

    // ai_first_sheets_read_range - Read sheet range
    this.defaultResponses.set('ai_first_sheets_read_range', () => ({
      response: {
        values: [],
        range: 'Sheet1!A1:Z100',
      },
    }));

    // ai_first_sheets_write_range - Write to sheet
    this.defaultResponses.set('ai_first_sheets_write_range', () => ({
      response: {
        success: true,
        updatedCells: 0,
      },
    }));
  }

  /**
   * Create a duplicate template response with specific slide ID
   */
  static createDuplicateTemplateResponse(newSlideId: string): MockResponse {
    return {
      response: {
        success: true,
        newSlideId,
      },
    };
  }

  /**
   * Create a presentation response with custom slides
   */
  static createPresentationResponse(slides: MockSlide[]): MockResponse {
    return {
      response: {
        presentationId: 'presentation-123',
        title: 'Test Presentation',
        slides,
      },
    };
  }

  /**
   * Create a calendar events response
   */
  static createEventsResponse(events: MockCalendarEvent[]): MockResponse {
    return {
      response: {
        events,
      },
    };
  }
}
