import * as path from 'path';
import { ValidationError } from '../../shared/validators/mcp-schemas.js';
import { randomBytes } from 'crypto';

/**
 * Sanitizes and validates file paths to prevent path traversal attacks
 */
export function sanitizePath(inputPath: string): string {
  if (typeof inputPath !== 'string') {
    throw new ValidationError('Path must be a string', []);
  }

  // Remove null bytes
  const cleanPath = inputPath.replace(/\0/g, '');
  
  // Normalize path to resolve .. and . components
  const normalizedPath = path.normalize(cleanPath);
  
  // Check for path traversal attempts
  if (normalizedPath.includes('..')) {
    throw new ValidationError('Path traversal detected', []);
  }
  
  // Ensure path doesn't start with / (absolute paths could be dangerous)
  if (normalizedPath.startsWith('/') && process.env.NODE_ENV === 'production') {
    throw new ValidationError('Absolute paths not allowed in production', []);
  }
  
  return normalizedPath;
}

/**
 * Sanitizes command line arguments for shell execution
 */
export function sanitizeCommandArgs(args: string[]): string[] {
  return args.map(arg => {
    if (typeof arg !== 'string') {
      throw new ValidationError('Command arguments must be strings', []);
    }
    
    // Remove null bytes and control characters
    const cleaned = arg.replace(/[\0\r\n]/g, '');
    
    // Check for command injection patterns
    const dangerousPatterns = [
      /[;&|`$(){}]/,  // Shell metacharacters
      /\$\(/,         // Command substitution
      /`/,            // Backtick substitution
      />/,            // Redirection
      /</, 
      /\|/,           // Pipes
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(cleaned)) {
        throw new ValidationError(`Dangerous characters in command argument: ${cleaned}`, []);
      }
    }
    
    return cleaned;
  });
}

/**
 * Safely quotes a string for shell execution
 */
export function shellQuote(str: string): string {
  // For security, we'll use single quotes which prevent all expansions
  return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Validates and sanitizes SonarQube project keys
 */
export function sanitizeProjectKey(projectKey: string): string {
  if (typeof projectKey !== 'string') {
    throw new ValidationError('Project key must be a string', []);
  }
  
  const cleaned = projectKey.trim();
  
  // SonarQube project key format: only alphanumeric, dots, hyphens, underscores, colons
  if (!/^[a-zA-Z0-9._:-]+$/.test(cleaned)) {
    throw new ValidationError('Invalid characters in project key', []);
  }
  
  if (cleaned.length === 0) {
    throw new ValidationError('Project key cannot be empty', []);
  }
  
  if (cleaned.length > 400) {
    throw new ValidationError('Project key too long', []);
  }
  
  return cleaned;
}

/**
 * Sanitizes URLs to prevent SSRF attacks
 */
export function sanitizeUrl(url: string): string {
  if (typeof url !== 'string') {
    throw new ValidationError('URL must be a string', []);
  }
  
  try {
    const urlObj = new URL(url);
    
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw new ValidationError('Only HTTP and HTTPS protocols allowed', []);
    }
    
    // Block private IP ranges in production
    if (process.env.NODE_ENV === 'production') {
      const hostname = urlObj.hostname;
      
      // Block localhost
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        throw new ValidationError('Localhost URLs not allowed in production', []);
      }
      
      // Block private IP ranges (RFC 1918)
      const ipPatterns = [
        /^10\./,                    // 10.0.0.0/8
        /^192\.168\./,              // 192.168.0.0/16
        /^172\.(1\d|2\d|3[01])\./, // 172.16.0.0/12
        /^169\.254\./,              // Link-local
        /^::1$|^127\./,             // IPv6 localhost
      ];
      
      for (const pattern of ipPatterns) {
        if (pattern.test(hostname)) {
          throw new ValidationError('Private IP addresses not allowed in production', []);
        }
      }
    }
    
    return urlObj.toString();
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError('Invalid URL format', []);
  }
}

/**
 * Masks sensitive tokens for logging
 */
export function maskToken(token: string): string {
  if (typeof token !== 'string' || token.length < 8) {
    return '[INVALID_TOKEN]';
  }
  
  const prefix = token.substring(0, 4);
  const suffix = token.substring(token.length - 4);
  const masked = '*'.repeat(Math.max(0, token.length - 8));
  
  return `${prefix}${masked}${suffix}`;
}

/**
 * Sanitizes log messages to prevent log injection
 */
export function sanitizeLogMessage(message: string): string {
  if (typeof message !== 'string') {
    return '[NON_STRING_MESSAGE]';
  }
  
  // Remove control characters that could cause log injection
  return message.replace(/[\r\n\t\0]/g, ' ').trim();
}

/**
 * Rate limiting helper - simple in-memory implementation
 */
export class RateLimiter {
  private readonly requests = new Map<string, number[]>();

  constructor(
    private readonly maxRequests: number = 60,
    private readonly windowMs: number = 60000 // 1 minute
  ) {}
  
  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Get existing requests for this identifier
    const requests = this.requests.get(identifier) || [];
    
    // Filter out expired requests
    const validRequests = requests.filter(time => time > windowStart);
    
    // Check if under limit
    if (validRequests.length >= this.maxRequests) {
      return false;
    }
    
    // Add current request
    validRequests.push(now);
    this.requests.set(identifier, validRequests);

    // Cleanup old entries periodically using cryptographically secure random
    // Check if random byte is < 2.56 (roughly 1% of 256)
    if (randomBytes(1)[0] < 2.56) {
      this.cleanup();
    }
    
    return true;
  }
  
  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    for (const [identifier, requests] of this.requests.entries()) {
      const validRequests = requests.filter(time => time > windowStart);
      if (validRequests.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, validRequests);
      }
    }
  }
}