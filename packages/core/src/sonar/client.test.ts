import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SonarQubeClient } from './client';
import axios from 'axios';
import * as fs from 'fs/promises';
import {
  mockIssuesResponse,
  mockSourceCode,
  mockRule,
  mockRulesResponse,
  mockMetrics,
  mockComponentDetails,
  mockSecurityHotspotsResponse,
  mockDuplicationData,
  mock401Response,
  mock403Response,
  mock404Response,
  mockLineCoverage,
  createMockLineCoverage,
} from '../../tests/fixtures/mock-sonar-responses';

// Mock axios
vi.mock('axios');

// Mock fs/promises
vi.mock('fs/promises', () => ({
  writeFile: vi.fn(() => Promise.resolve()),
  unlink: vi.fn(() => Promise.resolve()),
  readFile: vi.fn(() => Promise.resolve('')),
  stat: vi.fn(() => Promise.resolve({})),
  readdir: vi.fn(() => Promise.resolve([])),
  access: vi.fn(() => Promise.resolve()),
}));

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn((cmd, options, callback) => {
    if (callback) {
      callback(null, { stdout: 'Analysis completed', stderr: '' });
    }
  }),
}));

describe('SonarQubeClient', () => {
  let client: SonarQubeClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock axios instance
    mockAxiosInstance = {
      get: vi.fn(() => Promise.resolve({ data: {} })),
      post: vi.fn(() => Promise.resolve({ data: {} })),
      delete: vi.fn(() => Promise.resolve({ data: {} })),
      defaults: {
        baseURL: 'http://localhost:9000/',
        headers: {
          Authorization: 'Bearer test-token',
        },
      },
      interceptors: {
        response: {
          use: vi.fn(() => {}),
        },
      },
    };

    (axios.create as any) = vi.fn(() => mockAxiosInstance);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create client with correct configuration', () => {
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project'
      );

      // sanitizeUrl adds trailing slash via URL.toString()
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://localhost:9000/',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
          timeout: 30000,
        })
      );
    });

    it('should normalize URL with sanitizeUrl', () => {
      client = new SonarQubeClient(
        'http://localhost:9000/',
        'test-token',
        'test-project'
      );

      // URL.toString() normalizes and adds trailing slash
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://localhost:9000/',
        })
      );
    });

    it('should setup response interceptor', () => {
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project'
      );

      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('getIssues', () => {
    beforeEach(() => {
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project'
      );
    });

    it('should fetch issues successfully', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockIssuesResponse }));

      const issues = await client.getIssues();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/issues/search', {
        params: expect.objectContaining({
          componentKeys: 'test-project',
          resolved: false,
          ps: 500,
        }),
      });
      expect(issues).toEqual(mockIssuesResponse.issues);
    });

    it('should apply severity filter', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockIssuesResponse }));

      await client.getIssues({ severities: ['CRITICAL', 'BLOCKER'] });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/issues/search',
        expect.objectContaining({
          params: expect.objectContaining({
            severities: 'CRITICAL,BLOCKER',
          }),
        })
      );
    });

    it('should apply type filter', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockIssuesResponse }));

      await client.getIssues({ types: ['BUG', 'VULNERABILITY'] });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/issues/search',
        expect.objectContaining({
          params: expect.objectContaining({
            types: 'BUG,VULNERABILITY',
          }),
        })
      );
    });

    it('should handle API errors', async () => {
      mockAxiosInstance.get = vi.fn(async () => { throw new Error('API Error'); });

      await expect(client.getIssues()).rejects.toThrow('API Error');
    });

    it('should handle 401 unauthorized', async () => {
      mockAxiosInstance.get = vi.fn(async () => { throw {
        response: { status: 401, data: mock401Response },
      }; });

      await expect(client.getIssues()).rejects.toThrow();
    });

    it('should handle 403 forbidden', async () => {
      mockAxiosInstance.get = vi.fn(async () => { throw {
        response: { status: 403, data: mock403Response },
      }; });

      await expect(client.getIssues()).rejects.toThrow();
    });

    it('should handle 404 not found', async () => {
      mockAxiosInstance.get = vi.fn(async () => { throw {
        response: { status: 404, data: mock404Response },
      }; });

      await expect(client.getIssues()).rejects.toThrow();
    });

    it('should handle pagination for large result sets', async () => {
      // Mock response for first page (total: 1500 issues, 3 pages needed)
      const firstPageResponse = {
        total: 1500,
        issues: Array(500).fill(null).map((_, i) => ({
          ...mockIssuesResponse.issues[0],
          key: `issue-${i}`,
        })),
      };

      // Mock response for second and third pages
      const secondPageResponse = {
        total: 1500,
        issues: Array(500).fill(null).map((_, i) => ({
          ...mockIssuesResponse.issues[0],
          key: `issue-${i + 500}`,
        })),
      };

      const thirdPageResponse = {
        total: 1500,
        issues: Array(500).fill(null).map((_, i) => ({
          ...mockIssuesResponse.issues[0],
          key: `issue-${i + 1000}`,
        })),
      };

      // Mock project search response
      const projectSearchResponse = {
        components: [{
          key: 'test-project',
          name: 'Test Project',
          lastAnalysisDate: new Date().toISOString(),
        }],
      };

      // Setup mock to return different responses based on call count
      let callCount = 0;
      mockAxiosInstance.get = vi.fn(async (url: string, config: any) => {
        if (url === '/api/projects/search') {
          return { data: projectSearchResponse };
        }

        callCount++;
        if (callCount === 1) {
          return { data: firstPageResponse };
        } else if (callCount === 2) {
          return { data: secondPageResponse };
        } else {
          return { data: thirdPageResponse };
        }
      });

      const issues = await client.getIssues();

      // Should have called with page 1, 2, and 3
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/issues/search', {
        params: expect.objectContaining({ p: 1 }),
      });
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/issues/search', {
        params: expect.objectContaining({ p: 2 }),
      });
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/issues/search', {
        params: expect.objectContaining({ p: 3 }),
      });

      // Should have returned all 1500 issues
      expect(issues).toHaveLength(1500);
      expect(issues[0].key).toBe('issue-0');
      expect(issues[500].key).toBe('issue-500');
      expect(issues[1000].key).toBe('issue-1000');
    });

    it('should not paginate when total is less than page size', async () => {
      // Mock response with only 100 issues
      const singlePageResponse = {
        total: 100,
        issues: Array(100).fill(null).map((_, i) => ({
          ...mockIssuesResponse.issues[0],
          key: `issue-${i}`,
        })),
      };

      const projectSearchResponse = {
        components: [{
          key: 'test-project',
          name: 'Test Project',
          lastAnalysisDate: new Date().toISOString(),
        }],
      };

      mockAxiosInstance.get = vi.fn(async (url: string) => {
        if (url === '/api/projects/search') {
          return { data: projectSearchResponse };
        }
        return { data: singlePageResponse };
      });

      const issues = await client.getIssues();

      // Should only call once (no pagination needed)
      const issueSearchCalls = vi.mocked(mockAxiosInstance.get).mock.calls.filter(
        call => call[0] === '/api/issues/search'
      );
      expect(issueSearchCalls).toHaveLength(1);
      expect(issues).toHaveLength(100);
    });
  });

  describe('getSourceContext', () => {
    beforeEach(() => {
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project'
      );
    });

    it('should fetch source code context successfully from raw endpoint', async () => {
      const rawCode = `function example() {
  const used = "value";
  const unused = "test"; // Issue here
  return used;
}`;
      mockAxiosInstance.get = vi.fn(async () => ({ data: rawCode }));

      const source = await client.getSourceContext('test-file.ts', 2, 2);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/sources/raw', {
        params: {
          key: 'test-file.ts'
        },
      });
      // Should return a string with context lines around line 2
      expect(typeof source).toBe('string');
      expect(source.length).toBeGreaterThan(0);
    });

    it('should handle missing source code gracefully', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: null }));

      const source = await client.getSourceContext('missing-file.ts', 1, 5);

      expect(source).toEqual('');
    });

    it('should handle API errors gracefully', async () => {
      mockAxiosInstance.get = vi.fn(async () => { throw new Error('API error'); });

      const source = await client.getSourceContext('error-file.ts', 1, 5);

      expect(source).toEqual('');
    });
  });

  describe('getIssues with enhanced context', () => {
    beforeEach(() => {
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project'
      );
    });

    it('should request additionalFields=_all for full issue context', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockIssuesResponse }));

      await client.getIssues();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/issues/search',
        expect.objectContaining({
          params: expect.objectContaining({
            additionalFields: '_all',
          }),
        })
      );
    });

    it('should include transitions in issue response', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockIssuesResponse }));

      const issues = await client.getIssues();

      expect(issues[0]).toHaveProperty('transitions');
      expect(issues[0].transitions).toEqual(['resolve', 'wontfix', 'falsepositive']);
    });

    it('should include actions in issue response', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockIssuesResponse }));

      const issues = await client.getIssues();

      expect(issues[0]).toHaveProperty('actions');
      expect(issues[0].actions).toEqual(['set_type', 'set_tags', 'comment', 'set_severity']);
    });

    it('should include comments in issue response', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockIssuesResponse }));

      const issues = await client.getIssues();

      expect(issues[0]).toHaveProperty('comments');
      expect(issues[0].comments).toHaveLength(1);
      expect(issues[0].comments?.[0]).toHaveProperty('login', 'user1');
    });

    it('should include clean code attributes', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockIssuesResponse }));

      const issues = await client.getIssues();

      expect(issues[0]).toHaveProperty('cleanCodeAttribute', 'COMPLETE');
      expect(issues[0]).toHaveProperty('cleanCodeAttributeCategory', 'INTENTIONAL');
    });

    it('should include software quality impacts', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockIssuesResponse }));

      const issues = await client.getIssues();

      expect(issues[0]).toHaveProperty('impacts');
      expect(issues[0].impacts).toHaveLength(1);
      expect(issues[0].impacts?.[0]).toEqual({
        softwareQuality: 'MAINTAINABILITY',
        severity: 'LOW',
      });
    });
  });

  describe('getRuleDetails', () => {
    beforeEach(() => {
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project'
      );
    });

    it('should fetch rule details successfully', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockRule }));

      const rule = await client.getRuleDetails('typescript:S1234');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/rules/show', {
        params: {
          key: 'typescript:S1234',
          actives: true,
        },
      });
      // Check key fields that must be present
      expect(rule.key).toBe('typescript:S1234');
      expect(rule.name).toBe('Unused variables should be removed');
      expect(rule.severity).toBe('MAJOR');
      expect(rule.type).toBe('CODE_SMELL');
      expect(rule.descriptionSections).toHaveLength(1);
    });

    it('should handle missing rule', async () => {
      mockAxiosInstance.get = vi.fn(async () => { throw {
        response: { status: 404 },
      }; });

      await expect(client.getRuleDetails('invalid:rule')).rejects.toThrow();
    });
  });

  describe('getProjectMetrics', () => {
    beforeEach(() => {
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project'
      );
    });

    it('should fetch metrics successfully', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockMetrics }));

      const metrics = await client.getProjectMetrics([
        'bugs',
        'vulnerabilities',
        'code_smells',
      ]);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/measures/component',
        {
          params: {
            component: 'test-project',
            metricKeys: 'bugs,vulnerabilities,code_smells',
          },
        }
      );
      expect(metrics).toHaveProperty('component');
      expect(metrics.component.measures).toHaveLength(
        mockMetrics.component.measures.length
      );
    });

    it('should handle empty metrics', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({
        data: { component: { measures: [] } },
      }));

      const metrics = await client.getProjectMetrics([]);

      expect(metrics.component.measures).toEqual([]);
    });
  });

  describe('getRulesSearch', () => {
    beforeEach(() => {
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project'
      );
    });

    it('should fetch rules successfully', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockRulesResponse }));

      const rules = await client.getRulesSearch();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/rules/search', {
        params: expect.objectContaining({
          p: 1,
          ps: 100,
        }),
      });
      expect(rules.total).toBe(3);
      expect(rules.rules).toHaveLength(3);
      expect(rules.rules[0].key).toBe('typescript:S1234');
    });

    it('should filter by language', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockRulesResponse }));

      await client.getRulesSearch({ languages: ['ts', 'js'] });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/rules/search',
        expect.objectContaining({
          params: expect.objectContaining({
            languages: 'ts,js',
          }),
        })
      );
    });

    it('should filter by type', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockRulesResponse }));

      await client.getRulesSearch({ types: ['CODE_SMELL', 'BUG'] });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/rules/search',
        expect.objectContaining({
          params: expect.objectContaining({
            types: 'CODE_SMELL,BUG',
          }),
        })
      );
    });

    it('should filter by severity', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockRulesResponse }));

      await client.getRulesSearch({ severities: ['MAJOR', 'CRITICAL'] });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/rules/search',
        expect.objectContaining({
          params: expect.objectContaining({
            severities: 'MAJOR,CRITICAL',
          }),
        })
      );
    });

    it('should filter by tags', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockRulesResponse }));

      await client.getRulesSearch({ tags: ['cwe', 'owasp'] });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/rules/search',
        expect.objectContaining({
          params: expect.objectContaining({
            tags: 'cwe,owasp',
          }),
        })
      );
    });

    it('should search by query string', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockRulesResponse }));

      await client.getRulesSearch({ searchQuery: 'unused variables' });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/rules/search',
        expect.objectContaining({
          params: expect.objectContaining({
            q: 'unused variables',
          }),
        })
      );
    });

    it('should support pagination', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockRulesResponse }));

      await client.getRulesSearch({}, 2, 50);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/rules/search',
        expect.objectContaining({
          params: expect.objectContaining({
            p: 2,
            ps: 50,
          }),
        })
      );
    });

    it('should include clean code attributes in rules', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockRulesResponse }));

      const rules = await client.getRulesSearch();

      expect(rules.rules[0]).toHaveProperty('cleanCodeAttribute', 'COMPLETE');
      expect(rules.rules[0]).toHaveProperty('cleanCodeAttributeCategory', 'INTENTIONAL');
    });

    it('should include impacts in rules', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockRulesResponse }));

      const rules = await client.getRulesSearch();

      expect(rules.rules[0]).toHaveProperty('impacts');
      expect(rules.rules[0].impacts).toHaveLength(1);
      expect(rules.rules[0].impacts?.[0]).toEqual({
        softwareQuality: 'MAINTAINABILITY',
        severity: 'LOW',
      });
    });
  });

  describe('getComponentDetails', () => {
    beforeEach(() => {
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project'
      );
    });

    it('should fetch component details successfully', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockComponentDetails }));

      const component = await client.getComponentDetails('test-project:src/main.ts');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/measures/component',
        expect.objectContaining({
          params: expect.objectContaining({
            component: 'test-project:src/main.ts',
            metricKeys: expect.stringContaining('ncloc'),
          }),
        })
      );
      expect(component.key).toBe('test-project:src/main.ts');
      expect(component.name).toBe('main.ts');
      expect(component.qualifier).toBe('FIL');
    });

    it('should include all default metrics', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockComponentDetails }));

      const component = await client.getComponentDetails('test-project:src/main.ts');

      expect(component.measures).toHaveLength(5);
      const metricKeys = component.measures.map((m: any) => m.metric);
      expect(metricKeys).toContain('ncloc');
      expect(metricKeys).toContain('complexity');
      expect(metricKeys).toContain('duplicated_lines_density');
      expect(metricKeys).toContain('coverage');
      expect(metricKeys).toContain('violations');
    });

    it('should allow custom metrics', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockComponentDetails }));

      await client.getComponentDetails('test-project:src/main.ts', [
        'ncloc',
        'complexity',
      ]);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/measures/component',
        expect.objectContaining({
          params: expect.objectContaining({
            metricKeys: 'ncloc,complexity',
          }),
        })
      );
    });

    it('should include file path and qualifier', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockComponentDetails }));

      const component = await client.getComponentDetails('test-project:src/main.ts');

      expect(component.path).toBe('src/main.ts');
      expect(component.qualifier).toBe('FIL');
    });

    it('should handle component with duplicate percentage', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockComponentDetails }));

      const component = await client.getComponentDetails('test-project:src/main.ts');

      const duplicationMetric = component.measures.find(
        (m: any) => m.metric === 'duplicated_lines_density'
      );
      expect(duplicationMetric?.value).toBe('12.0');
    });

    it('should handle component with coverage metric', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockComponentDetails }));

      const component = await client.getComponentDetails('test-project:src/main.ts');

      const coverageMetric = component.measures.find(
        (m: any) => m.metric === 'coverage'
      );
      expect(coverageMetric?.value).toBe('82.0');
    });

    it('should throw error when component not found', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: { component: null } }));

      await expect(
        client.getComponentDetails('non-existent-component')
      ).rejects.toThrow('not found');
    });
  });

  describe('getSecurityHotspots', () => {
    beforeEach(() => {
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project'
      );
    });

    it('should fetch security hotspots successfully', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({
        data: mockSecurityHotspotsResponse,
      }));

      const hotspots = await client.getSecurityHotspots();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/hotspots/search',
        {
          params: expect.objectContaining({
            projectKey: 'test-project',
          }),
        }
      );
      expect(hotspots).toEqual(mockSecurityHotspotsResponse.hotspots);
    });

    it('should apply status filter', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({
        data: mockSecurityHotspotsResponse,
      }));

      await client.getSecurityHotspots({
        statuses: ['TO_REVIEW'],
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/hotspots/search',
        expect.objectContaining({
          params: expect.objectContaining({
            status: 'TO_REVIEW',
          }),
        })
      );
    });

    it('should handle no hotspots', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({
        data: { hotspots: [], paging: { total: 0 } },
      }));

      const hotspots = await client.getSecurityHotspots();

      expect(hotspots).toEqual([]);
    });
  });

  describe('getDuplicationDetails', () => {
    beforeEach(() => {
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project'
      );
    });

    it('should fetch duplication details successfully', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockDuplicationData }));

      const duplication = await client.getDuplicationDetails('test-file.ts');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/duplications/show',
        {
          params: { key: 'test-file.ts' },
        }
      );
      expect(duplication).toEqual(mockDuplicationData);
    });

    it('should handle no duplications', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({
        data: { duplications: [], files: {} },
      }));

      const duplication = await client.getDuplicationDetails('clean-file.ts');

      expect(duplication.duplications).toEqual([]);
    });
  });

  describe('getLineCoverage', () => {
    beforeEach(() => {
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project'
      );
    });

    it('should fetch line coverage successfully', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockLineCoverage }));

      const coverage = await client.getLineCoverage('test-project:src/Calculator.java');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/sources/lines', {
        params: {
          key: 'test-project:src/Calculator.java',
        },
      });
      expect(coverage).toEqual(mockLineCoverage.sources);
    });

    it('should identify covered lines (lineHits > 0)', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockLineCoverage }));

      const coverage = await client.getLineCoverage('test-project:src/Calculator.java');

      // Line 4-6 should be covered (lineHits > 0)
      const coveredLines = coverage.filter(line => line.lineHits !== undefined && line.lineHits > 0);
      expect(coveredLines.length).toBeGreaterThan(0);
      expect(coveredLines.some(l => l.line === 4)).toBe(true);
    });

    it('should identify uncovered lines (lineHits === 0)', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockLineCoverage }));

      const coverage = await client.getLineCoverage('test-project:src/Calculator.java');

      // Lines 10, 11, 15, 16, 17 should be uncovered (lineHits === 0)
      const uncoveredLines = coverage.filter(line => line.lineHits === 0);
      expect(uncoveredLines.length).toBeGreaterThan(0);
      expect(uncoveredLines.some(l => l.line === 10)).toBe(true);
      expect(uncoveredLines.some(l => l.line === 15)).toBe(true);
    });

    it('should identify partial branch coverage', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockLineCoverage }));

      const coverage = await client.getLineCoverage('test-project:src/Calculator.java');

      // Line 9 should have partial branch coverage (conditions: 2, coveredConditions: 1)
      const partialCoverageLine = coverage.find(l => l.line === 9);
      expect(partialCoverageLine).toBeDefined();
      expect(partialCoverageLine?.conditions).toBe(2);
      expect(partialCoverageLine?.coveredConditions).toBe(1);
    });

    it('should identify lines without coverage info (non-executable)', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockLineCoverage }));

      const coverage = await client.getLineCoverage('test-project:src/Calculator.java');

      // Line 1, 2, 3 have no lineHits (not executable)
      const nonExecutableLines = coverage.filter(line => line.lineHits === undefined);
      expect(nonExecutableLines.length).toBeGreaterThan(0);
      expect(nonExecutableLines.some(l => l.line === 1)).toBe(true);
    });

    it('should handle empty coverage response', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: { sources: [] } }));

      const coverage = await client.getLineCoverage('empty-file');

      expect(coverage).toEqual([]);
    });

    it('should handle 404 not found', async () => {
      mockAxiosInstance.get = vi.fn(async () => {
        throw { response: { status: 404, data: mock404Response } };
      });

      await expect(client.getLineCoverage('non-existent-file')).rejects.toThrow();
    });

    it('should handle 403 forbidden', async () => {
      mockAxiosInstance.get = vi.fn(async () => {
        throw { response: { status: 403, data: mock403Response } };
      });

      await expect(client.getLineCoverage('forbidden-file')).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockAxiosInstance.get = vi.fn(async () => { throw new Error('Network timeout'); });

      await expect(client.getLineCoverage('error-file')).rejects.toThrow('Network timeout');
    });

    it('should support pagination with from/to parameters', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({
        data: createMockLineCoverage([
          { line: 100, code: '  return result;', lineHits: 3 },
          { line: 101, code: '}', lineHits: 3 },
        ])
      }));

      const coverage = await client.getLineCoverage('test-file', 100, 101);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/sources/lines', {
        params: {
          key: 'test-file',
          from: 100,
          to: 101,
        },
      });
      expect(coverage).toHaveLength(2);
    });
  });

  describe('getFilesWithCoverageGaps', () => {
    beforeEach(() => {
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project'
      );
    });

    const mockFilesWithCoverage = {
      paging: { pageIndex: 1, pageSize: 100, total: 3 },
      baseComponent: { key: 'test-project', name: 'Test Project', qualifier: 'TRK' },
      components: [
        {
          key: 'test-project:src/critical.ts',
          name: 'critical.ts',
          path: 'src/critical.ts',
          language: 'ts',
          measures: [
            { metric: 'coverage', value: '0.0' },
            { metric: 'uncovered_lines', value: '150' },
            { metric: 'lines_to_cover', value: '150' }
          ]
        },
        {
          key: 'test-project:src/partial.ts',
          name: 'partial.ts',
          path: 'src/partial.ts',
          language: 'ts',
          measures: [
            { metric: 'coverage', value: '45.0' },
            { metric: 'uncovered_lines', value: '55' },
            { metric: 'lines_to_cover', value: '100' }
          ]
        },
        {
          key: 'test-project:src/good.ts',
          name: 'good.ts',
          path: 'src/good.ts',
          language: 'ts',
          measures: [
            { metric: 'coverage', value: '85.0' },
            { metric: 'uncovered_lines', value: '15' },
            { metric: 'lines_to_cover', value: '100' }
          ]
        }
      ]
    };

    const mockFilesNoCoverage = {
      paging: { pageIndex: 1, pageSize: 100, total: 2 },
      baseComponent: { key: 'test-project', name: 'Test Project', qualifier: 'TRK' },
      components: [
        {
          key: 'test-project:src/no-coverage.ts',
          name: 'no-coverage.ts',
          path: 'src/no-coverage.ts',
          language: 'ts',
          measures: [] // No coverage data
        },
        {
          key: 'test-project:src/another.ts',
          name: 'another.ts',
          path: 'src/another.ts',
          language: 'ts',
          measures: [] // No coverage data
        }
      ]
    };

    it('should fetch files with coverage gaps successfully', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockFilesWithCoverage }));

      const result = await client.getFilesWithCoverageGaps();

      // Uses /api/measures/component_tree (not /api/components/tree) to get metrics
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/measures/component_tree', {
        params: expect.objectContaining({
          component: 'test-project',
          qualifiers: 'FIL',
          metricKeys: 'coverage,uncovered_lines,lines_to_cover'
        })
      });
      expect(result.hasCoverageReport).toBe(true);
    });

    it('should return files sorted by coverage ascending (default)', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockFilesWithCoverage }));

      const result = await client.getFilesWithCoverageGaps();

      expect(result.files[0].coverage).toBe(0); // critical.ts first
      expect(result.files[1].coverage).toBe(45); // partial.ts second
      expect(result.files[2].coverage).toBe(85); // good.ts last
    });

    it('should filter files below target coverage', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockFilesWithCoverage }));

      const result = await client.getFilesWithCoverageGaps({ targetCoverage: 50 });

      // Only critical.ts (0%) and partial.ts (45%) should be returned
      expect(result.filesWithGaps).toBe(2);
      expect(result.files.every(f => f.coverage < 50)).toBe(true);
    });

    it('should assign critical priority to 0% coverage', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockFilesWithCoverage }));

      const result = await client.getFilesWithCoverageGaps();

      const criticalFile = result.files.find(f => f.coverage === 0);
      expect(criticalFile?.priority).toBe('critical');
    });

    it('should assign high priority to <30% coverage', async () => {
      const mockWithHighPriority = {
        ...mockFilesWithCoverage,
        components: [{
          ...mockFilesWithCoverage.components[0],
          measures: [
            { metric: 'coverage', value: '25.0' },
            { metric: 'uncovered_lines', value: '75' },
            { metric: 'lines_to_cover', value: '100' }
          ]
        }]
      };
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockWithHighPriority }));

      const result = await client.getFilesWithCoverageGaps();

      expect(result.files[0].priority).toBe('high');
    });

    it('should assign medium priority to 30-60% coverage', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockFilesWithCoverage }));

      const result = await client.getFilesWithCoverageGaps();

      const mediumFile = result.files.find(f => f.coverage === 45);
      expect(mediumFile?.priority).toBe('medium');
    });

    it('should assign low priority to >60% coverage', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockFilesWithCoverage }));

      const result = await client.getFilesWithCoverageGaps();

      const lowFile = result.files.find(f => f.coverage === 85);
      expect(lowFile?.priority).toBe('low');
    });

    it('should handle project with NO coverage report', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockFilesNoCoverage }));

      const result = await client.getFilesWithCoverageGaps({ includeNoCoverageData: true });

      expect(result.hasCoverageReport).toBe(false);
      expect(result.filesWithGaps).toBe(0);
      expect(result.filesWithoutCoverageData).toBe(2);
    });

    it('should return filesNeedingCoverageSetup when no coverage data', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockFilesNoCoverage }));

      const result = await client.getFilesWithCoverageGaps({ includeNoCoverageData: true });

      expect(result.filesNeedingCoverageSetup).toContain('src/no-coverage.ts');
      expect(result.filesNeedingCoverageSetup).toContain('src/another.ts');
    });

    it('should handle mixed scenario: some files with coverage, some without', async () => {
      const mockMixed = {
        ...mockFilesWithCoverage,
        components: [
          ...mockFilesWithCoverage.components,
          {
            key: 'test-project:src/no-data.ts',
            name: 'no-data.ts',
            path: 'src/no-data.ts',
            language: 'ts',
            measures: [] // No coverage data
          }
        ]
      };
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockMixed }));

      const result = await client.getFilesWithCoverageGaps({ includeNoCoverageData: true });

      expect(result.hasCoverageReport).toBe(true); // Has some coverage data
      expect(result.filesWithGaps).toBe(3);
      expect(result.filesWithoutCoverageData).toBe(1);
    });

    it('should respect maxFiles limit', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockFilesWithCoverage }));

      const result = await client.getFilesWithCoverageGaps({ maxFiles: 2 });

      expect(result.files.length).toBeLessThanOrEqual(2);
    });

    it('should sort by uncovered_lines when requested', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockFilesWithCoverage }));

      const result = await client.getFilesWithCoverageGaps({ sortBy: 'uncovered_lines' });

      // Should be sorted by uncovered lines descending (most uncovered first)
      expect(result.files[0].uncoveredLines).toBe(150); // critical.ts
    });

    it('should sort by name when requested', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockFilesWithCoverage }));

      const result = await client.getFilesWithCoverageGaps({ sortBy: 'name' });

      // Should be sorted alphabetically
      expect(result.files[0].name).toBe('critical.ts');
      expect(result.files[1].name).toBe('good.ts');
      expect(result.files[2].name).toBe('partial.ts');
    });

    it('should calculate average coverage correctly', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockFilesWithCoverage }));

      const result = await client.getFilesWithCoverageGaps();

      // Average of 0 + 45 + 85 = 130 / 3 = 43.33... rounded to 43
      expect(result.averageCoverage).toBeCloseTo(43, 0);
    });

    it('should handle empty project (no files)', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({
        data: {
          ...mockFilesWithCoverage,
          components: []
        }
      }));

      const result = await client.getFilesWithCoverageGaps();

      expect(result.totalFiles).toBe(0);
      expect(result.filesWithGaps).toBe(0);
      expect(result.hasCoverageReport).toBe(false);
    });

    it('should exclude files with linesToCover === 0', async () => {
      const mockWithNonExecutable = {
        ...mockFilesWithCoverage,
        components: [{
          key: 'test-project:src/types.d.ts',
          name: 'types.d.ts',
          path: 'src/types.d.ts',
          language: 'ts',
          measures: [
            { metric: 'coverage', value: '0.0' },
            { metric: 'uncovered_lines', value: '0' },
            { metric: 'lines_to_cover', value: '0' } // No executable lines
          ]
        }]
      };
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockWithNonExecutable }));

      const result = await client.getFilesWithCoverageGaps();

      expect(result.files.length).toBe(0); // Should be excluded
    });

    it('should handle API errors gracefully', async () => {
      mockAxiosInstance.get = vi.fn(async () => {
        throw { response: { status: 500, data: { errors: [{ msg: 'Internal error' }] } } };
      });

      await expect(client.getFilesWithCoverageGaps()).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project'
      );
    });

    it('should handle network errors', async () => {
      mockAxiosInstance.get = vi.fn(async () => { throw new Error('Network timeout'); });

      await expect(client.getIssues()).rejects.toThrow('Network timeout');
    });

    it('should handle malformed responses', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: null }));

      await expect(client.getIssues()).rejects.toThrow();
    });

    it('should handle 500 server errors', async () => {
      mockAxiosInstance.get = vi.fn(async () => { throw {
        response: {
          status: 500,
          data: { errors: [{ msg: 'Internal server error' }] },
        },
      }; });

      await expect(client.getIssues()).rejects.toThrow();
    });
  });

  describe('File Locking', () => {
    beforeEach(() => {
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project'
      );
    });

    it('should acquire lock successfully', async () => {
      (fs.writeFile as any) = vi.fn(async () => undefined);
      (fs.unlink as any) = vi.fn(async () => undefined);

      const { exec } = await import('child_process');
      (exec as any).mockImplementation((cmd: any, options: any, callback: any) => {
        callback(null, { stdout: 'Success', stderr: '' });
      });

      await expect(
        client.triggerAnalysis('/test/project')
      ).resolves.not.toThrow();

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.sonar-analysis.lock'),
        expect.any(String),
        expect.objectContaining({ flag: 'wx' })
      );
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should remove stale lock and proceed', async () => {
      const lockError: any = new Error('File exists');
      lockError.code = 'EEXIST';

      // First attempt fails (lock exists), second succeeds (lock removed)
      (fs.writeFile as any)
        .mockImplementationOnce(async () => { throw lockError; })
        .mockImplementationOnce(async () => undefined);

      // Mock stale lock (older than 10 minutes)
      (fs.readFile as any) = vi.fn(async () => 
        JSON.stringify({
          pid: 12345,
          timestamp: new Date(Date.now() - 700000).toISOString(), // 700 seconds = 11.6 minutes
        })
      );
      (fs.unlink as any) = vi.fn(async () => undefined);

      const { exec } = await import('child_process');
      (exec as any).mockImplementation((cmd: any, options: any, callback: any) => {
        callback(null, { stdout: 'Success', stderr: '' });
      });

      // Should succeed after removing stale lock
      await expect(
        client.triggerAnalysis('/test/project')
      ).resolves.not.toThrow();

      // Verify stale lock was removed
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should release lock on error', async () => {
      (fs.writeFile as any) = vi.fn(async () => undefined);
      (fs.unlink as any) = vi.fn(async () => undefined);

      const { exec } = await import('child_process');
      (exec as any).mockImplementation((cmd: any, options: any, callback: any) => {
        callback(new Error('Analysis failed'), null, null);
      });

      await expect(client.triggerAnalysis('/test/project')).rejects.toThrow();

      // Lock should be released even on error
      expect(fs.unlink).toHaveBeenCalled();
    });
  });

  describe('Input Sanitization', () => {
    it('should sanitize project key', () => {
      expect(() => {
        new SonarQubeClient(
          'http://localhost:9000',
          'token',
          'invalid@project#key'
        );
      }).toThrow();
    });

    it('should normalize URL with sanitizeUrl', () => {
      client = new SonarQubeClient(
        'http://localhost:9000//',
        'token',
        'project'
      );

      // URL.toString() normalizes double slashes
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: expect.stringMatching(/^http:\/\/localhost:9000\//),
        })
      );
    });
  });

  describe('Performance', () => {
    beforeEach(() => {
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project'
      );
    });

    it('should have reasonable timeout', () => {
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000,
        })
      );
    });

    it('should handle concurrent requests', async () => {
      mockAxiosInstance.get = vi.fn(async () => ({ data: mockIssuesResponse }));

      const requests = Array.from({ length: 5 }, () => client.getIssues());

      await expect(Promise.all(requests)).resolves.toHaveLength(5);
      // Each getIssues() call makes 2 API calls internally (issues + analysis date check)
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(10);
    });
  });

  describe('triggerAnalysis with detected properties', () => {
    beforeEach(() => {
      (fs.writeFile as any) = vi.fn(async () => undefined);
      (fs.unlink as any) = vi.fn(async () => undefined);
      (fs.stat as any) = vi.fn(async () => { throw { code: 'ENOENT' }; }); // No target directory
    });

    it('should pass detected properties to triggerAnalysis', async () => {
      // Create client with TypeScript project context (CLI scanner)
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project',
        {
          name: 'test-project',
          path: '/test',
          language: ['typescript'],
          buildTool: 'npm'
        }
      );

      const { exec } = await import('child_process');
      let executedCommand = '';
      (exec as any).mockImplementation((cmd: string, options: any, callback: any) => {
        executedCommand = cmd;
        callback(null, { stdout: 'Success', stderr: '' });
      });

      const detectedProperties = new Map<string, string>();
      detectedProperties.set('sonar.sources', 'src');
      detectedProperties.set('sonar.tests', 'tests');

      await client.triggerAnalysis('/test/project', detectedProperties);

      // Should use detected properties in command
      expect(executedCommand).toContain('-Dsonar.sources=src');
      expect(executedCommand).toContain('-Dsonar.tests=tests');
    });

    it('should fallback to auto-detection when no detected properties', async () => {
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project',
        {
          name: 'test-project',
          path: '/test',
          language: ['typescript'],
          buildTool: 'npm'
        }
      );

      const { exec } = await import('child_process');
      let executedCommand = '';
      (exec as any).mockImplementation((cmd: string, options: any, callback: any) => {
        executedCommand = cmd;
        callback(null, { stdout: 'Success', stderr: '' });
      });

      // Call without detected properties
      await client.triggerAnalysis('/test/project');

      // Should still execute sonar-scanner (auto-detection mode)
      expect(executedCommand).toContain('sonar-scanner');
      // Should include host URL and token (projectKey may be added elsewhere)
      expect(executedCommand).toContain('-Dsonar.host.url=');
      expect(executedCommand).toContain('-Dsonar.login=');
    });

    it('should use detected properties over auto-detected', async () => {
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project',
        {
          name: 'test-project',
          path: '/test',
          language: ['typescript'],
          buildTool: 'npm'
        }
      );

      const { exec } = await import('child_process');
      let executedCommand = '';
      (exec as any).mockImplementation((cmd: string, options: any, callback: any) => {
        executedCommand = cmd;
        callback(null, { stdout: 'Success', stderr: '' });
      });

      // Detected properties from JavaAnalyzer
      const detectedProperties = new Map<string, string>();
      detectedProperties.set('sonar.java.binaries', 'target/classes');
      detectedProperties.set('sonar.java.libraries', '/path/to/libs/*');

      await client.triggerAnalysis('/test/project', detectedProperties);

      // Should use JavaAnalyzer detected values
      expect(executedCommand).toContain('-Dsonar.java.binaries=target/classes');
      expect(executedCommand).toContain('-Dsonar.java.libraries=/path/to/libs/*');
    });
  });

  describe('Maven/Gradle fallback to CLI', () => {
    beforeEach(() => {
      (fs.writeFile as any) = vi.fn(async () => undefined);
      (fs.unlink as any) = vi.fn(async () => undefined);
    });

    it('should fallback to CLI when Maven fails with detected properties', async () => {
      // Create client with Maven project context
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project',
        {
          name: 'test-project',
          path: '/test',
          language: ['java'],
          buildTool: 'maven'
        }
      );

      // Simulate compiled Java project - stat returns success for binary dirs
      (fs.stat as any) = vi.fn(async (path: string) => {
        // Accept target/classes paths (compilation check)
        if (path.includes('target/classes') || path.includes('target')) {
          return { isDirectory: () => true };
        }
        // Fail for other paths (like sonar-project.properties)
        const error: any = new Error('ENOENT');
        error.code = 'ENOENT';
        throw error;
      });

      const { exec } = await import('child_process');
      let execCallCount = 0;
      let lastCommand = '';
      (exec as any).mockImplementation((cmd: string, options: any, callback: any) => {
        execCallCount++;
        lastCommand = cmd;
        if (cmd.includes('mvn')) {
          // Maven fails
          callback(new Error('Maven plugin not configured'), null, null);
        } else if (cmd.includes('sonar-scanner')) {
          // CLI succeeds
          callback(null, { stdout: 'Success', stderr: '' });
        }
      });

      const detectedProperties = new Map<string, string>();
      detectedProperties.set('sonar.java.binaries', 'target/classes');

      await client.triggerAnalysis('/test/project', detectedProperties);

      // Should have tried Maven first, then fallback to CLI
      expect(execCallCount).toBeGreaterThanOrEqual(2);
      expect(lastCommand).toContain('sonar-scanner');
      expect(lastCommand).toContain('-Dsonar.java.binaries=target/classes');
    });

    it('should throw when Maven fails and no detected properties for fallback', async () => {
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project',
        {
          name: 'test-project',
          path: '/test',
          language: ['java'],
          buildTool: 'maven'
        }
      );

      // Simulate compiled Java project
      (fs.stat as any) = vi.fn(async (path: string) => {
        if (path.includes('target/classes') || path.includes('target')) {
          return { isDirectory: () => true };
        }
        const error: any = new Error('ENOENT');
        error.code = 'ENOENT';
        throw error;
      });

      const { exec } = await import('child_process');
      (exec as any).mockImplementation((cmd: string, options: any, callback: any) => {
        if (cmd.includes('mvn')) {
          callback(new Error('Maven plugin not configured'), null, null);
        }
      });

      // No detected properties - should throw Maven error (after compilation check passes)
      await expect(
        client.triggerAnalysis('/test/project')
      ).rejects.toThrow('Maven plugin not configured');
    });

    it('should fallback to CLI when Gradle fails with detected properties', async () => {
      client = new SonarQubeClient(
        'http://localhost:9000',
        'test-token',
        'test-project',
        {
          name: 'test-project',
          path: '/test',
          language: ['java'],
          buildTool: 'gradle'
        }
      );

      // Simulate compiled Java project
      (fs.stat as any) = vi.fn(async (path: string) => {
        if (path.includes('build/classes') || path.includes('build')) {
          return { isDirectory: () => true };
        }
        const error: any = new Error('ENOENT');
        error.code = 'ENOENT';
        throw error;
      });

      const { exec } = await import('child_process');
      let lastCommand = '';
      (exec as any).mockImplementation((cmd: string, options: any, callback: any) => {
        lastCommand = cmd;
        if (cmd.includes('gradlew')) {
          callback(new Error('Task sonar not found'), null, null);
        } else if (cmd.includes('sonar-scanner')) {
          callback(null, { stdout: 'Success', stderr: '' });
        }
      });

      const detectedProperties = new Map<string, string>();
      detectedProperties.set('sonar.java.binaries', 'build/classes/java/main');

      await client.triggerAnalysis('/test/project', detectedProperties);

      expect(lastCommand).toContain('sonar-scanner');
      expect(lastCommand).toContain('-Dsonar.java.binaries=build/classes/java/main');
    });
  });
});
