import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetCoverageGaps } from './coverage-gaps.handler';

// Mock all dependencies
vi.mock('../../core/analysis/index.js');
vi.mock('../../universal/project-manager');
vi.mock('../../shared/validators/mcp-schemas');
vi.mock('../../sonar/index.js');

describe('handleGetCoverageGaps', () => {
  let mockCoverageAnalyzer: any;
  let mockProjectManager: any;
  let mockSonarQubeClient: any;
  let mockValidateInput: any;

  const mockLineCoverage = [
    { line: 1, code: 'function test() {', lineHits: 1 },
    { line: 2, code: '  const x = 1;', lineHits: 0 },
    { line: 3, code: '  const y = 2;', lineHits: 0 },
    { line: 4, code: '  return x + y;', lineHits: 1 },
    { line: 5, code: '}', lineHits: 1 },
  ];

  const mockAnalysisResult = {
    componentKey: 'project:src/test.ts',
    totalLines: 5,
    executableLines: 5,
    coveredLines: 3,
    uncoveredLines: 2,
    coveragePercentage: 60,
    gaps: [
      {
        startLine: 2,
        endLine: 3,
        type: 'uncovered' as const,
        lines: [
          { line: 2, code: '  const x = 1;', lineHits: 0 },
          { line: 3, code: '  const y = 2;', lineHits: 0 },
        ],
        codeSnippet: '  const x = 1;\n  const y = 2;'
      }
    ],
    summary: '## Coverage Analysis: project:src/test.ts\n\n**Coverage: 60%** (3/5 executable lines)\n\n### Uncovered Code (1 gap)\n\n**Lines 2-3** (uncovered)\n```\n  const x = 1;\n  const y = 2;\n```'
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock validateInput
    const validators = await import('../../shared/validators/mcp-schemas');
    mockValidateInput = vi.mocked(validators.validateInput);
    mockValidateInput.mockImplementation(() => ({
      componentKey: 'project:src/test.ts',
      minGapSize: 1,
      includePartialBranch: true
    }));

    // Mock ProjectManager
    const projectManagerModule = await import('../../universal/project-manager');
    mockProjectManager = {
      getOrCreateConfig: vi.fn(async () => ({
        sonarUrl: 'http://localhost:9000',
        sonarToken: 'test-token',
        sonarProjectKey: 'project'
      })),
      analyzeProject: vi.fn(async () => ({ languages: ['typescript'] }))
    };
    vi.mocked(projectManagerModule.ProjectManager).mockImplementation(function() { return mockProjectManager; });

    // Mock SonarQubeClient
    const sonarModule = await import('../../sonar/index.js');
    mockSonarQubeClient = {
      getLineCoverage: vi.fn(async () => mockLineCoverage)
    };
    vi.mocked(sonarModule.SonarQubeClient).mockImplementation(function() { return mockSonarQubeClient; });

    // Mock CoverageAnalyzer
    const analysisModule = await import('../../core/analysis/index.js');
    mockCoverageAnalyzer = {
      analyzeCoverage: vi.fn(() => mockAnalysisResult),
      findCoverageGaps: vi.fn(() => mockAnalysisResult.gaps)
    };
    vi.mocked(analysisModule.CoverageAnalyzer).mockImplementation(function() { return mockCoverageAnalyzer; });
  });

  describe('Success cases', () => {
    it('should validate input and return coverage analysis', async () => {
      const args = {
        componentKey: 'project:src/test.ts',
        minGapSize: 1,
        includePartialBranch: true
      };

      const result = await handleGetCoverageGaps(args);

      expect(mockValidateInput).toHaveBeenCalledWith(
        expect.anything(),
        args,
        'sonar_get_coverage_gaps'
      );
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Coverage');
    });

    it('should call SonarQube client to get line coverage', async () => {
      await handleGetCoverageGaps({});

      expect(mockSonarQubeClient.getLineCoverage).toHaveBeenCalledWith(
        'project:src/test.ts'
      );
    });

    it('should call CoverageAnalyzer with line coverage data', async () => {
      await handleGetCoverageGaps({});

      expect(mockCoverageAnalyzer.analyzeCoverage).toHaveBeenCalledWith(
        'project:src/test.ts',
        mockLineCoverage
      );
    });

    it('should return summary with coverage percentage', async () => {
      const result = await handleGetCoverageGaps({});

      expect(result.content[0].text).toContain('60%');
    });

    it('should return gap information', async () => {
      const result = await handleGetCoverageGaps({});

      expect(result.content[0].text).toContain('Lines 2-3');
      expect(result.content[0].text).toContain('uncovered');
    });

    it('should pass correlation ID through', async () => {
      const correlationId = 'test-corr-123';
      await handleGetCoverageGaps({}, correlationId);

      // Verify client was created (correlation ID is used internally)
      expect(mockProjectManager.getOrCreateConfig).toHaveBeenCalled();
    });

    it('should handle custom minGapSize', async () => {
      mockValidateInput.mockImplementation(() => ({
        componentKey: 'project:src/test.ts',
        minGapSize: 3,
        includePartialBranch: true
      }));

      await handleGetCoverageGaps({ minGapSize: 3 });

      // CoverageAnalyzer should be called (options are passed internally)
      expect(mockCoverageAnalyzer.analyzeCoverage).toHaveBeenCalled();
    });

    it('should handle includePartialBranch false', async () => {
      mockValidateInput.mockImplementation(() => ({
        componentKey: 'project:src/test.ts',
        minGapSize: 1,
        includePartialBranch: false
      }));

      await handleGetCoverageGaps({ includePartialBranch: false });

      expect(mockCoverageAnalyzer.analyzeCoverage).toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('should handle file with 100% coverage', async () => {
      mockCoverageAnalyzer.analyzeCoverage = vi.fn(() => ({
        componentKey: 'project:src/test.ts',
        totalLines: 5,
        executableLines: 5,
        coveredLines: 5,
        uncoveredLines: 0,
        coveragePercentage: 100,
        gaps: [],
        summary: '## Coverage Analysis: project:src/test.ts\n\n**Coverage: 100%**\n\n✅ **All executable lines are covered!**'
      }));

      const result = await handleGetCoverageGaps({});

      expect(result.content[0].text).toContain('100%');
      expect(result.content[0].text).toContain('All executable lines are covered');
    });

    it('should handle file with no executable lines', async () => {
      mockSonarQubeClient.getLineCoverage = vi.fn(async () => [
        { line: 1, code: '// Comment only file' },
        { line: 2, code: '' },
      ]);

      mockCoverageAnalyzer.analyzeCoverage = vi.fn(() => ({
        componentKey: 'project:src/comments.ts',
        totalLines: 2,
        executableLines: 0,
        coveredLines: 0,
        uncoveredLines: 0,
        coveragePercentage: 100,
        gaps: [],
        summary: '## Coverage Analysis: project:src/comments.ts\n\n**Coverage: 100%** (0/0 executable lines)'
      }));

      const result = await handleGetCoverageGaps({});

      expect(result.content[0].text).toContain('100%');
    });

    it('should handle empty file', async () => {
      mockSonarQubeClient.getLineCoverage = vi.fn(async () => []);

      mockCoverageAnalyzer.analyzeCoverage = vi.fn(() => ({
        componentKey: 'project:src/empty.ts',
        totalLines: 0,
        executableLines: 0,
        coveredLines: 0,
        uncoveredLines: 0,
        coveragePercentage: 100,
        gaps: [],
        summary: '## Coverage Analysis: project:src/empty.ts\n\n**Coverage: 100%**'
      }));

      const result = await handleGetCoverageGaps({});

      expect(result.content[0].text).toContain('Coverage');
    });
  });

  describe('Error handling', () => {
    it('should propagate validation errors', async () => {
      mockValidateInput.mockImplementation(function() {
        throw new Error('Invalid component key');
      });

      await expect(handleGetCoverageGaps({})).rejects.toThrow('Invalid component key');
    });

    it('should handle component not found', async () => {
      mockSonarQubeClient.getLineCoverage = vi.fn(async () => {
        throw new Error("Component 'invalid:key' not found");
      });

      await expect(handleGetCoverageGaps({})).rejects.toThrow('not found');
    });

    it('should handle permission denied', async () => {
      mockSonarQubeClient.getLineCoverage = vi.fn(async () => {
        throw new Error('Permission denied when fetching line coverage');
      });

      await expect(handleGetCoverageGaps({})).rejects.toThrow('Permission denied');
    });

    it('should handle SonarQube API errors', async () => {
      mockSonarQubeClient.getLineCoverage = vi.fn(async () => {
        throw new Error('SonarQube API error');
      });

      await expect(handleGetCoverageGaps({})).rejects.toThrow('SonarQube API error');
    });

    it('should handle network errors', async () => {
      mockSonarQubeClient.getLineCoverage = vi.fn(async () => {
        throw new Error('Network timeout');
      });

      await expect(handleGetCoverageGaps({})).rejects.toThrow('Network timeout');
    });
  });
});
