import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetProjectMetrics } from './project-metrics.handler';

// Mock all dependencies
vi.mock('../../core/analysis/index.js');
vi.mock('../../universal/project-manager');
vi.mock('../../shared/validators/mcp-schemas');
vi.mock('../../shared/logger/structured-logger');

describe('handleGetProjectMetrics', () => {
  let mockQualityAnalyzer: any;
  let mockProjectManager: any;
  let mockValidateInput: any;
  let mockLogger: any;

  beforeEach(async () => {
    // Mock logger
    const loggerModule = await import('../../shared/logger/structured-logger');
    mockLogger = {
      error: vi.fn(() => {})
    };
    vi.mocked(loggerModule.getLogger).mockImplementation(function() { return mockLogger; });

    // Mock validateInput
    const validators = await import('../../shared/validators/mcp-schemas');
    mockValidateInput = vi.mocked(validators.validateInput);
    mockValidateInput.mockImplementation(() => ({
      metrics: ['bugs', 'vulnerabilities', 'code_smells']
    }));

    // Mock ProjectManager
    const projectManagerModule = await import('../../universal/project-manager');
    mockProjectManager = {};
    vi.mocked(projectManagerModule.ProjectManager).mockImplementation(function() { return mockProjectManager; });

    // Mock QualityAnalyzer
    const analysisModule = await import('../../core/analysis/index.js');
    mockQualityAnalyzer = {
      getProjectMetrics: vi.fn(async () =>
        'PROJECT METRICS\n\nBugs: 5\nVulnerabilities: 2\nCode Smells: 20'
      )
    };
    vi.mocked(analysisModule.QualityAnalyzer).mockImplementation(function() { return mockQualityAnalyzer; });
  });

  describe('Success cases', () => {
    it('should validate input and call QualityAnalyzer', async () => {
      const args = {
        metrics: ['bugs', 'vulnerabilities', 'code_smells']
      };

      const result = await handleGetProjectMetrics(args);

      expect(mockValidateInput).toHaveBeenCalledWith(
        expect.anything(),
        args,
        'sonar_get_project_metrics'
      );
      expect(mockQualityAnalyzer.getProjectMetrics).toHaveBeenCalledWith(
        {
          metrics: ['bugs', 'vulnerabilities', 'code_smells']
        },
        undefined
      );
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
    });

    it('should pass correlation ID through', async () => {
      const correlationId = 'test-corr-123';
      await handleGetProjectMetrics({}, correlationId);

      expect(mockQualityAnalyzer.getProjectMetrics).toHaveBeenCalledWith(
        expect.anything(),
        correlationId
      );
    });

    it('should return project metrics report', async () => {
      const result = await handleGetProjectMetrics({});

      expect(result.content[0].text).toContain('PROJECT METRICS');
      expect(result.content[0].text).toContain('Bugs');
    });

    it('should handle single metric', async () => {
      mockValidateInput.mockImplementation(() => ({
        metrics: ['coverage']
      }));

      await handleGetProjectMetrics({});

      expect(mockQualityAnalyzer.getProjectMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          metrics: ['coverage']
        }),
        undefined
      );
    });

    it('should handle multiple metrics', async () => {
      mockValidateInput.mockImplementation(() => ({
        metrics: ['bugs', 'vulnerabilities', 'code_smells', 'coverage', 'duplications']
      }));

      await handleGetProjectMetrics({});

      expect(mockQualityAnalyzer.getProjectMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          metrics: ['bugs', 'vulnerabilities', 'code_smells', 'coverage', 'duplications']
        }),
        undefined
      );
    });

    it('should handle reliability metrics', async () => {
      mockValidateInput.mockImplementation(() => ({
        metrics: ['reliability_rating', 'bugs']
      }));

      await handleGetProjectMetrics({});

      expect(mockQualityAnalyzer.getProjectMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          metrics: ['reliability_rating', 'bugs']
        }),
        undefined
      );
    });

    it('should handle security metrics', async () => {
      mockValidateInput.mockImplementation(() => ({
        metrics: ['security_rating', 'vulnerabilities']
      }));

      await handleGetProjectMetrics({});

      expect(mockQualityAnalyzer.getProjectMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          metrics: ['security_rating', 'vulnerabilities']
        }),
        undefined
      );
    });
  });

  describe('Error handling', () => {
    it('should handle validation errors gracefully', async () => {
      mockValidateInput.mockImplementation(function() {
        throw new Error('Invalid metric name');
      });

      const result = await handleGetProjectMetrics({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error fetching project metrics');
      expect(result.content[0].text).toContain('Invalid metric name');
    });

    it('should handle analyzer errors gracefully', async () => {
      mockQualityAnalyzer.getProjectMetrics = vi.fn(async () => {
        throw new Error('Failed to fetch metrics');
      });

      const result = await handleGetProjectMetrics({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error fetching project metrics');
      expect(result.content[0].text).toContain('Failed to fetch metrics');
    });

    it('should log errors with correlation ID', async () => {
      const correlationId = 'test-corr-123';
      const error = new Error('Metrics error');
      mockQualityAnalyzer.getProjectMetrics = vi.fn(async () => {
        throw error;
      });

      await handleGetProjectMetrics({}, correlationId);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error fetching project metrics',
        error,
        {},
        correlationId
      );
    });

    it('should log errors without correlation ID', async () => {
      const error = new Error('Metrics error');
      mockQualityAnalyzer.getProjectMetrics = vi.fn(async () => {
        throw error;
      });

      await handleGetProjectMetrics({});

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error fetching project metrics',
        error,
        {},
        undefined
      );
    });

    it('should return error response instead of throwing', async () => {
      mockValidateInput.mockImplementation(function() {
        throw new Error('Validation failed');
      });

      // Should not throw, should return error response
      const result = await handleGetProjectMetrics({});
      expect(result.isError).toBe(true);
    });
  });
});
