/**
 * Google Services Types
 *
 * Type definitions for Google Slides, Sheets, Gmail, Calendar, and Tasks services.
 */

// =============================================================================
// Google Slides Types
// =============================================================================

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

// =============================================================================
// Google Sheets Types
// =============================================================================

export interface SpreadsheetInfo {
  spreadsheetId: string;
  title: string;
  url: string;
  sheets: Array<{
    sheetId: number;
    title: string;
    index: number;
  }>;
}

export interface CreateSpreadsheetResult {
  spreadsheetId: string;
  url: string;
  title: string;
}

export interface SheetsConfig {
  credentialsPath: string;
}

// =============================================================================
// Gmail Types
// =============================================================================

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string[];
  cc?: string[];
  date: Date;
  snippet: string;
  labels: string[];
  isUnread: boolean;
  hasAttachments: boolean;
}

export interface GmailMessageDetails extends GmailMessage {
  body: string;
  htmlBody?: string;
  attachments: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
  }>;
}

export interface GmailSearchOptions {
  query?: string;
  maxResults?: number;
  unreadOnly?: boolean;
  label?: string;
  from?: string;
  after?: Date;
  before?: Date;
}

export interface GmailSendOptions {
  to: string;
  subject: string;
  body: string;
  htmlBody?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
}

export interface GmailDraftOptions {
  to: string;
  subject: string;
  body: string;
  htmlBody?: string;
}

// =============================================================================
// Google Calendar Types
// =============================================================================

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  }>;
  organizer?: {
    email: string;
    displayName?: string;
  };
  conferenceData?: {
    type: string;
    uri: string;
    label?: string;
  };
  recurrence?: string[];
  status: 'confirmed' | 'tentative' | 'cancelled';
  htmlLink?: string;
}

export interface CalendarSearchOptions {
  calendarId?: string;
  timeMin?: Date;
  timeMax?: Date;
  maxResults?: number;
  query?: string;
  singleEvents?: boolean;
  orderBy?: 'startTime' | 'updated';
}

export interface CreateEventOptions {
  calendarId?: string;
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  attendees?: string[];
  sendUpdates?: 'all' | 'externalOnly' | 'none';
  conferenceData?: boolean;
  recurrence?: string[];
}

// =============================================================================
// Google Tasks Types
// =============================================================================

export interface TaskList {
  id: string;
  title: string;
  updated: Date;
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: Date;
  completed?: Date;
  parent?: string;
  position?: string;
  links?: Array<{
    type: string;
    description?: string;
    link: string;
  }>;
}

export interface CreateTaskOptions {
  taskListId?: string;
  title: string;
  notes?: string;
  due?: Date;
  parent?: string;
}

// =============================================================================
// Google OAuth Types
// =============================================================================

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
  scope?: string;
}
