import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueAnalyzer } from './IssueAnalyzer';
import { mockIssue, mockSourceCode, mockComponentDetails } from '../../../tests/fixtures/mock-sonar-responses';

// Create mock instances at module level
const mockProjectManager = {
  getOrCreateConfig: vi.fn(() => Promise.resolve()),
  analyzeProject: vi.fn(() => Promise.resolve()),
  getWorkingDirectory: vi.fn(() => '/test/project'),
};

const mockSonarClient = {
  getIssues: vi.fn(() => Promise.resolve([])),
  getSourceContext: vi.fn(() => Promise.resolve('')),
  getComponentDetails: vi.fn(() => Promise.resolve({})),
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
}));

describe('IssueAnalyzer', () => {
  let analyzer: IssueAnalyzer;

  beforeEach(() => {
    // Reset function call history but keep implementations
    vi.mocked(mockProjectManager.getOrCreateConfig).mockClear();
    vi.mocked(mockProjectManager.analyzeProject).mockClear();
    vi.mocked(mockProjectManager.getWorkingDirectory).mockClear();
    vi.mocked(mockSonarClient.getIssues).mockClear();
    vi.mocked(mockSonarClient.getSourceContext).mockClear();
    vi.mocked(mockSonarClient.getComponentDetails).mockClear();

    // Set default return values
    mockProjectManager.getOrCreateConfig = vi.fn(async () => mockConfig);
    mockProjectManager.analyzeProject = vi.fn(async () => mockProjectContext);
    mockSonarClient.getIssues = vi.fn(async () => [mockIssue]);
    mockSonarClient.getSourceContext = vi.fn(async () => mockSourceCode.sources);
    mockSonarClient.getComponentDetails = vi.fn(async () => mockComponentDetails);

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
      expect(mockSonarClient.getIssues).toHaveBeenCalled();
    });

    it('should fetch source context with default contextLines of 10', async () => {
      const options = { issueKey: 'AX123-issue-key' };
      await analyzer.getIssueDetails(options);

      expect(mockSonarClient.getSourceContext).toHaveBeenCalledWith(
        'test-project:src/main.ts',
        32, // line 42 - 10
        52  // line 42 + 10
      );
    });

    it('should fetch source context with custom contextLines', async () => {
      const options = {
        issueKey: 'AX123-issue-key',
        contextLines: 5,
      };
      await analyzer.getIssueDetails(options);

      expect(mockSonarClient.getSourceContext).toHaveBeenCalledWith(
        'test-project:src/main.ts',
        37, // line 42 - 5
        47  // line 42 + 5
      );
    });

    it('should handle contextLines larger than line number (minimum line 1)', async () => {
      const issueAtLine5 = { ...mockIssue, line: 5 };
      mockSonarClient.getIssues = vi.fn(async () => [issueAtLine5]);

      const options = {
        issueKey: 'AX123-issue-key',
        contextLines: 10,
      };
      await analyzer.getIssueDetails(options);

      expect(mockSonarClient.getSourceContext).toHaveBeenCalledWith(
        'test-project:src/main.ts',
        1,  // Math.max(1, 5-10) = 1
        15  // 5 + 10
      );
    });

    it('should handle issue without line number (defaults to line 1)', async () => {
      const issueWithoutLine = { ...mockIssue, line: undefined };
      mockSonarClient.getIssues = vi.fn(async () => [issueWithoutLine]);

      const options = { issueKey: 'AX123-issue-key' };
      await analyzer.getIssueDetails(options);

      expect(mockSonarClient.getSourceContext).toHaveBeenCalledWith(
        'test-project:src/main.ts',
        1,  // Math.max(1, 1-10) = 1
        11  // 1 + 10
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
      expect(mockSonarClient.getIssues).toHaveBeenCalled();
    });
  });

  describe('getIssueDetails - error cases', () => {
    it('should throw error when issue not found', async () => {
      mockSonarClient.getIssues = vi.fn(async () => [
        { ...mockIssue, key: 'different-key' },
      ]);

      const options = { issueKey: 'AX123-issue-key' };

      await expect(analyzer.getIssueDetails(options)).rejects.toThrow(
        'Issue AX123-issue-key not found'
      );
    });

    it('should throw error when no issues exist', async () => {
      mockSonarClient.getIssues = vi.fn(async () => []);

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

    it('should handle getIssues API errors', async () => {
      mockSonarClient.getIssues = vi.fn(async () => {
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

  describe('Multiple issues in response', () => {
    it('should find correct issue from multiple issues', async () => {
      mockSonarClient.getIssues = vi.fn(async () => [
        { ...mockIssue, key: 'issue-1' },
        { ...mockIssue, key: 'AX123-issue-key' }, // Target issue
        { ...mockIssue, key: 'issue-3' },
      ]);

      const options = { issueKey: 'AX123-issue-key' };
      const result = await analyzer.getIssueDetails(options);

      expect(result).toBe('Detailed issue report');
      expect(mockSonarClient.getSourceContext).toHaveBeenCalledWith(
        'test-project:src/main.ts',
        expect.any(Number),
        expect.any(Number)
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
        27, // 42 - 15
        57  // 42 + 15
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
