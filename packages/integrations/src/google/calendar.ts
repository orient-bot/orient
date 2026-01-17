/**
 * Google Calendar Service
 *
 * Provides functionality to interact with Google Calendar using OAuth 2.0.
 * Supports listing events, creating/updating/deleting events, and managing calendars.
 *
 * Exported via @orient/integrations package.
 */

import { google, calendar_v3 } from 'googleapis';
import { createServiceLogger } from '@orient/core';
import { getGoogleOAuthService } from './oauth.js';

const logger = createServiceLogger('calendar-service');

// =============================================================================
// Types and Interfaces
// =============================================================================

export interface CalendarEvent {
  /** Event ID */
  id: string;
  /** Event title/summary */
  title: string;
  /** Event description */
  description?: string;
  /** Event location */
  location?: string;
  /** Start time */
  startTime: Date;
  /** End time */
  endTime: Date;
  /** Whether this is an all-day event */
  isAllDay: boolean;
  /** Event status */
  status: 'confirmed' | 'tentative' | 'cancelled';
  /** Attendees */
  attendees: Array<{
    email: string;
    displayName?: string;
    responseStatus: 'needsAction' | 'accepted' | 'declined' | 'tentative';
  }>;
  /** Organizer */
  organizer?: {
    email: string;
    displayName?: string;
    self: boolean;
  };
  /** HTML link to event */
  htmlLink?: string;
  /** Calendar ID this event belongs to */
  calendarId: string;
  /** Whether the event is recurring */
  isRecurring: boolean;
  /** Conference/meeting link if available */
  meetingLink?: string;
}

export interface CalendarInfo {
  /** Calendar ID */
  id: string;
  /** Calendar name */
  name: string;
  /** Calendar description */
  description?: string;
  /** Whether this is the primary calendar */
  isPrimary: boolean;
  /** Calendar timezone */
  timezone: string;
  /** Background color */
  backgroundColor?: string;
  /** Access role */
  accessRole: 'owner' | 'writer' | 'reader' | 'freeBusyReader';
}

export interface CreateEventOptions {
  /** Event title/summary */
  title: string;
  /** Event description */
  description?: string;
  /** Event location */
  location?: string;
  /** Start time */
  startTime: Date;
  /** End time */
  endTime: Date;
  /** Whether this is an all-day event */
  isAllDay?: boolean;
  /** Attendee emails */
  attendees?: string[];
  /** Calendar ID (default: primary) */
  calendarId?: string;
  /** Create Google Meet link */
  createMeetingLink?: boolean;
  /** Timezone (default: calendar timezone) */
  timezone?: string;
}

export interface UpdateEventOptions extends Partial<CreateEventOptions> {
  /** Event ID to update */
  eventId: string;
  /** Calendar ID */
  calendarId?: string;
}

export interface ListEventsOptions {
  /** Calendar ID (default: primary) */
  calendarId?: string;
  /** Start time filter */
  timeMin?: Date;
  /** End time filter */
  timeMax?: Date;
  /** Max results */
  maxResults?: number;
  /** Search query */
  query?: string;
  /** Include deleted events */
  showDeleted?: boolean;
  /** Only include single events (expand recurring) */
  singleEvents?: boolean;
}

// =============================================================================
// CalendarService Class
// =============================================================================

export class CalendarService {
  private calendar: calendar_v3.Calendar | null = null;
  private currentEmail: string | null = null;

  constructor() {
    logger.debug('CalendarService instance created');
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Get or create Calendar client for an account.
   */
  private async getClient(accountEmail?: string): Promise<calendar_v3.Calendar> {
    const oauthService = getGoogleOAuthService();

    // Determine which account to use
    const email = accountEmail || oauthService.getDefaultAccount();
    if (!email) {
      throw new Error(
        'No Google account connected. Use google_oauth_connect to connect an account.'
      );
    }

    // If we already have a client for this email, reuse it
    if (this.calendar && this.currentEmail === email) {
      return this.calendar;
    }

    // Get authenticated client
    const authClient = await oauthService.getAuthClient(email);
    this.calendar = google.calendar({ version: 'v3', auth: authClient });
    this.currentEmail = email;

    return this.calendar;
  }

  /**
   * Parse Google event into our format.
   */
  private parseEvent(event: calendar_v3.Schema$Event, calendarId: string): CalendarEvent {
    const start = event.start?.dateTime || event.start?.date || '';
    const end = event.end?.dateTime || event.end?.date || '';
    const isAllDay = !!event.start?.date;

    return {
      id: event.id || '',
      title: event.summary || '(no title)',
      description: event.description || undefined,
      location: event.location || undefined,
      startTime: new Date(start),
      endTime: new Date(end),
      isAllDay,
      status: (event.status as CalendarEvent['status']) || 'confirmed',
      attendees: (event.attendees || []).map((a) => ({
        email: a.email || '',
        displayName: a.displayName || undefined,
        responseStatus:
          (a.responseStatus as CalendarEvent['attendees'][0]['responseStatus']) || 'needsAction',
      })),
      organizer: event.organizer
        ? {
            email: event.organizer.email || '',
            displayName: event.organizer.displayName || undefined,
            self: event.organizer.self || false,
          }
        : undefined,
      htmlLink: event.htmlLink || undefined,
      calendarId,
      isRecurring: !!event.recurringEventId,
      meetingLink:
        event.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri ||
        undefined,
    };
  }

  /**
   * Convert our event format to Google event.
   */
  private buildEvent(options: CreateEventOptions): calendar_v3.Schema$Event {
    const event: calendar_v3.Schema$Event = {
      summary: options.title,
      description: options.description,
      location: options.location,
      start: options.isAllDay
        ? { date: options.startTime.toISOString().split('T')[0] }
        : { dateTime: options.startTime.toISOString(), timeZone: options.timezone },
      end: options.isAllDay
        ? { date: options.endTime.toISOString().split('T')[0] }
        : { dateTime: options.endTime.toISOString(), timeZone: options.timezone },
    };

    if (options.attendees && options.attendees.length > 0) {
      event.attendees = options.attendees.map((email) => ({ email }));
    }

    if (options.createMeetingLink) {
      event.conferenceData = {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    return event;
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * List events from a calendar.
   */
  async listEvents(
    options: ListEventsOptions = {},
    accountEmail?: string
  ): Promise<CalendarEvent[]> {
    const op = logger.startOperation('listEvents', { options });

    const calendar = await this.getClient(accountEmail);
    const calendarId = options.calendarId || 'primary';

    try {
      const response = await calendar.events.list({
        calendarId,
        timeMin: options.timeMin?.toISOString(),
        timeMax: options.timeMax?.toISOString(),
        maxResults: options.maxResults || 20,
        q: options.query,
        showDeleted: options.showDeleted || false,
        singleEvents: options.singleEvents ?? true,
        orderBy: (options.singleEvents ?? true) ? 'startTime' : undefined,
      });

      const events: CalendarEvent[] = (response.data.items || []).map((event) =>
        this.parseEvent(event, calendarId)
      );

      op.success('Events listed', { count: events.length, calendarId });
      return events;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Get a specific event.
   */
  async getEvent(
    eventId: string,
    calendarId: string = 'primary',
    accountEmail?: string
  ): Promise<CalendarEvent> {
    const op = logger.startOperation('getEvent', { eventId, calendarId });

    const calendar = await this.getClient(accountEmail);

    try {
      const response = await calendar.events.get({ calendarId, eventId });
      const event = this.parseEvent(response.data, calendarId);

      op.success('Event retrieved', { eventId });
      return event;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Create a new event.
   */
  async createEvent(options: CreateEventOptions, accountEmail?: string): Promise<CalendarEvent> {
    const op = logger.startOperation('createEvent', { title: options.title });

    const calendar = await this.getClient(accountEmail);
    const calendarId = options.calendarId || 'primary';
    const event = this.buildEvent(options);

    try {
      const response = await calendar.events.insert({
        calendarId,
        requestBody: event,
        conferenceDataVersion: options.createMeetingLink ? 1 : 0,
      });

      const createdEvent = this.parseEvent(response.data, calendarId);
      op.success('Event created', { eventId: createdEvent.id });
      return createdEvent;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Update an existing event.
   */
  async updateEvent(options: UpdateEventOptions, accountEmail?: string): Promise<CalendarEvent> {
    const op = logger.startOperation('updateEvent', { eventId: options.eventId });

    const calendar = await this.getClient(accountEmail);
    const calendarId = options.calendarId || 'primary';

    try {
      const existing = await calendar.events.get({
        calendarId,
        eventId: options.eventId,
      });

      const updatedEvent = this.buildEvent({
        title: options.title || existing.data.summary || '(no title)',
        description: options.description ?? existing.data.description ?? undefined,
        location: options.location ?? existing.data.location ?? undefined,
        startTime: options.startTime || new Date(existing.data.start?.dateTime || ''),
        endTime: options.endTime || new Date(existing.data.end?.dateTime || ''),
        isAllDay: options.isAllDay ?? !!existing.data.start?.date,
        attendees: options.attendees || existing.data.attendees?.map((a) => a.email || '') || [],
        calendarId,
        createMeetingLink: options.createMeetingLink,
        timezone: options.timezone || existing.data.start?.timeZone || undefined,
      });

      const response = await calendar.events.update({
        calendarId,
        eventId: options.eventId,
        requestBody: updatedEvent,
        conferenceDataVersion: options.createMeetingLink ? 1 : 0,
      });

      const event = this.parseEvent(response.data, calendarId);
      op.success('Event updated', { eventId: event.id });
      return event;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Delete an event.
   */
  async deleteEvent(
    eventId: string,
    calendarId: string = 'primary',
    accountEmail?: string
  ): Promise<void> {
    const op = logger.startOperation('deleteEvent', { eventId });

    const calendar = await this.getClient(accountEmail);

    try {
      await calendar.events.delete({ calendarId, eventId });
      op.success('Event deleted');
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * List calendars for the account.
   */
  async listCalendars(accountEmail?: string): Promise<CalendarInfo[]> {
    const op = logger.startOperation('listCalendars');

    const calendar = await this.getClient(accountEmail);

    try {
      const response = await calendar.calendarList.list();
      const calendars: CalendarInfo[] = (response.data.items || []).map((cal) => ({
        id: cal.id || '',
        name: cal.summary || '(no name)',
        description: cal.description || undefined,
        isPrimary: !!cal.primary,
        timezone: cal.timeZone || 'UTC',
        backgroundColor: cal.backgroundColor || undefined,
        accessRole: (cal.accessRole as CalendarInfo['accessRole']) || 'reader',
      }));

      op.success('Calendars listed', { count: calendars.length });
      return calendars;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

let calendarService: CalendarService | null = null;

/**
 * Get or create the CalendarService singleton.
 */
export function getCalendarService(): CalendarService {
  if (!calendarService) {
    calendarService = new CalendarService();
  }
  return calendarService;
}

/**
 * Create a new CalendarService instance.
 */
export function createCalendarService(): CalendarService {
  return new CalendarService();
}
