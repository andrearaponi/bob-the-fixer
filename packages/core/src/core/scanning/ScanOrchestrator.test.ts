import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScanOrchestrator } from './ScanOrchestrator';
import { mockIssue } from '../../../tests/fixtures/mock-sonar-responses';

// Create mock instances at module level
const mockProjectManager = {
  setWorkingDirectory: vi.fn(() => {}),
  getWorkingDirectory: vi.fn(() => '/test/project'),
  analyzeProject: vi.fn(() => Promise.resolve()),
  getOrCreateConfig: vi.fn(() => Promise.resolve()),
};

const mockSonarAdmin = {
  createProject: vi.fn(() => Promise.resolve()),
  generateToken: vi.fn(() => Promise.resolve()),
};

const mockSonarClient = {
  triggerAnalysis: vi.fn(() => Promise.resolve()),
  triggerDotnetAnalysis: vi.fn(() => Promise.resolve()),
  waitForAnalysis: vi.fn(() => Promise.resolve()),
  getIssues: vi.fn(() => Promise.resolve([])),
  getSecurityHotspots: vi.fn(async () => []),
  getProjectMetrics: vi.fn(async () => ({})),
};

const mockProjectContext = {
  path: '/test/project',
  name: 'test-project',
  language: ['typescript'],
  frameworks: ['node'],
  testFrameworks: [],
  buildTools: ['npm'],
  hasTests: false,
  configFiles: [],
};

const mockConfig = {
  sonarProjectKey: 'test-project',
  sonarUrl: 'http://localhost:9000',
  sonarToken: 'sqp_test_token_1234567890',
  createdAt: '2024-01-01T00:00:00.000Z',
};

// Mock modules
vi.mock('../../universal/project-manager', () => ({
  ProjectManager: vi.fn(function() { return mockProjectManager; }),
}));

vi.mock('../../universal/sonar-admin', () => ({
  SonarAdmin: vi.fn(function() { return mockSonarAdmin; }),
}));

vi.mock('../../sonar/client', () => ({
  SonarQubeClient: vi.fn(function(url, token, key, context) {
    return {
      ...mockSonarClient,
      projectContext: context,
    };
  }),
}));

vi.mock('../../sonar/index', () => ({
  SonarQubeClient: vi.fn(function(url, token, key, context) {
    return {
      ...mockSonarClient,
      projectContext: context,
    };
  }),
  verifyProjectSetup: vi.fn(async () => undefined),
  waitForCacheRefresh: vi.fn(async () => undefined),
}));


vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(async () => { throw new Error('File not found'); }),
    readdir: vi.fn(async () => []),
  },
  access: vi.fn(async () => { throw new Error('File not found'); }),
  readdir: vi.fn(async () => []),
}));

vi.mock('../../shared/utils/server-utils', () => ({
  generateProjectKey: vi.fn(() => 'test-project'),
  saveConfigToFile: vi.fn(async () => undefined),
  calculateQualityScore: vi.fn(() => 85),
  getSeverityWeight: vi.fn((severity: string) => {
    const weights: Record<string, number> = {
      BLOCKER: 5, CRITICAL: 4, MAJOR: 3, MINOR: 2, INFO: 1,
    };
    return weights[severity] || 0;
  }),
}));

vi.mock('../../shared/logger/structured-logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(() => {}),
    debug: vi.fn(() => {}),
    warn: vi.fn(() => {}),
    error: vi.fn(() => {}),
  })),
}));

vi.mock('../../infrastructure/security/input-sanitization', () => ({
  sanitizePath: vi.fn((path: string) => path),
  sanitizeLogMessage: vi.fn((msg: string) => msg),
  sanitizeCommandArgs: vi.fn((args: string[]) => args),
  shellQuote: vi.fn((str: string) => `'${str}'`),
  sanitizeProjectKey: vi.fn((key: string) => key),
  sanitizeUrl: vi.fn((url: string) => url),
  maskToken: vi.fn((token: string) => token.substring(0, 10) + '...'),
}));

describe('ScanOrchestrator', () => {
  let orchestrator: ScanOrchestrator;

  beforeEach(() => {
    // Reset function call history but keep implementations
    vi.mocked(mockProjectManager.setWorkingDirectory).mockClear();
    vi.mocked(mockProjectManager.getWorkingDirectory).mockClear();
    vi.mocked(mockProjectManager.analyzeProject).mockClear();
    vi.mocked(mockProjectManager.getOrCreateConfig).mockClear();
    vi.mocked(mockSonarAdmin.createProject).mockClear();
    vi.mocked(mockSonarAdmin.generateToken).mockClear();
    vi.mocked(mockSonarClient.triggerAnalysis).mockClear();
    vi.mocked(mockSonarClient.triggerDotnetAnalysis).mockClear();
    vi.mocked(mockSonarClient.waitForAnalysis).mockClear();
    vi.mocked(mockSonarClient.getIssues).mockClear();

    // Set default return values
    mockProjectManager.analyzeProject = vi.fn(async () => mockProjectContext);
    mockProjectManager.getOrCreateConfig = vi.fn(async () => mockConfig);
    mockSonarClient.triggerAnalysis = vi.fn(async () => undefined);
    mockSonarClient.triggerDotnetAnalysis = vi.fn(async () => undefined);
    mockSonarClient.waitForAnalysis = vi.fn(async () => undefined);
    mockSonarClient.getIssues = vi.fn(async () => [mockIssue]);
    mockSonarAdmin.createProject = vi.fn(async () => undefined);
    mockSonarAdmin.generateToken = vi.fn(async () => ({
      name: 'test-token',
      token: 'sqp_generated_token',
      createdAt: '2024-01-01T00:00:00.000Z',
    }));

    orchestrator = new ScanOrchestrator(mockProjectManager, mockSonarAdmin);
  });

  describe('Constructor', () => {
    it('should create orchestrator with default options', () => {
      const orch = new ScanOrchestrator(mockProjectManager, mockSonarAdmin);
      expect(orch).toBeDefined();
    });

    it('should accept custom options', () => {
      const orch = new ScanOrchestrator(mockProjectManager, mockSonarAdmin, {
        maxRetries: 5,
        retryDelay: 10000,
      });
      expect(orch).toBeDefined();
    });
  });

  describe('execute - success path', () => {
    it('should execute complete scan workflow successfully', async () => {
      const result = await orchestrator.execute({ autoSetup: false });

      expect(result).toBeDefined();
      expect(result.projectKey).toBe('test-project');
      expect(result.totalIssues).toBe(1);
      expect(result.qualityScore).toBe(85);
      expect(mockSonarClient.triggerAnalysis).toHaveBeenCalled();
      expect(mockSonarClient.waitForAnalysis).toHaveBeenCalled();
      expect(mockSonarClient.getIssues).toHaveBeenCalled();
    });

    it('should handle multiple issues and sort by severity', async () => {
      mockSonarClient.getIssues = vi.fn(async () => [
        { ...mockIssue, key: 'issue-1', severity: 'MINOR' },
        { ...mockIssue, key: 'issue-2', severity: 'CRITICAL' },
        { ...mockIssue, key: 'issue-3', severity: 'BLOCKER' },
      ]);

      const result = await orchestrator.execute({ autoSetup: false });

      expect(result.totalIssues).toBe(3);
      expect(result.topIssues[0].severity).toBe('BLOCKER');
      expect(result.topIssues[1].severity).toBe('CRITICAL');
    });

    it('should apply severity filters', async () => {
      await orchestrator.execute({
        autoSetup: false,
        severityFilter: ['CRITICAL', 'BLOCKER'],
      });

      expect(mockSonarClient.getIssues).toHaveBeenCalledWith(
        expect.objectContaining({
          severities: ['CRITICAL', 'BLOCKER'],
        })
      );
    });

    it('should apply type filters', async () => {
      await orchestrator.execute({
        autoSetup: false,
        typeFilter: ['BUG', 'VULNERABILITY'],
      });

      expect(mockSonarClient.getIssues).toHaveBeenCalledWith(
        expect.objectContaining({
          types: ['BUG', 'VULNERABILITY'],
        })
      );
    });

    it('should handle empty issues array', async () => {
      mockSonarClient.getIssues = vi.fn(async () => []);

      const result = await orchestrator.execute({ autoSetup: false });

      expect(result.totalIssues).toBe(0);
      expect(result.topIssues).toEqual([]);
    });
  });

  describe('.NET project', () => {
    it('should call triggerDotnetAnalysis for dotnet projects', async () => {
        const mockDotnetProjectContext = {
            path: '/test/project',
            name: 'test-dotnet-project',
            language: ['csharp'],
            buildTool: 'dotnet',
        };

        mockProjectManager.analyzeProject = vi.fn(async () => mockDotnetProjectContext);
        
        await orchestrator.execute({ autoSetup: false });

        expect(mockSonarClient.triggerDotnetAnalysis).toHaveBeenCalled();
        expect(mockSonarClient.triggerAnalysis).not.toHaveBeenCalled();
    });
  });

  describe('execute - auto-setup', () => {
    it('should perform auto-setup when config not found', async () => {
      mockProjectManager.getOrCreateConfig
        .mockImplementationOnce(async () => { throw new Error('Config not found'); })
        .mockImplementationOnce(async () => mockConfig);

      await orchestrator.execute({ autoSetup: true });

      expect(mockSonarAdmin.createProject).toHaveBeenCalled();
      expect(mockSonarAdmin.generateToken).toHaveBeenCalled();
    });

    it('should throw error when autoSetup is false and config not found', async () => {
      mockProjectManager.getOrCreateConfig = vi.fn(async () => { throw new Error('Config not found'); });

      await expect(
        orchestrator.execute({ autoSetup: false })
      ).rejects.toThrow('No Bob the Fixer configuration found');
    });
  });

  describe('execute - error handling', () => {
    it('should handle project manager errors', async () => {
      mockProjectManager.analyzeProject = vi.fn(async () => { throw new Error('Analysis failed'); });

      await expect(
        orchestrator.execute({ autoSetup: false })
      ).rejects.toThrow('Analysis failed');
    });

    it('should handle sonar client errors', async () => {
      mockSonarClient.triggerAnalysis = vi.fn(async () => { throw new Error('Analysis failed'); });

      await expect(
        orchestrator.execute({ autoSetup: false })
      ).rejects.toThrow();
    });

    it('should handle issue fetching errors', async () => {
      mockSonarClient.getIssues = vi.fn(async () => { throw new Error('API error'); });

      await expect(
        orchestrator.execute({ autoSetup: false })
      ).rejects.toThrow('API error');
    });
  });

  describe('Clean Code Metrics', () => {
    beforeEach(() => {
      orchestrator = new ScanOrchestrator(mockProjectManager as any, mockSonarAdmin as any);

      // Reset mocks
      vi.clearAllMocks();

      // Setup default happy path mocks
      mockProjectManager.analyzeProject = vi.fn(async () => mockProjectContext);
      mockProjectManager.getOrCreateConfig = vi.fn(async () => mockConfig);
      mockProjectManager.getWorkingDirectory = vi.fn(() => '/test/project');
      mockSonarClient.triggerAnalysis = vi.fn(async () => undefined);
      mockSonarClient.waitForAnalysis = vi.fn(async () => undefined);
      mockSonarClient.getIssues = vi.fn(async () => [mockIssue]);
      mockSonarClient.getSecurityHotspots = vi.fn(async () => []);
    });

    it('should include Clean Code metrics in scan result', async () => {
      // Mock project metrics with Clean Code metrics
      const mockMetrics = {
        component: {
          measures: [
            {
              metric: 'reliability_issues',
              value: '{"total":304,"HIGH":4,"MEDIUM":294,"LOW":6,"INFO":0,"BLOCKER":0}',
            },
            {
              metric: 'maintainability_issues',
              value: '{"total":1638,"HIGH":173,"MEDIUM":492,"LOW":945,"INFO":24,"BLOCKER":4}',
            },
            {
              metric: 'security_issues',
              value: '{"total":0,"HIGH":0,"MEDIUM":0,"LOW":0,"INFO":0,"BLOCKER":0}',
            },
          ],
        },
      };

      mockSonarClient.getProjectMetrics = vi.fn(async () => mockMetrics);

      const result = await orchestrator.execute({ autoSetup: false });

      expect(mockSonarClient.getProjectMetrics).toHaveBeenCalled();
      expect(result.cleanCodeMetrics).toBeDefined();
      expect(result.cleanCodeMetrics?.reliability).toBe(304);
      expect(result.cleanCodeMetrics?.maintainability).toBe(1638);
      expect(result.cleanCodeMetrics?.security).toBe(0);
    });

    it('should handle missing Clean Code metrics gracefully', async () => {
      // Mock project metrics without Clean Code metrics
      const mockMetrics = {
        component: {
          measures: [
            {
              metric: 'bugs',
              value: '22',
            },
          ],
        },
      };

      mockSonarClient.getProjectMetrics = vi.fn(async () => mockMetrics);

      const result = await orchestrator.execute({ autoSetup: false });

      expect(result.cleanCodeMetrics).toBeDefined();
      expect(result.cleanCodeMetrics?.reliability).toBe(0);
      expect(result.cleanCodeMetrics?.maintainability).toBe(0);
      expect(result.cleanCodeMetrics?.security).toBe(0);
    });

    it('should handle metric fetch failure gracefully', async () => {
      mockSonarClient.getProjectMetrics = vi.fn(async () => { throw new Error('Metrics API error'); });

      const result = await orchestrator.execute({ autoSetup: false });

      // Should complete scan even if metrics fail
      expect(result).toBeDefined();
      expect(result.cleanCodeMetrics).toBeUndefined();
    });

    it('should include issuesByType in scan result', async () => {
      mockSonarClient.getIssues = vi.fn(async () => [
        { ...mockIssue, type: 'BUG', severity: 'CRITICAL' },
        { ...mockIssue, key: 'issue-2', type: 'CODE_SMELL', severity: 'MAJOR' },
        { ...mockIssue, key: 'issue-3', type: 'CODE_SMELL', severity: 'MINOR' },
      ]);

      mockSonarClient.getProjectMetrics = vi.fn(async () => ({
        component: { measures: [] },
      }));

      const result = await orchestrator.execute({ autoSetup: false });

      expect(result.issuesByType).toBeDefined();
      expect(result.issuesByType?.BUG).toBe(1);
      expect(result.issuesByType?.CODE_SMELL).toBe(2);
    });
  });

  describe('Fallback System', () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mockProjectManager.analyzeProject = vi.fn(async () => mockProjectContext);
      mockProjectManager.getOrCreateConfig = vi.fn(async () => mockConfig);
      mockProjectManager.getWorkingDirectory = vi.fn(() => '/test/project');
    });

    it('should throw ScanRecoverableError for recoverable config errors', async () => {
      // Simulate a "sources not found" error
      mockSonarClient.triggerAnalysis = vi.fn(async () => {
        throw new Error('Unable to find source files in specified path');
      });

      const orch = new ScanOrchestrator(mockProjectManager, mockSonarAdmin, {
        enableFallback: true
      });

      try {
        await orch.execute({ autoSetup: false });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.name).toBe('ScanRecoverableError');
        expect(error.fallbackAnalysis).toBeDefined();
        expect(error.fallbackAnalysis.parsedError).toBeDefined();
        expect(error.fallbackAnalysis.projectStructure).toBeDefined();
      }
    });

    it('should not throw ScanRecoverableError when fallback is disabled', async () => {
      mockSonarClient.triggerAnalysis = vi.fn(async () => {
        throw new Error('Unable to find source files');
      });

      const orch = new ScanOrchestrator(mockProjectManager, mockSonarAdmin, {
        enableFallback: false
      });

      try {
        await orch.execute({ autoSetup: false });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.name).not.toBe('ScanRecoverableError');
      }
    });

    it('should not throw ScanRecoverableError for non-recoverable errors', async () => {
      // Permission denied is not recoverable
      mockSonarClient.triggerAnalysis = vi.fn(async () => {
        throw new Error('Permission denied: 403');
      });

      const orch = new ScanOrchestrator(mockProjectManager, mockSonarAdmin, {
        enableFallback: true,
        retryDelay: 0
      });

      try {
        await orch.execute({ autoSetup: false });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.name).not.toBe('ScanRecoverableError');
      }
    });

    it('should detect "No sources found" as recoverable', async () => {
      mockSonarClient.triggerAnalysis = vi.fn(async () => {
        throw new Error('No sources found for analysis');
      });

      const orch = new ScanOrchestrator(mockProjectManager, mockSonarAdmin, {
        enableFallback: true
      });

      try {
        await orch.execute({ autoSetup: false });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.name).toBe('ScanRecoverableError');
      }
    });

    it('should detect "sonar.java.binaries" error as recoverable', async () => {
      mockSonarClient.triggerAnalysis = vi.fn(async () => {
        throw new Error('Your project contains Java files but sonar.java.binaries is not set');
      });

      const orch = new ScanOrchestrator(mockProjectManager, mockSonarAdmin, {
        enableFallback: true
      });

      try {
        await orch.execute({ autoSetup: false });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.name).toBe('ScanRecoverableError');
      }
    });

    it('should detect "Module not found" as recoverable', async () => {
      mockSonarClient.triggerAnalysis = vi.fn(async () => {
        throw new Error('Module "backend" not found in configuration');
      });

      const orch = new ScanOrchestrator(mockProjectManager, mockSonarAdmin, {
        enableFallback: true
      });

      try {
        await orch.execute({ autoSetup: false });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.name).toBe('ScanRecoverableError');
      }
    });

    it('should include recovery recommendation in fallback result', async () => {
      mockSonarClient.triggerAnalysis = vi.fn(async () => {
        throw new Error('No sources found');
      });

      const orch = new ScanOrchestrator(mockProjectManager, mockSonarAdmin, {
        enableFallback: true
      });

      try {
        await orch.execute({ autoSetup: false });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.fallbackAnalysis.recommendation).toBeDefined();
        expect(error.fallbackAnalysis.recommendation).toContain('sonar_generate_config');
      }
    });

    it('should enable fallback by default', async () => {
      mockSonarClient.triggerAnalysis = vi.fn(async () => {
        throw new Error('Unable to find source files');
      });

      // Create without explicit enableFallback option
      const orch = new ScanOrchestrator(mockProjectManager, mockSonarAdmin);

      try {
        await orch.execute({ autoSetup: false });
        expect(true).toBe(false);
      } catch (error: any) {
        // Should use fallback by default
        expect(error.name).toBe('ScanRecoverableError');
      }
    });

    it('should include suggested template in fallback result', async () => {
      mockSonarClient.triggerAnalysis = vi.fn(async () => {
        throw new Error('No sources found');
      });

      const orch = new ScanOrchestrator(mockProjectManager, mockSonarAdmin, {
        enableFallback: true
      });

      try {
        await orch.execute({ autoSetup: false });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.fallbackAnalysis.suggestedTemplate).toBeDefined();
        expect(error.fallbackAnalysis.suggestedTemplate).toContain('sonar.projectKey');
      }
    });
  });
});
