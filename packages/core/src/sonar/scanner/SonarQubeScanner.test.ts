import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SonarQubeScanner } from './SonarQubeScanner.js';
import { SonarQubeApiClient } from '../api/SonarQubeApiClient.js';
import { RuleCache } from '../cache/RuleCache.js';
import { SonarIssue } from '../types.js';

// Mock dependencies
vi.mock('../api/SonarQubeApiClient.js');
vi.mock('../cache/RuleCache.js');

describe('SonarQubeScanner', () => {
  let scanner: SonarQubeScanner;
  let mockApiClient: {
    getPaginated: ReturnType<typeof vi.fn>;
    checkConnection: ReturnType<typeof vi.fn>;
    baseUrl: string;
  };
  let mockRuleCache: RuleCache;

  const mockSonarIssue: SonarIssue = {
    key: 'AYX123',
    rule: 'java:S1234',
    severity: 'MAJOR',
    component: 'project:src/main/java/Example.java',
    project: 'project',
    line: 42,
    textRange: {
      startLine: 42,
      endLine: 42,
      startOffset: 10,
      endOffset: 50,
    },
    flows: [],
    status: 'OPEN',
    message: 'Remove this unused variable',
    type: 'CODE_SMELL',
    tags: ['unused', 'clean-code'],
    creationDate: '2024-01-15T10:00:00Z',
    updateDate: '2024-01-15T10:00:00Z',
    effort: '5min',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockApiClient = {
      getPaginated: vi.fn(),
      checkConnection: vi.fn(),
      baseUrl: 'http://sonarqube:9000',
    };

    mockRuleCache = new RuleCache();

    scanner = new SonarQubeScanner(
      mockApiClient as unknown as SonarQubeApiClient,
      mockRuleCache
    );
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(scanner.name).toBe('sonarqube');
    });

    it('should have correct type', () => {
      expect(scanner.type).toBe('sast');
    });
  });

  describe('getIssues', () => {
    it('should fetch and convert issues to unified format', async () => {
      mockApiClient.getPaginated.mockResolvedValueOnce([mockSonarIssue]);

      const issues = await scanner.getIssues('test-project');

      expect(mockApiClient.getPaginated).toHaveBeenCalledWith(
        '/api/issues/search',
        expect.objectContaining({
          componentKeys: 'test-project',
        }),
        expect.any(Object)
      );

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        id: 'AYX123',
        source: 'sonarqube',
        type: 'CODE_SMELL',
        severity: 'HIGH', // MAJOR maps to HIGH
        status: 'OPEN',
        message: 'Remove this unused variable',
        ruleId: 'java:S1234',
      });
    });

    it('should convert issue location correctly', async () => {
      mockApiClient.getPaginated.mockResolvedValueOnce([mockSonarIssue]);

      const issues = await scanner.getIssues('test-project');

      expect(issues[0].location).toMatchObject({
        filePath: 'src/main/java/Example.java',
        startLine: 42,
        endLine: 42,
        startOffset: 10,
        endOffset: 50,
      });
    });

    it('should handle severity mapping', async () => {
      const severityTests = [
        { sonar: 'BLOCKER', unified: 'CRITICAL' },
        { sonar: 'CRITICAL', unified: 'CRITICAL' },
        { sonar: 'MAJOR', unified: 'HIGH' },
        { sonar: 'MINOR', unified: 'MEDIUM' },
        { sonar: 'INFO', unified: 'INFO' },
      ];

      for (const test of severityTests) {
        mockApiClient.getPaginated.mockResolvedValueOnce([
          { ...mockSonarIssue, severity: test.sonar },
        ]);

        const issues = await scanner.getIssues('test-project');
        expect(issues[0].severity).toBe(test.unified);
      }
    });

    it('should handle type mapping', async () => {
      const typeTests = [
        { sonar: 'BUG', unified: 'BUG' },
        { sonar: 'VULNERABILITY', unified: 'VULNERABILITY' },
        { sonar: 'CODE_SMELL', unified: 'CODE_SMELL' },
        { sonar: 'SECURITY_HOTSPOT', unified: 'SECURITY_HOTSPOT' },
      ];

      for (const test of typeTests) {
        mockApiClient.getPaginated.mockResolvedValueOnce([
          { ...mockSonarIssue, type: test.sonar },
        ]);

        const issues = await scanner.getIssues('test-project');
        expect(issues[0].type).toBe(test.unified);
      }
    });

    it('should apply severity filter', async () => {
      mockApiClient.getPaginated.mockResolvedValueOnce([]);

      await scanner.getIssues('test-project', {
        severities: ['CRITICAL', 'HIGH'],
      });

      expect(mockApiClient.getPaginated).toHaveBeenCalledWith(
        '/api/issues/search',
        expect.objectContaining({
          severities: 'BLOCKER,CRITICAL',
        }),
        expect.any(Object)
      );
    });

    it('should apply type filter', async () => {
      mockApiClient.getPaginated.mockResolvedValueOnce([]);

      await scanner.getIssues('test-project', {
        types: ['BUG', 'VULNERABILITY'],
      });

      expect(mockApiClient.getPaginated).toHaveBeenCalledWith(
        '/api/issues/search',
        expect.objectContaining({
          types: 'BUG,VULNERABILITY',
        }),
        expect.any(Object)
      );
    });

    it('should throw when not initialized', async () => {
      const uninitializedScanner = new SonarQubeScanner();

      await expect(uninitializedScanner.getIssues('test-project')).rejects.toThrow(
        'not initialized'
      );
    });

    it('should throw when project key is missing', async () => {
      await expect(scanner.getIssues('')).rejects.toThrow('Project key is required');
    });

    it('should include remediation effort when present', async () => {
      mockApiClient.getPaginated.mockResolvedValueOnce([mockSonarIssue]);

      const issues = await scanner.getIssues('test-project');

      expect(issues[0].remediation).toMatchObject({
        effort: '5min',
      });
    });

    it('should preserve raw data', async () => {
      mockApiClient.getPaginated.mockResolvedValueOnce([mockSonarIssue]);

      const issues = await scanner.getIssues('test-project');

      expect(issues[0].rawData).toEqual(mockSonarIssue);
    });
  });

  describe('checkHealth', () => {
    it('should return available status when connected', async () => {
      mockApiClient.checkConnection.mockResolvedValueOnce({
        connected: true,
        version: '9.9.0',
      });

      const status = await scanner.checkHealth();

      expect(status.available).toBe(true);
      expect(status.version).toBe('9.9.0');
      expect(status.lastChecked).toBeDefined();
    });

    it('should return unavailable status when not connected', async () => {
      mockApiClient.checkConnection.mockResolvedValueOnce({
        connected: false,
        error: 'Connection refused',
      });

      const status = await scanner.checkHealth();

      expect(status.available).toBe(false);
      expect(status.errorMessage).toBe('Connection refused');
    });

    it('should return not initialized error when scanner not initialized', async () => {
      const uninitializedScanner = new SonarQubeScanner();

      const status = await uninitializedScanner.checkHealth();

      expect(status.available).toBe(false);
      expect(status.errorMessage).toBe('Scanner not initialized');
    });
  });

  describe('scan', () => {
    it('should throw not implemented error', async () => {
      await expect(
        scanner.scan({ projectPath: '/test', projectKey: 'test' })
      ).rejects.toThrow('not yet implemented');
    });
  });

  describe('initialize', () => {
    it('should initialize with configuration', () => {
      const newScanner = new SonarQubeScanner();

      // Should not throw
      newScanner.initialize({
        baseUrl: 'http://sonarqube:9000',
        token: 'test-token',
        projectKey: 'test-project',
      });

      // After initialization, checkHealth should work
      // (even if connection fails, it won't throw "not initialized")
    });
  });

  describe('getConfig', () => {
    it('should return default config', () => {
      const config = scanner.getConfig();
      expect(config.enabled).toBe(true);
    });

    it('should return updated config after configure', () => {
      scanner.configure({ enabled: false });
      const config = scanner.getConfig();
      expect(config.enabled).toBe(false);
    });
  });
});
