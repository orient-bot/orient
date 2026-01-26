/**
 * Transcription Service - Using OpenAI Whisper API
 *
 * Handles audio transcription with support for multiple languages,
 * including Hebrew and English.
 *
 * Exported via @orientbot/bot-whatsapp package.
 */

import fs from 'fs';
import path from 'path';
import { createServiceLogger } from '@orientbot/core';
import { getEnvWithSecrets } from '@orientbot/core';

const logger = createServiceLogger('transcription');

export interface TranscriptionResult {
  text: string;
  language: string;
  duration?: number;
}

export interface TranscriptionConfig {
  apiKey?: string;
  model?: string; // Default: 'whisper-1'
  language?: string; // Optional: force specific language (e.g., 'he', 'en')
  tempDir?: string; // Directory for temporary audio files
}

export class TranscriptionService {
  private apiKey: string;
  private model: string;
  private language?: string;
  private tempDir: string;
  private readonly API_URL = 'https://api.openai.com/v1/audio/transcriptions';

  constructor(config: TranscriptionConfig) {
    const resolvedApiKey = config.apiKey || getEnvWithSecrets('OPENAI_API_KEY');
    if (!resolvedApiKey) {
      throw new Error('OpenAI API key is required for transcription');
    }
    this.apiKey = resolvedApiKey;
    this.model = config.model || 'whisper-1';
    this.language = config.language;
    this.tempDir = config.tempDir || '/tmp/whatsapp-audio';

    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
      logger.info('Created temp directory for audio files', { path: this.tempDir });
    }
  }

  /**
   * Transcribe audio from a Buffer
   * @param audioBuffer - The audio data as a Buffer
   * @param mimeType - The MIME type of the audio (e.g., 'audio/ogg', 'audio/mpeg')
   * @param filename - Optional original filename
   */
  async transcribeBuffer(
    audioBuffer: Buffer,
    mimeType: string,
    filename?: string
  ): Promise<TranscriptionResult> {
    const op = logger.startOperation('transcribeBuffer');

    // Determine file extension from MIME type
    const extension = this.getExtensionFromMimeType(mimeType);
    const tempFilename = filename || `audio_${Date.now()}${extension}`;
    const tempFilePath = path.join(this.tempDir, tempFilename);

    try {
      // Write buffer to temp file
      fs.writeFileSync(tempFilePath, audioBuffer);
      logger.debug('Wrote audio to temp file', {
        path: tempFilePath,
        size: audioBuffer.length,
        mimeType,
      });

      // Transcribe the file
      const result = await this.transcribeFile(tempFilePath);

      op.success('Transcription complete', {
        textLength: result.text.length,
        language: result.language,
      });

      return result;
    } finally {
      // Clean up temp file
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          logger.debug('Cleaned up temp audio file', { path: tempFilePath });
        }
      } catch (cleanupError) {
        logger.warn('Failed to clean up temp file', {
          path: tempFilePath,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }
    }
  }

  /**
   * Transcribe audio from a file path
   * @param filePath - Path to the audio file
   */
  async transcribeFile(filePath: string): Promise<TranscriptionResult> {
    const op = logger.startOperation('transcribeFile');

    if (!fs.existsSync(filePath)) {
      throw new Error(`Audio file not found: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    logger.info('Transcribing audio file', {
      path: filePath,
      sizeBytes: stats.size,
    });

    try {
      // Create form data for the API request
      const formData = new FormData();

      // Read the file and create a Blob
      const fileBuffer = fs.readFileSync(filePath);
      const blob = new Blob([fileBuffer], { type: 'audio/ogg' });
      formData.append('file', blob, path.basename(filePath));
      formData.append('model', this.model);
      formData.append('response_format', 'verbose_json');

      // If language is specified, add it (otherwise Whisper auto-detects)
      if (this.language) {
        formData.append('language', this.language);
      }

      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
      }

      const result = (await response.json()) as {
        text: string;
        language: string;
        duration?: number;
      };

      op.success('Transcription successful', {
        language: result.language,
        duration: result.duration,
        textLength: result.text.length,
      });

      return {
        text: result.text.trim(),
        language: result.language,
        duration: result.duration,
      };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Get file extension from MIME type
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'audio/ogg': '.ogg',
      'audio/ogg; codecs=opus': '.ogg',
      'audio/opus': '.opus',
      'audio/mpeg': '.mp3',
      'audio/mp3': '.mp3',
      'audio/mp4': '.m4a',
      'audio/m4a': '.m4a',
      'audio/wav': '.wav',
      'audio/x-wav': '.wav',
      'audio/webm': '.webm',
      'audio/aac': '.aac',
    };

    return mimeToExt[mimeType] || '.ogg';
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

/**
 * Create a TranscriptionService instance
 */
export function createTranscriptionService(config: TranscriptionConfig): TranscriptionService {
  return new TranscriptionService(config);
}
