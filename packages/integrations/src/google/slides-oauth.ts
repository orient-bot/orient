/**
 * Google Slides OAuth Service
 *
 * Provides functionality to interact with Google Slides using OAuth 2.0
 * for personal accounts (as opposed to service accounts).
 *
 * Exported via @orientbot/integrations package.
 */

import { google, slides_v1 } from 'googleapis';
import { createServiceLogger } from '@orientbot/core';
import { getGoogleOAuthService } from './oauth.js';

const logger = createServiceLogger('slides-oauth');

// =============================================================================
// Types and Interfaces
// =============================================================================

export interface TextReplacement {
  /** Placeholder text to replace */
  placeholder: string;
  /** New text to insert */
  replacement: string;
  /** Whether to preserve formatting (default true) */
  preserveFormatting?: boolean;
}

export interface PresentationInfo {
  presentationId: string;
  title: string;
  url: string;
  slides: Array<{
    objectId: string;
    title?: string;
  }>;
}

// =============================================================================
// SlidesOAuthService Class
// =============================================================================

export class SlidesOAuthService {
  private slides: slides_v1.Slides | null = null;
  private currentEmail: string | null = null;

  constructor() {
    logger.debug('SlidesOAuthService instance created');
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Get or create Slides client for an account.
   */
  private async getClient(accountEmail?: string): Promise<slides_v1.Slides> {
    const oauthService = getGoogleOAuthService();

    // Determine which account to use
    const email = accountEmail || oauthService.getDefaultAccount();
    if (!email) {
      throw new Error(
        'No Google account connected. Use google_oauth_connect to connect an account.'
      );
    }

    // If we already have a client for this email, reuse it
    if (this.slides && this.currentEmail === email) {
      return this.slides;
    }

    // Get authenticated client
    const authClient = await oauthService.getAuthClient(email);
    this.slides = google.slides({ version: 'v1', auth: authClient });
    this.currentEmail = email;

    return this.slides;
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Get presentation metadata.
   */
  async getPresentation(presentationId: string, accountEmail?: string): Promise<PresentationInfo> {
    const op = logger.startOperation('getPresentation', { presentationId });

    const slides = await this.getClient(accountEmail);

    try {
      const response = await slides.presentations.get({ presentationId });

      const info: PresentationInfo = {
        presentationId,
        title: response.data.title || '',
        url: `https://docs.google.com/presentation/d/${presentationId}`,
        slides: (response.data.slides || []).map((slide) => ({
          objectId: slide.objectId || '',
          title:
            slide.pageElements?.[0]?.shape?.text?.textElements?.[0]?.textRun?.content || undefined,
        })),
      };

      op.success('Presentation retrieved', { title: info.title });
      return info;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Replace text in a presentation.
   */
  async replaceText(
    presentationId: string,
    replacements: TextReplacement[],
    accountEmail?: string
  ): Promise<void> {
    const op = logger.startOperation('replaceText', { count: replacements.length });

    const slides = await this.getClient(accountEmail);

    try {
      const requests = replacements.map((r) => ({
        replaceAllText: {
          containsText: {
            text: r.placeholder,
            matchCase: true,
          },
          replaceText: r.replacement,
        },
      }));

      await slides.presentations.batchUpdate({
        presentationId,
        requestBody: { requests },
      });

      op.success('Text replaced');
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Duplicate a slide by objectId within a presentation.
   */
  async duplicateSlide(
    presentationId: string,
    sourceObjectId: string,
    accountEmail?: string
  ): Promise<string> {
    const op = logger.startOperation('duplicateSlide', { sourceObjectId });

    const slides = await this.getClient(accountEmail);

    try {
      const response = await slides.presentations.batchUpdate({
        presentationId,
        requestBody: {
          requests: [
            {
              duplicateObject: {
                objectId: sourceObjectId,
              },
            },
          ],
        },
      });

      const newObjectId = response.data.replies?.[0]?.duplicateObject?.objectId || '';
      op.success('Slide duplicated', { newObjectId });
      return newObjectId;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

let slidesOAuthService: SlidesOAuthService | null = null;

/**
 * Get or create the SlidesOAuthService singleton.
 */
export function getSlidesOAuthService(): SlidesOAuthService {
  if (!slidesOAuthService) {
    slidesOAuthService = new SlidesOAuthService();
  }
  return slidesOAuthService;
}

/**
 * Create a new SlidesOAuthService instance.
 */
export function createSlidesOAuthService(): SlidesOAuthService {
  return new SlidesOAuthService();
}
