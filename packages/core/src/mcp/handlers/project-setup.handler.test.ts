import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAutoSetup, ProjectSetupHandler } from './project-setup.handler';

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

  describe('Template types', () => {
    it('should handle strict template', async () => {
      mockValidateInput.mockImplementation(() => ({
        force: false,
        template: 'strict',
      }));

      await handleAutoSetup({ template: 'strict' });

      expect(mockProjectSetup.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'strict',
        }),
        undefined
      );
    });

    it('should handle balanced template', async () => {
      mockValidateInput.mockImplementation(() => ({
        force: false,
        template: 'balanced',
      }));

      await handleAutoSetup({ template: 'balanced' });

      expect(mockProjectSetup.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'balanced',
        }),
        undefined
      );
    });

    it('should handle permissive template', async () => {
      mockValidateInput.mockImplementation(() => ({
        force: false,
        template: 'permissive',
      }));

      await handleAutoSetup({ template: 'permissive' });

      expect(mockProjectSetup.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'permissive',
        }),
        undefined
      );
    });

    it('should handle force with existing project', async () => {
      mockValidateInput.mockImplementation(() => ({
        force: true,
        template: 'balanced',
      }));

      const result = await handleAutoSetup({ force: true, template: 'balanced' });

      expect(mockProjectSetup.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          force: true,
          template: 'balanced',
        }),
        undefined
      );
      expect(result.content[0].text).toContain('PROJECT SETUP COMPLETE');
    });
  });

  describe('Edge cases', () => {
    it('should handle project already exists scenario', async () => {
      const project = await import('../../core/project/index.js');
      vi.mocked(project.ProjectSetup.formatSetupResult).mockImplementation(function() {
        return 'PROJECT SETUP COMPLETE\n\nProject Key: existing-project\nStatus: already_exists\nLanguages: typescript';
      });

      const result = await handleAutoSetup({});

      expect(result.content[0].text).toContain('already_exists');
    });

    it('should handle multi-language detection', async () => {
      mockProjectSetup.execute = vi.fn(async () => ({
        projectKey: 'multi-lang-project',
        projectName: 'Multi Language Project',
        status: 'created',
        configPath: '/test/project/sonar-project.properties',
        detectedLanguages: ['typescript', 'javascript', 'css'],
      }));

      const project = await import('../../core/project/index.js');
      vi.mocked(project.ProjectSetup.formatSetupResult).mockImplementation(function() {
        return 'PROJECT SETUP COMPLETE\n\nProject Key: multi-lang-project\nStatus: created\nLanguages: typescript, javascript, css';
      });

      const result = await handleAutoSetup({});

      expect(result.content[0].text).toContain('typescript, javascript, css');
    });

    it('should handle empty args object', async () => {
      mockValidateInput.mockImplementation(() => ({
        force: undefined,
        template: undefined,
      }));

      await handleAutoSetup({});

      expect(mockProjectSetup.execute).toHaveBeenCalled();
    });

    it('should handle setup with config path in result', async () => {
      const project = await import('../../core/project/index.js');
      vi.mocked(project.ProjectSetup.formatSetupResult).mockImplementation(function() {
        return 'PROJECT SETUP COMPLETE\n\nProject Key: test-project\nConfig: /path/to/sonar-project.properties';
      });

      const result = await handleAutoSetup({});

      expect(result.content[0].text).toContain('Config:');
    });
  });
});

