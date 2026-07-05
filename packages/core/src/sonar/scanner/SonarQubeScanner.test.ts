import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SonarQubeScanner } from './SonarQubeScanner.js';
import { SonarIssue } from '../types.js';
import { IProjectManager, ISonarAdmin } from '../../infrastructure/interfaces/index.js';

// Hoisted mock fns so the vi.mock factories can reference them.
const { mockExecute, mockGetIssues, mockClientGet } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockGetIssues: vi.fn(),
  mockClientGet: vi.fn(),
}));

// ScanOrchestrator is the Sonar engine the scanner drives; mock it entirely.
// vitest requires a class/function (not an arrow) for `new` to work.
vi.mock('../../core/scanning/ScanOrchestrator.js', () => ({
  ScanOrchestrator: class {
    execute = mockExecute;
  },
}));

// getIssues/checkHealth build a real SonarQubeClient; mock it.
vi.mock('../client.js', () => ({
  SonarQubeClient: class {
    getIssues = mockGetIssues;
    client = { get: mockClientGet };
  },
}));

const mockSonarIssue: SonarIssue = {
  key: 'AYX123',
  rule: 'java:S1234',
  severity: 'MAJOR',
  component: 'project:src/main/java/Example.java',
  project: 'project',
  line: 42,
  textRange: { startLine: 42, endLine: 42, startOffset: 10, endOffset: 50 },
  flows: [],
  status: 'OPEN',
  message: 'Remove this unused variable',
  type: 'CODE_SMELL',
  tags: ['unused'],
  creationDate: '2024-01-15T10:00:00Z',
  updateDate: '2024-01-15T10:00:00Z',
  effort: '5min',
};

const fakeScanResult = {
  projectKey: 'test-project',
  totalIssues: 2,
  issuesBySeverity: { BLOCKER: 1, MAJOR: 1 },
  issuesByType: { BUG: 1, CODE_SMELL: 1 },
  qualityScore: 80,
  topIssues: [
    {
      key: 'AYX123',
      severity: 'MAJOR',
      type: 'CODE_SMELL',
      message: 'Remove this unused variable',
      component: 'test-project:src/main/java/Example.java',
      line: 42,
      rule: 'java:S1234',
      effort: '5min',
      status: 'OPEN',
      tags: ['unused'],
    },
  ],
  projectContext: { path: '/test', name: 'test', language: ['java'] },
};

describe('SonarQubeScanner', () => {
  let scanner: SonarQubeScanner;
  let projectManager: IProjectManager;
  let sonarAdmin: ISonarAdmin;

  beforeEach(() => {
    vi.clearAllMocks();
    projectManager = {
      getOrCreateConfig: vi.fn().mockResolvedValue({
        sonarUrl: 'http://sonarqube:9000',
        sonarToken: 'squ_testtoken1234',
        sonarProjectKey: 'test-project',
        createdAt: '2024-01-01',
      }),
      ensureConfigSync: vi.fn(),
      analyzeProject: vi.fn(),
      getWorkingDirectory: vi.fn().mockReturnValue('/test'),
      setWorkingDirectory: vi.fn(),
    } as unknown as IProjectManager;
    sonarAdmin = {} as unknown as ISonarAdmin;
    scanner = new SonarQubeScanner(projectManager, sonarAdmin);
  });

  describe('properties', () => {
    it('has the sonarqube name and sast type', () => {
      expect(scanner.name).toBe('sonarqube');
      expect(scanner.type).toBe('sast');
    });
  });

  describe('scan', () => {
    it('drives the orchestrator and returns a normalized IScanResult', async () => {
      mockExecute.mockResolvedValueOnce(fakeScanResult);

      const result = await scanner.scan({ projectPath: '/test' });

      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(result.source).toBe('sonarqube');
      expect(result.scannerType).toBe('sast');
      expect(result.status).toBe('COMPLETED');
      expect(result.project.key).toBe('test-project');
      expect(result.summary.total).toBe(2);
      // BLOCKER -> CRITICAL, MAJOR -> HIGH
      expect(result.summary.counts.bySeverity.CRITICAL).toBe(1);
      expect(result.summary.counts.bySeverity.HIGH).toBe(1);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toMatchObject({ id: 'AYX123', severity: 'HIGH', type: 'CODE_SMELL' });
    });

    it('preserves the native Sonar ScanResult in rawOutput (output parity)', async () => {
      mockExecute.mockResolvedValueOnce(fakeScanResult);
      const result = await scanner.scan({ projectPath: '/test' });
      expect(result.rawOutput).toBe(fakeScanResult);
    });
  });

  describe('getIssues', () => {
    it('fetches via SonarQubeClient and normalizes to IIssue', async () => {
      mockGetIssues.mockResolvedValueOnce([mockSonarIssue]);

      const issues = await scanner.getIssues('test-project');

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        id: 'AYX123',
        source: 'sonarqube',
        type: 'CODE_SMELL',
        severity: 'HIGH', // MAJOR -> HIGH
        ruleId: 'java:S1234',
      });
      expect(issues[0].location).toMatchObject({
        filePath: 'src/main/java/Example.java',
        startLine: 42,
      });
    });

    it('throws when project key is missing', async () => {
      await expect(scanner.getIssues('')).rejects.toThrow('Project key is required');
    });
  });

  describe('checkHealth', () => {
    it('reports available when SonarQube status is UP', async () => {
      mockClientGet.mockResolvedValueOnce({ data: { status: 'UP', version: '9.9.0' } });
      const status = await scanner.checkHealth();
      expect(status.available).toBe(true);
      expect(status.version).toBe('9.9.0');
    });

    it('reports unavailable when the request fails', async () => {
      mockClientGet.mockRejectedValueOnce(new Error('Connection refused'));
      const status = await scanner.checkHealth();
      expect(status.available).toBe(false);
      expect(status.errorMessage).toBe('Connection refused');
    });
  });

  describe('getConfig', () => {
    it('returns default config and reflects configure()', () => {
      expect(scanner.getConfig().enabled).toBe(true);
      scanner.configure({ enabled: false });
      expect(scanner.getConfig().enabled).toBe(false);
    });
  });
});
