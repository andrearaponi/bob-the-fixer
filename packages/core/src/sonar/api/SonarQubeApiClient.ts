/**
 * SonarQube API Client
 *
 * Low-level HTTP client for SonarQube API calls.
 * Handles authentication, error responses, and pagination.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { sanitizeUrl, maskToken } from '../../infrastructure/security/input-sanitization.js';

export interface SonarQubeApiConfig {
  /** SonarQube server URL */
  baseUrl: string;
  /** Authentication token */
  token: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
}

export interface PaginationParams {
  /** Page number (1-indexed) */
  p?: number;
  /** Page size (max 500) */
  ps?: number;
}

export interface ApiErrorInfo {
  status: number;
  message: string;
  errors?: Array<{ msg: string }>;
}

/**
 * SonarQubeApiClient - Low-level HTTP client for SonarQube API
 *
 * Features:
 * - Authentication via Bearer token
 * - 401 error handling with recovery suggestions
 * - Request timeout handling
 * - Pagination support
 */
export class SonarQubeApiClient {
  private readonly client: AxiosInstance;
  private readonly token: string;

  constructor(config: SonarQubeApiConfig) {
    const sanitizedUrl = sanitizeUrl(config.baseUrl);
    this.token = config.token;

    this.client = axios.create({
      baseURL: sanitizedUrl,
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      timeout: config.timeout ?? 30000,
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => this.handleApiError(error)
    );
  }

  /**
   * Get the base URL
   */
  get baseUrl(): string {
    return this.client.defaults.baseURL ?? '';
  }

  /**
   * Get the raw axios instance for advanced use cases
   */
  get axiosInstance(): AxiosInstance {
    return this.client;
  }

  /**
   * Make a GET request
   */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const response = await this.client.get<T>(path, { params });
    return response.data;
  }

  /**
   * Make a POST request
   */
  async post<T>(path: string, data?: unknown, params?: Record<string, unknown>): Promise<T> {
    const response = await this.client.post<T>(path, data, { params });
    return response.data;
  }

  /**
   * Make a GET request with pagination
   * Returns all items across all pages
   */
  async getPaginated<T>(
    path: string,
    params: Record<string, unknown>,
    options: {
      itemsKey: string;
      pageSize?: number;
      maxPages?: number;
    }
  ): Promise<T[]> {
    const pageSize = Math.min(options.pageSize ?? 500, 500);
    const maxPages = options.maxPages ?? 100;
    const allItems: T[] = [];

    // First request to get total
    const firstResponse = await this.client.get(path, {
      params: { ...params, p: 1, ps: pageSize },
    });

    const total = firstResponse.data.total ?? firstResponse.data.paging?.total ?? 0;
    const firstItems = firstResponse.data[options.itemsKey] ?? [];
    allItems.push(...firstItems);

    // Calculate remaining pages
    const totalPages = Math.min(Math.ceil(total / pageSize), maxPages);

    if (totalPages > 1) {
      // Fetch remaining pages in parallel
      const pagePromises = Array.from({ length: totalPages - 1 }, (_, i) =>
        this.client
          .get(path, {
            params: { ...params, p: i + 2, ps: pageSize },
          })
          .then((response) => response.data[options.itemsKey] ?? [])
      );

      const pageResults = await Promise.all(pagePromises);
      pageResults.forEach((items) => allItems.push(...items));
    }

    return allItems;
  }

  /**
   * Get the masked token for logging
   */
  getMaskedToken(): string {
    return maskToken(this.token);
  }

  /**
   * Handle API errors with helpful messages
   */
  private handleApiError(error: AxiosError): Promise<never> {
    if (error.response?.status === 401) {
      const tokenInfo = this.token
        ? `Token present (${this.token.substring(0, 10)}...)`
        : 'NO TOKEN';
      const envToken = process.env.SONAR_TOKEN;
      const envInfo = envToken
        ? `Env token: ${envToken.substring(0, 10)}...`
        : 'NO ENV TOKEN';

      console.error('[SonarQubeApiClient] 401 Unauthorized - Authentication failed');
      console.error('[SonarQubeApiClient] Token status:', tokenInfo);
      console.error('[SonarQubeApiClient] Environment:', envInfo);
      console.error('[SonarQubeApiClient] This usually happens when:');
      console.error('  1. MCP server was restarted and lost environment variables');
      console.error('  2. Token expired or was revoked in SonarQube');
      console.error('  3. Using wrong token from local file instead of environment');
      console.error(
        '[SonarQubeApiClient] Solution: Restart MCP server with: claude mcp remove bob-the-fixer && ./setup-token.sh'
      );

      error.message = `SonarQube authentication failed (401). ${tokenInfo}. ${envInfo}. Restart MCP server to fix.`;
    }

    return Promise.reject(error);
  }

  /**
   * Build a helpful error message for 403 errors
   */
  static build403ErrorMessage(
    context: string,
    errorData?: { errors?: Array<{ msg: string }> }
  ): string {
    let errorMessage = `Permission denied when ${context}.`;

    if (errorData?.errors) {
      const errors = errorData.errors;
      errorMessage += ` SonarQube errors: ${errors.map((e) => e.msg).join(', ')}`;
    }

    errorMessage +=
      '\n\n🔧 Possible solutions:\n' +
      '  1. Verify the token has "Browse" permission on the project\n' +
      '  2. Check if the project/resource exists and key is correct\n' +
      "  3. Ensure the token hasn't expired\n" +
      '  4. Verify you\'re using a user token (not a global token)\n' +
      '  5. Check SonarQube logs for detailed permission errors';

    return errorMessage;
  }

  /**
   * Check connection to SonarQube server
   */
  async checkConnection(): Promise<{ connected: boolean; version?: string; error?: string }> {
    try {
      const response = await this.client.get('/api/system/status');
      return {
        connected: true,
        version: response.data.version,
      };
    } catch (error: unknown) {
      const axiosError = error as AxiosError;
      return {
        connected: false,
        error: axiosError.message,
      };
    }
  }
}
