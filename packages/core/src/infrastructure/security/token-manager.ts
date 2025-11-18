import * as crypto from 'crypto';
import { ValidationError } from '../../shared/validators/mcp-schemas.js';
import { maskToken } from './input-sanitization.js';

export interface TokenInfo {
  token: string;
  type: 'USER_TOKEN' | 'PROJECT_ANALYSIS_TOKEN';
  createdAt: Date;
  expiresAt?: Date;
  projectKey?: string;
}

export interface SecureTokenInfo {
  maskedToken: string;
  type: string;
  createdAt: Date;
  expiresAt?: Date;
  projectKey?: string;
}

/**
 * Secure token management with encryption and proper validation
 */
export class TokenManager {
  private readonly encryptionKey: Buffer;
  private readonly algorithm = 'aes-256-cbc';
  
  constructor(encryptionKey?: string) {
    // Use provided key or generate from environment/random
    if (encryptionKey) {
      this.encryptionKey = Buffer.from(encryptionKey, 'hex');
    } else {
      // In production, this should come from secure key management
      const envKey = process.env.TOKEN_ENCRYPTION_KEY;
      if (envKey) {
        this.encryptionKey = Buffer.from(envKey, 'hex');
      } else {
        // Generate random key (not recommended for production)
        this.encryptionKey = crypto.randomBytes(32);
        if (process.env.NODE_ENV === 'production') {
          throw new ValidationError('TOKEN_ENCRYPTION_KEY required in production', []);
        }
      }
    }
    
    if (this.encryptionKey.length !== 32) {
      throw new ValidationError('Token encryption key must be 32 bytes', []);
    }
  }
  
  /**
   * Validates token format and security requirements
   */
  validateToken(token: string): void {
    if (typeof token !== 'string') {
      throw new ValidationError('Token must be a string', []);
    }
    
    if (token.length < 20) {
      throw new ValidationError('Token too short (minimum 20 characters)', []);
    }
    
    if (token.length > 200) {
      throw new ValidationError('Token too long (maximum 200 characters)', []);
    }
    
    // Check for valid characters (SonarQube tokens are alphanumeric + some special chars)
    if (!/^[a-zA-Z0-9_-]+$/.test(token)) {
      throw new ValidationError('Token contains invalid characters', []);
    }
    
    // Basic entropy check (not cryptographically sound but catches obvious issues)
    const uniqueChars = new Set(token).size;
    if (uniqueChars < 10) {
      throw new ValidationError('Token appears to have low entropy', []);
    }
  }
  
  /**
   * Encrypts a token for secure storage
   */
  encryptToken(token: string): string {
    this.validateToken(token);

    const iv = crypto.randomBytes(16); // 128-bit IV for CBC
    // Create a 32-byte key from the encryption key using SHA-256
    const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Combine IV and encrypted data
    return iv.toString('hex') + ':' + encrypted;
  }
  
  /**
   * Decrypts a token from secure storage
   */
  decryptToken(encryptedToken: string): string {
    const parts = encryptedToken.split(':');
    if (parts.length !== 2) {
      throw new ValidationError('Invalid encrypted token format', []);
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    // Create a 32-byte key from the encryption key using SHA-256
    const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
  
  /**
   * Creates a secure token info object for logging/display
   */
  createSecureTokenInfo(tokenInfo: TokenInfo): SecureTokenInfo {
    return {
      maskedToken: maskToken(tokenInfo.token),
      type: tokenInfo.type,
      createdAt: tokenInfo.createdAt,
      expiresAt: tokenInfo.expiresAt,
      projectKey: tokenInfo.projectKey
    };
  }
  
  /**
   * Checks if a token is expired
   */
  isTokenExpired(tokenInfo: TokenInfo): boolean {
    if (!tokenInfo.expiresAt) {
      return false; // No expiry set
    }
    
    return new Date() > tokenInfo.expiresAt;
  }
  
  /**
   * Validates token against SonarQube server (mock implementation)
   * In production, this would make an actual API call
   */
  async validateTokenWithServer(token: string, sonarUrl: string): Promise<boolean> {
    try {
      this.validateToken(token);
      
      // This is a placeholder - in real implementation, would call:
      // GET {sonarUrl}/api/authentication/validate
      
      // For now, just validate format
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Securely wipes a token from memory
   */
  wipeToken(tokenInfo: TokenInfo): void {
    // Overwrite token in memory (JavaScript limitation - not cryptographically secure)
    if (tokenInfo.token) {
      const tokenLength = tokenInfo.token.length;
      (tokenInfo as any).token = crypto.randomBytes(tokenLength).toString('hex').substring(0, tokenLength);
    }
  }
  
  /**
   * Generates a secure random token (for testing/demo purposes)
   */
  generateSecureToken(length: number = 40): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    const bytes = crypto.randomBytes(length);
    
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i] % chars.length];
    }
    
    return result;
  }
}

// Singleton instance for application use
let tokenManager: TokenManager | null = null;

export function getTokenManager(): TokenManager {
  tokenManager ??= new TokenManager();
  return tokenManager;
}