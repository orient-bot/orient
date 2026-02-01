/**
 * Media Storage Service
 *
 * Handles saving and retrieving media files (images, audio, video, documents)
 * from WhatsApp messages. Files are stored on disk with metadata tracked in the database.
 *
 * Exported via @orient-bot/bot-whatsapp package.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createServiceLogger } from '@orient-bot/core';

const logger = createServiceLogger('media-storage');

export interface SavedMedia {
  filePath: string; // Relative path from media directory
  absolutePath: string; // Full absolute path
  mediaType: 'image' | 'audio' | 'video' | 'document';
  mimeType: string;
  size: number;
  hash: string; // SHA256 hash for deduplication
}

export interface MediaStorageConfig {
  baseDir?: string; // Base directory for media storage (default: ./data/media)
  maxFileSizeMB?: number; // Maximum file size to store (default: 50MB)
}

export class MediaStorageService {
  private baseDir: string;
  private maxFileSize: number;

  constructor(config?: MediaStorageConfig) {
    this.baseDir = config?.baseDir || path.join(process.cwd(), 'data', 'media');
    this.maxFileSize = (config?.maxFileSizeMB || 50) * 1024 * 1024; // Convert MB to bytes

    // Ensure base directories exist
    this.ensureDirectories();

    logger.info('Media storage service initialized', {
      baseDir: this.baseDir,
      maxFileSizeMB: this.maxFileSize / 1024 / 1024,
    });
  }

  /**
   * Ensure all required directories exist
   */
  private ensureDirectories(): void {
    const subdirs = ['images', 'audio', 'video', 'documents'];

    for (const subdir of subdirs) {
      const dirPath = path.join(this.baseDir, subdir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        logger.debug('Created media directory', { path: dirPath });
      }
    }
  }

  /**
   * Get the subdirectory for a media type
   */
  private getSubdir(mediaType: string): string {
    switch (mediaType) {
      case 'image':
        return 'images';
      case 'audio':
        return 'audio';
      case 'video':
        return 'video';
      case 'document':
        return 'documents';
      default:
        return 'documents';
    }
  }

  /**
   * Get file extension from MIME type
   */
  private getExtension(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      // Images
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      // Audio
      'audio/ogg': '.ogg',
      'audio/ogg; codecs=opus': '.opus',
      'audio/mpeg': '.mp3',
      'audio/mp4': '.m4a',
      'audio/wav': '.wav',
      'audio/webm': '.webm',
      // Video
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/3gpp': '.3gp',
      // Documents
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    };

    return mimeToExt[mimeType] || '.bin';
  }

  /**
   * Determine media type from MIME type
   */
  private getMediaType(mimeType: string): 'image' | 'audio' | 'video' | 'document' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    return 'document';
  }

  /**
   * Generate a unique filename for a media file
   */
  private generateFilename(
    hash: string,
    extension: string,
    timestamp: Date,
    messageId?: string
  ): string {
    const dateStr = timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
    const shortHash = hash.substring(0, 8);
    const idPart = messageId ? `_${messageId.substring(0, 8)}` : '';
    return `${dateStr}${idPart}_${shortHash}${extension}`;
  }

  /**
   * Save media buffer to disk
   *
   * @param buffer - The media data
   * @param mimeType - MIME type of the media
   * @param timestamp - Message timestamp
   * @param messageId - Optional message ID for uniqueness
   * @returns SavedMedia info or null if failed
   */
  saveMedia(
    buffer: Buffer,
    mimeType: string,
    timestamp: Date = new Date(),
    messageId?: string
  ): SavedMedia | null {
    try {
      // Check file size
      if (buffer.length > this.maxFileSize) {
        logger.warn('Media file too large, skipping', {
          sizeMB: buffer.length / 1024 / 1024,
          maxMB: this.maxFileSize / 1024 / 1024,
        });
        return null;
      }

      // Calculate hash for deduplication
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');

      // Get media type and extension
      const mediaType = this.getMediaType(mimeType);
      const extension = this.getExtension(mimeType);
      const subdir = this.getSubdir(mediaType);

      // Generate filename
      const filename = this.generateFilename(hash, extension, timestamp, messageId);
      const relativePath = path.join(subdir, filename);
      const absolutePath = path.join(this.baseDir, relativePath);

      // Check if file already exists (deduplication)
      if (fs.existsSync(absolutePath)) {
        logger.debug('Media file already exists, skipping write', { relativePath });
        return {
          filePath: relativePath,
          absolutePath,
          mediaType,
          mimeType,
          size: buffer.length,
          hash,
        };
      }

      // Write file to disk
      fs.writeFileSync(absolutePath, buffer);

      logger.info('Saved media file', {
        relativePath,
        mediaType,
        sizeMB: (buffer.length / 1024 / 1024).toFixed(2),
      });

      return {
        filePath: relativePath,
        absolutePath,
        mediaType,
        mimeType,
        size: buffer.length,
        hash,
      };
    } catch (error) {
      logger.error('Failed to save media file', {
        error: error instanceof Error ? error.message : String(error),
        mimeType,
      });
      return null;
    }
  }

  /**
   * Read media file from disk
   */
  readMedia(relativePath: string): Buffer | null {
    try {
      const absolutePath = path.join(this.baseDir, relativePath);
      if (!fs.existsSync(absolutePath)) {
        logger.warn('Media file not found', { relativePath });
        return null;
      }
      return fs.readFileSync(absolutePath);
    } catch (error) {
      logger.error('Failed to read media file', {
        error: error instanceof Error ? error.message : String(error),
        relativePath,
      });
      return null;
    }
  }

  /**
   * Check if a media file exists
   */
  mediaExists(relativePath: string): boolean {
    const absolutePath = path.join(this.baseDir, relativePath);
    return fs.existsSync(absolutePath);
  }

  /**
   * Get absolute path for a relative media path
   */
  getAbsolutePath(relativePath: string): string {
    return path.join(this.baseDir, relativePath);
  }

  /**
   * Delete a media file
   */
  deleteMedia(relativePath: string): boolean {
    try {
      const absolutePath = path.join(this.baseDir, relativePath);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
        logger.debug('Deleted media file', { relativePath });
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to delete media file', {
        error: error instanceof Error ? error.message : String(error),
        relativePath,
      });
      return false;
    }
  }

  /**
   * Get storage statistics
   */
  getStorageStats(): {
    totalFiles: number;
    totalSizeMB: number;
    byType: Record<string, { count: number; sizeMB: number }>;
  } {
    const stats = {
      totalFiles: 0,
      totalSizeMB: 0,
      byType: {} as Record<string, { count: number; sizeMB: number }>,
    };

    const subdirs = ['images', 'audio', 'video', 'documents'];

    for (const subdir of subdirs) {
      const dirPath = path.join(this.baseDir, subdir);
      if (!fs.existsSync(dirPath)) continue;

      const files = fs.readdirSync(dirPath);
      let typeSize = 0;

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            stats.totalFiles++;
            stats.totalSizeMB += stat.size / 1024 / 1024;
            typeSize += stat.size / 1024 / 1024;
          }
        } catch {
          // Skip files we can't stat
        }
      }

      stats.byType[subdir] = {
        count: files.length,
        sizeMB: Math.round(typeSize * 100) / 100,
      };
    }

    stats.totalSizeMB = Math.round(stats.totalSizeMB * 100) / 100;
    return stats;
  }
}

/**
 * Create a MediaStorageService instance
 */
export function createMediaStorageService(config?: MediaStorageConfig): MediaStorageService {
  return new MediaStorageService(config);
}
