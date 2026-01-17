/**
 * Google Sheets Service
 *
 * Provides functionality to interact with Google Sheets spreadsheets
 * using Service Account authentication.
 */

import { google, sheets_v4 } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { createServiceLogger } from '@orient/core';

// Create a service-specific logger
const sheetsLogger = createServiceLogger('sheets-service');

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

export class SheetsService {
  private sheets: sheets_v4.Sheets | null = null;
  private drive: ReturnType<typeof google.drive> | null = null;
  private config: SheetsConfig;
  private initialized = false;

  constructor(config: SheetsConfig) {
    this.config = config;
    sheetsLogger.debug('SheetsService instance created', {
      credentialsPath: config.credentialsPath,
    });
  }

  /**
   * Initialize the Google Sheets client with Service Account credentials
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      sheetsLogger.debug('Sheets service already initialized, skipping');
      return;
    }

    const op = sheetsLogger.startOperation('initialize');
    const credentialsPath = path.resolve(this.config.credentialsPath);

    sheetsLogger.debug('Checking for credentials file', { credentialsPath });

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

      sheetsLogger.debug('Credentials loaded', {
        clientEmail: credentials.client_email,
        projectId: credentials.project_id,
      });

      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive.file',
        ],
      });

      this.sheets = google.sheets({ version: 'v4', auth });
      this.drive = google.drive({ version: 'v3', auth });
      this.initialized = true;

      op.success('Google Sheets client initialized', {
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
  private async ensureInitialized(): Promise<sheets_v4.Sheets> {
    if (!this.initialized || !this.sheets) {
      sheetsLogger.debug('Service not initialized, initializing now');
      await this.initialize();
    }
    return this.sheets!;
  }

  /**
   * Create a new spreadsheet with headers
   */
  async createSpreadsheet(title: string, headers: string[]): Promise<CreateSpreadsheetResult> {
    const op = sheetsLogger.startOperation('createSpreadsheet', {
      title,
      headerCount: headers.length,
    });
    const sheets = await this.ensureInitialized();

    sheetsLogger.debug('Creating new spreadsheet', { title, headers });

    try {
      // Create the spreadsheet
      const response = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title,
          },
          sheets: [
            {
              properties: {
                title: 'Ideas',
                gridProperties: {
                  rowCount: 1000,
                  columnCount: headers.length,
                  frozenRowCount: 1, // Freeze header row
                },
              },
            },
          ],
        },
      });

      const spreadsheetId = response.data.spreadsheetId!;
      const url = response.data.spreadsheetUrl!;

      // Add headers to the first row
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Ideas!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [headers],
        },
      });

      // Format the header row (bold, background color)
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: response.data.sheets![0].properties!.sheetId!,
                  startRowIndex: 0,
                  endRowIndex: 1,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: {
                      red: 0.2,
                      green: 0.6,
                      blue: 0.86,
                    },
                    textFormat: {
                      bold: true,
                      foregroundColor: {
                        red: 1,
                        green: 1,
                        blue: 1,
                      },
                    },
                  },
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)',
              },
            },
          ],
        },
      });

      op.success('Spreadsheet created', {
        spreadsheetId,
        url,
        title,
      });

      return {
        spreadsheetId,
        url,
        title,
      };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error), { title });
      throw error;
    }
  }

  /**
   * Share a spreadsheet with users or make it public
   */
  async shareSpreadsheet(
    spreadsheetId: string,
    options: {
      emails?: string[];
      makePublic?: boolean;
    }
  ): Promise<void> {
    const op = sheetsLogger.startOperation('shareSpreadsheet', {
      spreadsheetId,
      emails: options.emails,
      makePublic: options.makePublic,
    });

    await this.ensureInitialized();

    sheetsLogger.debug('Sharing spreadsheet', {
      spreadsheetId,
      emails: options.emails,
      makePublic: options.makePublic,
    });

    try {
      if (options.makePublic) {
        // Make the spreadsheet editable by anyone with the link
        await this.drive!.permissions.create({
          fileId: spreadsheetId,
          requestBody: {
            role: 'writer',
            type: 'anyone',
          },
        });
        sheetsLogger.debug('Spreadsheet made public (editable by anyone with link)');
      }

      if (options.emails && options.emails.length > 0) {
        // Share with specific users
        for (const email of options.emails) {
          await this.drive!.permissions.create({
            fileId: spreadsheetId,
            requestBody: {
              role: 'writer',
              type: 'user',
              emailAddress: email,
            },
            sendNotificationEmail: false,
          });
          sheetsLogger.debug('Spreadsheet shared with user', { email });
        }
      }

      op.success('Spreadsheet shared', {
        spreadsheetId,
        sharedWithCount: options.emails?.length || 0,
        isPublic: options.makePublic,
      });
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error), { spreadsheetId });
      throw error;
    }
  }

  /**
   * Append rows to a spreadsheet
   */
  async appendRows(spreadsheetId: string, sheetName: string, values: unknown[][]): Promise<void> {
    const op = sheetsLogger.startOperation('appendRows', {
      spreadsheetId,
      sheetName,
      rowCount: values.length,
    });
    const sheets = await this.ensureInitialized();

    sheetsLogger.debug('Appending rows', {
      spreadsheetId,
      sheetName,
      rowCount: values.length,
    });

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:A`,
        valueInputOption: 'RAW',
        requestBody: {
          values,
        },
      });

      op.success('Rows appended', {
        spreadsheetId,
        sheetName,
        rowCount: values.length,
      });
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error), {
        spreadsheetId,
        sheetName,
      });
      throw error;
    }
  }

  /**
   * Get all rows from a range
   */
  async getRows(spreadsheetId: string, range: string): Promise<unknown[][]> {
    const op = sheetsLogger.startOperation('getRows', {
      spreadsheetId,
      range,
    });
    const sheets = await this.ensureInitialized();

    sheetsLogger.debug('Getting rows', { spreadsheetId, range });

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const values = response.data.values || [];

      op.success('Rows retrieved', {
        spreadsheetId,
        range,
        rowCount: values.length,
      });

      return values;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error), {
        spreadsheetId,
        range,
      });
      throw error;
    }
  }

  /**
   * Update a range with new values
   */
  async updateRow(spreadsheetId: string, range: string, values: unknown[][]): Promise<void> {
    const op = sheetsLogger.startOperation('updateRow', {
      spreadsheetId,
      range,
      rowCount: values.length,
    });
    const sheets = await this.ensureInitialized();

    sheetsLogger.debug('Updating row', { spreadsheetId, range });

    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: {
          values,
        },
      });

      op.success('Row updated', { spreadsheetId, range });
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error), {
        spreadsheetId,
        range,
      });
      throw error;
    }
  }

  /**
   * Get spreadsheet metadata and information
   */
  async getSpreadsheetInfo(spreadsheetId: string): Promise<SpreadsheetInfo> {
    const op = sheetsLogger.startOperation('getSpreadsheetInfo', {
      spreadsheetId,
    });
    const sheets = await this.ensureInitialized();

    sheetsLogger.debug('Getting spreadsheet info', { spreadsheetId });

    try {
      const response = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      const spreadsheet = response.data;
      const sheetsList =
        spreadsheet.sheets?.map((sheet, index) => ({
          sheetId: sheet.properties!.sheetId!,
          title: sheet.properties!.title!,
          index,
        })) || [];

      const info: SpreadsheetInfo = {
        spreadsheetId,
        title: spreadsheet.properties!.title!,
        url: spreadsheet.spreadsheetUrl!,
        sheets: sheetsList,
      };

      op.success('Spreadsheet info retrieved', {
        spreadsheetId,
        title: info.title,
        sheetCount: sheetsList.length,
      });

      return info;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error), {
        spreadsheetId,
      });
      throw error;
    }
  }
}

// Export a factory function for creating the service
export function createSheetsService(config: SheetsConfig): SheetsService {
  sheetsLogger.info('Creating new SheetsService instance');
  return new SheetsService(config);
}
