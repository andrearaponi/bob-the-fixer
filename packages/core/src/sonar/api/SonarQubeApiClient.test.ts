import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SonarQubeApiClient } from './SonarQubeApiClient.js';
import axios from 'axios';

// Mock axios
vi.mock('axios', () => {
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    defaults: {
      baseURL: 'http://sonarqube:9000',
      headers: {},
    },
    interceptors: {
      response: {
        use: vi.fn(),
      },
    },
  };

  return {
    default: {
      create: vi.fn(() => mockAxiosInstance),
    },
  };
});

describe('SonarQubeApiClient', () => {
  let client: SonarQubeApiClient;
  let mockAxiosInstance: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAxiosInstance = (axios.create as ReturnType<typeof vi.fn>)();
    client = new SonarQubeApiClient({
      baseUrl: 'http://sonarqube:9000',
      token: 'test-token-12345',
    });
  });

  describe('constructor', () => {
    it('should create axios instance with correct config', () => {
      // Note: URL is sanitized and may have trailing slash added
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000,
        })
      );
      // Verify headers separately to avoid issues with URL sanitization
      const callArgs = (axios.create as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = callArgs[callArgs.length - 1][0];
      expect(lastCall.headers.Authorization).toBe('Bearer test-token-12345');
      expect(lastCall.headers['Content-Type']).toBe('application/json');
      expect(lastCall.baseURL).toContain('sonarqube:9000');
    });

    it('should respect custom timeout', () => {
      new SonarQubeApiClient({
        baseUrl: 'http://sonarqube:9000',
        token: 'test-token',
        timeout: 60000,
      });

      expect(axios.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          timeout: 60000,
        })
      );
    });

    it('should register response interceptor', () => {
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should make GET request and return data', async () => {
      const mockData = { issues: [], total: 0 };
      mockAxiosInstance.get.mockResolvedValueOnce({ data: mockData });

      const result = await client.get('/api/issues/search', { projectKey: 'test' });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/issues/search', {
        params: { projectKey: 'test' },
      });
      expect(result).toEqual(mockData);
    });

    it('should handle errors', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.get('/api/issues/search')).rejects.toThrow('Network error');
    });
  });

  describe('post', () => {
    it('should make POST request with data', async () => {
      const mockResponse = { success: true };
      mockAxiosInstance.post.mockResolvedValueOnce({ data: mockResponse });

      const result = await client.post('/api/projects/create', { name: 'test' });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/projects/create',
        { name: 'test' },
        { params: undefined }
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getPaginated', () => {
    it('should fetch all pages when multiple exist', async () => {
      // First page response
      mockAxiosInstance.get
        .mockResolvedValueOnce({
          data: {
            total: 150,
            issues: [{ id: 1 }, { id: 2 }],
          },
        })
        // Second page
        .mockResolvedValueOnce({
          data: {
            total: 150,
            issues: [{ id: 3 }, { id: 4 }],
          },
        });

      const result = await client.getPaginated('/api/issues/search', { projectKey: 'test' }, {
        itemsKey: 'issues',
        pageSize: 100,
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(4);
    });

    it('should respect maxPages limit', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          total: 10000,
          issues: [{ id: 1 }],
        },
      });

      await client.getPaginated('/api/issues/search', {}, {
        itemsKey: 'issues',
        pageSize: 100,
        maxPages: 5,
      });

      // 1 initial + 4 additional (limited to 5 total)
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(5);
    });

    it('should handle single page result', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          total: 10,
          issues: [{ id: 1 }, { id: 2 }],
        },
      });

      const result = await client.getPaginated('/api/issues/search', {}, {
        itemsKey: 'issues',
        pageSize: 100,
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
    });
  });

  describe('getMaskedToken', () => {
    it('should return masked token', () => {
      const masked = client.getMaskedToken();
      // Token should be partially masked with asterisks
      expect(masked).toContain('*');
      expect(masked.length).toBeGreaterThan(0);
    });
  });

  describe('baseUrl', () => {
    it('should return the base URL', () => {
      expect(client.baseUrl).toBe('http://sonarqube:9000');
    });
  });

  describe('checkConnection', () => {
    it('should return connected status on success', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { status: 'UP', version: '9.9.0' },
      });

      const result = await client.checkConnection();

      expect(result.connected).toBe(true);
      expect(result.version).toBe('9.9.0');
    });

    it('should return error on failure', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await client.checkConnection();

      expect(result.connected).toBe(false);
      expect(result.error).toBe('Connection refused');
    });
  });

  describe('build403ErrorMessage', () => {
    it('should build helpful error message', () => {
      const message = SonarQubeApiClient.build403ErrorMessage('fetching issues');

      expect(message).toContain('Permission denied when fetching issues');
      expect(message).toContain('Possible solutions');
      expect(message).toContain('Browse');
    });

    it('should include SonarQube error messages', () => {
      const message = SonarQubeApiClient.build403ErrorMessage('fetching issues', {
        errors: [{ msg: 'Insufficient privileges' }],
      });

      expect(message).toContain('Insufficient privileges');
    });
  });
});
