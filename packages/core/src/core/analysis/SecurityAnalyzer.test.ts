import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecurityAnalyzer } from './SecurityAnalyzer';
import { mockSecurityHotspot } from '../../../tests/fixtures/mock-sonar-responses';

// Create mock instances at module level
const mockProjectManager = {
  getOrCreateConfig: vi.fn(() => Promise.resolve()),
  getWorkingDirectory: vi.fn(() => '/test/project'),
};

const mockSonarClient = {
  getSecurityHotspots: vi.fn(() => Promise.resolve([])),
  getSecurityHotspotDetails: vi.fn(() => Promise.resolve({})),
  getSourceContext: vi.fn(() => Promise.resolve('const example = "code";\nconst line = 25;\nconst more = "context";')),
};

const mockConfig = {
  sonarProjectKey: 'test-project',
  sonarUrl: 'http://localhost:9000',
  sonarToken: 'sqp_test_token_1234567890',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const mockHotspotDetails = {
  key: 'AX789-hotspot',
  component: {
    key: 'test-project:src/auth.ts',
    qualifier: 'FIL',
    name: 'auth.ts',
    longName: 'src/auth.ts',
    path: 'src/auth.ts'
  },
  vulnerabilityProbability: 'HIGH',
  securityCategory: 'weak-cryptography',
  status: 'TO_REVIEW',
  message: 'Make sure this weak hash algorithm is not used in a sensitive context',
  line: 25,
  rule: {
    key: 'javascript:S4790',
    name: 'Hashing algorithms should be used appropriately',
    securityCategory: 'weak-cryptography',
    vulnerabilityProbability: 'HIGH',
    riskDescription: '<p>Using weak hashing algorithms can expose your application to attacks.</p>',
    vulnerabilityDescription: '<p>Weak hashing algorithms like MD5 or SHA1 are vulnerable to collisions.</p>',
    fixRecommendations: '<p>Use strong hashing algorithms like SHA-256 or bcrypt.</p>',
  },
  assignee: 'john.doe',
  resolution: undefined,
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
  getVulnerabilityEmoji: vi.fn((probability: string) => {
    const emojis: Record<string, string> = {
      HIGH: '🔴',
      MEDIUM: '🟡',
      LOW: '🟢',
    };
    return emojis[probability] || '⚪';
  }),
  cleanHtmlContent: vi.fn((html: string) => html.replace(/<[^>]*>/g, '')),
  buildSourceContext: vi.fn((issue: any, context: string, contextLines?: number) => {
    return `SOURCE CODE CONTEXT\n\nContext: ${contextLines} lines around the issue\n\n\`\`\`typescript\n${context}\n\`\`\`\n\n`;
  }),
}));

describe('SecurityAnalyzer', () => {
  let analyzer: SecurityAnalyzer;

  beforeEach(() => {
    // Reset function call history but keep implementations
    vi.mocked(mockProjectManager.getOrCreateConfig).mockClear();
    vi.mocked(mockProjectManager.getWorkingDirectory).mockClear();
    vi.mocked(mockSonarClient.getSecurityHotspots).mockClear();
    vi.mocked(mockSonarClient.getSecurityHotspotDetails).mockClear();
    vi.mocked(mockSonarClient.getSourceContext).mockClear();

    // Set default return values
    mockProjectManager.getOrCreateConfig = vi.fn(async () => mockConfig);
    mockSonarClient.getSecurityHotspots = vi.fn(async () => [mockSecurityHotspot]);
    mockSonarClient.getSecurityHotspotDetails = vi.fn(async () => mockHotspotDetails);
    mockSonarClient.getSourceContext = vi.fn(async () => 'const example = "code";\nconst line = 25;\nconst more = "context";');

    analyzer = new SecurityAnalyzer(mockProjectManager as any);
  });

  describe('Constructor', () => {
    it('should create analyzer instance with project manager', () => {
      const instance = new SecurityAnalyzer(mockProjectManager as any);
      expect(instance).toBeDefined();
    });
  });

  describe('getSecurityHotspots - success cases', () => {
    it('should get security hotspots with default status TO_REVIEW', async () => {
      const options = {};
      const result = await analyzer.getSecurityHotspots(options);

      expect(result).toContain('SECURITY HOTSPOTS');
      expect(result).toContain('1 found');
      expect(mockSonarClient.getSecurityHotspots).toHaveBeenCalledWith({
        statuses: ['TO_REVIEW'],
        resolutions: undefined,
        severities: undefined,
      });
    });

    it('should get security hotspots with custom statuses', async () => {
      const options = { statuses: ['TO_REVIEW', 'REVIEWED'] };
      await analyzer.getSecurityHotspots(options);

      expect(mockSonarClient.getSecurityHotspots).toHaveBeenCalledWith({
        statuses: ['TO_REVIEW', 'REVIEWED'],
        resolutions: undefined,
        severities: undefined,
      });
    });

    it('should get security hotspots with resolutions filter', async () => {
      const options = {
        statuses: ['REVIEWED'],
        resolutions: ['SAFE', 'FIXED'],
      };
      await analyzer.getSecurityHotspots(options);

      expect(mockSonarClient.getSecurityHotspots).toHaveBeenCalledWith({
        statuses: ['REVIEWED'],
        resolutions: ['SAFE', 'FIXED'],
        severities: undefined,
      });
    });

    it('should get security hotspots with severities filter', async () => {
      const options = {
        severities: ['HIGH', 'CRITICAL'],
      };
      await analyzer.getSecurityHotspots(options);

      expect(mockSonarClient.getSecurityHotspots).toHaveBeenCalledWith({
        statuses: ['TO_REVIEW'],
        resolutions: undefined,
        severities: ['HIGH', 'CRITICAL'],
      });
    });

    it('should return no hotspots message when none found', async () => {
      mockSonarClient.getSecurityHotspots = vi.fn(async () => []);

      const options = { statuses: ['TO_REVIEW'] };
      const result = await analyzer.getSecurityHotspots(options);

      expect(result).toContain('No security hotspots found');
      expect(result).toContain('Great work on security!');
    });

    it('should group hotspots by vulnerability probability', async () => {
      mockSonarClient.getSecurityHotspots = vi.fn(async () => [
        { ...mockSecurityHotspot, key: 'hot-1', vulnerabilityProbability: 'HIGH' },
        { ...mockSecurityHotspot, key: 'hot-2', vulnerabilityProbability: 'LOW' },
        { ...mockSecurityHotspot, key: 'hot-3', vulnerabilityProbability: 'MEDIUM' },
        { ...mockSecurityHotspot, key: 'hot-4', vulnerabilityProbability: 'HIGH' },
      ]);

      const result = await analyzer.getSecurityHotspots({});

      expect(result).toContain('HIGH PROBABILITY (2 hotspots)');
      expect(result).toContain('MEDIUM PROBABILITY (1 hotspots)');
      expect(result).toContain('LOW PROBABILITY (1 hotspots)');
    });

    it('should display hotspot details in list', async () => {
      const result = await analyzer.getSecurityHotspots({});

      expect(result).toContain(mockSecurityHotspot.message);
      expect(result).toContain(mockSecurityHotspot.key);
      expect(result).toContain(mockSecurityHotspot.component);
      expect(result).toContain(`line ${mockSecurityHotspot.line}`);
      expect(result).toContain(mockSecurityHotspot.status);
      expect(result).toContain(mockSecurityHotspot.securityCategory);
    });

    it('should display resolution when available', async () => {
      mockSonarClient.getSecurityHotspots = vi.fn(async () => [
        { ...mockSecurityHotspot, resolution: 'SAFE' },
      ]);

      const result = await analyzer.getSecurityHotspots({});

      expect(result).toContain('Resolution: SAFE');
    });

    it('should handle hotspot without line number', async () => {
      mockSonarClient.getSecurityHotspots = vi.fn(async () => [
        { ...mockSecurityHotspot, line: undefined },
      ]);

      const result = await analyzer.getSecurityHotspots({});

      expect(result).toContain(mockSecurityHotspot.component);
      expect(result).not.toContain('line');
    });

    it('should include usage hint for details command', async () => {
      const result = await analyzer.getSecurityHotspots({});

      expect(result).toContain('sonar_get_security_hotspot_details');
    });

    it('should pass correlationId through logging', async () => {
      const correlationId = 'test-correlation-123';
      await analyzer.getSecurityHotspots({}, correlationId);

      expect(mockSonarClient.getSecurityHotspots).toHaveBeenCalled();
    });
  });

  describe('getSecurityHotspots - error cases', () => {
    it('should handle getOrCreateConfig errors', async () => {
      mockProjectManager.getOrCreateConfig = vi.fn(async () => {
        throw new Error('Config not found');
      });

      await expect(analyzer.getSecurityHotspots({})).rejects.toThrow(
        'Config not found'
      );
    });

    it('should handle SonarQube API errors', async () => {
      mockSonarClient.getSecurityHotspots = vi.fn(async () => {
        throw new Error('API error');
      });

      await expect(analyzer.getSecurityHotspots({})).rejects.toThrow(
        'API error'
      );
    });
  });

  describe('getHotspotDetails - success cases', () => {
    it('should get hotspot details with default options', async () => {
      const options = { hotspotKey: 'AX789-hotspot' };
      const result = await analyzer.getHotspotDetails(options);

      expect(result).toContain('SECURITY HOTSPOT DETAILS');
      expect(result).toContain(mockHotspotDetails.message);
      expect(mockSonarClient.getSecurityHotspotDetails).toHaveBeenCalledWith(
        'AX789-hotspot'
      );
    });

    it('should display location information', async () => {
      const options = { hotspotKey: 'AX789-hotspot' };
      const result = await analyzer.getHotspotDetails(options);

      expect(result).toContain('LOCATION:');
      expect(result).toContain('File: src/auth.ts');
      expect(result).toContain('Line: 25');
    });

    it('should display absolute file path when includeFilePath is true', async () => {
      const options = {
        hotspotKey: 'AX789-hotspot',
        includeFilePath: true,
      };
      const result = await analyzer.getHotspotDetails(options);

      expect(result).toContain('Absolute Path:');
      expect(result).toContain('/test/project');
    });

    it('should not display absolute path when includeFilePath is false', async () => {
      const options = {
        hotspotKey: 'AX789-hotspot',
        includeFilePath: false,
      };
      const result = await analyzer.getHotspotDetails(options);

      expect(result).not.toContain('Absolute Path:');
    });

    it('should display risk assessment information', async () => {
      const options = { hotspotKey: 'AX789-hotspot' };
      const result = await analyzer.getHotspotDetails(options);

      expect(result).toContain('RISK ASSESSMENT:');
      expect(result).toContain('Vulnerability Probability: HIGH');
      expect(result).toContain('Security Category: weak-cryptography');
      expect(result).toContain('Status: TO_REVIEW');
    });

    it('should display assignee when available', async () => {
      const options = { hotspotKey: 'AX789-hotspot' };
      const result = await analyzer.getHotspotDetails(options);

      expect(result).toContain('Assignee: john.doe');
    });

    it('should display resolution when available', async () => {
      mockSonarClient.getSecurityHotspotDetails = vi.fn(async () => ({
        ...mockHotspotDetails,
        resolution: 'SAFE',
      }));

      const options = { hotspotKey: 'AX789-hotspot' };
      const result = await analyzer.getHotspotDetails(options);

      expect(result).toContain('Resolution: SAFE');
    });

    it('should display rule information when includeRuleDetails is true', async () => {
      const options = {
        hotspotKey: 'AX789-hotspot',
        includeRuleDetails: true,
      };
      const result = await analyzer.getHotspotDetails(options);

      expect(result).toContain('RULE INFORMATION:');
      expect(result).toContain('Rule: javascript:S4790');
      expect(result).toContain('Name: Hashing algorithms should be used appropriately');
    });

    it('should not display rule information when includeRuleDetails is false', async () => {
      const options = {
        hotspotKey: 'AX789-hotspot',
        includeRuleDetails: false,
      };
      const result = await analyzer.getHotspotDetails(options);

      expect(result).not.toContain('RULE INFORMATION:');
    });

    it('should display risk description when available', async () => {
      const options = {
        hotspotKey: 'AX789-hotspot',
        includeRuleDetails: true,
      };
      const result = await analyzer.getHotspotDetails(options);

      expect(result).toContain('RISK DESCRIPTION:');
      expect(result).toContain('Using weak hashing algorithms');
    });

    it('should display vulnerability description when available', async () => {
      const options = {
        hotspotKey: 'AX789-hotspot',
        includeRuleDetails: true,
      };
      const result = await analyzer.getHotspotDetails(options);

      expect(result).toContain('VULNERABILITY:');
      expect(result).toContain('Weak hashing algorithms like MD5 or SHA1');
    });

    it('should display fix recommendations when available', async () => {
      const options = {
        hotspotKey: 'AX789-hotspot',
        includeRuleDetails: true,
      };
      const result = await analyzer.getHotspotDetails(options);

      expect(result).toContain('FIX RECOMMENDATIONS:');
      expect(result).toContain('Use strong hashing algorithms');
    });

    it('should display next steps', async () => {
      const options = { hotspotKey: 'AX789-hotspot' };
      const result = await analyzer.getHotspotDetails(options);

      expect(result).toContain('NEXT STEPS:');
      expect(result).toContain('Review the code');
      expect(result).toContain('Re-scan the project');
    });

    it('should handle hotspot without line number', async () => {
      mockSonarClient.getSecurityHotspotDetails = vi.fn(async () => ({
        ...mockHotspotDetails,
        line: undefined,
      }));

      const options = { hotspotKey: 'AX789-hotspot' };
      const result = await analyzer.getHotspotDetails(options);

      expect(result).toContain('File:');
      expect(result).not.toContain('Line:');
    });

    it('should handle hotspot without rule details', async () => {
      mockSonarClient.getSecurityHotspotDetails = vi.fn(async () => ({
        ...mockHotspotDetails,
        rule: undefined,
      }));

      const options = {
        hotspotKey: 'AX789-hotspot',
        includeRuleDetails: true,
      };
      const result = await analyzer.getHotspotDetails(options);

      expect(result).not.toContain('RULE INFORMATION:');
    });

    it('should handle component as string for backwards compatibility', async () => {
      mockSonarClient.getSecurityHotspotDetails = vi.fn(async () => ({
        ...mockHotspotDetails,
        component: 'test-project:src/legacy.ts',
      }));

      const options = { hotspotKey: 'AX789-hotspot' };
      const result = await analyzer.getHotspotDetails(options);

      expect(result).toContain('File: test-project:src/legacy.ts');
    });

    it('should handle rule without optional fields', async () => {
      mockSonarClient.getSecurityHotspotDetails = vi.fn(async () => ({
        ...mockHotspotDetails,
        rule: {
          key: 'javascript:S4790',
          name: 'Hashing algorithms',
          securityCategory: undefined,
          vulnerabilityProbability: undefined,
          riskDescription: undefined,
          vulnerabilityDescription: undefined,
          fixRecommendations: undefined,
        },
      }));

      const options = {
        hotspotKey: 'AX789-hotspot',
        includeRuleDetails: true,
      };
      const result = await analyzer.getHotspotDetails(options);

      expect(result).toContain('RULE INFORMATION:');
      expect(result).not.toContain('RISK DESCRIPTION:');
      expect(result).not.toContain('VULNERABILITY:');
      expect(result).not.toContain('FIX RECOMMENDATIONS:');
    });

    it('should pass correlationId through logging', async () => {
      const options = { hotspotKey: 'AX789-hotspot' };
      const correlationId = 'test-correlation-123';

      await analyzer.getHotspotDetails(options, correlationId);

      expect(mockSonarClient.getSecurityHotspotDetails).toHaveBeenCalled();
    });

    it('should include source code context when available', async () => {
      const options = { hotspotKey: 'AX789-hotspot' };
      const result = await analyzer.getHotspotDetails(options);

      expect(mockSonarClient.getSourceContext).toHaveBeenCalledWith(
        'test-project:src/auth.ts',
        25,
        10
      );
      expect(result).toContain('SOURCE CODE CONTEXT');
    });

    it('should use custom contextLines when provided', async () => {
      const options = {
        hotspotKey: 'AX789-hotspot',
        contextLines: 20
      };
      await analyzer.getHotspotDetails(options);

      expect(mockSonarClient.getSourceContext).toHaveBeenCalledWith(
        'test-project:src/auth.ts',
        25,
        20
      );
    });

    it('should handle missing source context gracefully', async () => {
      mockSonarClient.getSourceContext = vi.fn(async () => {
        throw new Error('Source not found');
      });

      const options = { hotspotKey: 'AX789-hotspot' };
      const result = await analyzer.getHotspotDetails(options);

      // Should not throw and should still return valid hotspot details
      expect(result).toContain('SECURITY HOTSPOT DETAILS');
      expect(result).not.toContain('SOURCE CODE CONTEXT');
    });

    it('should not fetch source context when hotspot has no line number', async () => {
      mockSonarClient.getSecurityHotspotDetails = vi.fn(async () => ({
        ...mockHotspotDetails,
        line: undefined
      }));

      const options = { hotspotKey: 'AX789-hotspot' };
      await analyzer.getHotspotDetails(options);

      expect(mockSonarClient.getSourceContext).not.toHaveBeenCalled();
    });
  });

  describe('getHotspotDetails - error cases', () => {
    it('should handle getOrCreateConfig errors', async () => {
      mockProjectManager.getOrCreateConfig = vi.fn(async () => {
        throw new Error('Config not found');
      });

      const options = { hotspotKey: 'AX789-hotspot' };

      await expect(analyzer.getHotspotDetails(options)).rejects.toThrow(
        'Config not found'
      );
    });

    it('should handle SonarQube API errors', async () => {
      mockSonarClient.getSecurityHotspotDetails = vi.fn(async () => {
        throw new Error('Hotspot not found');
      });

      const options = { hotspotKey: 'AX789-hotspot' };

      await expect(analyzer.getHotspotDetails(options)).rejects.toThrow(
        'Hotspot not found'
      );
    });
  });

  describe('Probability grouping edge cases', () => {
    it('should handle hotspots with unknown probability', async () => {
      mockSonarClient.getSecurityHotspots = vi.fn(async () => [
        { ...mockSecurityHotspot, vulnerabilityProbability: undefined },
      ]);

      const result = await analyzer.getSecurityHotspots({});

      expect(result).toContain('MEDIUM PROBABILITY');
    });

    it('should handle mixed probability levels', async () => {
      mockSonarClient.getSecurityHotspots = vi.fn(async () => [
        { ...mockSecurityHotspot, key: 'hot-1', vulnerabilityProbability: 'HIGH' },
        { ...mockSecurityHotspot, key: 'hot-2', vulnerabilityProbability: 'HIGH' },
        { ...mockSecurityHotspot, key: 'hot-3', vulnerabilityProbability: 'LOW' },
      ]);

      const result = await analyzer.getSecurityHotspots({});

      expect(result).toContain('HIGH PROBABILITY (2 hotspots)');
      expect(result).toContain('LOW PROBABILITY (1 hotspots)');
      expect(result).not.toContain('MEDIUM PROBABILITY');
    });
  });
});
