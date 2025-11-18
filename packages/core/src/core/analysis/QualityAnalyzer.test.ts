import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QualityAnalyzer } from './QualityAnalyzer';
import {
  mockQualityGate,
  mockQualityGateFailed,
  mockMetrics,
  mockComponentTree,
} from '../../../tests/fixtures/mock-sonar-responses';

// Create mock instances at module level
const mockProjectManager = {
  getOrCreateConfig: vi.fn(() => Promise.resolve()),
  analyzeProject: vi.fn(() => Promise.resolve()),
};

const mockSonarClient = {
  getQualityGateStatus: vi.fn(() => Promise.resolve()),
  getProjectMetrics: vi.fn(() => Promise.resolve()),
  getTechnicalDebtAnalysis: vi.fn(() => Promise.resolve()),
  getDuplicationSummary: vi.fn(() => Promise.resolve()),
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

const mockTechnicalDebtAnalysis = {
  totalDebt: '2h 30min',
  debtRatio: 2.5,
  issues: [
    { severity: 'MAJOR', type: 'CODE_SMELL', effort: '30min' },
    { severity: 'CRITICAL', type: 'BUG', effort: '2h' },
  ],
  breakdown: {
    byType: { CODE_SMELL: 1, BUG: 1 },
    bySeverity: { MAJOR: 1, CRITICAL: 1 },
  },
};

const mockDuplicationSummary = {
  totalFiles: 5,
  duplicatedLines: 125,
  duplicatedBlocks: 8,
  filesWithDuplication: mockComponentTree,
  recommendations: [
    '- Consider extracting duplicated code into reusable functions',
    '- Review files with >50% duplication as high priority',
  ],
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

// Mock report builder functions
vi.mock('../../reports/project-metrics-report', () => ({
  buildMetricsMap: vi.fn((measures) => {
    const map: Record<string, string> = {};
    measures.forEach((m: any) => {
      map[m.metric] = m.value;
    });
    return map;
  }),
  buildProjectMetricsReport: vi.fn(() => 'Project metrics report'),
}));

vi.mock('../../reports/technical-debt-report', () => ({
  buildDebtOverview: vi.fn(() => 'Debt overview\n'),
  buildDebtBreakdown: vi.fn(() => 'Debt breakdown\n'),
  buildBudgetAnalysis: vi.fn(() => 'Budget analysis\n'),
  buildRecommendationsSection: vi.fn(() => 'Recommendations\n'),
  buildROIAnalysis: vi.fn(() => 'ROI analysis\n'),
}));

describe('QualityAnalyzer', () => {
  let analyzer: QualityAnalyzer;

  beforeEach(() => {
    // Reset and set default return values
    mockProjectManager.getOrCreateConfig = vi.fn(async () => mockConfig);
    mockProjectManager.analyzeProject = vi.fn(async () => mockProjectContext);
    mockSonarClient.getQualityGateStatus = vi.fn(async () => mockQualityGate.projectStatus);
    mockSonarClient.getProjectMetrics = vi.fn(async () => mockMetrics);
    mockSonarClient.getTechnicalDebtAnalysis = vi.fn(async () => mockTechnicalDebtAnalysis);
    mockSonarClient.getDuplicationSummary = vi.fn(async () => mockDuplicationSummary);

    analyzer = new QualityAnalyzer(mockProjectManager as any);
  });

  describe('Constructor', () => {
    it('should create analyzer instance with project manager', () => {
      const instance = new QualityAnalyzer(mockProjectManager as any);
      expect(instance).toBeDefined();
    });
  });

  describe('getQualityGate - success cases', () => {
    it('should get quality gate status successfully', async () => {
      const result = await analyzer.getQualityGate();

      expect(result).toContain('QUALITY GATE STATUS');
      expect(result).toContain('PASSED');
      expect(mockSonarClient.getQualityGateStatus).toHaveBeenCalled();
    });

    it('should display passed status with success icon', async () => {
      const result = await analyzer.getQualityGate();

      expect(result).toContain('✅');
      expect(result).toContain('PASSED');
    });

    it('should display failed status with error icon', async () => {
      mockSonarClient.getQualityGateStatus = vi.fn(async () =>
        mockQualityGateFailed.projectStatus
      );

      const result = await analyzer.getQualityGate();

      expect(result).toContain('❌');
      expect(result).toContain('FAILED');
    });

    it('should display warning status with warning icon', async () => {
      mockSonarClient.getQualityGateStatus = vi.fn(async () => ({
        status: 'WARN',
        conditions: [],
      }));

      const result = await analyzer.getQualityGate();

      expect(result).toContain('⚠️');
      expect(result).toContain('WARNING');
    });

    it('should display conditions when available', async () => {
      const result = await analyzer.getQualityGate();

      expect(result).toContain('CONDITIONS:');
      expect(result).toContain('new_coverage');
      expect(result).toContain('new_bugs');
    });

    it('should display condition details', async () => {
      const result = await analyzer.getQualityGate();

      expect(result).toContain('Comparator:');
      expect(result).toContain('Actual Value:');
      expect(result).toContain('Error Threshold:');
    });

    it('should display warning threshold when available', async () => {
      mockSonarClient.getQualityGateStatus = vi.fn(async () => ({
        status: 'OK',
        conditions: [
          {
            status: 'OK',
            metricKey: 'coverage',
            comparator: 'LT',
            actualValue: '85.0',
            errorThreshold: '70',
            warningThreshold: '80',
          },
        ],
      }));

      const result = await analyzer.getQualityGate();

      expect(result).toContain('Warning Threshold: 80');
    });

    it('should display period information when available', async () => {
      mockSonarClient.getQualityGateStatus = vi.fn(async () => ({
        status: 'OK',
        conditions: [],
        period: {
          mode: 'previous_version',
          date: '2024-01-01T00:00:00+0000',
        },
      }));

      const result = await analyzer.getQualityGate();

      expect(result).toContain('PERIOD:');
      expect(result).toContain('Mode:');
      expect(result).toContain('Date:');
    });

    it('should display period parameter when available', async () => {
      mockSonarClient.getQualityGateStatus = vi.fn(async () => ({
        status: 'OK',
        conditions: [],
        period: {
          mode: 'previous_version',
          date: '2024-01-01T00:00:00+0000',
          parameter: '1.0.0',
        },
      }));

      const result = await analyzer.getQualityGate();

      expect(result).toContain('Parameter:');
    });

    it('should display CAYC status when available', async () => {
      mockSonarClient.getQualityGateStatus = vi.fn(async () => ({
        status: 'OK',
        conditions: [],
        caycStatus: 'compliant',
      }));

      const result = await analyzer.getQualityGate();

      expect(result).toContain('Clean as You Code Status: compliant');
    });

    it('should handle quality gate without conditions', async () => {
      mockSonarClient.getQualityGateStatus = vi.fn(async () => ({
        status: 'OK',
        conditions: [],
      }));

      const result = await analyzer.getQualityGate();

      expect(result).toContain('QUALITY GATE STATUS');
      expect(result).not.toContain('CONDITIONS:');
    });

    it('should pass correlationId through logging', async () => {
      const correlationId = 'test-correlation-123';
      await analyzer.getQualityGate(correlationId);

      expect(mockSonarClient.getQualityGateStatus).toHaveBeenCalled();
    });
  });

  describe('getQualityGate - error cases', () => {
    it('should handle getOrCreateConfig errors', async () => {
      mockProjectManager.getOrCreateConfig = vi.fn(async () => {
        throw new Error('Config not found');
      });

      await expect(analyzer.getQualityGate()).rejects.toThrow(
        'Config not found'
      );
    });

    it('should handle SonarQube API errors', async () => {
      mockSonarClient.getQualityGateStatus = vi.fn(async () => {
        throw new Error('API error');
      });

      await expect(analyzer.getQualityGate()).rejects.toThrow('API error');
    });
  });

  describe('getProjectMetrics - success cases', () => {
    it('should get project metrics with default metrics', async () => {
      const options = {};
      const result = await analyzer.getProjectMetrics(options);

      expect(result).toBe('Project metrics report');
      expect(mockSonarClient.getProjectMetrics).toHaveBeenCalledWith(undefined);
    });

    it('should get project metrics with specific metrics', async () => {
      const options = {
        metrics: ['bugs', 'vulnerabilities', 'code_smells'],
      };
      await analyzer.getProjectMetrics(options);

      expect(mockSonarClient.getProjectMetrics).toHaveBeenCalledWith([
        'bugs',
        'vulnerabilities',
        'code_smells',
      ]);
    });

    it('should build metrics map from response', async () => {
      const { buildMetricsMap } = await import('../../reports/project-metrics-report');

      await analyzer.getProjectMetrics({});

      expect(buildMetricsMap).toHaveBeenCalledWith(mockMetrics.component.measures);
    });

    it('should build project metrics report', async () => {
      const { buildProjectMetricsReport } = await import('../../reports/project-metrics-report');

      await analyzer.getProjectMetrics({});

      expect(buildProjectMetricsReport).toHaveBeenCalledWith(
        'test-project',
        'Test Project',
        expect.any(Object)
      );
    });

    it('should pass correlationId through logging', async () => {
      const correlationId = 'test-correlation-123';
      await analyzer.getProjectMetrics({}, correlationId);

      expect(mockSonarClient.getProjectMetrics).toHaveBeenCalled();
    });
  });

  describe('getProjectMetrics - error cases', () => {
    it('should handle getOrCreateConfig errors', async () => {
      mockProjectManager.getOrCreateConfig = vi.fn(async () => {
        throw new Error('Config not found');
      });

      await expect(analyzer.getProjectMetrics({})).rejects.toThrow(
        'Config not found'
      );
    });

    it('should handle SonarQube API errors', async () => {
      mockSonarClient.getProjectMetrics = vi.fn(async () => {
        throw new Error('Metrics not found');
      });

      await expect(analyzer.getProjectMetrics({})).rejects.toThrow(
        'Metrics not found'
      );
    });
  });

  describe('getTechnicalDebt - success cases', () => {
    it('should get technical debt with default options', async () => {
      const options = {};
      const result = await analyzer.getTechnicalDebt(options);

      expect(result).toContain('TECHNICAL DEBT ANALYSIS');
      expect(result).toContain('Debt overview');
      expect(result).toContain('Debt breakdown');
      expect(result).toContain('Budget analysis');
      expect(result).toContain('Recommendations');
      expect(result).toContain('ROI analysis');
      expect(mockSonarClient.getTechnicalDebtAnalysis).toHaveBeenCalled();
    });

    it('should include budget analysis by default', async () => {
      const { buildBudgetAnalysis } = await import('../../reports/technical-debt-report');

      await analyzer.getTechnicalDebt({});

      expect(buildBudgetAnalysis).toHaveBeenCalledWith(
        mockTechnicalDebtAnalysis,
        true
      );
    });

    it('should exclude budget analysis when explicitly disabled', async () => {
      const { buildBudgetAnalysis } = await import('../../reports/technical-debt-report');

      await analyzer.getTechnicalDebt({ includeBudgetAnalysis: false });

      expect(buildBudgetAnalysis).toHaveBeenCalledWith(
        mockTechnicalDebtAnalysis,
        false
      );
    });

    it('should call all report builder functions', async () => {
      const {
        buildDebtOverview,
        buildDebtBreakdown,
        buildBudgetAnalysis,
        buildRecommendationsSection,
        buildROIAnalysis,
      } = await import('../../reports/technical-debt-report');

      await analyzer.getTechnicalDebt({});

      expect(buildDebtOverview).toHaveBeenCalledWith(mockTechnicalDebtAnalysis);
      expect(buildDebtBreakdown).toHaveBeenCalledWith(mockTechnicalDebtAnalysis);
      expect(buildBudgetAnalysis).toHaveBeenCalledWith(mockTechnicalDebtAnalysis, true);
      expect(buildRecommendationsSection).toHaveBeenCalledWith(mockTechnicalDebtAnalysis);
      expect(buildROIAnalysis).toHaveBeenCalledWith(mockTechnicalDebtAnalysis);
    });

    it('should pass correlationId through logging', async () => {
      const correlationId = 'test-correlation-123';
      await analyzer.getTechnicalDebt({}, correlationId);

      expect(mockSonarClient.getTechnicalDebtAnalysis).toHaveBeenCalled();
    });
  });

  describe('getTechnicalDebt - error cases', () => {
    it('should handle getOrCreateConfig errors', async () => {
      mockProjectManager.getOrCreateConfig = vi.fn(async () => {
        throw new Error('Config not found');
      });

      await expect(analyzer.getTechnicalDebt({})).rejects.toThrow(
        'Config not found'
      );
    });

    it('should handle analyzeProject errors', async () => {
      mockProjectManager.analyzeProject = vi.fn(async () => {
        throw new Error('Analysis failed');
      });

      await expect(analyzer.getTechnicalDebt({})).rejects.toThrow(
        'Analysis failed'
      );
    });

    it('should handle SonarQube API errors', async () => {
      mockSonarClient.getTechnicalDebtAnalysis = vi.fn(async () => {
        throw new Error('Debt analysis failed');
      });

      await expect(analyzer.getTechnicalDebt({})).rejects.toThrow(
        'Debt analysis failed'
      );
    });
  });

  describe('getDuplicationSummary - success cases', () => {
    it('should get duplication summary with default options', async () => {
      const options = {};
      const result = await analyzer.getDuplicationSummary(options);

      expect(result).toContain('CODE DUPLICATION SUMMARY');
      expect(result).toContain('OVERVIEW:');
      expect(result).toContain('Files with duplication: 5');
      expect(result).toContain('Total duplicated lines: 125');
      expect(result).toContain('Total duplicated blocks: 8');
      expect(mockSonarClient.getDuplicationSummary).toHaveBeenCalled();
    });

    it('should display files with duplication sorted by density by default', async () => {
      const result = await analyzer.getDuplicationSummary({});

      expect(result).toContain('FILES WITH DUPLICATION (sorted by duplication density');
    });

    it('should sort by lines when requested', async () => {
      const result = await analyzer.getDuplicationSummary({ sortBy: 'lines' });

      expect(result).toContain('sorted by duplicated lines');
    });

    it('should sort by blocks when requested', async () => {
      const result = await analyzer.getDuplicationSummary({ sortBy: 'blocks' });

      expect(result).toContain('sorted by duplicated blocks');
    });

    it('should limit results to maxResults (default 10)', async () => {
      const result = await analyzer.getDuplicationSummary({});

      expect(result).toContain('showing top 10');
    });

    it('should respect custom maxResults', async () => {
      const result = await analyzer.getDuplicationSummary({ maxResults: 5 });

      expect(result).toContain('showing top 5');
    });

    it('should display file duplication details', async () => {
      const result = await analyzer.getDuplicationSummary({});

      expect(result).toContain('src/main.ts');
      expect(result).toContain('Duplication:');
      expect(result).toContain('Duplicated lines:');
      expect(result).toContain('Duplicated blocks:');
      expect(result).toContain('Key:');
    });

    it('should show priority indicator for high duplication (>50%)', async () => {
      mockSonarClient.getDuplicationSummary = vi.fn(async () => ({
        ...mockDuplicationSummary,
        filesWithDuplication: {
          components: [
            {
              key: 'test-file',
              path: 'src/high.ts',
              measures: [
                { metric: 'duplicated_lines_density', value: '60.0' },
              ],
            },
          ],
        },
      }));

      const result = await analyzer.getDuplicationSummary({});

      expect(result).toContain('🔴'); // Red priority
    });

    it('should show priority indicator for medium duplication (20-50%)', async () => {
      mockSonarClient.getDuplicationSummary = vi.fn(async () => ({
        ...mockDuplicationSummary,
        filesWithDuplication: {
          components: [
            {
              key: 'test-file',
              path: 'src/medium.ts',
              measures: [
                { metric: 'duplicated_lines_density', value: '30.0' },
              ],
            },
          ],
        },
      }));

      const result = await analyzer.getDuplicationSummary({});

      expect(result).toContain('🟡'); // Yellow priority
    });

    it('should show priority indicator for low duplication (<20%)', async () => {
      const result = await analyzer.getDuplicationSummary({});

      expect(result).toContain('🟢'); // Green priority
    });

    it('should display recommendations when available', async () => {
      const result = await analyzer.getDuplicationSummary({});

      expect(result).toContain('RECOMMENDATIONS:');
      expect(result).toContain('extracting duplicated code');
      expect(result).toContain('Review files with >50%');
    });

    it('should handle empty recommendations', async () => {
      mockSonarClient.getDuplicationSummary = vi.fn(async () => ({
        ...mockDuplicationSummary,
        recommendations: [],
      }));

      const result = await analyzer.getDuplicationSummary({});

      expect(result).not.toContain('RECOMMENDATIONS:');
    });

    it('should handle no files with duplication', async () => {
      mockSonarClient.getDuplicationSummary = vi.fn(async () => ({
        totalFiles: 0,
        duplicatedLines: 0,
        duplicatedBlocks: 0,
        filesWithDuplication: { components: [] },
        recommendations: [],
      }));

      const result = await analyzer.getDuplicationSummary({});

      expect(result).toContain('Files with duplication: 0');
      expect(result).not.toContain('FILES WITH DUPLICATION (sorted');
    });

    it('should filter out files without measures', async () => {
      mockSonarClient.getDuplicationSummary = vi.fn(async () => ({
        ...mockDuplicationSummary,
        filesWithDuplication: {
          components: [
            {
              key: 'file-1',
              path: 'src/file1.ts',
              measures: [{ metric: 'duplicated_lines_density', value: '10.0' }],
            },
            {
              key: 'file-2',
              path: 'src/file2.ts',
              measures: undefined,
            },
            {
              key: 'file-3',
              path: 'src/file3.ts',
              measures: [],
            },
          ],
        },
      }));

      const result = await analyzer.getDuplicationSummary({});

      expect(result).toContain('src/file1.ts');
      expect(result).not.toContain('src/file2.ts');
      expect(result).not.toContain('src/file3.ts');
    });

    it('should pass correlationId through logging', async () => {
      const correlationId = 'test-correlation-123';
      await analyzer.getDuplicationSummary({}, correlationId);

      expect(mockSonarClient.getDuplicationSummary).toHaveBeenCalled();
    });
  });

  describe('getDuplicationSummary - error cases', () => {
    it('should handle getOrCreateConfig errors', async () => {
      mockProjectManager.getOrCreateConfig = vi.fn(async () => {
        throw new Error('Config not found');
      });

      await expect(analyzer.getDuplicationSummary({})).rejects.toThrow(
        'Config not found'
      );
    });

    it('should handle analyzeProject errors', async () => {
      mockProjectManager.analyzeProject = vi.fn(async () => {
        throw new Error('Analysis failed');
      });

      await expect(analyzer.getDuplicationSummary({})).rejects.toThrow(
        'Analysis failed'
      );
    });

    it('should handle SonarQube API errors', async () => {
      mockSonarClient.getDuplicationSummary = vi.fn(async () => {
        throw new Error('Duplication analysis failed');
      });

      await expect(analyzer.getDuplicationSummary({})).rejects.toThrow(
        'Duplication analysis failed'
      );
    });
  });

  describe('Sorting edge cases', () => {
    it('should handle missing metric values when sorting by density', async () => {
      mockSonarClient.getDuplicationSummary = vi.fn(async () => ({
        ...mockDuplicationSummary,
        filesWithDuplication: {
          components: [
            {
              key: 'file-1',
              path: 'src/file1.ts',
              measures: [{ metric: 'duplicated_lines_density', value: '15.0' }],
            },
            {
              key: 'file-2',
              path: 'src/file2.ts',
              measures: [{ metric: 'other_metric', value: '10.0' }],
            },
          ],
        },
      }));

      const result = await analyzer.getDuplicationSummary({ sortBy: 'density' });

      // Should not throw, files without the metric should be treated as 0
      expect(result).toContain('CODE DUPLICATION SUMMARY');
    });

    it('should handle missing metric values when sorting by lines', async () => {
      mockSonarClient.getDuplicationSummary = vi.fn(async () => ({
        ...mockDuplicationSummary,
        filesWithDuplication: {
          components: [
            {
              key: 'file-1',
              path: 'src/file1.ts',
              measures: [{ metric: 'duplicated_lines', value: '50' }],
            },
            {
              key: 'file-2',
              path: 'src/file2.ts',
              measures: [{ metric: 'other_metric', value: '10' }],
            },
          ],
        },
      }));

      const result = await analyzer.getDuplicationSummary({ sortBy: 'lines' });

      expect(result).toContain('CODE DUPLICATION SUMMARY');
    });

    it('should handle missing metric values when sorting by blocks', async () => {
      mockSonarClient.getDuplicationSummary = vi.fn(async () => ({
        ...mockDuplicationSummary,
        filesWithDuplication: {
          components: [
            {
              key: 'file-1',
              path: 'src/file1.ts',
              measures: [{ metric: 'duplicated_blocks', value: '5' }],
            },
            {
              key: 'file-2',
              path: 'src/file2.ts',
              measures: [{ metric: 'other_metric', value: '3' }],
            },
          ],
        },
      }));

      const result = await analyzer.getDuplicationSummary({ sortBy: 'blocks' });

      expect(result).toContain('CODE DUPLICATION SUMMARY');
    });
  });
});
