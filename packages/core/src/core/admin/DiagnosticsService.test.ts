import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiagnosticsService, DiagnosticsOptions } from './DiagnosticsService';

// Create mock instances at module level
const mockProjectManager = {
  getWorkingDirectory: vi.fn(() => '/test/project'),
  analyzeProject: vi.fn(() => Promise.resolve()),
  getOrCreateConfig: vi.fn(() => Promise.resolve()),
};

const mockSonarAdmin = {
  validateConnection: vi.fn(() => Promise.resolve(false)),
  client: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
  },
};

const mockSonarClient = {
  client: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
  },
  getIssues: vi.fn(() => Promise.resolve([])),
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

// Mock modules
vi.mock('../../universal/project-manager', () => ({
  ProjectManager: vi.fn(function() { return mockProjectManager; }),
}));

vi.mock('../../universal/sonar-admin', () => ({
  SonarAdmin: vi.fn(function() { return mockSonarAdmin; }),
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

describe('DiagnosticsService', () => {
  let diagnosticsService: DiagnosticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    diagnosticsService = new DiagnosticsService(mockProjectManager as any, mockSonarAdmin as any);

    // Default successful responses
    mockProjectManager.getOrCreateConfig = vi.fn(async () => mockConfig);
    mockProjectManager.analyzeProject = vi.fn(async () => mockProjectContext);
    mockSonarAdmin.validateConnection = vi.fn(async () => true);
    mockSonarClient.client.get = vi.fn(async () => { data: {} });
    mockSonarClient.getIssues = vi.fn(async () => []);
  });

  describe('diagnose', () => {
    it('should run diagnostics successfully with all tests passing', async () => {
      // Mock successful API responses
      mockSonarClient.client.get.mockImplementation((url: string) => {
        if (url === '/api/system/ping') {
          return Promise.resolve({ data: 'pong' });
        }
        if (url === '/api/projects/search') {
          return Promise.resolve({
            data: {
              components: [
                {
                  key: 'test-project',
                  name: 'Test Project',
                  lastAnalysisDate: '2024-01-01',
                  visibility: 'public',
                },
              ],
            },
          });
        }
        if (url === '/api/ce/activity') {
          return Promise.resolve({ data: {} });
        }
        if (url === '/api/users/current') {
          return Promise.resolve({
            data: {
              name: 'Test User',
              login: 'testuser',
              permissions: {
                global: ['admin', 'scan'],
              },
            },
          });
        }
        return Promise.resolve({ data: {} });
      });

      const options: DiagnosticsOptions = { verbose: true };
      const result = await diagnosticsService.diagnose(options);

      expect(result).toContain('SONARGUARD PERMISSION DIAGNOSTICS');
      expect(result).toContain('CONFIGURATION');
      expect(result).toContain('http://localhost:9000');
      expect(result).toContain('test-project');
      expect(result).toContain('CONNECTIVITY TESTS');
      expect(result).toContain('TOKEN PERMISSION TESTS');
      expect(result).toContain('PROJECT STATUS');
      expect(result).toContain('RECOMMENDATIONS');
    });

    it('should include manual commands when verbose is true', async () => {
      const options: DiagnosticsOptions = { verbose: true };
      const result = await diagnosticsService.diagnose(options);

      expect(result).toContain('MANUAL TEST COMMANDS');
      expect(result).toContain('curl');
      expect(result).toContain('/api/system/ping');
      expect(result).toContain('/api/projects/search');
    });

    it('should not include manual commands when verbose is false', async () => {
      const options: DiagnosticsOptions = { verbose: false };
      const result = await diagnosticsService.diagnose(options);

      expect(result).not.toContain('MANUAL TEST COMMANDS');
    });

    it('should detect connection failure', async () => {
      mockSonarAdmin.validateConnection = vi.fn(async () => false);

      const result = await diagnosticsService.diagnose({});

      expect(result).toContain('Connection Test: FAIL');
    });

    it('should handle connection error', async () => {
      mockSonarAdmin.validateConnection = vi.fn(async () => { throw new Error('Network error'); });

      const result = await diagnosticsService.diagnose({});

      expect(result).toContain('Connection Test: FAIL');
      expect(result).toContain('Network error');
    });

    it('should detect API access failure', async () => {
      const error: any = new Error('Unauthorized');
      error.response = { status: 401, data: { message: 'Invalid token' } };
      mockSonarClient.client.get = vi.fn(async () => { throw error; });

      const result = await diagnosticsService.diagnose({});

      expect(result).toContain('Basic API Access: FAIL');
      expect(result).toContain('401');
    });

    it('should detect project browse permission issues', async () => {
      mockSonarClient.client.get.mockImplementation((url: string) => {
        if (url === '/api/system/ping') {
          return Promise.resolve({ data: 'pong' });
        }
        if (url === '/api/projects/search') {
          const error: any = new Error('Forbidden');
          error.response = { status: 403, data: { message: 'Insufficient permissions' } };
          return Promise.reject(error);
        }
        return Promise.resolve({ data: {} });
      });

      const result = await diagnosticsService.diagnose({});

      expect(result).toContain('Project Browse: FAIL');
      expect(result).toContain('403');
      expect(result).toContain('Browse');
    });

    it('should detect compute engine permission issues', async () => {
      mockSonarClient.client.get.mockImplementation((url: string) => {
        if (url === '/api/system/ping') {
          return Promise.resolve({ data: 'pong' });
        }
        if (url === '/api/ce/activity') {
          const error: any = new Error('Forbidden');
          error.response = { status: 403 };
          return Promise.reject(error);
        }
        return Promise.resolve({ data: {} });
      });

      const result = await diagnosticsService.diagnose({});

      expect(result).toContain('Compute Engine: FAIL');
      expect(result).toContain('Execute Analysis');
    });

    it('should detect issues API failure', async () => {
      mockSonarClient.getIssues = vi.fn(async () => { throw new Error('Issues API error'); });

      const result = await diagnosticsService.diagnose({});

      expect(result).toContain('Issues API: FAIL');
      expect(result).toContain('Issues API error');
    });

    it('should show user information when available', async () => {
      mockSonarClient.client.get.mockImplementation((url: string) => {
        if (url === '/api/users/current') {
          return Promise.resolve({
            data: {
              name: 'Admin User',
              login: 'admin',
              permissions: {
                global: ['admin', 'scan', 'provisioning'],
              },
            },
          });
        }
        return Promise.resolve({ data: {} });
      });

      const result = await diagnosticsService.diagnose({});

      expect(result).toContain('User Info: PASS');
      expect(result).toContain('Admin User');
      expect(result).toContain('admin');
      expect(result).toContain('admin, scan, provisioning');
    });

    it('should handle missing user permissions', async () => {
      mockSonarClient.client.get.mockImplementation((url: string) => {
        if (url === '/api/users/current') {
          return Promise.resolve({
            data: {
              name: 'Basic User',
              login: 'user',
            },
          });
        }
        return Promise.resolve({ data: {} });
      });

      const result = await diagnosticsService.diagnose({});

      expect(result).toContain('User Info: PASS');
      expect(result).toContain('Basic User');
    });

    it('should detect project not found', async () => {
      mockSonarClient.client.get.mockImplementation((url: string) => {
        if (url === '/api/projects/search') {
          return Promise.resolve({
            data: {
              components: [],
            },
          });
        }
        return Promise.resolve({ data: {} });
      });

      const result = await diagnosticsService.diagnose({});

      expect(result).toContain('Project Status: FAIL');
      expect(result).toContain('Project not found or no access');
    });

    it('should show project details when found', async () => {
      mockSonarClient.client.get.mockImplementation((url: string) => {
        if (url === '/api/projects/search') {
          return Promise.resolve({
            data: {
              components: [
                {
                  key: 'test-project',
                  name: 'Test Project',
                  lastAnalysisDate: '2024-01-15T10:00:00Z',
                  visibility: 'private',
                },
              ],
            },
          });
        }
        return Promise.resolve({ data: {} });
      });

      const result = await diagnosticsService.diagnose({});

      expect(result).toContain('Project Exists: PASS');
      expect(result).toContain('Test Project');
      expect(result).toContain('2024-01-15T10:00:00Z');
      expect(result).toContain('private');
    });

    it('should show project with no analysis date', async () => {
      mockSonarClient.client.get.mockImplementation((url: string) => {
        if (url === '/api/projects/search') {
          return Promise.resolve({
            data: {
              components: [
                {
                  key: 'test-project',
                  name: 'Test Project',
                  visibility: 'public',
                },
              ],
            },
          });
        }
        return Promise.resolve({ data: {} });
      });

      const result = await diagnosticsService.diagnose({});

      expect(result).toContain('Never');
    });

    it('should include recommendations in report', async () => {
      const result = await diagnosticsService.diagnose({});

      expect(result).toContain('RECOMMENDATIONS');
      expect(result).toContain('403 errors');
      expect(result).toContain('project not found');
      expect(result).toContain('connection fails');
    });

    it('should pass correlationId through logging', async () => {
      const correlationId = 'test-correlation-id';

      await diagnosticsService.diagnose({}, correlationId);

      expect(mockProjectManager.getOrCreateConfig).toHaveBeenCalled();
    });

    it('should handle verbose default to true', async () => {
      const result = await diagnosticsService.diagnose({});

      expect(result).toContain('MANUAL TEST COMMANDS');
    });

    it('should mask token in configuration section', async () => {
      const result = await diagnosticsService.diagnose({ verbose: false });

      const configSection = result.split('CONNECTIVITY TESTS')[0];
      expect(configSection).toContain('Token:');
      expect(configSection).toContain('...');
      expect(configSection).not.toContain('sqp_test_token_1234567890');
    });
  });

  describe('edge cases', () => {
    it('should handle multiple test failures', async () => {
      mockSonarAdmin.validateConnection = vi.fn(async () => false);
      const error: any = new Error('Failed');
      error.response = { status: 500 };
      mockSonarClient.client.get = vi.fn(async () => { throw error; });
      mockSonarClient.getIssues = vi.fn(async () => { throw new Error('Issues failed'); });

      const result = await diagnosticsService.diagnose({});

      expect(result).toContain('Connection Test: FAIL');
      expect(result).toContain('Basic API Access: FAIL');
      expect(result).toContain('Issues API: FAIL');
    });

    it('should handle project status error', async () => {
      mockSonarClient.client.get.mockImplementation((url: string) => {
        if (url === '/api/projects/search') {
          const error: any = new Error('Server error');
          error.response = { status: 500 };
          return Promise.reject(error);
        }
        return Promise.resolve({ data: {} });
      });

      const result = await diagnosticsService.diagnose({});

      expect(result).toContain('Project Status: FAIL');
      expect(result).toContain('500');
    });

    it('should handle user info error', async () => {
      mockSonarClient.client.get.mockImplementation((url: string) => {
        if (url === '/api/users/current') {
          const error: any = new Error('Unauthorized');
          error.response = { status: 401 };
          return Promise.reject(error);
        }
        return Promise.resolve({ data: {} });
      });

      const result = await diagnosticsService.diagnose({});

      expect(result).toContain('User Info: FAIL');
    });
  });
});
