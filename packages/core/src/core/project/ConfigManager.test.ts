import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigManager, ConfigAction, ConfigViewOptions, ConfigInfo } from './ConfigManager';

// Create mock instances at module level
const mockProjectManager = {
  getWorkingDirectory: vi.fn(() => '/test/project'),
  getOrCreateConfig: vi.fn(() => Promise.resolve()),
};

const mockConfig = {
  sonarProjectKey: 'test-project',
  sonarUrl: 'http://localhost:9000',
  sonarToken: 'sqp_test_token_1234567890abcdefghijklmnopqrstuvwxyz',
  createdAt: '2024-01-01T00:00:00.000Z',
  language: 'typescript,javascript',
  framework: 'react',
};

// Mock modules
vi.mock('../../universal/project-manager', () => ({
  ProjectManager: vi.fn(function() { return mockProjectManager; }),
}));

vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(() => Promise.resolve()),
    unlink: vi.fn(() => Promise.resolve()),
  },
  access: vi.fn(() => Promise.resolve()),
  unlink: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../shared/logger/structured-logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(() => {}),
    debug: vi.fn(() => {}),
    warn: vi.fn(() => {}),
    error: vi.fn(() => {}),
  })),
}));

describe('ConfigManager', () => {
  let configManager: ConfigManager;

  beforeEach(async () => {
    vi.clearAllMocks();

    const fs = await import('fs/promises');
    (fs.access as any) = vi.fn(async () => undefined);
    (fs.unlink as any) = vi.fn(async () => undefined);

    configManager = new ConfigManager(mockProjectManager as any);

    // Default successful responses
    mockProjectManager.getOrCreateConfig = vi.fn(async () => mockConfig);
  });

  describe('view', () => {
    it('should return configuration with masked token by default', async () => {
      const result = await configManager.view();

      expect(result).toEqual({
        sonarUrl: 'http://localhost:9000',
        projectKey: 'test-project',
        token: '***wxyz',
        createdAt: '2024-01-01T00:00:00.000Z',
        language: 'typescript,javascript',
        framework: 'react',
        isValid: true,
      });
    });

    it('should return configuration with full token when showToken is true', async () => {
      const options: ConfigViewOptions = {
        showToken: true,
      };

      const result = await configManager.view(options);

      expect(result.token).toBe('sqp_test_token_1234567890abcdefghijklmnopqrstuvwxyz');
      expect(result.isValid).toBe(true);
    });

    it('should mark configuration as invalid with temp token', async () => {
      mockProjectManager.getOrCreateConfig = vi.fn(async () => ({
        ...mockConfig,
        sonarToken: 'temp-token-will-be-generated',
      }));

      const result = await configManager.view();

      expect(result.isValid).toBe(false);
    });

    it('should handle configuration without optional fields', async () => {
      mockProjectManager.getOrCreateConfig = vi.fn(async () => ({
        sonarProjectKey: 'test-project',
        sonarUrl: 'http://localhost:9000',
        sonarToken: 'sqp_test_token',
        createdAt: '2024-01-01T00:00:00.000Z',
      }));

      const result = await configManager.view();

      expect(result.language).toBeUndefined();
      expect(result.framework).toBeUndefined();
    });

    it('should mask short tokens with ****', async () => {
      mockProjectManager.getOrCreateConfig = vi.fn(async () => ({
        ...mockConfig,
        sonarToken: 'abc',
      }));

      const result = await configManager.view();

      expect(result.token).toBe('****');
    });
  });

  describe('validate', () => {
    it('should validate configuration successfully', async () => {
      const result = await configManager.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      const fs = await import('fs/promises');
      expect(fs.access).toHaveBeenCalledWith('/test/project/bobthefixer.env');
    });

    it('should detect missing SonarQube URL', async () => {
      mockProjectManager.getOrCreateConfig = vi.fn(async () => ({
        ...mockConfig,
        sonarUrl: '',
      }));

      const result = await configManager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing SonarQube URL');
    });

    it('should detect missing project key', async () => {
      mockProjectManager.getOrCreateConfig = vi.fn(async () => ({
        ...mockConfig,
        sonarProjectKey: '',
      }));

      const result = await configManager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing project key');
    });

    it('should detect missing token', async () => {
      mockProjectManager.getOrCreateConfig = vi.fn(async () => ({
        ...mockConfig,
        sonarToken: '',
      }));

      const result = await configManager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing or invalid token');
    });

    it('should detect temp token', async () => {
      mockProjectManager.getOrCreateConfig = vi.fn(async () => ({
        ...mockConfig,
        sonarToken: 'temp-token-will-be-generated',
      }));

      const result = await configManager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing or invalid token');
    });

    it('should detect missing configuration file', async () => {
      const fs = await import('fs/promises');
      (fs.access as any) = vi.fn(async () => { throw new Error('ENOENT'); });

      const result = await configManager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Configuration file not found');
    });

    it('should detect multiple errors', async () => {
      mockProjectManager.getOrCreateConfig = vi.fn(async () => ({
        sonarUrl: '',
        sonarProjectKey: '',
        sonarToken: '',
        createdAt: '2024-01-01T00:00:00.000Z',
      }));
      const fs = await import('fs/promises');
      (fs.access as any) = vi.fn(async () => { throw new Error('ENOENT'); });

      const result = await configManager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors).toContain('Missing SonarQube URL');
      expect(result.errors).toContain('Missing project key');
      expect(result.errors).toContain('Missing or invalid token');
    });

    it('should handle error during validation', async () => {
      mockProjectManager.getOrCreateConfig = vi.fn(async () => { throw new Error('Config error'); });

      const result = await configManager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Validation error: Config error');
    });
  });

  describe('reset', () => {
    it('should reset configuration successfully', async () => {
      const result = await configManager.reset();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Configuration reset successfully');
      const fs = await import('fs/promises');
      expect(fs.unlink).toHaveBeenCalledWith('/test/project/bobthefixer.env');
    });

    it('should handle non-existent configuration file', async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      const fs = await import('fs/promises');
      (fs.unlink as any) = vi.fn(async () => { throw error; });

      const result = await configManager.reset();

      expect(result.success).toBe(false);
      expect(result.message).toContain('No configuration file found to reset');
    });

    it('should handle errors during reset', async () => {
      const fs = await import('fs/promises');
      (fs.unlink as any) = vi.fn(async () => { throw new Error('Permission denied'); });

      const result = await configManager.reset();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Reset failed: Permission denied');
    });
  });

  describe('formatConfigInfo', () => {
    it('should format complete configuration info', () => {
      const info: ConfigInfo = {
        sonarUrl: 'http://localhost:9000',
        projectKey: 'test-project',
        token: '***wxyz',
        createdAt: '2024-01-01T00:00:00.000Z',
        language: 'typescript,javascript',
        framework: 'react',
        isValid: true,
      };

      const formatted = ConfigManager.formatConfigInfo(info);

      expect(formatted).toContain('SONARGUARD CONFIGURATION');
      expect(formatted).toContain('http://localhost:9000');
      expect(formatted).toContain('test-project');
      expect(formatted).toContain('***wxyz');
      expect(formatted).toContain('typescript,javascript');
      expect(formatted).toContain('react');
      expect(formatted).toContain('✅ Valid');
    });

    it('should format configuration without optional fields', () => {
      const info: ConfigInfo = {
        sonarUrl: 'http://localhost:9000',
        projectKey: 'test-project',
        token: '***wxyz',
        createdAt: '2024-01-01T00:00:00.000Z',
        isValid: true,
      };

      const formatted = ConfigManager.formatConfigInfo(info);

      expect(formatted).toContain('SONARGUARD CONFIGURATION');
      expect(formatted).not.toContain('Language:');
      expect(formatted).not.toContain('Framework:');
    });

    it('should format invalid configuration', () => {
      const info: ConfigInfo = {
        sonarUrl: 'http://localhost:9000',
        projectKey: 'test-project',
        token: '***wxyz',
        createdAt: '2024-01-01T00:00:00.000Z',
        isValid: false,
      };

      const formatted = ConfigManager.formatConfigInfo(info);

      expect(formatted).toContain('⚠️ Invalid');
    });
  });

  describe('formatValidationResult', () => {
    it('should format valid configuration result', () => {
      const result = { valid: true, errors: [] };

      const formatted = ConfigManager.formatValidationResult(result);

      expect(formatted).toContain('✅ CONFIGURATION VALID');
      expect(formatted).toContain('All required fields are present');
    });

    it('should format invalid configuration result', () => {
      const result = {
        valid: false,
        errors: ['Missing SonarQube URL', 'Missing project key', 'Configuration file not found'],
      };

      const formatted = ConfigManager.formatValidationResult(result);

      expect(formatted).toContain('❌ CONFIGURATION INVALID');
      expect(formatted).toContain('Found 3 error(s)');
      expect(formatted).toContain('1. Missing SonarQube URL');
      expect(formatted).toContain('2. Missing project key');
      expect(formatted).toContain('3. Configuration file not found');
      expect(formatted).toContain('sonar_auto_setup');
    });
  });

  describe('formatResetResult', () => {
    it('should format successful reset', () => {
      const result = {
        success: true,
        message: 'Configuration reset successfully',
      };

      const formatted = ConfigManager.formatResetResult(result);

      expect(formatted).toContain('✅');
      expect(formatted).toContain('Configuration reset successfully');
    });

    it('should format failed reset', () => {
      const result = {
        success: false,
        message: 'No configuration file found',
      };

      const formatted = ConfigManager.formatResetResult(result);

      expect(formatted).toContain('❌');
      expect(formatted).toContain('No configuration file found');
    });
  });
});
