import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetDuplicationDetails, DuplicationDetailsHandler } from './duplication-details.handler';

// Mock all dependencies
vi.mock('../../sonar/index.js');
vi.mock('../../universal/project-manager');
vi.mock('../../shared/validators/mcp-schemas');

describe('handleGetDuplicationDetails', () => {
  let mockSonarQubeClient: any;
  let mockProjectManager: any;
  let mockValidateInput: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock validateInput
    const validators = await import('../../shared/validators/mcp-schemas');
    mockValidateInput = vi.mocked(validators.validateInput);
    mockValidateInput.mockImplementation((schema, args) => ({
      fileKey: args.fileKey || 'project:src/main/java/Example.java',
      includeRecommendations: args.includeRecommendations !== false
    }));

    // Mock ProjectManager
    const projectManagerModule = await import('../../universal/project-manager');
    mockProjectManager = {
      getOrCreateConfig: vi.fn(async () => ({
        sonarUrl: 'http://localhost:9000',
        sonarToken: 'test-token',
        sonarProjectKey: 'test-project'
      })),
      analyzeProject: vi.fn(async () => ({
        path: '/test/project',
        name: 'test-project',
        language: ['java']
      }))
    };
    vi.mocked(projectManagerModule.ProjectManager).mockImplementation(function() { return mockProjectManager; });

    // Mock SonarQubeClient
    const sonarModule = await import('../../sonar/index.js');
    mockSonarQubeClient = {
      getDuplicationDetails: vi.fn(async () => ({
        duplications: [
          {
            blocks: [
              { from: 10, size: 15, _ref: '1' },
              { from: 50, size: 15, _ref: '2' }
            ]
          }
        ],
        files: {
          '1': { key: 'project:src/File1.java', name: 'File1.java', projectName: 'test-project' },
          '2': { key: 'project:src/File2.java', name: 'File2.java', projectName: 'test-project' }
        }
      }))
    };
    vi.mocked(sonarModule.SonarQubeClient).mockImplementation(function() { return mockSonarQubeClient; });
  });

  describe('Success cases', () => {
    it('should validate input and call SonarQubeClient', async () => {
      const args = {
        fileKey: 'project:src/main/java/Example.java',
        includeRecommendations: true
      };

      const result = await handleGetDuplicationDetails(args);

      expect(mockValidateInput).toHaveBeenCalledWith(
        expect.anything(),
        args,
        'sonar_get_duplication_details'
      );
      expect(mockSonarQubeClient.getDuplicationDetails).toHaveBeenCalledWith(
        'project:src/main/java/Example.java'
      );
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
    });

    it('should return duplication details report', async () => {
      const result = await handleGetDuplicationDetails({
        fileKey: 'project:src/Example.java'
      });

      expect(result.content[0].text).toContain('DUPLICATION DETAILS');
      expect(result.content[0].text).toContain('File:');
    });

    it('should include file path in report', async () => {
      const result = await handleGetDuplicationDetails({
        fileKey: 'project:src/Example.java'
      });

      expect(result.content[0].text).toContain('Path:');
      expect(result.content[0].text).toContain('/test/project');
    });

    it('should include duplicate groups in report', async () => {
      const result = await handleGetDuplicationDetails({
        fileKey: 'project:src/Example.java'
      });

      expect(result.content[0].text).toContain('Group 1');
      expect(result.content[0].text).toContain('Block 1');
      expect(result.content[0].text).toContain('Lines:');
    });

    it('should include recommendations when enabled', async () => {
      const result = await handleGetDuplicationDetails({
        fileKey: 'project:src/Example.java',
        includeRecommendations: true
      });

      expect(result.content[0].text).toContain('REFACTORING RECOMMENDATIONS');
      expect(result.content[0].text).toContain('GENERAL TIPS');
    });

    it('should exclude recommendations when disabled', async () => {
      mockValidateInput.mockImplementation(() => ({
        fileKey: 'project:src/Example.java',
        includeRecommendations: false
      }));

      const result = await handleGetDuplicationDetails({
        fileKey: 'project:src/Example.java',
        includeRecommendations: false
      });

      expect(result.content[0].text).not.toContain('REFACTORING RECOMMENDATIONS');
    });

    it('should handle file with no duplications', async () => {
      mockSonarQubeClient.getDuplicationDetails = vi.fn(async () => ({
        duplications: [],
        files: {}
      }));

      const result = await handleGetDuplicationDetails({
        fileKey: 'project:src/Clean.java'
      });

      expect(result.content[0].text).toContain('No duplications found');
    });

    it('should include affected files section', async () => {
      const result = await handleGetDuplicationDetails({
        fileKey: 'project:src/Example.java'
      });

      expect(result.content[0].text).toContain('AFFECTED FILES');
      expect(result.content[0].text).toContain('File1.java');
      expect(result.content[0].text).toContain('File2.java');
    });

    it('should detect cross-file duplication', async () => {
      const result = await handleGetDuplicationDetails({
        fileKey: 'project:src/Example.java'
      });

      expect(result.content[0].text).toContain('CROSS-FILE DUPLICATION');
    });

    it('should pass correlation ID through', async () => {
      const correlationId = 'test-corr-123';
      await handleGetDuplicationDetails({ fileKey: 'project:src/Example.java' }, correlationId);

      // Correlation ID is passed but not directly used in getDuplicationDetails
      expect(mockSonarQubeClient.getDuplicationDetails).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle validation errors gracefully', async () => {
      mockValidateInput.mockImplementation(function() {
        throw new Error('fileKey is required');
      });

      const result = await handleGetDuplicationDetails({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error getting duplication details');
      expect(result.content[0].text).toContain('fileKey is required');
    });

    it('should handle SonarQube API errors gracefully', async () => {
      mockSonarQubeClient.getDuplicationDetails = vi.fn(async () => {
        throw new Error('File not found or has no duplications');
      });

      const result = await handleGetDuplicationDetails({
        fileKey: 'project:src/NotFound.java'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error getting duplication details');
      expect(result.content[0].text).toContain('File not found');
    });

    it('should handle project config errors', async () => {
      mockProjectManager.getOrCreateConfig = vi.fn(async () => {
        throw new Error('No configuration found');
      });

      const result = await handleGetDuplicationDetails({
        fileKey: 'project:src/Example.java'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error getting duplication details');
    });

    it('should handle errors without message', async () => {
      mockSonarQubeClient.getDuplicationDetails = vi.fn(async () => {
        throw {};
      });

      const result = await handleGetDuplicationDetails({
        fileKey: 'project:src/Example.java'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error getting duplication details');
    });

    it('should return error response instead of throwing', async () => {
      mockValidateInput.mockImplementation(function() {
        throw new Error('Validation failed');
      });

      // Should not throw, should return error response
      const result = await handleGetDuplicationDetails({});
      expect(result.isError).toBe(true);
    });
  });

  describe('Report formatting', () => {
    it('should calculate correct line ranges', async () => {
      mockSonarQubeClient.getDuplicationDetails = vi.fn(async () => ({
        duplications: [
          {
            blocks: [
              { from: 100, size: 20, _ref: '1' }
            ]
          }
        ],
        files: {
          '1': { key: 'project:src/File.java', name: 'File.java', projectName: 'test' }
        }
      }));

      const result = await handleGetDuplicationDetails({
        fileKey: 'project:src/Example.java'
      });

      // Lines should be 100 - 119 (from 100, size 20)
      expect(result.content[0].text).toContain('100 - 119');
      expect(result.content[0].text).toContain('20 lines');
    });

    it('should show high priority for many duplicate groups', async () => {
      mockSonarQubeClient.getDuplicationDetails = vi.fn(async () => ({
        duplications: [
          { blocks: [{ from: 10, size: 10, _ref: '1' }] },
          { blocks: [{ from: 30, size: 10, _ref: '1' }] },
          { blocks: [{ from: 50, size: 10, _ref: '1' }] }
        ],
        files: {
          '1': { key: 'project:src/File.java', name: 'File.java', projectName: 'test' }
        }
      }));

      const result = await handleGetDuplicationDetails({
        fileKey: 'project:src/Example.java'
      });

      expect(result.content[0].text).toContain('HIGH PRIORITY');
    });

    it('should show medium priority for few duplicate groups', async () => {
      mockSonarQubeClient.getDuplicationDetails = vi.fn(async () => ({
        duplications: [
          { blocks: [{ from: 10, size: 10, _ref: '1' }] }
        ],
        files: {
          '1': { key: 'project:src/File.java', name: 'File.java', projectName: 'test' }
        }
      }));

      const result = await handleGetDuplicationDetails({
        fileKey: 'project:src/Example.java'
      });

      expect(result.content[0].text).toContain('MEDIUM PRIORITY');
    });

    it('should extract filename from fileKey correctly', async () => {
      const result = await handleGetDuplicationDetails({
        fileKey: 'my-project:src/main/java/com/example/Service.java'
      });

      expect(result.content[0].text).toContain('Service.java');
    });
  });
});

