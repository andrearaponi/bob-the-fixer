import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleScanProject, ScanHandler } from './scan.handler';

// Mock all dependencies
vi.mock('../../core/scanning/index.js');
vi.mock('../../core/scanning/fallback/index.js');
vi.mock('../../universal/project-manager');
vi.mock('../../universal/sonar-admin');
vi.mock('../../shared/validators/mcp-schemas');
vi.mock('../../infrastructure/security/input-sanitization');

describe('handleScanProject', () => {
  let mockScanOrchestrator: any;
  let mockValidateInput: any;
  let mockSanitizeUrl: any;

  beforeEach(async () => {
    // Mock validateInput
    const validators = await import('../../shared/validators/mcp-schemas');
    mockValidateInput = vi.mocked(validators.validateInput);
    mockValidateInput.mockImplementation(() => ({
      projectPath: '/test/project',
      severityFilter: ['CRITICAL'],
      typeFilter: ['BUG'],
      autoSetup: false,
    }));

    // Mock sanitizeUrl
    const security = await import('../../infrastructure/security/input-sanitization');
    mockSanitizeUrl = vi.mocked(security.sanitizeUrl);
    mockSanitizeUrl.mockImplementation(() => 'http://localhost:9000');

    // Mock ScanOrchestrator
    const scanning = await import('../../core/scanning/index.js');
    mockScanOrchestrator = {
      execute: vi.fn(async () => ({
        projectKey: 'test-project',
        totalIssues: 5,
        issuesBySeverity: { CRITICAL: 2, MAJOR: 3 },
        qualityScore: 75,
        topIssues: [],
        projectContext: {
          path: '/test/project',
          name: 'test-project',
          language: ['typescript'],
        },
      })),
    };
    vi.mocked(scanning.ScanOrchestrator).mockImplementation(function() { return mockScanOrchestrator; });

    // Mock ScanResultProcessor
    vi.mocked(scanning.ScanResultProcessor.formatAsTextSummary).mockImplementation(function() {
      return 'SONARQUBE ANALYSIS RESULTS\n\nProject: test-project\nTotal Issues: 5';
    });

    // Set environment variables
    process.env.SONAR_URL = 'http://localhost:9000';
    process.env.SONAR_TOKEN = 'test-token';
  });

  describe('Success cases', () => {
    it('should validate input and call ScanOrchestrator', async () => {
      const args = {
        projectPath: '/test/project',
        severityFilter: ['CRITICAL'],
        autoSetup: false,
      };

      const result = await handleScanProject(args);

      expect(mockValidateInput).toHaveBeenCalledWith(
        expect.anything(),
        args,
        'sonar_scan_project'
      );
      expect(mockScanOrchestrator.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath: '/test/project',
          severityFilter: ['CRITICAL'],
          autoSetup: false,
        }),
        undefined
      );
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
    });

    it('should pass correlation ID through', async () => {
      const correlationId = 'test-corr-123';
      await handleScanProject({}, correlationId);

      expect(mockScanOrchestrator.execute).toHaveBeenCalledWith(
        expect.anything(),
        correlationId
      );
    });

    it('should format result as text summary', async () => {
      const result = await handleScanProject({});

      expect(result.content[0].text).toContain('SONARQUBE ANALYSIS RESULTS');
      expect(result.content[0].text).toContain('test-project');
    });

    it('should sanitize SONAR_URL from environment', async () => {
      await handleScanProject({});

      expect(mockSanitizeUrl).toHaveBeenCalledWith('http://localhost:9000');
    });

    it('should use default SONAR_URL when not set', async () => {
      delete process.env.SONAR_URL;
      await handleScanProject({});

      expect(mockSanitizeUrl).toHaveBeenCalledWith('http://localhost:9000');
    });
  });

  describe('Error handling', () => {
    it('should propagate validation errors', async () => {
      mockValidateInput.mockImplementation(function() {
        throw new Error('Validation failed');
      });

      await expect(handleScanProject({})).rejects.toThrow('Validation failed');
    });

    it('should propagate orchestrator errors', async () => {
      mockScanOrchestrator.execute = vi.fn(async () => {
        throw new Error('Scan failed');
      });

      await expect(handleScanProject({})).rejects.toThrow('Scan failed');
    });
  });

  describe('Parameter handling', () => {
    it('should handle all severity filters', async () => {
      mockValidateInput.mockImplementation(() => ({
        severityFilter: ['BLOCKER', 'CRITICAL', 'MAJOR'],
      }));

      await handleScanProject({});

      expect(mockScanOrchestrator.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          severityFilter: ['BLOCKER', 'CRITICAL', 'MAJOR'],
        }),
        undefined
      );
    });

    it('should handle all type filters', async () => {
      mockValidateInput.mockImplementation(() => ({
        typeFilter: ['BUG', 'VULNERABILITY', 'CODE_SMELL'],
      }));

      await handleScanProject({});

      expect(mockScanOrchestrator.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          typeFilter: ['BUG', 'VULNERABILITY', 'CODE_SMELL'],
        }),
        undefined
      );
    });

    it('should handle autoSetup true', async () => {
      mockValidateInput.mockImplementation(() => ({
        autoSetup: true,
      }));

      await handleScanProject({});

      expect(mockScanOrchestrator.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          autoSetup: true,
        }),
        undefined
      );
    });
  });

  describe('ScanRecoverableError handling', () => {
    it('should handle ScanRecoverableError with fallback', async () => {
      const scanning = await import('../../core/scanning/index.js');
      const fallbackModule = await import('../../core/scanning/fallback/index.js');

      const recoverableError = new (scanning.ScanRecoverableError as any)(
        'Scan failed',
        { configIssues: [], scannerOutput: 'test output' }
      );
      mockScanOrchestrator.execute = vi.fn(async () => {
        throw recoverableError;
      });

      const mockFallbackService = {
        formatForOutput: vi.fn(() => 'SCAN FAILED WITH FALLBACK\n\nRecoverable error info')
      };
      vi.mocked(fallbackModule.ScanFallbackService).mockImplementation(function() { return mockFallbackService; });

      const result = await handleScanProject({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('SCAN FAILED WITH FALLBACK');
    });
  });
});

describe('ScanHandler (DI class)', () => {
  let mockScanOrchestrator: any;
  let mockValidateInput: any;
  let mockProjectManager: any;
  let mockSonarAdmin: any;

  beforeEach(async () => {
    // Mock validateInput
    const validators = await import('../../shared/validators/mcp-schemas');
    mockValidateInput = vi.mocked(validators.validateInput);
    mockValidateInput.mockImplementation(() => ({
      projectPath: '/test/project',
      severityFilter: ['CRITICAL'],
      typeFilter: ['BUG'],
      autoSetup: false,
    }));

    // Mock ScanOrchestrator
    const scanning = await import('../../core/scanning/index.js');
    mockScanOrchestrator = {
      execute: vi.fn(async () => ({
        projectKey: 'test-project',
        totalIssues: 5,
        issuesBySeverity: { CRITICAL: 2, MAJOR: 3 },
        qualityScore: 75,
        topIssues: [],
        projectContext: {
          path: '/test/project',
          name: 'test-project',
          language: ['typescript'],
        },
      })),
    };
    vi.mocked(scanning.ScanOrchestrator).mockImplementation(function() { return mockScanOrchestrator; });

    // Mock ScanResultProcessor
    vi.mocked(scanning.ScanResultProcessor.formatAsTextSummary).mockImplementation(function() {
      return 'SONARQUBE ANALYSIS RESULTS\n\nProject: test-project\nTotal Issues: 5';
    });

    // Mock dependencies
    mockProjectManager = {};
    mockSonarAdmin = {};
  });

  it('should validate input and call ScanOrchestrator', async () => {
    const handler = new ScanHandler(mockProjectManager, mockSonarAdmin);
    const args = {
      projectPath: '/test/project',
      severityFilter: ['CRITICAL'],
      autoSetup: false,
    };

    const result = await handler.handle(args);

    expect(mockValidateInput).toHaveBeenCalledWith(
      expect.anything(),
      args,
      'sonar_scan_project'
    );
    expect(mockScanOrchestrator.execute).toHaveBeenCalled();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('SONARQUBE ANALYSIS RESULTS');
  });

  it('should pass correlation ID through', async () => {
    const handler = new ScanHandler(mockProjectManager, mockSonarAdmin);
    await handler.handle({}, 'test-corr-scan');

    expect(mockScanOrchestrator.execute).toHaveBeenCalledWith(
      expect.anything(),
      'test-corr-scan'
    );
  });

  it('should handle severity filters', async () => {
    mockValidateInput.mockImplementation(() => ({
      severityFilter: ['BLOCKER', 'CRITICAL'],
    }));

    const handler = new ScanHandler(mockProjectManager, mockSonarAdmin);
    await handler.handle({ severityFilter: ['BLOCKER', 'CRITICAL'] });

    expect(mockScanOrchestrator.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        severityFilter: ['BLOCKER', 'CRITICAL'],
      }),
      undefined
    );
  });

  it('should handle type filters', async () => {
    mockValidateInput.mockImplementation(() => ({
      typeFilter: ['BUG', 'VULNERABILITY'],
    }));

    const handler = new ScanHandler(mockProjectManager, mockSonarAdmin);
    await handler.handle({ typeFilter: ['BUG', 'VULNERABILITY'] });

    expect(mockScanOrchestrator.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        typeFilter: ['BUG', 'VULNERABILITY'],
      }),
      undefined
    );
  });

  it('should handle autoSetup parameter', async () => {
    mockValidateInput.mockImplementation(() => ({
      autoSetup: true,
    }));

    const handler = new ScanHandler(mockProjectManager, mockSonarAdmin);
    await handler.handle({ autoSetup: true });

    expect(mockScanOrchestrator.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        autoSetup: true,
      }),
      undefined
    );
  });

  it('should propagate validation errors', async () => {
    mockValidateInput.mockImplementation(() => {
      throw new Error('DI Validation failed');
    });

    const handler = new ScanHandler(mockProjectManager, mockSonarAdmin);
    await expect(handler.handle({})).rejects.toThrow('DI Validation failed');
  });

  it('should propagate orchestrator errors', async () => {
    mockScanOrchestrator.execute = vi.fn(async () => {
      throw new Error('DI Scan failed');
    });

    const handler = new ScanHandler(mockProjectManager, mockSonarAdmin);
    await expect(handler.handle({})).rejects.toThrow('DI Scan failed');
  });

  it('should handle ScanRecoverableError with fallback', async () => {
    const scanning = await import('../../core/scanning/index.js');
    const fallbackModule = await import('../../core/scanning/fallback/index.js');

    const recoverableError = new (scanning.ScanRecoverableError as any)(
      'Scan failed',
      { configIssues: [], scannerOutput: 'test output' }
    );
    mockScanOrchestrator.execute = vi.fn(async () => {
      throw recoverableError;
    });

    const mockFallbackService = {
      formatForOutput: vi.fn(() => 'DI SCAN FAILED WITH FALLBACK\n\nRecoverable error info')
    };
    vi.mocked(fallbackModule.ScanFallbackService).mockImplementation(function() { return mockFallbackService; });

    const handler = new ScanHandler(mockProjectManager, mockSonarAdmin);
    const result = await handler.handle({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('DI SCAN FAILED WITH FALLBACK');
  });
});
