import { sanitizeLogMessage } from '../../infrastructure/security/input-sanitization.js';
import { randomBytes } from 'crypto';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  context?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  performance?: {
    startTime?: number;
    duration?: number;
  };
  tool?: string;
  security?: {
    event: string;
    severity: string;
  };
  success?: boolean;
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  filePath?: string;
  maxFileSize?: number;
  maxFiles?: number;
  format?: 'json' | 'text';
}

/**
 * Structured logger for production MCP server
 * Provides correlation IDs, performance tracking, and secure output
 */
export class StructuredLogger {
  private config: LoggerConfig;
  private correlationCounter = 0;
  
  private readonly levelPriority: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
  };

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: (process.env.LOG_LEVEL as LogLevel) ?? 'info',
      enableConsole: process.env.NODE_ENV !== 'test',
      enableFile: process.env.NODE_ENV === 'production',
      filePath: process.env.LOG_FILE_PATH ?? './logs/mcp-server.log',
      maxFileSize: parseInt(process.env.LOG_MAX_FILE_SIZE ?? '10485760'), // 10MB
      maxFiles: parseInt(process.env.LOG_MAX_FILES ?? '5'),
      format: (process.env.LOG_FORMAT as 'json' | 'text') ?? 'json',
      ...config
    };
  }

  /**
   * Generates a unique correlation ID for request tracking using cryptographically secure random
   */
  generateCorrelationId(): string {
    const timestamp = Date.now().toString(36);
    const counter = (++this.correlationCounter).toString(36).padStart(3, '0');
    // Use cryptographically secure random instead of Math.random()
    const random = randomBytes(4).toString('hex').substring(0, 6);
    return `${timestamp}-${counter}-${random}`;
  }

  /**
   * Log an error with full context
   */
  error(message: string, error?: Error, context?: Record<string, any>, correlationId?: string): void {
    this.log('error', message, {
      error: error ? {
        name: error.name,
        message: sanitizeLogMessage(error.message),
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      } : undefined,
      context: this.sanitizeContext(context),
      correlationId
    });
  }

  /**
   * Log a warning
   */
  warn(message: string, context?: Record<string, any>, correlationId?: string): void {
    this.log('warn', message, { context: this.sanitizeContext(context), correlationId });
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, any>, correlationId?: string): void {
    this.log('info', message, { context: this.sanitizeContext(context), correlationId });
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, any>, correlationId?: string): void {
    this.log('debug', message, { context: this.sanitizeContext(context), correlationId });
  }

  /**
   * Log the start of an operation for performance tracking
   */
  startOperation(operation: string, context?: Record<string, any>, correlationId?: string): number {
    const startTime = Date.now();
    this.debug(`Starting ${operation}`, { 
      ...this.sanitizeContext(context), 
      performance: { startTime } 
    }, correlationId);
    return startTime;
  }

  /**
   * Log the completion of an operation with performance metrics
   */
  endOperation(
    operation: string, 
    startTime: number, 
    success: boolean = true, 
    context?: Record<string, any>,
    correlationId?: string
  ): void {
    const duration = Date.now() - startTime;
    const level: LogLevel = success ? 'info' : 'warn';
    
    this.log(level, `${success ? 'Completed' : 'Failed'} ${operation}`, {
      context: this.sanitizeContext(context),
      performance: { startTime, duration },
      correlationId
    });
  }

  /**
   * Log MCP tool invocation
   */
  toolInvoked(toolName: string, correlationId?: string, context?: Record<string, any>): void {
    this.info(`MCP tool invoked: ${toolName}`, {
      tool: toolName,
      ...this.sanitizeContext(context)
    }, correlationId);
  }

  /**
   * Log MCP tool completion
   */
  toolCompleted(toolName: string, success: boolean, duration?: number, correlationId?: string): void {
    const level: LogLevel = success ? 'info' : 'error';
    this.log(level, `MCP tool ${success ? 'completed' : 'failed'}: ${toolName}`, {
      tool: toolName,
      success,
      performance: duration ? { duration } : undefined,
      correlationId
    });
  }

  /**
   * Log security event
   */
  security(event: string, severity: 'low' | 'medium' | 'high' | 'critical', context?: Record<string, any>): void {
    const level: LogLevel = severity === 'critical' ? 'error' : 'warn';
    this.log(level, `Security event: ${event}`, {
      security: { event, severity },
      context: this.sanitizeContext(context)
    });
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, additionalData: Partial<LogEntry> = {}): void {
    // Check if we should log at this level
    if (this.levelPriority[level] > this.levelPriority[this.config.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: sanitizeLogMessage(message),
      ...additionalData
    };

    // Output to console if enabled
    if (this.config.enableConsole) {
      this.outputToConsole(entry);
    }

    // Output to file if enabled (in real implementation, use a proper file logger)
    if (this.config.enableFile) {
      this.outputToFile(entry);
    }
  }

  /**
   * Output log entry to console
   */
  private outputToConsole(entry: LogEntry): void {
    const colorMap = {
      error: '\x1b[31m', // Red
      warn: '\x1b[33m',  // Yellow
      info: '\x1b[32m',  // Green
      debug: '\x1b[36m'  // Cyan
    };
    const resetColor = '\x1b[0m';

    // Use console.error for MCP servers to avoid stdout conflicts
    // MCP protocol uses stdout for JSON-RPC, stderr for logs
    const logMethod = process.env.MCP_SERVER === 'true' || process.argv[0]?.includes('node')
      ? console.error
      : console.error;

    if (this.config.format === 'json') {
      logMethod(JSON.stringify(entry));
    } else {
      const color = colorMap[entry.level];
      const prefix = `[${entry.timestamp}] ${color}${entry.level.toUpperCase()}${resetColor}`;
      const correlationSuffix = entry.correlationId ? ` (${entry.correlationId})` : '';

      logMethod(`${prefix}: ${entry.message}${correlationSuffix}`);

      if (entry.context && Object.keys(entry.context).length > 0) {
        logMethod('  Context:', JSON.stringify(entry.context, null, 2));
      }

      if (entry.error) {
        logMethod('  Error:', entry.error.message);
        if (entry.error.stack) {
          logMethod('  Stack:', entry.error.stack);
        }
      }

      if (entry.performance?.duration) {
        logMethod(`  Duration: ${entry.performance.duration}ms`);
      }
    }
  }

  /**
   * Output log entry to file (placeholder - in production use proper file rotation)
   */
  private outputToFile(entry: LogEntry): void {
    // This is a placeholder - in production, use a proper file logging library
    // that handles rotation, buffering, and error handling
    try {
      const fs = require('fs');
      const logLine = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.config.filePath, logLine);
    } catch (error) {
      // Fallback to console if file logging fails (silently, don't use console.error which breaks MCP stdio)
      this.outputToConsole(entry);
    }
  }

  /**
   * Sanitize context data for safe logging
   */
  private sanitizeContext(context?: Record<string, any>): Record<string, any> | undefined {
    if (!context) return undefined;
    
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(context)) {
      // Sanitize sensitive keys
      if (['token', 'password', 'secret', 'key', 'auth'].some(sensitive => 
        key.toLowerCase().includes(sensitive))
      ) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        sanitized[key] = sanitizeLogMessage(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeContext(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  /**
   * Get current log configuration
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }

  /**
   * Update log configuration
   */
  updateConfig(newConfig: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

// Singleton logger instance
let loggerInstance: StructuredLogger | null = null;

/**
 * Get the global logger instance
 */
export function getLogger(): StructuredLogger {
  loggerInstance ??= new StructuredLogger();
  return loggerInstance;
}

/**
 * Initialize logger with custom configuration
 */
export function initializeLogger(config: Partial<LoggerConfig>): StructuredLogger {
  loggerInstance = new StructuredLogger(config);
  return loggerInstance;
}