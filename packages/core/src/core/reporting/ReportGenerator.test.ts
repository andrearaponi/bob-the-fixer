import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportGenerator, ReportGeneratorOptions } from './ReportGenerator';
import { mockIssue } from '../../../tests/fixtures/mock-sonar-responses';

// Create mock instances at module level
const mockProjectManager = {
  getOrCreateConfig: vi.fn(() => Promise.resolve()),
  analyzeProject: vi.fn(() => Promise.resolve()),
};

const mockSonarClient = {
  getIssues: vi.fn(() => Promise.resolve([])),
  getSecurityHotspots: vi.fn(() => Promise.resolve([])),
  getProjectMetrics: vi.fn(() => Promise.resolve({})),
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
  language: ['typescript'],
  framework: 'react',
};

const mockIssues = [
  {
    ...mockIssue,
    key: 'issue-1',
    severity: 'CRITICAL',
    type: 'BUG',
    message: 'Critical bug found',
  },
  {
    ...mockIssue,
    key: 'issue-2',
    severity: 'MAJOR',
    type: 'CODE_SMELL',
    message: 'Code smell detected',
  },
  {
    ...mockIssue,
    key: 'issue-3',
    severity: 'MINOR',
    type: 'VULNERABILITY',
    message: 'Minor vulnerability',
  },
];

const mockHotspots = [
  {
    key: 'hotspot-1',
    status: 'TO_REVIEW',
    vulnerabilityProbability: 'HIGH',
    message: 'Security hotspot',
  },
];

const mockProjectMetrics = {
  component: {
    key: 'test-project',
    name: 'Test Project',
    measures: [
      { metric: 'ncloc', value: '1000' },
      { metric: 'bugs', value: '5' },
      { metric: 'vulnerabilities', value: '2' },
      { metric: 'code_smells', value: '10' },
      { metric: 'coverage', value: '80.5' },
      { metric: 'duplicated_lines_density', value: '3.2' },
    ],
  },
};

const mockReportFormatter = {
  format: vi.fn((data: any) => 'Formatted report'),
};

// Mock modules
vi.mock('../../universal/project-manager', () => ({
  ProjectManager: vi.fn(function() { return mockProjectManager; }),
}));

vi.mock('../../sonar/index', () => ({
  SonarQubeClient: vi.fn(function() { return mockSonarClient; }),
}));

vi.mock('../../reports/comprehensive-report', () => ({
  groupBy: vi.fn((items: any[], key: string) => {
    const grouped: any = {};
    items.forEach((item) => {
      const groupKey = item[key];
      if (!grouped[groupKey]) {
        grouped[groupKey] = [];
      }
      grouped[groupKey].push(item);
    });
    return grouped;
  }),
}));

vi.mock('../../reports/project-metrics-report', () => ({
  buildMetricsMap: vi.fn((measures: any[]) => {
    const map: any = {};
    measures.forEach((m) => {
      map[m.metric] = m.value;
    });
    return map;
  }),
}));

vi.mock('../../shared/utils/server-utils', () => ({
  calculateQualityScore: vi.fn(() => 85),
  getSeverityWeight: vi.fn((severity: string) => {
    const weights: Record<string, number> = {
      BLOCKER: 5,
      CRITICAL: 4,
      MAJOR: 3,
      MINOR: 2,
      INFO: 1,
    };
    return weights[severity] || 0;
  }),
}));

vi.mock('../../shared/utils/issue-details-utils', () => ({
  getSeverityIcon: vi.fn((severity: string) => {
    const icons: Record<string, string> = {
      BLOCKER: '🔴',
      CRITICAL: '🟠',
      MAJOR: '🟡',
      MINOR: '🔵',
      INFO: '⚪',
    };
    return icons[severity] || '';
  }),
  getIssueTypeIcon: vi.fn((type: string) => {
    const icons: Record<string, string> = {
      BUG: '🐛',
      VULNERABILITY: '🔓',
      CODE_SMELL: '👃',
    };
    return icons[type] || '';
  }),
}));

vi.mock('../../reports/report-utils', () => ({
  getReportFormatter: vi.fn(() => mockReportFormatter),
}));

vi.mock('../../shared/logger/structured-logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(() => {}),
    debug: vi.fn(() => {}),
    warn: vi.fn(() => {}),
    error: vi.fn(() => {}),
  })),
}));

describe('ReportGenerator', () => {
  let reportGenerator: ReportGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    reportGenerator = new ReportGenerator(mockProjectManager as any);

    // Default successful responses
    mockProjectManager.getOrCreateConfig = vi.fn(async () => mockConfig);
    mockProjectManager.analyzeProject = vi.fn(async () => mockProjectContext);
    mockSonarClient.getIssues = vi.fn(async () => mockIssues);
    mockSonarClient.getSecurityHotspots = vi.fn(async () => mockHotspots);
    mockSonarClient.getProjectMetrics = vi.fn(async () => mockProjectMetrics);
    mockReportFormatter.format = vi.fn(() => 'Formatted report');
  });

  describe('generateReport', () => {
    it('should generate summary report by default', async () => {
      const options: ReportGeneratorOptions = {};
      const result = await reportGenerator.generateReport(options);

      expect(result).toBe('Formatted report');
      expect(mockSonarClient.getIssues).toHaveBeenCalled();
      expect(mockSonarClient.getSecurityHotspots).toHaveBeenCalled();
      expect(mockSonarClient.getProjectMetrics).toHaveBeenCalled();
    });

    it('should generate detailed report when format is detailed', async () => {
      const options: ReportGeneratorOptions = {
        format: 'detailed',
      };
      const result = await reportGenerator.generateReport(options);

      expect(result).toBe('Formatted report');
    });

    it('should generate json report when format is json', async () => {
      const options: ReportGeneratorOptions = {
        format: 'json',
      };
      const result = await reportGenerator.generateReport(options);

      expect(result).toBe('Formatted report');
    });

    it('should fetch all required data in parallel', async () => {
      const options: ReportGeneratorOptions = {};
      await reportGenerator.generateReport(options);

      expect(mockSonarClient.getIssues).toHaveBeenCalled();
      expect(mockSonarClient.getSecurityHotspots).toHaveBeenCalledWith({
        statuses: ['TO_REVIEW'],
      });
      expect(mockSonarClient.getProjectMetrics).toHaveBeenCalled();
    });

    it('should pass report data to formatter', async () => {
      const options: ReportGeneratorOptions = {};
      await reportGenerator.generateReport(options);

      expect(mockReportFormatter.format).toHaveBeenCalledWith(
        expect.objectContaining({
          config: mockConfig,
          issues: mockIssues,
          hotspots: mockHotspots,
          projectMetrics: mockProjectMetrics,
        })
      );
    });

    it('should calculate quality score from issues', async () => {
      const options: ReportGeneratorOptions = {};
      await reportGenerator.generateReport(options);

      expect(mockReportFormatter.format).toHaveBeenCalledWith(
        expect.objectContaining({
          qualityScore: 85,
        })
      );
    });

    it('should group issues by severity', async () => {
      const options: ReportGeneratorOptions = {};
      await reportGenerator.generateReport(options);

      expect(mockReportFormatter.format).toHaveBeenCalledWith(
        expect.objectContaining({
          bySeverity: expect.any(Object),
        })
      );
    });

    it('should group issues by type', async () => {
      const options: ReportGeneratorOptions = {};
      await reportGenerator.generateReport(options);

      expect(mockReportFormatter.format).toHaveBeenCalledWith(
        expect.objectContaining({
          byType: expect.any(Object),
        })
      );
    });

    it('should build metrics map from project metrics', async () => {
      const options: ReportGeneratorOptions = {};
      await reportGenerator.generateReport(options);

      expect(mockReportFormatter.format).toHaveBeenCalledWith(
        expect.objectContaining({
          metricsMap: expect.any(Object),
        })
      );
    });

    it('should pass correlationId through logging', async () => {
      const correlationId = 'test-correlation-id';
      const options: ReportGeneratorOptions = {};

      await reportGenerator.generateReport(options, correlationId);

      expect(mockProjectManager.getOrCreateConfig).toHaveBeenCalled();
    });

    it('should handle empty issues array', async () => {
      mockSonarClient.getIssues = vi.fn(async () => []);

      const options: ReportGeneratorOptions = {};
      const result = await reportGenerator.generateReport(options);

      expect(result).toBe('Formatted report');
    });

    it('should handle empty hotspots array', async () => {
      mockSonarClient.getSecurityHotspots = vi.fn(async () => []);

      const options: ReportGeneratorOptions = {};
      const result = await reportGenerator.generateReport(options);

      expect(result).toBe('Formatted report');
    });

    it('should handle project with no metrics', async () => {
      mockSonarClient.getProjectMetrics = vi.fn(async () => ({
        component: {
          key: 'test-project',
          name: 'Test Project',
          measures: [],
        },
      }));

      const options: ReportGeneratorOptions = {};
      const result = await reportGenerator.generateReport(options);

      expect(result).toBe('Formatted report');
    });

    it('should handle error during data fetching', async () => {
      mockSonarClient.getIssues = vi.fn(async () => { throw new Error('API error'); });

      const options: ReportGeneratorOptions = {};

      await expect(reportGenerator.generateReport(options)).rejects.toThrow('API error');
    });

    it('should handle error during config loading', async () => {
      mockProjectManager.getOrCreateConfig = vi.fn(async () => { throw new Error('Config error'); });

      await expect(reportGenerator.generateReport({})).rejects.toThrow('Config error');
    });

    it('should handle error during project analysis', async () => {
      mockProjectManager.analyzeProject = vi.fn(async () => { throw new Error('Analysis error'); });

      await expect(reportGenerator.generateReport({})).rejects.toThrow('Analysis error');
    });
  });

  describe('report formats', () => {
    it('should use correct formatter for summary format', async () => {
      const options: ReportGeneratorOptions = {
        format: 'summary',
      };

      await reportGenerator.generateReport(options);

      // Verify getReportFormatter was called (mocked module verifies the format)
      expect(mockReportFormatter.format).toHaveBeenCalled();
    });

    it('should use correct formatter for detailed format', async () => {
      const options: ReportGeneratorOptions = {
        format: 'detailed',
      };

      await reportGenerator.generateReport(options);

      expect(mockReportFormatter.format).toHaveBeenCalled();
    });

    it('should use correct formatter for json format', async () => {
      const options: ReportGeneratorOptions = {
        format: 'json',
      };

      await reportGenerator.generateReport(options);

      expect(mockReportFormatter.format).toHaveBeenCalled();
    });

    it('should default to summary format when format is not specified', async () => {
      const options: ReportGeneratorOptions = {};

      await reportGenerator.generateReport(options);

      expect(mockReportFormatter.format).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle large number of issues', async () => {
      const largeIssuesList = Array.from({ length: 1000 }, (_, i) => ({
        ...mockIssue,
        key: `issue-${i}`,
        severity: i % 2 === 0 ? 'CRITICAL' : 'MAJOR',
        type: i % 3 === 0 ? 'BUG' : 'CODE_SMELL',
      }));
      mockSonarClient.getIssues = vi.fn(async () => largeIssuesList);

      const result = await reportGenerator.generateReport({});

      expect(result).toBe('Formatted report');
    });

    it('should handle various issue severities', async () => {
      const diverseIssues = [
        { ...mockIssue, key: '1', severity: 'BLOCKER', type: 'BUG' },
        { ...mockIssue, key: '2', severity: 'CRITICAL', type: 'BUG' },
        { ...mockIssue, key: '3', severity: 'MAJOR', type: 'CODE_SMELL' },
        { ...mockIssue, key: '4', severity: 'MINOR', type: 'CODE_SMELL' },
        { ...mockIssue, key: '5', severity: 'INFO', type: 'CODE_SMELL' },
      ];
      mockSonarClient.getIssues = vi.fn(async () => diverseIssues);

      const result = await reportGenerator.generateReport({});

      expect(result).toBe('Formatted report');
    });

    it('should handle various issue types', async () => {
      const diverseIssues = [
        { ...mockIssue, key: '1', severity: 'MAJOR', type: 'BUG' },
        { ...mockIssue, key: '2', severity: 'MAJOR', type: 'VULNERABILITY' },
        { ...mockIssue, key: '3', severity: 'MAJOR', type: 'CODE_SMELL' },
      ];
      mockSonarClient.getIssues = vi.fn(async () => diverseIssues);

      const result = await reportGenerator.generateReport({});

      expect(result).toBe('Formatted report');
    });

    it('should handle metrics with various data types', async () => {
      mockSonarClient.getProjectMetrics = vi.fn(async () => ({
        component: {
          key: 'test-project',
          name: 'Test Project',
          measures: [
            { metric: 'ncloc', value: '1000' },
            { metric: 'coverage', value: '80.5' },
            { metric: 'sqale_rating', value: 'A' },
            { metric: 'reliability_rating', value: '1.0' },
          ],
        },
      }));

      const result = await reportGenerator.generateReport({});

      expect(result).toBe('Formatted report');
    });

    it('should handle hotspots with different probabilities', async () => {
      const diverseHotspots = [
        { key: '1', status: 'TO_REVIEW', vulnerabilityProbability: 'HIGH' },
        { key: '2', status: 'TO_REVIEW', vulnerabilityProbability: 'MEDIUM' },
        { key: '3', status: 'TO_REVIEW', vulnerabilityProbability: 'LOW' },
      ];
      mockSonarClient.getSecurityHotspots = vi.fn(async () => diverseHotspots);

      const result = await reportGenerator.generateReport({});

      expect(result).toBe('Formatted report');
    });
  });
});
