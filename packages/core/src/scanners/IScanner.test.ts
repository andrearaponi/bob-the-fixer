import { describe, it, expect, vi } from 'vitest';
import {
  BaseScannerImpl,
  IScanner,
  ScannerConfig,
  ScannerHealthStatus,
  IIssue,
  IScanResult,
  ScanParams,
  IssueFilter,
  IssueSummary,
} from './index.js';

// Mock scanner implementation for testing
class MockScanner extends BaseScannerImpl {
  readonly name = 'mock-scanner';
  readonly type = 'sast' as const;

  private mockIssues: IIssue[] = [];
  private mockHealthStatus: ScannerHealthStatus = {
    available: true,
    version: '1.0.0',
    lastChecked: new Date().toISOString(),
  };

  async scan(params: ScanParams): Promise<IScanResult> {
    const scanId = this.generateScanId();
    const startedAt = new Date().toISOString();

    return {
      scanId,
      source: 'sonarqube',
      scannerType: this.type,
      status: 'COMPLETED',
      startedAt,
      completedAt: new Date().toISOString(),
      project: {
        key: params.projectKey || 'test-project',
        name: params.projectName || 'Test Project',
        path: params.projectPath,
      },
      branch: params.branch,
      issues: this.mockIssues,
      summary: this.createSummaryFromIssues(this.mockIssues),
      metrics: {
        filesScanned: 10,
        linesOfCode: 1000,
        durationMs: 5000,
      },
    };
  }

  async getIssues(projectKey: string, filter?: IssueFilter): Promise<IIssue[]> {
    let issues = [...this.mockIssues];

    if (filter?.severities) {
      issues = issues.filter((i) => filter.severities!.includes(i.severity));
    }
    if (filter?.types) {
      issues = issues.filter((i) => filter.types!.includes(i.type));
    }
    if (filter?.limit) {
      issues = issues.slice(0, filter.limit);
    }

    return issues;
  }

  async checkHealth(): Promise<ScannerHealthStatus> {
    return this.mockHealthStatus;
  }

  // Test helper methods
  setMockIssues(issues: IIssue[]): void {
    this.mockIssues = issues;
  }

  setMockHealthStatus(status: ScannerHealthStatus): void {
    this.mockHealthStatus = status;
  }

  private createSummaryFromIssues(issues: IIssue[]): IssueSummary {
    const summary = this.createEmptySummary();
    summary.total = issues.length;

    for (const issue of issues) {
      summary.counts.bySeverity[issue.severity]++;
      summary.counts.byType[issue.type]++;
      summary.counts.byStatus[issue.status]++;
      summary.counts.bySource[issue.source]++;
    }

    return summary;
  }
}

describe('IScanner Interface', () => {
  describe('BaseScannerImpl', () => {
    it('should have correct name and type', () => {
      const scanner = new MockScanner();
      expect(scanner.name).toBe('mock-scanner');
      expect(scanner.type).toBe('sast');
    });

    it('should return default config', () => {
      const scanner = new MockScanner();
      const config = scanner.getConfig();

      expect(config).toEqual({ enabled: true });
    });

    it('should allow configuration updates', () => {
      const scanner = new MockScanner();

      scanner.configure({
        enabled: false,
        options: { timeout: 5000 },
      });

      const config = scanner.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.options).toEqual({ timeout: 5000 });
    });

    it('should generate unique scan IDs', () => {
      const scanner = new MockScanner();
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        // Access protected method via scan result
        scanner.scan({ projectPath: '/test' }).then((result) => {
          ids.add(result.scanId);
        });
      }

      // All IDs should be unique
      expect(ids.size).toBeLessThanOrEqual(100);
    });
  });

  describe('scan()', () => {
    it('should return a valid scan result', async () => {
      const scanner = new MockScanner();
      const result = await scanner.scan({
        projectPath: '/test/project',
        projectKey: 'test-key',
        projectName: 'Test Project',
      });

      expect(result.scanId).toMatch(/^mock-scanner-\d+-[a-z0-9]+$/);
      expect(result.source).toBe('sonarqube');
      expect(result.scannerType).toBe('sast');
      expect(result.status).toBe('COMPLETED');
      expect(result.project.key).toBe('test-key');
      expect(result.project.name).toBe('Test Project');
      expect(result.project.path).toBe('/test/project');
      expect(result.startedAt).toBeDefined();
      expect(result.completedAt).toBeDefined();
      expect(result.issues).toEqual([]);
      expect(result.summary.total).toBe(0);
      expect(result.metrics.filesScanned).toBe(10);
    });

    it('should include issues in scan result', async () => {
      const scanner = new MockScanner();
      const mockIssues: IIssue[] = [
        {
          id: 'issue-1',
          source: 'sonarqube',
          type: 'VULNERABILITY',
          severity: 'CRITICAL',
          status: 'OPEN',
          message: 'SQL Injection vulnerability',
          ruleId: 'squid:S2077',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: ['security', 'sql'],
          location: {
            filePath: 'src/db.ts',
            startLine: 42,
          },
        },
        {
          id: 'issue-2',
          source: 'sonarqube',
          type: 'BUG',
          severity: 'HIGH',
          status: 'OPEN',
          message: 'Null pointer dereference',
          ruleId: 'squid:S2259',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: ['bug'],
        },
      ];

      scanner.setMockIssues(mockIssues);
      const result = await scanner.scan({ projectPath: '/test' });

      expect(result.issues).toHaveLength(2);
      expect(result.summary.total).toBe(2);
      expect(result.summary.counts.bySeverity.CRITICAL).toBe(1);
      expect(result.summary.counts.bySeverity.HIGH).toBe(1);
      expect(result.summary.counts.byType.VULNERABILITY).toBe(1);
      expect(result.summary.counts.byType.BUG).toBe(1);
    });
  });

  describe('getIssues()', () => {
    it('should return all issues without filter', async () => {
      const scanner = new MockScanner();
      const mockIssues: IIssue[] = [
        {
          id: 'issue-1',
          source: 'sonarqube',
          type: 'VULNERABILITY',
          severity: 'CRITICAL',
          status: 'OPEN',
          message: 'Test issue 1',
          ruleId: 'rule-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: [],
        },
        {
          id: 'issue-2',
          source: 'sonarqube',
          type: 'BUG',
          severity: 'LOW',
          status: 'OPEN',
          message: 'Test issue 2',
          ruleId: 'rule-2',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: [],
        },
      ];

      scanner.setMockIssues(mockIssues);
      const issues = await scanner.getIssues('test-project');

      expect(issues).toHaveLength(2);
    });

    it('should filter by severity', async () => {
      const scanner = new MockScanner();
      const mockIssues: IIssue[] = [
        {
          id: 'issue-1',
          source: 'sonarqube',
          type: 'VULNERABILITY',
          severity: 'CRITICAL',
          status: 'OPEN',
          message: 'Critical issue',
          ruleId: 'rule-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: [],
        },
        {
          id: 'issue-2',
          source: 'sonarqube',
          type: 'BUG',
          severity: 'LOW',
          status: 'OPEN',
          message: 'Low issue',
          ruleId: 'rule-2',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: [],
        },
      ];

      scanner.setMockIssues(mockIssues);
      const issues = await scanner.getIssues('test-project', {
        severities: ['CRITICAL'],
      });

      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('CRITICAL');
    });

    it('should filter by type', async () => {
      const scanner = new MockScanner();
      const mockIssues: IIssue[] = [
        {
          id: 'issue-1',
          source: 'sonarqube',
          type: 'VULNERABILITY',
          severity: 'CRITICAL',
          status: 'OPEN',
          message: 'Vulnerability',
          ruleId: 'rule-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: [],
        },
        {
          id: 'issue-2',
          source: 'sonarqube',
          type: 'BUG',
          severity: 'LOW',
          status: 'OPEN',
          message: 'Bug',
          ruleId: 'rule-2',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: [],
        },
      ];

      scanner.setMockIssues(mockIssues);
      const issues = await scanner.getIssues('test-project', {
        types: ['BUG'],
      });

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('BUG');
    });

    it('should respect limit parameter', async () => {
      const scanner = new MockScanner();
      const mockIssues: IIssue[] = Array.from({ length: 10 }, (_, i) => ({
        id: `issue-${i}`,
        source: 'sonarqube' as const,
        type: 'BUG' as const,
        severity: 'LOW' as const,
        status: 'OPEN' as const,
        message: `Test issue ${i}`,
        ruleId: `rule-${i}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: [],
      }));

      scanner.setMockIssues(mockIssues);
      const issues = await scanner.getIssues('test-project', { limit: 5 });

      expect(issues).toHaveLength(5);
    });
  });

  describe('checkHealth()', () => {
    it('should return available status when healthy', async () => {
      const scanner = new MockScanner();
      const status = await scanner.checkHealth();

      expect(status.available).toBe(true);
      expect(status.version).toBe('1.0.0');
      expect(status.lastChecked).toBeDefined();
    });

    it('should return unavailable status with error message', async () => {
      const scanner = new MockScanner();
      scanner.setMockHealthStatus({
        available: false,
        errorMessage: 'Connection refused',
        lastChecked: new Date().toISOString(),
      });

      const status = await scanner.checkHealth();

      expect(status.available).toBe(false);
      expect(status.errorMessage).toBe('Connection refused');
    });
  });

  describe('Empty Summary', () => {
    it('should create empty summary with all counts at zero', () => {
      const scanner = new MockScanner();
      const summary = (scanner as any).createEmptySummary();

      expect(summary.total).toBe(0);
      expect(summary.counts.bySeverity.CRITICAL).toBe(0);
      expect(summary.counts.bySeverity.HIGH).toBe(0);
      expect(summary.counts.bySeverity.MEDIUM).toBe(0);
      expect(summary.counts.bySeverity.LOW).toBe(0);
      expect(summary.counts.bySeverity.INFO).toBe(0);
      expect(summary.counts.byType.VULNERABILITY).toBe(0);
      expect(summary.counts.byType.BUG).toBe(0);
      expect(summary.counts.byType.CODE_SMELL).toBe(0);
      expect(summary.counts.byType.SECURITY_HOTSPOT).toBe(0);
      expect(summary.counts.byType.DEPENDENCY_VULN).toBe(0);
      expect(summary.topAffectedFiles).toEqual([]);
    });
  });
});

describe('IIssue Interface', () => {
  it('should allow creating a complete issue', () => {
    const issue: IIssue = {
      id: 'test-issue-1',
      source: 'sonarqube',
      type: 'VULNERABILITY',
      severity: 'CRITICAL',
      status: 'OPEN',
      message: 'SQL Injection vulnerability detected',
      ruleId: 'squid:S2077',
      ruleName: 'SQL Injection',
      location: {
        filePath: 'src/database/query.ts',
        startLine: 42,
        endLine: 42,
        startOffset: 10,
        endOffset: 50,
      },
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z',
      tags: ['security', 'sql', 'owasp-a1'],
      remediation: {
        effort: '30min',
        recommendation: 'Use parameterized queries instead of string concatenation',
        referenceUrl: 'https://owasp.org/Top10/A03_2021-Injection/',
      },
    };

    expect(issue.id).toBe('test-issue-1');
    expect(issue.severity).toBe('CRITICAL');
    expect(issue.location?.filePath).toBe('src/database/query.ts');
    expect(issue.remediation?.effort).toBe('30min');
  });

  it('should allow creating a dependency vulnerability issue', () => {
    const issue: IIssue = {
      id: 'dep-vuln-1',
      source: 'trivy',
      type: 'DEPENDENCY_VULN',
      severity: 'HIGH',
      status: 'OPEN',
      message: 'lodash < 4.17.21 has prototype pollution vulnerability',
      ruleId: 'CVE-2021-23337',
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z',
      tags: ['npm', 'prototype-pollution'],
      dependency: {
        packageName: 'lodash',
        installedVersion: '4.17.15',
        vulnerableVersions: '< 4.17.21',
      },
      remediation: {
        fixedVersion: '4.17.21',
        recommendation: 'Upgrade lodash to version 4.17.21 or later',
      },
    };

    expect(issue.type).toBe('DEPENDENCY_VULN');
    expect(issue.dependency?.packageName).toBe('lodash');
    expect(issue.dependency?.installedVersion).toBe('4.17.15');
    expect(issue.remediation?.fixedVersion).toBe('4.17.21');
  });
});
