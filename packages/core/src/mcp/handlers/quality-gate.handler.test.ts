import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetQualityGate } from './quality-gate.handler';

// Mock all dependencies
vi.mock('../../core/analysis/index.js');
vi.mock('../../universal/project-manager');

describe('handleGetQualityGate', () => {
  let mockQualityAnalyzer: any;
  let mockProjectManager: any;

  beforeEach(async () => {
    // Mock ProjectManager
    const projectManagerModule = await import('../../universal/project-manager');
    mockProjectManager = {};
    vi.mocked(projectManagerModule.ProjectManager).mockImplementation(function() { return mockProjectManager; });

    // Mock QualityAnalyzer
    const analysisModule = await import('../../core/analysis/index.js');
    mockQualityAnalyzer = {
      getQualityGate: vi.fn(async () =>
        'QUALITY GATE STATUS\n\nStatus: PASSED\nConditions Met: 5/5'
      )
    };
    vi.mocked(analysisModule.QualityAnalyzer).mockImplementation(function() { return mockQualityAnalyzer; });
  });

  describe('Success cases', () => {
    it('should call QualityAnalyzer.getQualityGate', async () => {
      const result = await handleGetQualityGate({});

      expect(mockQualityAnalyzer.getQualityGate).toHaveBeenCalledWith(undefined);
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
    });

    it('should pass correlation ID through', async () => {
      const correlationId = 'test-corr-123';
      await handleGetQualityGate({}, correlationId);

      expect(mockQualityAnalyzer.getQualityGate).toHaveBeenCalledWith(correlationId);
    });

    it('should return quality gate status report', async () => {
      const result = await handleGetQualityGate({});

      expect(result.content[0].text).toContain('QUALITY GATE STATUS');
      expect(result.content[0].text).toContain('PASSED');
    });

    it('should handle PASSED status', async () => {
      mockQualityAnalyzer.getQualityGate = vi.fn(async () =>
        'QUALITY GATE STATUS\n\nStatus: PASSED'
      );

      const result = await handleGetQualityGate({});

      expect(result.content[0].text).toContain('PASSED');
    });

    it('should handle FAILED status', async () => {
      mockQualityAnalyzer.getQualityGate = vi.fn(async () =>
        'QUALITY GATE STATUS\n\nStatus: FAILED'
      );

      const result = await handleGetQualityGate({});

      expect(result.content[0].text).toContain('FAILED');
    });

    it('should handle WARNING status', async () => {
      mockQualityAnalyzer.getQualityGate = vi.fn(async () =>
        'QUALITY GATE STATUS\n\nStatus: WARNING'
      );

      const result = await handleGetQualityGate({});

      expect(result.content[0].text).toContain('WARNING');
    });

    it('should work with empty args', async () => {
      const result = await handleGetQualityGate({});

      expect(mockQualityAnalyzer.getQualityGate).toHaveBeenCalled();
      expect(result).toHaveProperty('content');
    });
  });

  describe('Error handling', () => {
    it('should handle analyzer errors gracefully', async () => {
      mockQualityAnalyzer.getQualityGate = vi.fn(async () => {
        throw new Error('Failed to fetch quality gate');
      });

      const result = await handleGetQualityGate({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Quality Gate Status Error');
      expect(result.content[0].text).toContain('Failed to fetch quality gate');
    });

    it('should handle errors without message', async () => {
      mockQualityAnalyzer.getQualityGate = vi.fn(async () => {
        throw {};
      });

      const result = await handleGetQualityGate({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Quality Gate Status Error');
      expect(result.content[0].text).toContain('Unknown error');
    });

    it('should handle API errors', async () => {
      mockQualityAnalyzer.getQualityGate = vi.fn(async () => {
        throw new Error('SonarQube API error');
      });

      const result = await handleGetQualityGate({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('SonarQube API error');
    });

    it('should return error response instead of throwing', async () => {
      mockQualityAnalyzer.getQualityGate = vi.fn(async () => {
        throw new Error('Failed');
      });

      // Should not throw, should return error response
      const result = await handleGetQualityGate({});
      expect(result.isError).toBe(true);
    });
  });
});
