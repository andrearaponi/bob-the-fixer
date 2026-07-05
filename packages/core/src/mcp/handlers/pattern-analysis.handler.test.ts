import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAnalyzePatterns, PatternAnalysisHandler } from './pattern-analysis.handler';

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

  describe('GroupBy options', () => {
    it('should handle groupBy pattern', async () => {
      mockValidateInput.mockImplementation(() => ({
        groupBy: 'pattern'
      }));

      await handleAnalyzePatterns({ groupBy: 'pattern' });

      expect(mockPatternAnalysisService.analyze).toHaveBeenCalledWith(
        expect.objectContaining({
          groupBy: 'pattern'
        }),
        undefined
      );
    });

    it('should handle groupBy fixability', async () => {
      mockValidateInput.mockImplementation(() => ({
        groupBy: 'fixability'
      }));

      await handleAnalyzePatterns({ groupBy: 'fixability' });

      expect(mockPatternAnalysisService.analyze).toHaveBeenCalledWith(
        expect.objectContaining({
          groupBy: 'fixability'
        }),
        undefined
      );
    });

    it('should format pattern grouping output correctly', async () => {
      mockPatternAnalysisService.analyze = vi.fn(async () => ({
        report: 'PATTERN ANALYSIS\n\nGrouped by: pattern\n\n1. java:S1135 - 20 issues\n2. java:S1192 - 15 issues'
      }));

      const result = await handleAnalyzePatterns({ groupBy: 'pattern' });

      expect(result.content[0].text).toContain('Grouped by: pattern');
    });

    it('should format fixability grouping output correctly', async () => {
      mockPatternAnalysisService.analyze = vi.fn(async () => ({
        report: 'PATTERN ANALYSIS\n\nGrouped by: fixability\n\nEasy: 30 issues\nMedium: 20 issues\nHard: 5 issues'
      }));

      const result = await handleAnalyzePatterns({ groupBy: 'fixability' });

      expect(result.content[0].text).toContain('Grouped by: fixability');
      expect(result.content[0].text).toContain('Easy:');
    });
  });

  describe('Edge cases', () => {
    it('should handle includeCorrelations with empty correlations', async () => {
      mockValidateInput.mockImplementation(() => ({
        includeCorrelations: true
      }));

      mockPatternAnalysisService.analyze = vi.fn(async () => ({
        report: 'PATTERN ANALYSIS\n\nCorrelations: None found'
      }));

      const result = await handleAnalyzePatterns({ includeCorrelations: true });

      expect(result.content[0].text).toContain('Correlations: None found');
    });

    it('should handle includeImpact with time estimates', async () => {
      mockValidateInput.mockImplementation(() => ({
        includeImpact: true
      }));

      mockPatternAnalysisService.analyze = vi.fn(async () => ({
        report: 'PATTERN ANALYSIS\n\nImpact:\n- Total effort: 4h 30m\n- Critical issues: 5'
      }));

      const result = await handleAnalyzePatterns({ includeImpact: true });

      expect(result.content[0].text).toContain('Total effort:');
    });

    it('should handle combined includeCorrelations and includeImpact', async () => {
      mockValidateInput.mockImplementation(() => ({
        includeCorrelations: true,
        includeImpact: true
      }));

      mockPatternAnalysisService.analyze = vi.fn(async () => ({
        report: 'PATTERN ANALYSIS\n\nCorrelations: Found 3\nImpact: High'
      }));

      const result = await handleAnalyzePatterns({ includeCorrelations: true, includeImpact: true });

      expect(result.content[0].text).toContain('Correlations:');
      expect(result.content[0].text).toContain('Impact:');
    });

    it('should handle empty issues result', async () => {
      mockPatternAnalysisService.analyze = vi.fn(async () => ({
        report: 'PATTERN ANALYSIS\n\nNo issues found in this project.'
      }));

      const result = await handleAnalyzePatterns({});

      expect(result.content[0].text).toContain('No issues found');
    });

    it('should handle all parameters combined', async () => {
      mockValidateInput.mockImplementation(() => ({
        groupBy: 'severity',
        includeCorrelations: true,
        includeImpact: true
      }));

      await handleAnalyzePatterns({
        groupBy: 'severity',
        includeCorrelations: true,
        includeImpact: true
      });

      expect(mockPatternAnalysisService.analyze).toHaveBeenCalledWith(
        {
          groupBy: 'severity',
          includeCorrelations: true,
          includeImpact: true
        },
        undefined
      );
    });
  });
});

