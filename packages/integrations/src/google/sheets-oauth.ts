/**
 * Google Sheets OAuth Service
 *
 * Provides functionality to interact with Google Sheets using OAuth 2.0
 * for personal accounts (as opposed to service accounts).
 *
 * Exported via @orient/integrations package.
 *
 * This allows access to the user's own spreadsheets without sharing.
 */

import { google, sheets_v4 } from 'googleapis';
import { createServiceLogger } from '@orient/core';
import { getGoogleOAuthService } from './oauth.js';

const logger = createServiceLogger('sheets-oauth');

// =============================================================================
// Types and Interfaces
// =============================================================================

export interface SpreadsheetInfo {
  /** Spreadsheet ID */
  id: string;
  /** Spreadsheet title */
  title: string;
  /** URL to open the spreadsheet */
  url: string;
  /** Sheets/tabs within the spreadsheet */
  sheets: Array<{
    sheetId: number;
    title: string;
    index: number;
    rowCount: number;
    columnCount: number;
  }>;
  /** Last modified time */
  modifiedTime?: Date;
}

export interface CellRange {
  /** The range in A1 notation (e.g., "Sheet1!A1:B10") */
  range: string;
  /** Values in the range (2D array) */
  values: unknown[][];
}

export interface CreateSpreadsheetOptions {
  /** Spreadsheet title */
  title: string;
  /** Initial sheets to create */
  sheets?: string[];
  /** Share with these email addresses */
  shareWith?: string[];
  /** Make editable by anyone with the link */
  makePublic?: boolean;
}

export interface UpdateValuesOptions {
  /** The range to update in A1 notation */
  range: string;
  /** Values to write (2D array) */
  values: unknown[][];
  /** How to interpret input values */
  valueInputOption?: 'RAW' | 'USER_ENTERED';
}

// =============================================================================
// SheetsOAuthService Class
// =============================================================================

export class SheetsOAuthService {
  private sheets: sheets_v4.Sheets | null = null;
  private drive: ReturnType<typeof google.drive> | null = null;
  private currentEmail: string | null = null;

  constructor() {
    logger.debug('SheetsOAuthService instance created');
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Get or create Sheets client for an account.
   */
  private async getClient(accountEmail?: string): Promise<sheets_v4.Sheets> {
    const oauthService = getGoogleOAuthService();

    // Determine which account to use
    const email = accountEmail || oauthService.getDefaultAccount();
    if (!email) {
      throw new Error(
        'No Google account connected. Use google_oauth_connect to connect an account.'
      );
    }

    // If we already have a client for this email, reuse it
    if (this.sheets && this.currentEmail === email) {
      return this.sheets;
    }

    // Get authenticated client
    const authClient = await oauthService.getAuthClient(email);
    this.sheets = google.sheets({ version: 'v4', auth: authClient });
    this.drive = google.drive({ version: 'v3', auth: authClient });
    this.currentEmail = email;

    return this.sheets;
  }

  /**
   * Parse spreadsheet ID from URL or return as-is if already an ID.
   */
  private parseSpreadsheetId(urlOrId: string): string {
    if (!urlOrId.includes('/')) {
      return urlOrId.trim();
    }

    // Try to extract from URL
    const patterns = [/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/, /\/d\/([a-zA-Z0-9_-]+)/];

    for (const pattern of patterns) {
      const match = urlOrId.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    throw new Error(`Could not parse spreadsheet ID from: ${urlOrId}`);
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Get spreadsheet metadata and information.
   */
  async getSpreadsheet(
    spreadsheetIdOrUrl: string,
    accountEmail?: string
  ): Promise<SpreadsheetInfo> {
    const op = logger.startOperation('getSpreadsheet');

    const sheets = await this.getClient(accountEmail);
    const spreadsheetId = this.parseSpreadsheetId(spreadsheetIdOrUrl);

    try {
      const response = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      const info: SpreadsheetInfo = {
        id: spreadsheetId,
        title: response.data.properties?.title || '',
        url:
          response.data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
        sheets: (response.data.sheets || []).map((sheet, index) => ({
          sheetId: sheet.properties?.sheetId || 0,
          title: sheet.properties?.title || '',
          index: sheet.properties?.index ?? index,
          rowCount: sheet.properties?.gridProperties?.rowCount || 0,
          columnCount: sheet.properties?.gridProperties?.columnCount || 0,
        })),
      };

      op.success('Spreadsheet retrieved', { spreadsheetId, title: info.title });
      return info;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Read values from a range.
   */
  async readRange(
    spreadsheetIdOrUrl: string,
    range: string,
    accountEmail?: string
  ): Promise<unknown[][]> {
    const op = logger.startOperation('readRange', { range });

    const sheets = await this.getClient(accountEmail);
    const spreadsheetId = this.parseSpreadsheetId(spreadsheetIdOrUrl);

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const values = response.data.values || [];
      op.success('Range read', { spreadsheetId, range, rowCount: values.length });
      return values;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Read multiple ranges at once.
   */
  async readRanges(
    spreadsheetIdOrUrl: string,
    ranges: string[],
    accountEmail?: string
  ): Promise<CellRange[]> {
    const op = logger.startOperation('readRanges', { rangeCount: ranges.length });

    const sheets = await this.getClient(accountEmail);
    const spreadsheetId = this.parseSpreadsheetId(spreadsheetIdOrUrl);

    try {
      const response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges,
      });

      const results: CellRange[] = (response.data.valueRanges || []).map((vr) => ({
        range: vr.range || '',
        values: vr.values || [],
      }));

      op.success('Ranges read', { spreadsheetId, rangeCount: results.length });
      return results;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Write values to a range.
   */
  async writeRange(
    spreadsheetIdOrUrl: string,
    options: UpdateValuesOptions,
    accountEmail?: string
  ): Promise<number> {
    const op = logger.startOperation('writeRange', { range: options.range });

    const sheets = await this.getClient(accountEmail);
    const spreadsheetId = this.parseSpreadsheetId(spreadsheetIdOrUrl);

    try {
      const response = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: options.range,
        valueInputOption: options.valueInputOption || 'USER_ENTERED',
        requestBody: {
          values: options.values,
        },
      });

      const updatedCells = response.data.updatedCells || 0;
      op.success('Range written', { spreadsheetId, range: options.range, updatedCells });
      return updatedCells;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Append values to a sheet.
   */
  async appendRows(
    spreadsheetIdOrUrl: string,
    sheetName: string,
    values: unknown[][],
    accountEmail?: string
  ): Promise<number> {
    const op = logger.startOperation('appendRows', { sheetName, rowCount: values.length });

    const sheets = await this.getClient(accountEmail);
    const spreadsheetId = this.parseSpreadsheetId(spreadsheetIdOrUrl);

    try {
      const response = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:A`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values,
        },
      });

      const updatedRows = response.data.updates?.updatedRows || 0;
      op.success('Rows appended', { spreadsheetId, sheetName, updatedRows });
      return updatedRows;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Clear values from a range.
   */
  async clearRange(
    spreadsheetIdOrUrl: string,
    range: string,
    accountEmail?: string
  ): Promise<void> {
    const op = logger.startOperation('clearRange', { range });

    const sheets = await this.getClient(accountEmail);
    const spreadsheetId = this.parseSpreadsheetId(spreadsheetIdOrUrl);

    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range,
      });

      op.success('Range cleared', { spreadsheetId, range });
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Create a new spreadsheet.
   */
  async createSpreadsheet(
    options: CreateSpreadsheetOptions,
    accountEmail?: string
  ): Promise<SpreadsheetInfo> {
    const op = logger.startOperation('createSpreadsheet', { title: options.title });

    const sheets = await this.getClient(accountEmail);

    try {
      // Build sheet configurations
      const sheetConfigs: sheets_v4.Schema$Sheet[] = (options.sheets || ['Sheet1']).map(
        (title, index) => ({
          properties: {
            title,
            index,
          },
        })
      );

      // Create the spreadsheet
      const response = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: options.title,
          },
          sheets: sheetConfigs,
        },
      });

      const spreadsheetId = response.data.spreadsheetId!;

      // Share the spreadsheet if requested
      if (this.drive && (options.shareWith?.length || options.makePublic)) {
        if (options.makePublic) {
          await this.drive.permissions.create({
            fileId: spreadsheetId,
            requestBody: {
              role: 'writer',
              type: 'anyone',
            },
          });
        }

        if (options.shareWith) {
          for (const email of options.shareWith) {
            await this.drive.permissions.create({
              fileId: spreadsheetId,
              sendNotificationEmail: false,
              requestBody: {
                role: 'writer',
                type: 'user',
                emailAddress: email,
              },
            });
          }
        }
      }

      const info: SpreadsheetInfo = {
        id: spreadsheetId,
        title: options.title,
        url:
          response.data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
        sheets: (response.data.sheets || []).map((sheet, index) => ({
          sheetId: sheet.properties?.sheetId || 0,
          title: sheet.properties?.title || '',
          index: sheet.properties?.index ?? index,
          rowCount: sheet.properties?.gridProperties?.rowCount || 0,
          columnCount: sheet.properties?.gridProperties?.columnCount || 0,
        })),
      };

      op.success('Spreadsheet created', { spreadsheetId, title: info.title });
      return info;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Add a new sheet/tab to a spreadsheet.
   */
  async addSheet(
    spreadsheetIdOrUrl: string,
    sheetTitle: string,
    accountEmail?: string
  ): Promise<number> {
    const op = logger.startOperation('addSheet', { sheetTitle });

    const sheets = await this.getClient(accountEmail);
    const spreadsheetId = this.parseSpreadsheetId(spreadsheetIdOrUrl);

    try {
      const response = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetTitle,
                },
              },
            },
          ],
        },
      });

      const sheetId = response.data.replies?.[0]?.addSheet?.properties?.sheetId || 0;
      op.success('Sheet added', { spreadsheetId, sheetTitle, sheetId });
      return sheetId;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Delete a sheet/tab from a spreadsheet.
   */
  async deleteSheet(
    spreadsheetIdOrUrl: string,
    sheetId: number,
    accountEmail?: string
  ): Promise<void> {
    const op = logger.startOperation('deleteSheet', { sheetId });

    const sheets = await this.getClient(accountEmail);
    const spreadsheetId = this.parseSpreadsheetId(spreadsheetIdOrUrl);

    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteSheet: {
                sheetId,
              },
            },
          ],
        },
      });

      op.success('Sheet deleted', { spreadsheetId, sheetId });
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Rename a sheet/tab.
   */
  async renameSheet(
    spreadsheetIdOrUrl: string,
    sheetId: number,
    newTitle: string,
    accountEmail?: string
  ): Promise<void> {
    const op = logger.startOperation('renameSheet', { sheetId, newTitle });

    const sheets = await this.getClient(accountEmail);
    const spreadsheetId = this.parseSpreadsheetId(spreadsheetIdOrUrl);

    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              updateSheetProperties: {
                properties: {
                  sheetId,
                  title: newTitle,
                },
                fields: 'title',
              },
            },
          ],
        },
      });

      op.success('Sheet renamed', { spreadsheetId, sheetId, newTitle });
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Get a sheet as a table (with headers).
   */
  async getSheetAsTable(
    spreadsheetIdOrUrl: string,
    sheetName: string,
    accountEmail?: string
  ): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
    const op = logger.startOperation('getSheetAsTable', { sheetName });

    try {
      const values = await this.readRange(spreadsheetIdOrUrl, `${sheetName}!A:ZZ`, accountEmail);

      if (values.length === 0) {
        return { headers: [], rows: [] };
      }

      const headers = values[0].map((v) => String(v || ''));
      const rows: Record<string, unknown>[] = [];

      for (let i = 1; i < values.length; i++) {
        const row: Record<string, unknown> = {};
        for (let j = 0; j < headers.length; j++) {
          row[headers[j]] = values[i]?.[j] ?? null;
        }
        rows.push(row);
      }

      op.success('Sheet read as table', {
        sheetName,
        headerCount: headers.length,
        rowCount: rows.length,
      });
      return { headers, rows };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

let sheetsOAuthService: SheetsOAuthService | null = null;

/**
 * Get or create the SheetsOAuthService singleton.
 */
export function getSheetsOAuthService(): SheetsOAuthService {
  if (!sheetsOAuthService) {
    sheetsOAuthService = new SheetsOAuthService();
  }
  return sheetsOAuthService;
}

/**
 * Create a new SheetsOAuthService instance.
 */
export function createSheetsOAuthService(): SheetsOAuthService {
  return new SheetsOAuthService();
}
