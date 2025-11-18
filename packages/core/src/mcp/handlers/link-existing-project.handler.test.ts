import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleLinkExistingProject } from './link-existing-project.handler';

// Mock all dependencies
vi.mock('../../shared/validators/mcp-schemas');
vi.mock('../../infrastructure/security/input-sanitization');
vi.mock('../../universal/sonar-admin');
vi.mock('fs/promises');

describe('handleLinkExistingProject', () => {
  let mockValidateInput: any;
  let mockSanitizeUrl: any;
  let mockSanitizePath: any;
  let mockSonarAdmin: any;
  let mockFs: any;

  beforeEach(async () => {
    // Mock validateInput
    const validators = await import('../../shared/validators/mcp-schemas');
    mockValidateInput = vi.mocked(validators.validateInput);
    mockValidateInput.mockImplementation(() => ({
      sonarUrl: 'http://localhost:9000',
      projectKey: 'existing-project',
      token: 'test-token-12345678901234567890',
      projectPath: undefined,
    }));

    // Mock sanitizeUrl and sanitizePath
    const security = await import('../../infrastructure/security/input-sanitization');
    mockSanitizeUrl = vi.mocked(security.sanitizeUrl);
    mockSanitizeUrl.mockImplementation((url) => url);
    mockSanitizePath = vi.mocked(security.sanitizePath);
    mockSanitizePath.mockImplementation((path) => path);

    // Mock SonarAdmin
    const sonarAdmin = await import('../../universal/sonar-admin');
    mockSonarAdmin = {
      validateConnection: vi.fn(async () => true),
      projectExists: vi.fn(async () => true),
    };
    vi.mocked(sonarAdmin.SonarAdmin).mockImplementation(function() { return mockSonarAdmin; });

    // Mock fs/promises
    mockFs = await import('fs/promises');
    vi.mocked(mockFs.readFile).mockRejectedValue(new Error('ENOENT: no such file'));
    vi.mocked(mockFs.writeFile).mockResolvedValue(undefined);
  });

  describe('Success cases', () => {
    it('should validate input and link existing project', async () => {
      const args = {
        sonarUrl: 'http://localhost:9000',
        projectKey: 'existing-project',
        token: 'test-token-12345678901234567890',
      };

      const result = await handleLinkExistingProject(args);

      expect(mockValidateInput).toHaveBeenCalledWith(
        expect.anything(),
        args,
        'sonar_link_existing_project'
      );
      expect(mockSonarAdmin.validateConnection).toHaveBeenCalled();
      expect(mockSonarAdmin.projectExists).toHaveBeenCalledWith('existing-project');
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Successfully linked');
    });

    it('should create bobthefixer.env file', async () => {
      const args = {
        sonarUrl: 'http://localhost:9000',
        projectKey: 'existing-project',
        token: 'test-token-12345678901234567890',
      };

      await handleLinkExistingProject(args);

      expect(mockFs.writeFile).toHaveBeenCalled();
      const writeCall = vi.mocked(mockFs.writeFile).mock.calls[0];
      expect(writeCall[0]).toContain('bobthefixer.env');
      expect(writeCall[1]).toContain('SONAR_URL=http://localhost:9000');
      expect(writeCall[1]).toContain('SONAR_PROJECT_KEY=existing-project');
      expect(writeCall[1]).toContain('SONAR_TOKEN=test-token-12345678901234567890');
    });

    it('should use custom project path if provided', async () => {
      mockSanitizePath.mockImplementation((path) => path);
      mockValidateInput.mockImplementation(() => ({
        sonarUrl: 'http://localhost:9000',
        projectKey: 'existing-project',
        token: 'test-token-12345678901234567890',
        projectPath: '/custom/path',
      }));

      const args = {
        sonarUrl: 'http://localhost:9000',
        projectKey: 'existing-project',
        token: 'test-token-12345678901234567890',
        projectPath: '/custom/path',
      };

      await handleLinkExistingProject(args);

      // Verify writeFile was called
      expect(mockFs.writeFile).toHaveBeenCalled();
      const writeCalls = vi.mocked(mockFs.writeFile).mock.calls;

      // Find the call that writes bobthefixer.env (could be multiple calls for .gitignore too)
      const envFileCall = writeCalls.find(call => call[0].includes('bobthefixer.env'));
      expect(envFileCall).toBeDefined();
      expect(envFileCall![0]).toContain('bobthefixer.env');
    });

    it('should pass correlation ID through', async () => {
      const correlationId = 'test-corr-123';
      const args = {
        sonarUrl: 'http://localhost:9000',
        projectKey: 'existing-project',
        token: 'test-token-12345678901234567890',
      };

      await handleLinkExistingProject(args, correlationId);

      // Should not throw and should complete successfully
      expect(mockSonarAdmin.validateConnection).toHaveBeenCalled();
    });
  });

  describe('Error cases', () => {
    it('should throw error if connection fails', async () => {
      mockSonarAdmin.validateConnection.mockRejectedValue(new Error('Connection failed'));

      const args = {
        sonarUrl: 'http://localhost:9000',
        projectKey: 'existing-project',
        token: 'test-token-12345678901234567890',
      };

      await expect(handleLinkExistingProject(args)).rejects.toThrow('Cannot connect to SonarQube');
    });

    it('should throw error if authentication fails', async () => {
      mockSonarAdmin.validateConnection.mockResolvedValue(false);

      const args = {
        sonarUrl: 'http://localhost:9000',
        projectKey: 'existing-project',
        token: 'test-token-12345678901234567890',
      };

      await expect(handleLinkExistingProject(args)).rejects.toThrow('authentication failed');
    });

    it('should throw error if project does not exist', async () => {
      mockSonarAdmin.projectExists.mockResolvedValue(false);

      const args = {
        sonarUrl: 'http://localhost:9000',
        projectKey: 'non-existent-project',
        token: 'test-token-12345678901234567890',
      };

      await expect(handleLinkExistingProject(args)).rejects.toThrow('does not exist');
    });

    it('should provide helpful error message with suggestions', async () => {
      mockSonarAdmin.projectExists.mockResolvedValue(false);

      const args = {
        sonarUrl: 'http://localhost:9000',
        projectKey: 'missing-project',
        token: 'test-token-12345678901234567890',
      };

      try {
        await handleLinkExistingProject(args);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('does not exist');
        expect(error.message).toContain('verify');
        expect(error.message).toContain('sonar_auto_setup');
      }
    });
  });

  describe('Existing configuration', () => {
    it('should warn if bobthefixer.env already exists', async () => {
      mockFs.readFile.mockResolvedValue('SONAR_PROJECT_KEY=old-project\n');

      const args = {
        sonarUrl: 'http://localhost:9000',
        projectKey: 'new-project',
        token: 'test-token-12345678901234567890',
      };

      const result = await handleLinkExistingProject(args);

      expect(result.content[0].text).toContain('overwritten');
      expect(result.content[0].text).toContain('old-project');
    });
  });
});
