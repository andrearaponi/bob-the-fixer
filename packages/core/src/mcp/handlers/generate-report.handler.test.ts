import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGenerateReport } from './generate-report.handler';

// Mock all dependencies
vi.mock('../../core/reporting/index.js');
vi.mock('../../universal/project-manager');
vi.mock('../../shared/logger/structured-logger');

describe('handleGenerateReport', () => {
  let mockReportGenerator: any;
  let mockProjectManager: any;
  let mockLogger: any;

  beforeEach(async () => {
    // Mock logger
    const loggerModule = await import('../../shared/logger/structured-logger');
    mockLogger = {
      error: vi.fn(() => {})
    };
    vi.mocked(loggerModule.getLogger).mockImplementation(function() { return mockLogger; });

    // Mock ProjectManager
    const projectManagerModule = await import('../../universal/project-manager');
    mockProjectManager = {};
    vi.mocked(projectManagerModule.ProjectManager).mockImplementation(function() { return mockProjectManager; });

    // Mock ReportGenerator
    const reportingModule = await import('../../core/reporting/index.js');
    mockReportGenerator = {
      generateReport: vi.fn(async () =>
        'QUALITY REPORT\n\nProject: test-project\nOverall Status: PASSED'
      )
    };
    vi.mocked(reportingModule.ReportGenerator).mockImplementation(function() { return mockReportGenerator; });
  });

  describe('Success cases', () => {
    it('should call ReportGenerator with default format', async () => {
      const args = {};

      const result = await handleGenerateReport(args);

      expect(mockReportGenerator.generateReport).toHaveBeenCalledWith(
        { format: 'summary' },
        undefined
      );
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
    });

    it('should call ReportGenerator with specified format', async () => {
      const args = { format: 'detailed' };

      await handleGenerateReport(args);

      expect(mockReportGenerator.generateReport).toHaveBeenCalledWith(
        { format: 'detailed' },
        undefined
      );
    });

    it('should pass correlation ID through', async () => {
      const correlationId = 'test-corr-123';
      await handleGenerateReport({}, correlationId);

      expect(mockReportGenerator.generateReport).toHaveBeenCalledWith(
        expect.anything(),
        correlationId
      );
    });

    it('should return generated report text', async () => {
      const result = await handleGenerateReport({});

      expect(result.content[0].text).toContain('QUALITY REPORT');
      expect(result.content[0].text).toContain('test-project');
    });

    it('should handle summary format', async () => {
      const args = { format: 'summary' };

      await handleGenerateReport(args);

      expect(mockReportGenerator.generateReport).toHaveBeenCalledWith(
        { format: 'summary' },
        undefined
      );
    });

    it('should handle detailed format', async () => {
      const args = { format: 'detailed' };

      await handleGenerateReport(args);

      expect(mockReportGenerator.generateReport).toHaveBeenCalledWith(
        { format: 'detailed' },
        undefined
      );
    });

    it('should handle json format', async () => {
      const args = { format: 'json' };

      await handleGenerateReport(args);

      expect(mockReportGenerator.generateReport).toHaveBeenCalledWith(
        { format: 'json' },
        undefined
      );
    });
  });

  describe('Error handling', () => {
    it('should handle generator errors gracefully', async () => {
      mockReportGenerator.generateReport = vi.fn(async () => {
        throw new Error('Report generation failed');
      });

      const result = await handleGenerateReport({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Report generation failed');
      expect(result.content[0].text).toContain('Report generation failed');
    });

    it('should log errors with correlation ID', async () => {
      const correlationId = 'test-corr-123';
      const error = new Error('Generation error');
      mockReportGenerator.generateReport = vi.fn(async () => {
        throw error;
      });

      await handleGenerateReport({}, correlationId);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error generating report',
        error,
        {},
        correlationId
      );
    });

    it('should log errors without correlation ID', async () => {
      const error = new Error('Generation error');
      mockReportGenerator.generateReport = vi.fn(async () => {
        throw error;
      });

      await handleGenerateReport({});

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error generating report',
        error,
        {},
        undefined
      );
    });

    it('should handle errors without message', async () => {
      mockReportGenerator.generateReport = vi.fn(async () => {
        throw {};
      });

      const result = await handleGenerateReport({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Report generation failed');
    });

    it('should return error response instead of throwing', async () => {
      mockReportGenerator.generateReport = vi.fn(async () => {
        throw new Error('Failed');
      });

      // Should not throw, should return error response
      const result = await handleGenerateReport({});
      expect(result.isError).toBe(true);
    });
  });
});
