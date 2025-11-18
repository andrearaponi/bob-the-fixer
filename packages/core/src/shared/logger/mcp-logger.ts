import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { sanitizeLogMessage } from '../../infrastructure/security/input-sanitization.js';
import { randomBytes } from 'crypto';

export type MCPLogLevel = 'emergency' | 'alert' | 'critical' | 'error' | 'warning' | 'notice' | 'info' | 'debug';

export interface MCPLogMessage {
  [key: string]: unknown;
  level: MCPLogLevel;
  logger: string;
  data?: Record<string, any>;
}

export interface MCPLoggerConfig {
  level: MCPLogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  filePath?: string;
  maxFileSize?: number;
  maxFiles?: number;
  format?: 'json' | 'text';
}

/**
 * MCP-compliant logger following RFC 5424 syslog severity levels
 * Sends log messages to MCP client via logging notifications
 */
export class MCPLogger {
  private config: MCPLoggerConfig;
  private server: Server | null = null;
  private correlationCounter = 0;
  private currentLevel: MCPLogLevel = 'info';
  
  private readonly levelPriority: Record<MCPLogLevel, number> = {
    emergency: 0,
    alert: 1,
    critical: 2,
    error: 3,
    warning: 4,
    notice: 5,
    info: 6,
    debug: 7
  };

  constructor(config: Partial<MCPLoggerConfig> = {}) {
    this.config = {
      level: (process.env.LOG_LEVEL as MCPLogLevel) ?? 'info',
      enableConsole: process.env.NODE_ENV !== 'test',
      enableFile: process.env.NODE_ENV === 'production',
      filePath: process.env.LOG_FILE_PATH ?? './logs/mcp-server.log',
      maxFileSize: parseInt(process.env.LOG_MAX_FILE_SIZE ?? '10485760'), // 10MB
      maxFiles: parseInt(process.env.LOG_MAX_FILES ?? '5'),
      format: (process.env.LOG_FORMAT as 'json' | 'text') ?? 'json',
      ...config
    };
    this.currentLevel = this.config.level;
  }

  /**
   * Set the MCP server instance for sending logging notifications
   */
  setServer(server: Server): void {
    this.server = server;
  }

  /**
   * Set the minimum log level
   */
  setLevel(level: MCPLogLevel): void {
    this.currentLevel = level;
    this.config.level = level;
  }

  /**
   * Get current log level
   */
  getLevel(): MCPLogLevel {
    return this.currentLevel;
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
   * Emergency: System is unusable
   */
  emergency(logger: string, message: string, data?: Record<string, any>): void {
    void this.log('emergency', logger, message, data);
  }

  /**
   * Alert: Immediate action required
   */
  alert(logger: string, message: string, data?: Record<string, any>): void {
    void this.log('alert', logger, message, data);
  }

  /**
   * Critical: System component failures
   */
  critical(logger: string, message: string, data?: Record<string, any>): void {
    void this.log('critical', logger, message, data);
  }

  /**
   * Error: Operation failures
   */
  error(logger: string, message: string, error?: Error, data?: Record<string, any>): void {
    const errorData = error ? {
      error: {
        name: error.name,
        message: sanitizeLogMessage(error.message),
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      ...data
    } : data;

    void this.log('error', logger, message, errorData);
  }

  /**
   * Warning: Deprecated feature usage
   */
  warning(logger: string, message: string, data?: Record<string, any>): void {
    void this.log('warning', logger, message, data);
  }

  /**
   * Notice: Normal significant events
   */
  notice(logger: string, message: string, data?: Record<string, any>): void {
    void this.log('notice', logger, message, data);
  }

  /**
   * Info: Operation progress updates
   */
  info(logger: string, message: string, data?: Record<string, any>): void {
    void this.log('info', logger, message, data);
  }

  /**
   * Debug: Detailed debugging information
   */
  debug(logger: string, message: string, data?: Record<string, any>): void {
    void this.log('debug', logger, message, data);
  }

  /**
   * Log MCP tool invocation
   */
  toolInvoked(toolName: string, correlationId?: string, context?: Record<string, any>): void {
    this.info('mcp-tools', `Tool invoked: ${toolName}`, {
      tool: toolName,
      correlationId,
      ...this.sanitizeContext(context)
    });
  }

  /**
   * Log MCP tool completion
   */
  toolCompleted(toolName: string, success: boolean, duration?: number, correlationId?: string): void {
    const level: MCPLogLevel = success ? 'info' : 'error';
    void this.log(level, 'mcp-tools', `Tool ${success ? 'completed' : 'failed'}: ${toolName}`, {
      tool: toolName,
      success,
      duration,
      correlationId
    });
  }

  /**
   * Log security event
   */
  security(event: string, severity: 'low' | 'medium' | 'high' | 'critical', context?: Record<string, any>): void {
    const level: MCPLogLevel = severity === 'critical' ? 'critical' : 'warning';
    void this.log(level, 'security', `Security event: ${event}`, {
      security: { event, severity },
      ...this.sanitizeContext(context)
    });
  }

  /**
   * Core logging method
   */
  private async log(level: MCPLogLevel, logger: string, message: string, data?: Record<string, any>): Promise<void> {
    // Check if we should log at this level
    if (this.levelPriority[level] > this.levelPriority[this.currentLevel]) {
      return;
    }

    const logMessage: MCPLogMessage = {
      level,
      logger,
      data: data ? {
        message: sanitizeLogMessage(message),
        timestamp: new Date().toISOString(),
        ...this.sanitizeContext(data)
      } : {
        message: sanitizeLogMessage(message),
        timestamp: new Date().toISOString()
      }
    };

    // Send to MCP client if server is available
    if (this.server) {
      try {
        await this.server.sendLoggingMessage(logMessage);
      } catch (error) {
        // Fallback to console if MCP logging fails (silently, don't use console.error which breaks MCP stdio)
        this.outputToConsole(logMessage);
      }
    } else {
      // Fallback to console if no server
      this.outputToConsole(logMessage);
    }

    // Also output to console/file if enabled
    if (this.config.enableConsole) {
      this.outputToConsole(logMessage);
    }

    if (this.config.enableFile) {
      this.outputToFile(logMessage);
    }
  }

  /**
   * Output log message to console
   */
  private outputToConsole(logMessage: MCPLogMessage): void {
    const colorMap = {
      emergency: '\x1b[91m', // Bright Red
      alert: '\x1b[91m',     // Bright Red
      critical: '\x1b[31m',  // Red
      error: '\x1b[31m',     // Red
      warning: '\x1b[33m',   // Yellow
      notice: '\x1b[32m',    // Green
      info: '\x1b[32m',      // Green
      debug: '\x1b[36m'      // Cyan
    };
    const resetColor = '\x1b[0m';

    // Use console.error for MCP servers to avoid stdout conflicts
    // MCP protocol uses stdout for JSON-RPC, stderr for logs
    const logMethod = console.error;  // Always use stderr for MCP servers

    if (this.config.format === 'json') {
      logMethod(JSON.stringify(logMessage));
    } else {
      const color = colorMap[logMessage.level];
      const prefix = `[${logMessage.data?.timestamp}] ${color}${logMessage.level.toUpperCase()}${resetColor}`;
      const loggerName = `[${logMessage.logger}]`;

      logMethod(`${prefix} ${loggerName}: ${logMessage.data?.message}`);

      if (logMessage.data && Object.keys(logMessage.data).length > 2) { // More than message + timestamp
        const contextData = { ...logMessage.data };
        delete contextData.message;
        delete contextData.timestamp;
        logMethod('  Data:', JSON.stringify(contextData, null, 2));
      }
    }
  }

  /**
   * Output log message to file
   */
  private outputToFile(logMessage: MCPLogMessage): void {
    try {
      const fs = require('fs');
      const logLine = JSON.stringify(logMessage) + '\n';
      fs.appendFileSync(this.config.filePath, logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error);
      this.outputToConsole(logMessage);
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
  getConfig(): MCPLoggerConfig {
    return { ...this.config };
  }

  /**
   * Update log configuration
   */
  updateConfig(newConfig: Partial<MCPLoggerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.level) {
      this.currentLevel = newConfig.level;
    }
  }
}

// Singleton MCP logger instance
let mcpLoggerInstance: MCPLogger | null = null;

/**
 * Get the global MCP logger instance
 */
export function getMCPLogger(): MCPLogger {
  mcpLoggerInstance ??= new MCPLogger();
  return mcpLoggerInstance;
}

/**
 * Initialize MCP logger with custom configuration
 */
export function initializeMCPLogger(config: Partial<MCPLoggerConfig>): MCPLogger {
  mcpLoggerInstance = new MCPLogger(config);
  return mcpLoggerInstance;
}