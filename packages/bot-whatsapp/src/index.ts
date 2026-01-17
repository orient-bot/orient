/**
 * @orient/bot-whatsapp
 *
 * WhatsApp bot service for the Orient.
 *
 * This package provides:
 * - WhatsApp connection management (Baileys)
 * - Message handling and routing
 * - QR code generation for pairing
 * - Health monitoring
 *
 * Service implementations are in src/services/ and re-exported here.
 * Import from this package for the public API.
 */

export * from './types.js';
export * from './services/index.js';

/**
 * WhatsApp Services Status
 *
 * Package-native implementations:
 * - WhatsAppConnection - Baileys connection management
 * - WhatsAppMessaging - Message sending
 * - WhatsAppApiServer - REST API server
 *
 * Services re-exported from src/services/:
 * - whatsappService - Core WhatsApp service (Baileys)
 * - whatsappApiServer - REST API server (legacy, use WhatsAppApiServer)
 * - whatsappEventHandlers - Event handling
 * - whatsappHealthMonitor - Health monitoring
 * - whatsappCloudApiService - Cloud API integration
 * - whatsappMessageRouter - Message routing
 * - whatsappAgentService - Agent integration
 * - mediaStorageService - Media storage
 * - transcriptionService - Audio transcription
 * - progressiveResponder - Progress updates
 * - openCodeWhatsAppHandler - OpenCode integration
 */
export const WHATSAPP_SERVICES = {
  // Package-native (preferred)
  connection: 'WhatsAppConnection',
  messaging: 'WhatsAppMessaging',
  apiServer: 'WhatsAppApiServer',
  // Re-exported from src/services/ imports
  srcServices: [
    'whatsappService',
    'whatsappApiServer',
    'whatsappEventHandlers',
    'whatsappHealthMonitor',
    'whatsappCloudApiService',
    'whatsappMessageRouter',
    'whatsappAgentService',
    'mediaStorageService',
    'transcriptionService',
    'progressiveResponder',
    'openCodeWhatsAppHandler',
  ],
} as const;
