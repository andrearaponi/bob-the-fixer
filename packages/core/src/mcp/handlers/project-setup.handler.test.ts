import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAutoSetup } from './project-setup.handler';

// Mock all dependencies
vi.mock('../../core/project/index.js');
vi.mock('../../universal/project-manager');
vi.mock('../../universal/sonar-admin');
vi.mock('../../shared/validators/mcp-schemas');
vi.mock('../../infrastructure/security/input-sanitization');

describe('handleAutoSetup', () => {
  let mockProjectSetup: any;
  let mockValidateInput: any;
  let mockSanitizeUrl: any;

  beforeEach(async () => {
    // Mock validateInput
    const validators = await import('../../shared/validators/mcp-schemas');
    mockValidateInput = vi.mocked(validators.validateInput);
    mockValidateInput.mockImplementation(() => ({
      force: false,
      template: undefined,
    }));

    // Mock sanitizeUrl
    const security = await import('../../infrastructure/security/input-sanitization');
    mockSanitizeUrl = vi.mocked(security.sanitizeUrl);
    mockSanitizeUrl.mockImplementation(() => 'http://localhost:9000');

    // Mock ProjectSetup
    const project = await import('../../core/project/index.js');
    mockProjectSetup = {
      execute: vi.fn(async () => ({
        projectKey: 'test-project',
        projectName: 'Test Project',
        status: 'created',
        configPath: '/test/project/sonar-project.properties',
        detectedLanguages: ['typescript'],
      })),
    };
    vi.mocked(project.ProjectSetup).mockImplementation(function() { return mockProjectSetup; });
    vi.mocked(project.ProjectSetup.formatSetupResult).mockImplementation(function() {
      return 'PROJECT SETUP COMPLETE\n\nProject Key: test-project\nStatus: created\nLanguages: typescript';
    });

    // Set environment variables
    process.env.SONAR_URL = 'http://localhost:9000';
    process.env.SONAR_TOKEN = 'test-token';
  });

  describe('Success cases', () => {
    it('should validate input and call ProjectSetup', async () => {
      const args = {
        force: false,
        template: undefined,
      };

      const result = await handleAutoSetup(args);

      expect(mockValidateInput).toHaveBeenCalledWith(
        expect.anything(),
        args,
        'sonar_auto_setup'
      );
      expect(mockProjectSetup.execute).toHaveBeenCalledWith(
        {
          force: false,
          template: undefined,
        },
        undefined
      );
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
    });

    it('should pass correlation ID through', async () => {
      const correlationId = 'test-corr-123';
      await handleAutoSetup({}, correlationId);

      expect(mockProjectSetup.execute).toHaveBeenCalledWith(
        expect.anything(),
        correlationId
      );
    });

    it('should format result using static method', async () => {
      const result = await handleAutoSetup({});

      expect(result.content[0].text).toContain('PROJECT SETUP COMPLETE');
      expect(result.content[0].text).toContain('test-project');
    });

    it('should sanitize SONAR_URL from environment', async () => {
      await handleAutoSetup({});

      expect(mockSanitizeUrl).toHaveBeenCalledWith('http://localhost:9000');
    });

    it('should use default SONAR_URL when not set', async () => {
      delete process.env.SONAR_URL;
      await handleAutoSetup({});

      expect(mockSanitizeUrl).toHaveBeenCalledWith('http://localhost:9000');
    });
  });

  describe('Error handling', () => {
    it('should propagate validation errors', async () => {
      mockValidateInput.mockImplementation(function() {
        throw new Error('Validation failed');
      });

      await expect(handleAutoSetup({})).rejects.toThrow('Validation failed');
    });

    it('should propagate service errors', async () => {
      mockProjectSetup.execute = vi.fn(async () => {
        throw new Error('Setup failed');
      });

      await expect(handleAutoSetup({})).rejects.toThrow('Setup failed');
    });
  });

  describe('Parameter handling', () => {
    it('should handle force true', async () => {
      mockValidateInput.mockImplementation(() => ({
        force: true,
        template: undefined,
      }));

      await handleAutoSetup({ force: true });

      expect(mockProjectSetup.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          force: true,
        }),
        undefined
      );
    });

    it('should handle force false', async () => {
      mockValidateInput.mockImplementation(() => ({
        force: false,
        template: undefined,
      }));

      await handleAutoSetup({ force: false });

      expect(mockProjectSetup.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          force: false,
        }),
        undefined
      );
    });

    it('should handle template parameter', async () => {
      mockValidateInput.mockImplementation(() => ({
        force: false,
        template: 'react',
      }));

      await handleAutoSetup({ template: 'react' });

      expect(mockProjectSetup.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'react',
        }),
        undefined
      );
    });

    it('should handle undefined template', async () => {
      mockValidateInput.mockImplementation(() => ({
        force: false,
        template: undefined,
      }));

      await handleAutoSetup({});

      expect(mockProjectSetup.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          template: undefined,
        }),
        undefined
      );
    });
  });
});
