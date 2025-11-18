import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleProjectDiscovery } from './project-discovery.handler';

// Mock all dependencies
vi.mock('../../core/project/index.js');
vi.mock('../../universal/project-manager');
vi.mock('../../universal/sonar-admin');
vi.mock('../../shared/validators/mcp-schemas');
vi.mock('../../infrastructure/security/input-sanitization');

describe('handleProjectDiscovery', () => {
  let mockProjectDiscovery: any;
  let mockValidateInput: any;
  let mockSanitizeUrl: any;

  beforeEach(async () => {
    // Mock validateInput
    const validators = await import('../../shared/validators/mcp-schemas');
    mockValidateInput = vi.mocked(validators.validateInput);
    mockValidateInput.mockImplementation(() => ({
      path: '/test/project',
      deep: false,
    }));

    // Mock sanitizeUrl
    const security = await import('../../infrastructure/security/input-sanitization');
    mockSanitizeUrl = vi.mocked(security.sanitizeUrl);
    mockSanitizeUrl.mockImplementation(() => 'http://localhost:9000');

    // Mock ProjectDiscovery
    const project = await import('../../core/project/index.js');
    mockProjectDiscovery = {
      execute: vi.fn(async () => ({
        path: '/test/project',
        languages: ['typescript', 'javascript'],
        frameworksDetected: ['react'],
        testFrameworks: ['vitest'],
        buildTools: ['npm'],
      })),
    };
    vi.mocked(project.ProjectDiscovery).mockImplementation(function() { return mockProjectDiscovery; });
    vi.mocked(project.ProjectDiscovery.formatDiscoveryResult).mockImplementation(function() {
      return 'PROJECT DISCOVERY\n\nPath: /test/project\nLanguages: typescript, javascript\nFrameworks: react';
    });

    // Set environment variables
    process.env.SONAR_URL = 'http://localhost:9000';
    process.env.SONAR_TOKEN = 'test-token';
  });

  describe('Success cases', () => {
    it('should validate input and call ProjectDiscovery', async () => {
      const args = {
        path: '/test/project',
        deep: false,
      };

      const result = await handleProjectDiscovery(args);

      expect(mockValidateInput).toHaveBeenCalledWith(
        expect.anything(),
        args,
        'sonar_project_discovery'
      );
      expect(mockProjectDiscovery.execute).toHaveBeenCalledWith(
        {
          path: '/test/project',
          deep: false,
        },
        undefined
      );
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
    });

    it('should pass correlation ID through', async () => {
      const correlationId = 'test-corr-123';
      await handleProjectDiscovery({}, correlationId);

      expect(mockProjectDiscovery.execute).toHaveBeenCalledWith(
        expect.anything(),
        correlationId
      );
    });

    it('should format result using static method', async () => {
      const result = await handleProjectDiscovery({});

      expect(result.content[0].text).toContain('PROJECT DISCOVERY');
      expect(result.content[0].text).toContain('/test/project');
    });

    it('should sanitize SONAR_URL from environment', async () => {
      await handleProjectDiscovery({});

      expect(mockSanitizeUrl).toHaveBeenCalledWith('http://localhost:9000');
    });

    it('should use default SONAR_URL when not set', async () => {
      delete process.env.SONAR_URL;
      await handleProjectDiscovery({});

      expect(mockSanitizeUrl).toHaveBeenCalledWith('http://localhost:9000');
    });
  });

  describe('Error handling', () => {
    it('should propagate validation errors', async () => {
      mockValidateInput.mockImplementation(function() {
        throw new Error('Validation failed');
      });

      await expect(handleProjectDiscovery({})).rejects.toThrow('Validation failed');
    });

    it('should propagate service errors', async () => {
      mockProjectDiscovery.execute = vi.fn(async () => {
        throw new Error('Discovery failed');
      });

      await expect(handleProjectDiscovery({})).rejects.toThrow('Discovery failed');
    });
  });

  describe('Parameter handling', () => {
    it('should handle path parameter', async () => {
      mockValidateInput.mockImplementation(() => ({
        path: '/custom/path',
        deep: false,
      }));

      await handleProjectDiscovery({ path: '/custom/path' });

      expect(mockProjectDiscovery.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/custom/path',
        }),
        undefined
      );
    });

    it('should handle deep true', async () => {
      mockValidateInput.mockImplementation(() => ({
        path: '/test/project',
        deep: true,
      }));

      await handleProjectDiscovery({ deep: true });

      expect(mockProjectDiscovery.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          deep: true,
        }),
        undefined
      );
    });

    it('should handle deep false', async () => {
      mockValidateInput.mockImplementation(() => ({
        path: '/test/project',
        deep: false,
      }));

      await handleProjectDiscovery({ deep: false });

      expect(mockProjectDiscovery.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          deep: false,
        }),
        undefined
      );
    });
  });
});
