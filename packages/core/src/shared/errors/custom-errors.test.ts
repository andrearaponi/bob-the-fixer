import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BaseError,
  ValidationError,
  AuthenticationError,
  SonarQubeError,
  FileSystemError,
  NetworkError,
  ConfigurationError,
  RateLimitError,
  ToolExecutionError,
  SecurityError,
  TimeoutError,
  wrapError,
  isRetryableError,
  withRetry,
  type RetryOptions,
} from './custom-errors';

describe('BaseError', () => {
  // Create concrete implementation for testing abstract class
  class TestError extends BaseError {
    constructor(message: string, options = {}) {
      super(message, 'TEST_ERROR', options);
    }
  }

  it('should create error with required properties', () => {
    const error = new TestError('Test message');

    expect(error.message).toBe('Test message');
    expect(error.errorCode).toBe('TEST_ERROR');
    expect(error.timestamp).toBeInstanceOf(Date);
    expect(error.retryable).toBe(false);
  });

  it('should include correlation ID when provided', () => {
    const error = new TestError('Test', { correlationId: 'abc-123' });

    expect(error.correlationId).toBe('abc-123');
  });

  it('should include context when provided', () => {
    const context = { userId: '123', action: 'test' };
    const error = new TestError('Test', { context });

    expect(error.context).toEqual(context);
  });

  it('should set retryable flag', () => {
    const error = new TestError('Test', { retryable: true });

    expect(error.retryable).toBe(true);
  });

  it('should include cause error', () => {
    const cause = new Error('Original error');
    const error = new TestError('Test', { cause });

    expect(error.cause).toBe(cause);
  });

  it('should serialize to JSON correctly', () => {
    const error = new TestError('Test message', {
      correlationId: 'abc-123',
      context: { key: 'value' },
      retryable: true,
    });

    const json = error.toJSON();

    expect(json).toMatchObject({
      name: 'TestError',
      message: 'Test message',
      errorCode: 'TEST_ERROR',
      correlationId: 'abc-123',
      context: { key: 'value' },
      retryable: true,
    });
    expect(json.timestamp).toBeTruthy();
    expect(json.stack).toBeTruthy();
  });

  it('should return user message', () => {
    const error = new TestError('Technical message');

    expect(error.getUserMessage()).toBe('Technical message');
  });

  it('should have proper stack trace', () => {
    const error = new TestError('Test');

    expect(error.stack).toBeTruthy();
    expect(error.stack).toContain('TestError');
  });
});

describe('ValidationError', () => {
  it('should create validation error with details', () => {
    const validationErrors = [
      { field: 'username', message: 'Required', value: '' },
      { field: 'age', message: 'Must be positive', value: -5 },
    ];

    const error = new ValidationError('Validation failed', validationErrors);

    expect(error.errorCode).toBe('VALIDATION_ERROR');
    expect(error.validationErrors).toEqual(validationErrors);
    expect(error.retryable).toBe(false);
  });

  it('should create validation error without details', () => {
    const error = new ValidationError('Validation failed');

    expect(error.validationErrors).toEqual([]);
  });

  it('should return sanitized user message', () => {
    const error = new ValidationError('Internal validation message');

    expect(error.getUserMessage()).toBe('Invalid input parameters provided');
  });

  it('should include correlation ID', () => {
    const error = new ValidationError('Test', [], { correlationId: 'xyz-789' });

    expect(error.correlationId).toBe('xyz-789');
  });
});

describe('AuthenticationError', () => {
  it('should create authentication error', () => {
    const error = new AuthenticationError('Invalid token');

    expect(error.errorCode).toBe('AUTH_ERROR');
    expect(error.message).toBe('Invalid token');
    expect(error.retryable).toBe(false);
  });

  it('should return user-friendly message', () => {
    const error = new AuthenticationError('Token expired');

    expect(error.getUserMessage()).toBe('Authentication failed. Please check your credentials');
  });
});

describe('SonarQubeError', () => {
  it('should create SonarQube error', () => {
    const error = new SonarQubeError('API failed');

    expect(error.errorCode).toBe('SONARQUBE_ERROR');
    expect(error.message).toBe('API failed');
  });

  it('should include HTTP status code', () => {
    const error = new SonarQubeError('Not found', { httpStatus: 404 });

    expect(error.httpStatus).toBe(404);
  });

  it('should include SonarQube error messages', () => {
    const sonarErrors = [{ msg: 'Invalid project key' }];
    const error = new SonarQubeError('API error', { sonarErrors });

    expect(error.sonarErrors).toEqual(sonarErrors);
  });

  it('should be retryable for 5xx errors', () => {
    const error500 = new SonarQubeError('Server error', { httpStatus: 500 });
    const error503 = new SonarQubeError('Unavailable', { httpStatus: 503 });

    expect(error500.retryable).toBe(true);
    expect(error503.retryable).toBe(true);
  });

  it('should not be retryable for 4xx errors', () => {
    const error400 = new SonarQubeError('Bad request', { httpStatus: 400 });
    const error403 = new SonarQubeError('Forbidden', { httpStatus: 403 });
    const error404 = new SonarQubeError('Not found', { httpStatus: 404 });

    expect(error400.retryable).toBe(false);
    expect(error403.retryable).toBe(false);
    expect(error404.retryable).toBe(false);
  });

  it('should return specific user messages by HTTP status', () => {
    const error403 = new SonarQubeError('Forbidden', { httpStatus: 403 });
    const error404 = new SonarQubeError('Not found', { httpStatus: 404 });
    const error500 = new SonarQubeError('Server error', { httpStatus: 500 });
    const errorGeneric = new SonarQubeError('Unknown error');

    expect(error403.getUserMessage()).toBe('Access denied. Please check your SonarQube permissions');
    expect(error404.getUserMessage()).toBe('SonarQube resource not found');
    expect(error500.getUserMessage()).toBe('SonarQube server error. Please try again later');
    expect(errorGeneric.getUserMessage()).toBe('SonarQube operation failed');
  });

  it('should allow explicit retryable override', () => {
    const error = new SonarQubeError('Error', { httpStatus: 400, retryable: true });

    expect(error.retryable).toBe(true);
  });
});

describe('FileSystemError', () => {
  it('should create filesystem error with operation', () => {
    const error = new FileSystemError('Cannot read file', 'read');

    expect(error.errorCode).toBe('FILESYSTEM_ERROR');
    expect(error.operation).toBe('read');
    expect(error.message).toBe('Cannot read file');
  });

  it('should include file path', () => {
    const error = new FileSystemError('Cannot write', 'write', {
      filePath: '/tmp/test.json',
    });

    expect(error.filePath).toBe('/tmp/test.json');
  });

  it('should be retryable for read/write operations', () => {
    const readError = new FileSystemError('Read failed', 'read');
    const writeError = new FileSystemError('Write failed', 'write');

    expect(readError.retryable).toBe(true);
    expect(writeError.retryable).toBe(true);
  });

  it('should not be retryable for other operations', () => {
    const deleteError = new FileSystemError('Delete failed', 'delete');
    const mkdirError = new FileSystemError('Mkdir failed', 'mkdir');

    expect(deleteError.retryable).toBe(false);
    expect(mkdirError.retryable).toBe(false);
  });

  it('should return user-friendly message', () => {
    const error = new FileSystemError('Failed', 'read');

    expect(error.getUserMessage()).toBe('File operation failed: read');
  });

  it('should include cause error', () => {
    const cause = new Error('ENOENT');
    const error = new FileSystemError('Failed', 'read', { cause });

    expect(error.cause).toBe(cause);
  });
});

describe('NetworkError', () => {
  it('should create network error', () => {
    const error = new NetworkError('Connection failed');

    expect(error.errorCode).toBe('NETWORK_ERROR');
    expect(error.message).toBe('Connection failed');
  });

  it('should include URL and method', () => {
    const error = new NetworkError('Failed', {
      url: 'http://api.example.com/data',
      method: 'GET',
    });

    expect(error.url).toBe('http://api.example.com/data');
    expect(error.method).toBe('GET');
  });

  it('should include status code', () => {
    const error = new NetworkError('Server error', { statusCode: 502 });

    expect(error.statusCode).toBe(502);
  });

  it('should be retryable for 5xx errors', () => {
    const error500 = new NetworkError('Error', { statusCode: 500 });
    const error503 = new NetworkError('Error', { statusCode: 503 });

    expect(error500.retryable).toBe(true);
    expect(error503.retryable).toBe(true);
  });

  it('should not be retryable for 4xx errors', () => {
    const error400 = new NetworkError('Error', { statusCode: 400 });
    const error404 = new NetworkError('Error', { statusCode: 404 });

    expect(error400.retryable).toBe(false);
    expect(error404.retryable).toBe(false);
  });

  it('should be retryable without status code', () => {
    const error = new NetworkError('Timeout');

    expect(error.retryable).toBe(true);
  });

  it('should return specific user message for 5xx', () => {
    const error500 = new NetworkError('Error', { statusCode: 500 });
    const errorGeneric = new NetworkError('Connection failed');

    expect(error500.getUserMessage()).toBe('Server temporarily unavailable. Please try again later');
    expect(errorGeneric.getUserMessage()).toBe('Network operation failed');
  });
});

describe('ConfigurationError', () => {
  it('should create configuration error', () => {
    const error = new ConfigurationError('Missing config');

    expect(error.errorCode).toBe('CONFIG_ERROR');
    expect(error.retryable).toBe(false);
  });

  it('should include config key', () => {
    const error = new ConfigurationError('Invalid value', { configKey: 'apiUrl' });

    expect(error.configKey).toBe('apiUrl');
  });

  it('should return user-friendly message', () => {
    const error = new ConfigurationError('Internal error');

    expect(error.getUserMessage()).toBe('Configuration error. Please check your settings');
  });
});

describe('RateLimitError', () => {
  it('should create rate limit error', () => {
    const error = new RateLimitError('Too many requests');

    expect(error.errorCode).toBe('RATE_LIMIT_ERROR');
    expect(error.retryable).toBe(true);
  });

  it('should include retry after duration', () => {
    const error = new RateLimitError('Rate limited', { retryAfter: 60 });

    expect(error.retryAfter).toBe(60);
  });

  it('should return user message with retry time', () => {
    const errorWithRetry = new RateLimitError('Limited', { retryAfter: 30 });
    const errorWithoutRetry = new RateLimitError('Limited');

    expect(errorWithRetry.getUserMessage()).toBe('Rate limit exceeded. Try again in 30 seconds.');
    expect(errorWithoutRetry.getUserMessage()).toBe('Rate limit exceeded.');
  });
});

describe('ToolExecutionError', () => {
  it('should create tool execution error', () => {
    const error = new ToolExecutionError('Failed', 'sonar_scan');

    expect(error.errorCode).toBe('TOOL_EXECUTION_ERROR');
    expect(error.toolName).toBe('sonar_scan');
    expect(error.message).toBe('Failed');
  });

  it('should include execution step', () => {
    const error = new ToolExecutionError('Failed', 'sonar_scan', {
      step: 'analysis',
    });

    expect(error.step).toBe('analysis');
  });

  it('should return user-friendly message with error details', () => {
    const error = new ToolExecutionError('Internal error', 'sonar_scan');

    expect(error.getUserMessage()).toBe("Tool 'sonar_scan' execution failed: Internal error");
  });

  it('should include step in message when provided', () => {
    const error = new ToolExecutionError('Internal error', 'sonar_scan', { step: 'analysis' });

    expect(error.getUserMessage()).toBe("Tool 'sonar_scan' execution failed at step 'analysis': Internal error");
  });

  it('should include cause error', () => {
    const cause = new Error('Underlying error');
    const error = new ToolExecutionError('Failed', 'test_tool', { cause });

    expect(error.cause).toBe(cause);
  });

  it('should respect custom retryable flag', () => {
    const retryable = new ToolExecutionError('Failed', 'tool', { retryable: true });
    const notRetryable = new ToolExecutionError('Failed', 'tool', { retryable: false });

    expect(retryable.retryable).toBe(true);
    expect(notRetryable.retryable).toBe(false);
  });
});

describe('SecurityError', () => {
  it('should create security error with violation type', () => {
    const error = new SecurityError('Path traversal detected', 'path_traversal');

    expect(error.errorCode).toBe('SECURITY_ERROR');
    expect(error.violationType).toBe('path_traversal');
    expect(error.retryable).toBe(false);
  });

  it('should accept all violation types', () => {
    const types: Array<SecurityError['violationType']> = [
      'path_traversal',
      'command_injection',
      'unauthorized_access',
      'invalid_token',
      'other',
    ];

    types.forEach((type) => {
      const error = new SecurityError('Violation', type);
      expect(error.violationType).toBe(type);
    });
  });

  it('should return generic user message', () => {
    const error = new SecurityError('Internal security issue', 'other');

    expect(error.getUserMessage()).toBe('Security policy violation detected');
  });
});

describe('TimeoutError', () => {
  it('should create timeout error', () => {
    const error = new TimeoutError('Operation timed out', 'scan', 30000);

    expect(error.errorCode).toBe('TIMEOUT_ERROR');
    expect(error.operation).toBe('scan');
    expect(error.timeoutMs).toBe(30000);
    expect(error.retryable).toBe(true);
  });

  it('should return user message with timeout duration', () => {
    const error = new TimeoutError('Timeout', 'analysis', 5000);

    expect(error.getUserMessage()).toBe('Operation timed out after 5000ms');
  });
});

describe('wrapError', () => {
  it('should return BaseError unchanged', () => {
    const original = new ValidationError('Test error');
    const wrapped = wrapError(original);

    expect(wrapped).toBe(original);
  });

  it('should wrap standard Error as ToolExecutionError', () => {
    const original = new Error('Standard error');
    const wrapped = wrapError(original, 'corr-123', 'my_tool');

    expect(wrapped).toBeInstanceOf(ToolExecutionError);
    expect((wrapped as ToolExecutionError).toolName).toBe('my_tool');
    expect(wrapped.correlationId).toBe('corr-123');
    expect(wrapped.cause).toBe(original);
  });

  it('should use "unknown" tool name if not provided', () => {
    const original = new Error('Error');
    const wrapped = wrapError(original) as ToolExecutionError;

    expect(wrapped.toolName).toBe('unknown');
  });

  it('should wrap non-Error values as string', () => {
    const wrapped1 = wrapError('String error') as ToolExecutionError;
    const wrapped2 = wrapError(42) as ToolExecutionError;
    const wrapped3 = wrapError(null) as ToolExecutionError;

    expect(wrapped1.message).toBe('String error');
    expect(wrapped2.message).toBe('42');
    expect(wrapped3.message).toBe('null');
  });
});

describe('isRetryableError', () => {
  it('should return retryable flag for BaseError instances', () => {
    const retryable = new NetworkError('Timeout');
    const notRetryable = new ValidationError('Invalid');

    expect(isRetryableError(retryable)).toBe(true);
    expect(isRetryableError(notRetryable)).toBe(false);
  });

  it('should detect retryable network errors by message', () => {
    expect(isRetryableError(new Error('Connection timeout'))).toBe(true);
    expect(isRetryableError(new Error('Network error occurred'))).toBe(true);
    expect(isRetryableError(new Error('Connection refused'))).toBe(true);
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
    expect(isRetryableError(new Error('ENOTFOUND'))).toBe(true);
  });

  it('should return false for non-retryable error messages', () => {
    expect(isRetryableError(new Error('Validation failed'))).toBe(false);
    expect(isRetryableError(new Error('Invalid input'))).toBe(false);
  });

  it('should return false for non-Error values', () => {
    expect(isRetryableError('error string')).toBe(false);
    expect(isRetryableError(42)).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return result on first success', async () => {
    const operation = vi.fn(async () => 'success');
    const options: RetryOptions = { maxAttempts: 3, delayMs: 100 };

    const promise = withRetry(operation, options);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable errors', async () => {
    let attempts = 0;
    const operation = vi.fn(async () => {
      attempts++;
      if (attempts < 3) {
        throw new NetworkError('Timeout');
      }
      return 'success';
    });

    const options: RetryOptions = { maxAttempts: 3, delayMs: 100 };

    const promise = withRetry(operation, options);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should not retry on non-retryable errors', async () => {
    const operation = vi.fn(async () => {
      throw new ValidationError('Invalid input');
    });

    const options: RetryOptions = { maxAttempts: 3, delayMs: 100 };

    await expect(withRetry(operation, options)).rejects.toThrow();
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should throw after max attempts', async () => {
    const operation = vi.fn(async () => {
      throw new NetworkError('Always fails');
    });

    const options: RetryOptions = { maxAttempts: 3, delayMs: 10 };

    const promise = withRetry(operation, options);
    const expectation = expect(promise).rejects.toThrow();
    await vi.runAllTimersAsync();

    await expectation;
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should apply exponential backoff', async () => {
    const delays: number[] = [];
    const operation = vi.fn(async () => {
      throw new NetworkError('Retry');
    });

    const options: RetryOptions = {
      maxAttempts: 4,
      delayMs: 100,
      backoffMultiplier: 2,
    };

    const promise = withRetry(operation, options);
    const expectation = expect(promise).rejects.toThrow();

    // Capture delays between attempts
    const timers = vi.getTimerCount();
    for (let i = 0; i < timers; i++) {
      const nextTimer = vi.getTimerCount();
      if (nextTimer > 0) {
        await vi.advanceTimersByTimeAsync(100);
      }
    }

    await vi.runAllTimersAsync();
    await expectation;

    // Should have retried with exponential backoff
    expect(operation).toHaveBeenCalledTimes(4);
  });

  it('should respect max delay', async () => {
    let attempts = 0;
    const operation = vi.fn(async () => {
      attempts++;
      throw new NetworkError('Retry');
    });

    const options: RetryOptions = {
      maxAttempts: 5,
      delayMs: 100,
      backoffMultiplier: 10,
      maxDelayMs: 500,
    };

    const promise = withRetry(operation, options);
    const expectation = expect(promise).rejects.toThrow();
    await vi.runAllTimersAsync();

    await expectation;
    expect(operation).toHaveBeenCalledTimes(5);
  });

  it('should include correlation ID in wrapped errors', async () => {
    const operation = vi.fn(async () => {
      throw new Error('Standard error');
    });

    const options: RetryOptions = { maxAttempts: 1, delayMs: 100 };

    try {
      await withRetry(operation, options, 'test-corr-id');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolExecutionError);
      expect((error as ToolExecutionError).correlationId).toBe('test-corr-id');
    }
  });

  it('should not wait after last attempt', async () => {
    const operation = vi.fn(async () => {
      throw new NetworkError('Always fails');
    });

    const options: RetryOptions = { maxAttempts: 2, delayMs: 1000 };

    const startTime = Date.now();
    const promise = withRetry(operation, options);
    const expectation = expect(promise).rejects.toThrow();
    await vi.runAllTimersAsync();

    await expectation;

    // Should only wait once (between attempt 1 and 2), not after attempt 2
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
