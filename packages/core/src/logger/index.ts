/**
 * Logger Module
 *
 * Provides structured logging with Winston, supporting:
 * - Log rotation
 * - Correlation IDs for request tracing
 * - Service-specific loggers
 * - Sensitive data redaction
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

// Ensure logs directory exists
const logsDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logLevel = process.env.LOG_LEVEL || 'debug';

// Log rotation configuration
export const LOG_ROTATION_CONFIG = {
  // Maximum size of a single log file before rotation
  maxSize: process.env.LOG_MAX_SIZE || '10m',
  // Maximum number of days to keep logs (delete older)
  maxDays: process.env.LOG_MAX_DAYS || '14d',
  // Maximum total size of all log files (oldest deleted when exceeded)
  maxTotalSize: process.env.LOG_MAX_TOTAL_SIZE || '100m',
  // Compress rotated files
  compress: true,
};

// Cache of dedicated service loggers
const serviceLoggers = new Map<string, winston.Logger>();

// Patterns for sensitive data redaction
const SENSITIVE_PATTERNS = [
  /apiToken['":\s]+['"]?([^'"}\s,]+)/gi,
  /api_token['":\s]+['"]?([^'"}\s,]+)/gi,
  /password['":\s]+['"]?([^'"}\s,]+)/gi,
  /secret['":\s]+['"]?([^'"}\s,]+)/gi,
  /authorization['":\s]+['"]?([^'"}\s,]+)/gi,
  /bearer\s+([^\s'"]+)/gi,
  /basic\s+([^\s'"]+)/gi,
];

/**
 * Redact sensitive information from log data
 */
function redactSensitive(data: unknown): unknown {
  if (typeof data === 'string') {
    let result = data;
    for (const pattern of SENSITIVE_PATTERNS) {
      result = result.replace(pattern, (match, group) => {
        return match.replace(group, '[REDACTED]');
      });
    }
    return result;
  }
  if (Array.isArray(data)) {
    return data.map(redactSensitive);
  }
  if (data && typeof data === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('token') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('password') ||
        lowerKey.includes('apikey') ||
        lowerKey.includes('api_key') ||
        lowerKey.includes('authorization')
      ) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactSensitive(value);
      }
    }
    return redacted;
  }
  return data;
}

/**
 * Format log entry as structured JSON
 */
const jsonFormat = winston.format.printf((info) => {
  const { level, message, timestamp, correlationId, service, operation, duration, ...meta } = info;

  const logEntry: Record<string, unknown> = {
    timestamp,
    level: level.toUpperCase(),
    message,
  };

  if (correlationId) logEntry.correlationId = correlationId;
  if (service) logEntry.service = service;
  if (operation) logEntry.operation = operation;
  if (duration !== undefined) logEntry.durationMs = duration;

  // Add any additional metadata
  if (Object.keys(meta).length > 0) {
    logEntry.meta = redactSensitive(meta);
  }

  return JSON.stringify(logEntry);
});

/**
 * Human-readable format for stderr
 */
const humanFormat = winston.format.printf((info) => {
  const { level, message, timestamp, correlationId, service, operation, duration, stack, ...meta } =
    info;

  let output = `${timestamp} [${level.toUpperCase()}]`;

  if (correlationId && typeof correlationId === 'string') {
    output += ` [${correlationId.slice(0, 8)}]`;
  }
  if (service) output += ` [${service}]`;
  if (operation) output += ` ${operation}:`;

  output += ` ${message}`;

  if (duration !== undefined) output += ` (${duration}ms)`;

  if (stack) {
    output += `\n${stack}`;
  }

  // Add metadata on new lines if present
  if (Object.keys(meta).length > 0) {
    const redactedMeta = redactSensitive(meta);
    output += `\n  → ${JSON.stringify(redactedMeta, null, 2).replace(/\n/g, '\n  ')}`;
  }

  return output;
});

// Create rotating file transport for debug logs
const debugFileTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'mcp-debug-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: LOG_ROTATION_CONFIG.maxSize,
  maxFiles: LOG_ROTATION_CONFIG.maxDays,
  zippedArchive: LOG_ROTATION_CONFIG.compress,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    jsonFormat
  ),
});

// Create rotating file transport for error logs
const errorFileTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'mcp-error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize: LOG_ROTATION_CONFIG.maxSize,
  maxFiles: '7d', // Keep error logs for 7 days
  zippedArchive: LOG_ROTATION_CONFIG.compress,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    jsonFormat
  ),
});

// Log rotation events
debugFileTransport.on('rotate', (oldFilename: string, newFilename: string) => {
  console.error(`[Logger] Rotating debug log: ${oldFilename} -> ${newFilename}`);
});

debugFileTransport.on('archive', (zipFilename: string) => {
  console.error(`[Logger] Archived debug log: ${zipFilename}`);
});

debugFileTransport.on('logRemoved', (removedFilename: string) => {
  console.error(`[Logger] Deleted old debug log: ${removedFilename}`);
});

errorFileTransport.on('rotate', (oldFilename: string, newFilename: string) => {
  console.error(`[Logger] Rotating error log: ${oldFilename} -> ${newFilename}`);
});

errorFileTransport.on('logRemoved', (removedFilename: string) => {
  console.error(`[Logger] Deleted old error log: ${removedFilename}`);
});

// Create the main logger
export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true })
  ),
  transports: [
    // Stderr transport with human-readable format (for MCP)
    new winston.transports.Console({
      stderrLevels: ['error', 'warn', 'info', 'debug'],
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        humanFormat
      ),
    }),
    // Rotating debug log file
    debugFileTransport,
    // Rotating error log file
    errorFileTransport,
  ],
});

// Log startup info about rotation configuration
logger.info('Logger initialized with rotation', {
  service: 'logger',
  logsDir,
  rotation: {
    maxSize: LOG_ROTATION_CONFIG.maxSize,
    maxDays: LOG_ROTATION_CONFIG.maxDays,
    compress: LOG_ROTATION_CONFIG.compress,
  },
});

/**
 * Correlation ID storage using AsyncLocalStorage for request tracing
 */
let currentCorrelationId: string | null = null;

/**
 * Generate a new correlation ID
 */
export function generateCorrelationId(): string {
  return randomUUID();
}

/**
 * Set the current correlation ID for the execution context
 */
export function setCorrelationId(id: string): void {
  currentCorrelationId = id;
}

/**
 * Get the current correlation ID
 */
export function getCorrelationId(): string | null {
  return currentCorrelationId;
}

/**
 * Clear the current correlation ID
 */
export function clearCorrelationId(): void {
  currentCorrelationId = null;
}

/**
 * Service logger interface - returned by createServiceLogger
 */
export interface ServiceLogger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  startOperation: (
    operation: string,
    meta?: Record<string, unknown>
  ) => {
    success: (message?: string, resultMeta?: Record<string, unknown>) => void;
    failure: (error: Error | string, resultMeta?: Record<string, unknown>) => void;
  };
}

/**
 * Create a child logger with specific context (service name, correlation ID)
 */
export function createServiceLogger(serviceName: string): ServiceLogger {
  return {
    debug: (message: string, meta?: Record<string, unknown>) => {
      logger.debug(message, { service: serviceName, correlationId: getCorrelationId(), ...meta });
    },
    info: (message: string, meta?: Record<string, unknown>) => {
      logger.info(message, { service: serviceName, correlationId: getCorrelationId(), ...meta });
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      logger.warn(message, { service: serviceName, correlationId: getCorrelationId(), ...meta });
    },
    error: (message: string, meta?: Record<string, unknown>) => {
      logger.error(message, { service: serviceName, correlationId: getCorrelationId(), ...meta });
    },
    /**
     * Log the start of an operation and return a function to log completion
     */
    startOperation: (operation: string, meta?: Record<string, unknown>) => {
      const startTime = Date.now();
      logger.debug(`Starting ${operation}`, {
        service: serviceName,
        operation,
        correlationId: getCorrelationId(),
        ...meta,
      });

      return {
        success: (message?: string, resultMeta?: Record<string, unknown>) => {
          const duration = Date.now() - startTime;
          logger.info(message || `Completed ${operation}`, {
            service: serviceName,
            operation,
            correlationId: getCorrelationId(),
            duration,
            status: 'success',
            ...resultMeta,
          });
        },
        failure: (error: Error | string, resultMeta?: Record<string, unknown>) => {
          const duration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : error;
          const errorStack = error instanceof Error ? error.stack : undefined;
          logger.error(`Failed ${operation}: ${errorMessage}`, {
            service: serviceName,
            operation,
            correlationId: getCorrelationId(),
            duration,
            status: 'failure',
            error: errorMessage,
            stack: errorStack,
            ...resultMeta,
          });
        },
      };
    },
  };
}

/**
 * Summarize large results for logging
 */
function summarizeResult(data: unknown): unknown {
  if (Array.isArray(data)) {
    if (data.length > 5) {
      return {
        _type: 'array',
        length: data.length,
        sample: data.slice(0, 3),
        truncated: true,
      };
    }
    return data;
  }

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;

    // Handle common patterns
    if ('issues' in obj && Array.isArray(obj.issues)) {
      return {
        ...obj,
        issues:
          obj.issues.length > 5
            ? {
                _type: 'array',
                length: obj.issues.length,
                sample: (obj.issues as unknown[]).slice(0, 3),
                truncated: true,
              }
            : obj.issues,
      };
    }

    if ('content' in obj && Array.isArray(obj.content)) {
      const content = obj.content as Array<{ type: string; text?: string }>;
      return {
        ...obj,
        content: content.map((c) => ({
          type: c.type,
          textLength: c.text?.length,
          textPreview: c.text?.slice(0, 200),
        })),
      };
    }

    return obj;
  }

  return data;
}

/**
 * MCP Tool logger - specialized for logging tool invocations
 */
export const mcpToolLogger = {
  /**
   * Log the start of a tool invocation
   */
  toolStart: (toolName: string, args: Record<string, unknown>, correlationId: string) => {
    setCorrelationId(correlationId);
    logger.info(`Tool invoked: ${toolName}`, {
      service: 'mcp-server',
      operation: 'tool_call',
      correlationId,
      tool: toolName,
      input: redactSensitive(args),
    });
  },

  /**
   * Log successful tool completion
   */
  toolSuccess: (toolName: string, result: unknown, duration: number) => {
    const correlationId = getCorrelationId();

    // Summarize large results
    let resultSummary: unknown;
    if (typeof result === 'string') {
      try {
        const parsed = JSON.parse(result);
        resultSummary = summarizeResult(parsed);
      } catch {
        resultSummary = result.length > 500 ? `${result.slice(0, 500)}... (truncated)` : result;
      }
    } else {
      resultSummary = summarizeResult(result);
    }

    logger.info(`Tool completed: ${toolName}`, {
      service: 'mcp-server',
      operation: 'tool_call',
      correlationId,
      tool: toolName,
      duration,
      status: 'success',
      output: redactSensitive(resultSummary),
    });
  },

  /**
   * Log tool error
   */
  toolError: (toolName: string, error: Error | string, duration: number) => {
    const correlationId = getCorrelationId();
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error(`Tool failed: ${toolName}`, {
      service: 'mcp-server',
      operation: 'tool_call',
      correlationId,
      tool: toolName,
      duration,
      status: 'error',
      error: errorMessage,
      stack: errorStack,
    });
  },
};

/**
 * Configuration options for creating a dedicated service logger
 */
export interface DedicatedLoggerOptions {
  /** Maximum size of log file before rotation (e.g., '10m', '50m') */
  maxSize?: string;
  /** Maximum number of days to keep logs (e.g., '14d', '7d') */
  maxDays?: string;
  /** Whether to compress rotated files */
  compress?: boolean;
  /** Log level override (defaults to global LOG_LEVEL or 'debug') */
  logLevel?: string;
  /** Whether to also log to console/stderr */
  consoleOutput?: boolean;
}

/**
 * Create a dedicated logger for a specific service with its own log files
 */
export function createDedicatedLogger(serviceName: string, options: DedicatedLoggerOptions = {}) {
  // Return cached logger if already created
  if (serviceLoggers.has(serviceName)) {
    return serviceLoggers.get(serviceName)!;
  }

  const {
    maxSize = LOG_ROTATION_CONFIG.maxSize,
    maxDays = LOG_ROTATION_CONFIG.maxDays,
    compress = LOG_ROTATION_CONFIG.compress,
    logLevel: level = logLevel,
    consoleOutput = true,
  } = options;

  // Create rotating file transport for debug logs
  const serviceDebugFileTransport = new DailyRotateFile({
    filename: path.join(logsDir, `${serviceName}-debug-%DATE%.log`),
    datePattern: 'YYYY-MM-DD',
    maxSize,
    maxFiles: maxDays,
    zippedArchive: compress,
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      jsonFormat
    ),
  });

  // Create rotating file transport for error logs
  const serviceErrorFileTransport = new DailyRotateFile({
    filename: path.join(logsDir, `${serviceName}-error-%DATE%.log`),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    maxSize,
    maxFiles: '7d',
    zippedArchive: compress,
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      jsonFormat
    ),
  });

  // Build transports array
  const transports: winston.transport[] = [serviceDebugFileTransport, serviceErrorFileTransport];

  // Optionally add console output
  if (consoleOutput) {
    transports.push(
      new winston.transports.Console({
        stderrLevels: ['error', 'warn', 'info', 'debug'],
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
          humanFormat
        ),
      })
    );
  }

  // Create the service-specific logger
  const serviceLogger = winston.createLogger({
    level,
    defaultMeta: { service: serviceName },
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true })
    ),
    transports,
  });

  // Log startup info
  serviceLogger.info(`${serviceName} logger initialized with rotation`, {
    logsDir,
    rotation: { maxSize, maxDays, compress },
  });

  // Cache the logger
  serviceLoggers.set(serviceName, serviceLogger);

  return serviceLogger;
}

/**
 * Create a service-specific logger interface from a dedicated Winston logger
 */
export function createDedicatedServiceLogger(
  serviceName: string,
  options: DedicatedLoggerOptions = {}
): ServiceLogger & { getWinstonLogger: () => winston.Logger } {
  const dedicatedLogger = createDedicatedLogger(serviceName, options);

  return {
    debug: (message: string, meta?: Record<string, unknown>) => {
      dedicatedLogger.debug(message, { correlationId: getCorrelationId(), ...meta });
    },
    info: (message: string, meta?: Record<string, unknown>) => {
      dedicatedLogger.info(message, { correlationId: getCorrelationId(), ...meta });
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      dedicatedLogger.warn(message, { correlationId: getCorrelationId(), ...meta });
    },
    error: (message: string, meta?: Record<string, unknown>) => {
      dedicatedLogger.error(message, { correlationId: getCorrelationId(), ...meta });
    },
    startOperation: (operation: string, meta?: Record<string, unknown>) => {
      const startTime = Date.now();
      dedicatedLogger.debug(`Starting ${operation}`, {
        operation,
        correlationId: getCorrelationId(),
        ...meta,
      });

      return {
        success: (message?: string, resultMeta?: Record<string, unknown>) => {
          const duration = Date.now() - startTime;
          dedicatedLogger.info(message || `Completed ${operation}`, {
            operation,
            correlationId: getCorrelationId(),
            duration,
            status: 'success',
            ...resultMeta,
          });
        },
        failure: (error: Error | string, resultMeta?: Record<string, unknown>) => {
          const duration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : error;
          const errorStack = error instanceof Error ? error.stack : undefined;
          dedicatedLogger.error(`Failed ${operation}: ${errorMessage}`, {
            operation,
            correlationId: getCorrelationId(),
            duration,
            status: 'failure',
            error: errorMessage,
            stack: errorStack,
            ...resultMeta,
          });
        },
      };
    },
    getWinstonLogger: () => dedicatedLogger,
  };
}

/**
 * Manually trigger cleanup of old log files
 */
export function cleanupOldLogs(): void {
  logger.info('Manual log cleanup triggered', { service: 'logger' });

  const files = fs.readdirSync(logsDir);
  const now = Date.now();
  const maxAge = 14 * 24 * 60 * 60 * 1000; // 14 days in ms

  for (const file of files) {
    if (file.endsWith('.log') || file.endsWith('.log.gz')) {
      const filePath = path.join(logsDir, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtime.getTime();

      if (age > maxAge) {
        fs.unlinkSync(filePath);
        logger.info(`Deleted old log file: ${file}`, {
          service: 'logger',
          ageInDays: Math.floor(age / (24 * 60 * 60 * 1000)),
        });
      }
    }
  }
}

export default logger;
