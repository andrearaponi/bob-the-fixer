import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueAnalyzer } from './IssueAnalyzer';
import { mockIssue, mockSourceCode, mockComponentDetails } from '../../../tests/fixtures/mock-sonar-responses';

// Mock fs/promises for related tests discovery
vi.mock('fs/promises', () => ({
  readdir: vi.fn(async () => []),
}));

// Create mock instances at module level
const mockProjectManager = {
  getOrCreateConfig: vi.fn(() => Promise.resolve()),
  analyzeProject: vi.fn(() => Promise.resolve()),
  getWorkingDirectory: vi.fn(() => '/test/project'),
};

const mockSonarClient = {
  getIssueByKey: vi.fn(() => Promise.resolve(null)),
  getSourceContext: vi.fn(() => Promise.resolve('')),
  getSourceLines: vi.fn(() => Promise.resolve([])),
  getLineCoverage: vi.fn(() => Promise.resolve([])),
  getComponentDetails: vi.fn(() => Promise.resolve({})),
  getSimilarFixedIssues: vi.fn(() => Promise.resolve([])),
  getProjectTestFiles: vi.fn(() => Promise.resolve([])),
};

const mockConfig = {
  sonarProjectKey: 'test-project',
  sonarUrl: 'http://localhost:9000',
  sonarToken: 'sqp_test_token_1234567890',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const mockProjectContext = {
  path: '/test/project',
  name: 'test-project',
  languages: ['typescript'],
  frameworks: ['node'],
  testFrameworks: [],
  buildTools: ['npm'],
  hasTests: false,
  configFiles: [],
};

// Mock modules
vi.mock('../../universal/project-manager', () => ({
  ProjectManager: vi.fn(function() { return mockProjectManager; }),
}));

vi.mock('../../sonar/index', () => ({
  SonarQubeClient: vi.fn(function() { return mockSonarClient; }),
}));

vi.mock('../../shared/logger/structured-logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(() => {}),
    debug: vi.fn(() => {}),
    warn: vi.fn(() => {}),
    error: vi.fn(() => {}),
  })),
}));

// Mock utility functions
vi.mock('../../shared/utils/issue-details-utils', () => ({
  buildIssueDetailsReport: vi.fn(() => Promise.resolve('Detailed issue report')),
  buildIssueBasicInfo: vi.fn(() => ''),
  buildIssueLocation: vi.fn(() => ''),
  buildRuleInformation: vi.fn(() => ''),
  buildSourceContext: vi.fn(() => ''),
  buildFileMetrics: vi.fn(() => ''),
  buildAdditionalFields: vi.fn(() => ''),
  buildNextSteps: vi.fn(() => ''),
  detectLanguageFromFile: vi.fn(() => 'typescript'),
}));

describe('IssueAnalyzer', () => {
  let analyzer: IssueAnalyzer;

  beforeEach(() => {
    // Reset function call history but keep implementations
    vi.mocked(mockProjectManager.getOrCreateConfig).mockClear();
    vi.mocked(mockProjectManager.analyzeProject).mockClear();
    vi.mocked(mockProjectManager.getWorkingDirectory).mockClear();
    vi.mocked(mockSonarClient.getIssueByKey).mockClear();
    vi.mocked(mockSonarClient.getSourceContext).mockClear();
    vi.mocked(mockSonarClient.getSourceLines).mockClear();
    vi.mocked(mockSonarClient.getLineCoverage).mockClear();
    vi.mocked(mockSonarClient.getComponentDetails).mockClear();
    vi.mocked(mockSonarClient.getSimilarFixedIssues).mockClear();
    vi.mocked(mockSonarClient.getProjectTestFiles).mockClear();

    // Set default return values
    mockProjectManager.getOrCreateConfig = vi.fn(async () => mockConfig);
    mockProjectManager.analyzeProject = vi.fn(async () => mockProjectContext);
    mockSonarClient.getIssueByKey = vi.fn(async () => mockIssue);
    mockSonarClient.getSourceContext = vi.fn(async () => mockSourceCode.sources);
    mockSonarClient.getSourceLines = vi.fn(async () => mockSourceCode.sources);
    mockSonarClient.getLineCoverage = vi.fn(async () => []);
    mockSonarClient.getComponentDetails = vi.fn(async () => mockComponentDetails);
    mockSonarClient.getSimilarFixedIssues = vi.fn(async () => []);
    mockSonarClient.getProjectTestFiles = vi.fn(async () => []);

    analyzer = new IssueAnalyzer(mockProjectManager as any);
  });

  describe('Constructor', () => {
    it('should create analyzer instance with project manager', () => {
      const instance = new IssueAnalyzer(mockProjectManager as any);
      expect(instance).toBeDefined();
    });
  });

  describe('getIssueDetails - success cases', () => {
    it('should get issue details successfully with default options', async () => {
      const options = { issueKey: 'AX123-issue-key' };
      const result = await analyzer.getIssueDetails(options);

      expect(result).toBe('Detailed issue report');
      expect(mockProjectManager.getOrCreateConfig).toHaveBeenCalled();
      expect(mockProjectManager.analyzeProject).toHaveBeenCalled();
      expect(mockSonarClient.getIssueByKey).toHaveBeenCalled();
    });

    it('should fetch source context with default contextLines of 10', async () => {
      const options = { issueKey: 'AX123-issue-key' };
      await analyzer.getIssueDetails(options);

      expect(mockSonarClient.getSourceContext).toHaveBeenCalledWith(
        'test-project:src/main.ts',
        42,
        10
      );
    });

    it('should fetch file header by default (first 60 lines)', async () => {
      const options = { issueKey: 'AX123-issue-key' };
      await analyzer.getIssueDetails(options);

      expect(mockSonarClient.getSourceLines).toHaveBeenCalledWith(
        'test-project:src/main.ts',
        1,
        60,
        expect.objectContaining({ bestEffort: true })
      );
    });

    it('should skip file header when includeFileHeader is false', async () => {
      const options = { issueKey: 'AX123-issue-key', includeFileHeader: false };
      await analyzer.getIssueDetails(options);

      expect(mockSonarClient.getSourceLines).not.toHaveBeenCalled();
    });

    it('should include data flow when flows are present and includeDataFlow is auto', async () => {
      const issueWithFlow = {
        ...mockIssue,
        flows: [
          {
            locations: [
              {
                component: 'test-project:src/request.ts',
                textRange: { startLine: 10, endLine: 10, startOffset: 0, endOffset: 0 },
                msg: 'SOURCE'
              },
              {
                component: 'test-project:src/db.ts',
                textRange: { startLine: 42, endLine: 42, startOffset: 0, endOffset: 0 },
                msg: 'SINK'
              }
            ]
          }
        ]
      };

      mockSonarClient.getIssueByKey = vi.fn(async () => issueWithFlow as any);
      mockSonarClient.getSourceLines = vi.fn(async () => mockSourceCode.sources as any);

      await analyzer.getIssueDetails({
        issueKey: 'AX123-issue-key',
        includeFileHeader: false,
        includeDataFlow: 'auto',
        flowContextLines: 3
      });

      expect(mockSonarClient.getSourceLines).toHaveBeenCalledWith(
        'test-project:src/request.ts',
        7,
        13,
        expect.objectContaining({ bestEffort: true })
      );
      expect(mockSonarClient.getSourceLines).toHaveBeenCalledWith(
        'test-project:src/db.ts',
        39,
        45,
        expect.objectContaining({ bestEffort: true })
      );

      const { buildIssueDetailsReport } = await import('../../shared/utils/issue-details-utils');
      const calls = vi.mocked(buildIssueDetailsReport).mock.calls;
      const optionsArg = calls[calls.length - 1][4] as any;
      expect(optionsArg.dataFlowSection).toContain('DATA FLOW');
    });

    it('should not include data flow when includeDataFlow is false', async () => {
      const issueWithFlow = {
        ...mockIssue,
        flows: [
          {
            locations: [
              {
                component: 'test-project:src/request.ts',
                textRange: { startLine: 10, endLine: 10, startOffset: 0, endOffset: 0 },
                msg: 'SOURCE'
              }
            ]
          }
        ]
      };

      mockSonarClient.getIssueByKey = vi.fn(async () => issueWithFlow as any);
      mockSonarClient.getSourceLines = vi.fn(async () => mockSourceCode.sources as any);

      await analyzer.getIssueDetails({
        issueKey: 'AX123-issue-key',
        includeFileHeader: false,
        includeDataFlow: false
      });

      expect(mockSonarClient.getSourceLines).not.toHaveBeenCalled();
    });

    it('should include similar FIXED issues when includeSimilarFixed is true', async () => {
      mockSonarClient.getSimilarFixedIssues = vi.fn(async () => ([
        {
          key: 'fixed-1',
          component: 'test-project:src/a.ts',
          line: 10,
          message: 'Fixed issue example',
          closeDate: '2024-01-01T00:00:00+0000'
        }
      ] as any));

      await analyzer.getIssueDetails({
        issueKey: 'AX123-issue-key',
        includeFileHeader: false,
        includeDataFlow: false,
        includeSimilarFixed: true,
        maxSimilarIssues: 1
      });

      expect(mockSonarClient.getSimilarFixedIssues).toHaveBeenCalledWith(
        'typescript:S1234',
        2
      );

      const { buildIssueDetailsReport } = await import('../../shared/utils/issue-details-utils');
      const calls = vi.mocked(buildIssueDetailsReport).mock.calls;
      const optionsArg = calls[calls.length - 1][4] as any;
      expect(optionsArg.similarFixedSection).toContain('SIMILAR FIXED ISSUES');
      expect(optionsArg.similarFixedSection).toContain('fixed-1');
    });

    it('should include related tests and coverage hints when includeRelatedTests is true', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.readdir).mockImplementation(async (dirPath: any) => {
        if (String(dirPath) === '/test/project/src') return ['main.test.ts', 'other.ts'] as any;
        return [] as any;
      });

      mockSonarClient.getLineCoverage = vi.fn(async () => ([
        { line: 42, code: '<span>ignored</span>', lineHits: 0, conditions: 2, coveredConditions: 1 }
      ] as any));

      await analyzer.getIssueDetails({
        issueKey: 'AX123-issue-key',
        includeFileHeader: false,
        includeDataFlow: false,
        includeRelatedTests: true
      });

      const { buildIssueDetailsReport } = await import('../../shared/utils/issue-details-utils');
      const calls = vi.mocked(buildIssueDetailsReport).mock.calls;
      const optionsArg = calls[calls.length - 1][4] as any;
      expect(optionsArg.relatedTestsSection).toContain('RELATED TESTS');
      expect(optionsArg.relatedTestsSection).toContain('src/main.test.ts');
      expect(optionsArg.relatedTestsSection).toContain('COVERAGE HINTS');
      expect(optionsArg.relatedTestsSection).toContain('NOT COVERED');
      expect(optionsArg.relatedTestsSection).toContain('Branch coverage: 1/2');
    });

    it('should include SCM hints when includeScmHints is true', async () => {
      mockSonarClient.getLineCoverage = vi.fn(async () => ([
        { line: 42, code: '<span>ignored</span>', scmAuthor: 'dev1', scmDate: '2024-01-01', scmRevision: 'abc123' }
      ] as any));

      await analyzer.getIssueDetails({
        issueKey: 'AX123-issue-key',
        includeFileHeader: false,
        includeDataFlow: false,
        includeScmHints: true
      });

      const { buildIssueDetailsReport } = await import('../../shared/utils/issue-details-utils');
      const calls = vi.mocked(buildIssueDetailsReport).mock.calls;
      const optionsArg = calls[calls.length - 1][4] as any;
      expect(optionsArg.scmHintsSection).toContain('SCM HINTS');
      expect(optionsArg.scmHintsSection).toContain('dev1');
      expect(optionsArg.scmHintsSection).toContain('abc123');
    });

    it('should fetch source context with custom contextLines', async () => {
      const options = {
        issueKey: 'AX123-issue-key',
        contextLines: 5,
      };
      await analyzer.getIssueDetails(options);

      expect(mockSonarClient.getSourceContext).toHaveBeenCalledWith(
        'test-project:src/main.ts',
        42,
        5
      );
    });

    it('should handle contextLines larger than line number (minimum line 1)', async () => {
      const issueAtLine5 = { ...mockIssue, line: 5 };
      mockSonarClient.getIssueByKey = vi.fn(async () => issueAtLine5);

      const options = {
        issueKey: 'AX123-issue-key',
        contextLines: 10,
      };
      await analyzer.getIssueDetails(options);

      expect(mockSonarClient.getSourceContext).toHaveBeenCalledWith(
        'test-project:src/main.ts',
        5,
        10
      );
    });

    it('should handle issue without line number (defaults to line 1)', async () => {
      const issueWithoutLine = { ...mockIssue, line: undefined };
      mockSonarClient.getIssueByKey = vi.fn(async () => issueWithoutLine);

      const options = { issueKey: 'AX123-issue-key' };
      await analyzer.getIssueDetails(options);

      expect(mockSonarClient.getSourceContext).toHaveBeenCalledWith(
        'test-project:src/main.ts',
        1,
        10
      );
    });

    it('should pass includeRuleDetails option (default true)', async () => {
      const { buildIssueDetailsReport } = await import('../../shared/utils/issue-details-utils');

      const options = { issueKey: 'AX123-issue-key' };
      await analyzer.getIssueDetails(options);

      expect(buildIssueDetailsReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          includeRuleDetails: true,
        }),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it('should pass includeRuleDetails option when explicitly false', async () => {
      const { buildIssueDetailsReport } = await import('../../shared/utils/issue-details-utils');

      const options = {
        issueKey: 'AX123-issue-key',
        includeRuleDetails: false,
      };
      await analyzer.getIssueDetails(options);

      expect(buildIssueDetailsReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          includeRuleDetails: false,
        }),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it('should pass includeFilePath option (default true)', async () => {
      const { buildIssueDetailsReport } = await import('../../shared/utils/issue-details-utils');

      const options = { issueKey: 'AX123-issue-key' };
      await analyzer.getIssueDetails(options);

      expect(buildIssueDetailsReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          includeFilePath: true,
        }),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it('should fetch component details successfully', async () => {
      const options = { issueKey: 'AX123-issue-key' };
      await analyzer.getIssueDetails(options);

      expect(mockSonarClient.getComponentDetails).toHaveBeenCalledWith(
        'test-project:src/main.ts'
      );
    });

    it('should gracefully handle component details fetch failure', async () => {
      mockSonarClient.getComponentDetails = vi.fn(async () => {
        throw new Error('Component not found');
      });

      const options = { issueKey: 'AX123-issue-key' };
      const result = await analyzer.getIssueDetails(options);

      // Should not throw, should continue with null component details
      expect(result).toBe('Detailed issue report');
    });

    it('should pass correlationId through logging', async () => {
      const options = { issueKey: 'AX123-issue-key' };
      const correlationId = 'test-correlation-123';

      await analyzer.getIssueDetails(options, correlationId);

      // Just verify it doesn't throw
      expect(mockSonarClient.getIssueByKey).toHaveBeenCalled();
    });
  });

  describe('getIssueDetails - error cases', () => {
    it('should throw error when issue not found', async () => {
      mockSonarClient.getIssueByKey = vi.fn(async () => null);

      const options = { issueKey: 'AX123-issue-key' };

      await expect(analyzer.getIssueDetails(options)).rejects.toThrow(
        'Issue AX123-issue-key not found'
      );
    });

    it('should throw error when no issues exist', async () => {
      mockSonarClient.getIssueByKey = vi.fn(async () => null);

      const options = { issueKey: 'AX123-issue-key' };

      await expect(analyzer.getIssueDetails(options)).rejects.toThrow(
        'Issue AX123-issue-key not found'
      );
    });

    it('should handle getOrCreateConfig errors', async () => {
      mockProjectManager.getOrCreateConfig = vi.fn(async () => {
        throw new Error('Config not found');
      });

      const options = { issueKey: 'AX123-issue-key' };

      await expect(analyzer.getIssueDetails(options)).rejects.toThrow(
        'Config not found'
      );
    });

    it('should handle analyzeProject errors', async () => {
      mockProjectManager.analyzeProject = vi.fn(async () => {
        throw new Error('Project analysis failed');
      });

      const options = { issueKey: 'AX123-issue-key' };

      await expect(analyzer.getIssueDetails(options)).rejects.toThrow(
        'Project analysis failed'
      );
    });

    it('should handle getIssueByKey API errors', async () => {
      mockSonarClient.getIssueByKey = vi.fn(async () => {
        throw new Error('SonarQube API error');
      });

      const options = { issueKey: 'AX123-issue-key' };

      await expect(analyzer.getIssueDetails(options)).rejects.toThrow(
        'SonarQube API error'
      );
    });

    it('should handle getSourceContext errors', async () => {
      mockSonarClient.getSourceContext = vi.fn(async () => {
        throw new Error('Source not found');
      });

      const options = { issueKey: 'AX123-issue-key' };

      await expect(analyzer.getIssueDetails(options)).rejects.toThrow(
        'Source not found'
      );
    });
  });

  describe('Options combinations', () => {
    it('should handle all options together', async () => {
      const options = {
        issueKey: 'AX123-issue-key',
        contextLines: 15,
        includeRuleDetails: true,
        includeCodeExamples: true,
        includeFilePath: true,
      };

      const result = await analyzer.getIssueDetails(options);

      expect(result).toBe('Detailed issue report');
      expect(mockSonarClient.getSourceContext).toHaveBeenCalledWith(
        'test-project:src/main.ts',
        42,
        15
      );
    });

    it('should handle minimal options', async () => {
      const options = {
        issueKey: 'AX123-issue-key',
        includeRuleDetails: false,
        includeFilePath: false,
      };

      const result = await analyzer.getIssueDetails(options);
      expect(result).toBe('Detailed issue report');
    });
  });
});
