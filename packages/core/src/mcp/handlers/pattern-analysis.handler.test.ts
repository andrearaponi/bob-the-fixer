import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAnalyzePatterns } from './pattern-analysis.handler';

// Mock all dependencies
vi.mock('../../core/analysis/index.js');
vi.mock('../../universal/project-manager');
vi.mock('../../shared/validators/mcp-schemas');

describe('handleAnalyzePatterns', () => {
  let mockPatternAnalysisService: any;
  let mockProjectManager: any;
  let mockValidateInput: any;

  beforeEach(async () => {
    // Mock validateInput
    const validators = await import('../../shared/validators/mcp-schemas');
    mockValidateInput = vi.mocked(validators.validateInput);
    mockValidateInput.mockImplementation(() => ({
      groupBy: 'rule',
      includeImpact: true,
      includeCorrelations: true
    }));

    // Mock ProjectManager
    const projectManagerModule = await import('../../universal/project-manager');
    mockProjectManager = {};
    vi.mocked(projectManagerModule.ProjectManager).mockImplementation(function() { return mockProjectManager; });

    // Mock PatternAnalysisService
    const analysisModule = await import('../../core/analysis/index.js');
    mockPatternAnalysisService = {
      analyze: vi.fn(async () => ({
        report: 'PATTERN ANALYSIS\n\nTop patterns by rule:\n1. Rule A - 15 occurrences\n2. Rule B - 10 occurrences'
      }))
    };
    vi.mocked(analysisModule.PatternAnalysisService).mockImplementation(function() { return mockPatternAnalysisService; });
  });

  describe('Success cases', () => {
    it('should validate input and call PatternAnalysisService', async () => {
      const args = {
        groupBy: 'rule',
        includeImpact: true,
        includeCorrelations: true
      };

      const result = await handleAnalyzePatterns(args);

      expect(mockValidateInput).toHaveBeenCalledWith(
        expect.anything(),
        args,
        'sonar_analyze_patterns'
      );
      expect(mockPatternAnalysisService.analyze).toHaveBeenCalledWith(
        {
          groupBy: 'rule',
          includeImpact: true,
          includeCorrelations: true
        },
        undefined
      );
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
    });

    it('should pass correlation ID through', async () => {
      const correlationId = 'test-corr-123';
      await handleAnalyzePatterns({}, correlationId);

      expect(mockPatternAnalysisService.analyze).toHaveBeenCalledWith(
        expect.anything(),
        correlationId
      );
    });

    it('should return pattern analysis report', async () => {
      const result = await handleAnalyzePatterns({});

      expect(result.content[0].text).toContain('PATTERN ANALYSIS');
      expect(result.content[0].text).toContain('Top patterns');
    });

    it('should handle groupBy rule', async () => {
      mockValidateInput.mockImplementation(() => ({
        groupBy: 'rule'
      }));

      await handleAnalyzePatterns({});

      expect(mockPatternAnalysisService.analyze).toHaveBeenCalledWith(
        expect.objectContaining({
          groupBy: 'rule'
        }),
        undefined
      );
    });

    it('should handle groupBy severity', async () => {
      mockValidateInput.mockImplementation(() => ({
        groupBy: 'severity'
      }));

      await handleAnalyzePatterns({});

      expect(mockPatternAnalysisService.analyze).toHaveBeenCalledWith(
        expect.objectContaining({
          groupBy: 'severity'
        }),
        undefined
      );
    });

    it('should handle groupBy file', async () => {
      mockValidateInput.mockImplementation(() => ({
        groupBy: 'file'
      }));

      await handleAnalyzePatterns({});

      expect(mockPatternAnalysisService.analyze).toHaveBeenCalledWith(
        expect.objectContaining({
          groupBy: 'file'
        }),
        undefined
      );
    });

    it('should handle includeImpact false', async () => {
      mockValidateInput.mockImplementation(() => ({
        includeImpact: false
      }));

      await handleAnalyzePatterns({});

      expect(mockPatternAnalysisService.analyze).toHaveBeenCalledWith(
        expect.objectContaining({
          includeImpact: false
        }),
        undefined
      );
    });

    it('should handle includeCorrelations false', async () => {
      mockValidateInput.mockImplementation(() => ({
        includeCorrelations: false
      }));

      await handleAnalyzePatterns({});

      expect(mockPatternAnalysisService.analyze).toHaveBeenCalledWith(
        expect.objectContaining({
          includeCorrelations: false
        }),
        undefined
      );
    });
  });

  describe('Error handling', () => {
    it('should propagate validation errors', async () => {
      mockValidateInput.mockImplementation(function() {
        throw new Error('Invalid groupBy option');
      });

      await expect(handleAnalyzePatterns({})).rejects.toThrow('Invalid groupBy option');
    });

    it('should propagate service errors', async () => {
      mockPatternAnalysisService.analyze = vi.fn(async () => {
        throw new Error('Pattern analysis failed');
      });

      await expect(handleAnalyzePatterns({})).rejects.toThrow('Pattern analysis failed');
    });

    it('should propagate API errors', async () => {
      mockPatternAnalysisService.analyze = vi.fn(async () => {
        throw new Error('SonarQube API error');
      });

      await expect(handleAnalyzePatterns({})).rejects.toThrow('SonarQube API error');
    });
  });
});
