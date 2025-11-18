/**
 * Base class for all custom errors in the MCP server
 * Provides structured error information and correlation ID support
 */
export abstract class BaseError extends Error {
  public readonly timestamp: Date;
  public readonly errorCode: string;
  public readonly correlationId?: string;
  public readonly context?: Record<string, any>;
  public readonly retryable: boolean;
  
  constructor(
    message: string,
    errorCode: string,
    options: {
      correlationId?: string;
      context?: Record<string, any>;
      retryable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    this.errorCode = errorCode;
    this.correlationId = options.correlationId;
    this.context = options.context;
    this.retryable = options.retryable ?? false;
    
    if (options.cause) {
      this.cause = options.cause;
    }

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for logging/serialization
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      errorCode: this.errorCode,
      timestamp: this.timestamp.toISOString(),
      correlationId: this.correlationId,
      context: this.context,
      retryable: this.retryable,
      stack: this.stack
    };
  }

  /**
   * Get user-friendly error message (sanitized for external consumption)
   */
  getUserMessage(): string {
    return this.message;
  }
}

/**
 * Validation errors - input doesn't meet requirements
 */
export class ValidationError extends BaseError {
  public readonly validationErrors: Array<{
    field: string;
    message: string;
    value?: any;
  }>;

  constructor(
    message: string,
    validationErrors: Array<{ field: string; message: string; value?: any }> = [],
    options: {
      correlationId?: string;
      context?: Record<string, any>;
    } = {}
  ) {
    super(message, 'VALIDATION_ERROR', { ...options, retryable: false });
    this.validationErrors = validationErrors;
  }

  getUserMessage(): string {
    return 'Invalid input parameters provided';
  }
}

/**
 * Authentication/authorization errors
 */
export class AuthenticationError extends BaseError {
  constructor(
    message: string,
    options: {
      correlationId?: string;
      context?: Record<string, any>;
    } = {}
  ) {
    super(message, 'AUTH_ERROR', { ...options, retryable: false });
  }

  getUserMessage(): string {
    return 'Authentication failed. Please check your credentials';
  }
}

/**
 * SonarQube API errors
 */
export class SonarQubeError extends BaseError {
  public readonly httpStatus?: number;
  public readonly sonarErrors?: Array<{ msg: string; }>;

  constructor(
    message: string,
    options: {
      httpStatus?: number;
      sonarErrors?: Array<{ msg: string; }>;
      correlationId?: string;
      context?: Record<string, any>;
      retryable?: boolean;
    } = {}
  ) {
    super(message, 'SONARQUBE_ERROR', {
      ...options,
      retryable: options.retryable ?? (options.httpStatus ? options.httpStatus >= 500 : false)
    });
    this.httpStatus = options.httpStatus;
    this.sonarErrors = options.sonarErrors;
  }

  getUserMessage(): string {
    if (this.httpStatus === 403) {
      return 'Access denied. Please check your SonarQube permissions';
    }
    if (this.httpStatus === 404) {
      return 'SonarQube resource not found';
    }
    if (this.httpStatus && this.httpStatus >= 500) {
      return 'SonarQube server error. Please try again later';
    }
    return 'SonarQube operation failed';
  }
}

/**
 * File system operation errors
 */
export class FileSystemError extends BaseError {
  public readonly operation: string;
  public readonly filePath?: string;

  constructor(
    message: string,
    operation: string,
    options: {
      filePath?: string;
      correlationId?: string;
      context?: Record<string, any>;
      cause?: Error;
    } = {}
  ) {
    super(message, 'FILESYSTEM_ERROR', {
      ...options,
      retryable: operation === 'read' || operation === 'write'
    });
    this.operation = operation;
    this.filePath = options.filePath;
  }

  getUserMessage(): string {
    return `File operation failed: ${this.operation}`;
  }
}

/**
 * Network/connectivity errors
 */
export class NetworkError extends BaseError {
  public readonly url?: string;
  public readonly method?: string;
  public readonly statusCode?: number;

  constructor(
    message: string,
    options: {
      url?: string;
      method?: string;
      statusCode?: number;
      correlationId?: string;
      context?: Record<string, any>;
      cause?: Error;
    } = {}
  ) {
    super(message, 'NETWORK_ERROR', {
      ...options,
      retryable: !options.statusCode || (options.statusCode >= 500 && options.statusCode < 600)
    });
    this.url = options.url;
    this.method = options.method;
    this.statusCode = options.statusCode;
  }

  getUserMessage(): string {
    if (this.statusCode && this.statusCode >= 500) {
      return 'Server temporarily unavailable. Please try again later';
    }
    return 'Network operation failed';
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends BaseError {
  public readonly configKey?: string;

  constructor(
    message: string,
    options: {
      configKey?: string;
      correlationId?: string;
      context?: Record<string, any>;
    } = {}
  ) {
    super(message, 'CONFIG_ERROR', { ...options, retryable: false });
    this.configKey = options.configKey;
  }

  getUserMessage(): string {
    return 'Configuration error. Please check your settings';
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends BaseError {
  public readonly retryAfter?: number;

  constructor(
    message: string,
    options: {
      retryAfter?: number;
      correlationId?: string;
      context?: Record<string, any>;
    } = {}
  ) {
    super(message, 'RATE_LIMIT_ERROR', { ...options, retryable: true });
    this.retryAfter = options.retryAfter;
  }

  getUserMessage(): string {
    const retryMessage = this.retryAfter ? ` Try again in ${this.retryAfter} seconds.` : '';
    return `Rate limit exceeded.${retryMessage}`;
  }
}

/**
 * Tool execution errors
 */
export class ToolExecutionError extends BaseError {
  public readonly toolName: string;
  public readonly step?: string;

  constructor(
    message: string,
    toolName: string,
    options: {
      step?: string;
      correlationId?: string;
      context?: Record<string, any>;
      cause?: Error;
      retryable?: boolean;
    } = {}
  ) {
    super(message, 'TOOL_EXECUTION_ERROR', options);
    this.toolName = toolName;
    this.step = options.step;
  }

  getUserMessage(): string {
    // Include the actual error message to help the user understand what went wrong
    if (this.step) {
      return `Tool '${this.toolName}' execution failed at step '${this.step}': ${this.message}`;
    }
    return `Tool '${this.toolName}' execution failed: ${this.message}`;
  }
}

/**
 * Security violation errors
 */
export class SecurityError extends BaseError {
  public readonly violationType: 'path_traversal' | 'command_injection' | 'unauthorized_access' | 'invalid_token' | 'other';

  constructor(
    message: string,
    violationType: SecurityError['violationType'],
    options: {
      correlationId?: string;
      context?: Record<string, any>;
    } = {}
  ) {
    super(message, 'SECURITY_ERROR', { ...options, retryable: false });
    this.violationType = violationType;
  }

  getUserMessage(): string {
    return 'Security policy violation detected';
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends BaseError {
  public readonly operation: string;
  public readonly timeoutMs: number;

  constructor(
    message: string,
    operation: string,
    timeoutMs: number,
    options: {
      correlationId?: string;
      context?: Record<string, any>;
    } = {}
  ) {
    super(message, 'TIMEOUT_ERROR', { ...options, retryable: true });
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }

  getUserMessage(): string {
    return `Operation timed out after ${this.timeoutMs}ms`;
  }
}

/**
 * Helper function to wrap unknown errors
 */
export function wrapError(error: unknown, correlationId?: string, toolName?: string): BaseError {
  if (error instanceof BaseError) {
    return error;
  }

  if (error instanceof Error) {
    return new ToolExecutionError(
      error.message,
      toolName ?? 'unknown',
      { cause: error, correlationId, retryable: false }
    );
  }

  return new ToolExecutionError(
    String(error),
    toolName ?? 'unknown',
    { correlationId, retryable: false }
  );
}

/**
 * Helper function to determine if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof BaseError) {
    return error.retryable;
  }
  
  // For non-custom errors, assume network/server errors might be retryable
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('timeout') || 
           message.includes('network') || 
           message.includes('connection') ||
           message.includes('econnreset') ||
           message.includes('enotfound');
  }
  
  return false;
}

/**
 * Error recovery strategies
 */
export interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
  correlationId?: string
): Promise<T> {
  const { maxAttempts, delayMs, backoffMultiplier = 2, maxDelayMs = 30000 } = options;
  let lastError: unknown;
  let currentDelay = delayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Don't retry if error is not retryable
      if (!isRetryableError(error)) {
        throw wrapError(error, correlationId);
      }
      
      // Don't retry on last attempt
      if (attempt === maxAttempts) {
        break;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, currentDelay));
      currentDelay = Math.min(currentDelay * backoffMultiplier, maxDelayMs);
    }
  }

  throw wrapError(lastError, correlationId);
}