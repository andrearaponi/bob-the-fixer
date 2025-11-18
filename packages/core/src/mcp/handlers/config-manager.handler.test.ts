import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleConfigManager } from './config-manager.handler';

// Mock all dependencies
vi.mock('../../core/project/index.js');
vi.mock('../../universal/project-manager');

describe('handleConfigManager', () => {
  let mockConfigManager: any;
  let mockProjectManager: any;

  beforeEach(async () => {
    // Mock ProjectManager
    const projectManagerModule = await import('../../universal/project-manager');
    mockProjectManager = {};
    vi.mocked(projectManagerModule.ProjectManager).mockImplementation(function() { return mockProjectManager; });

    // Mock ConfigManager
    const projectModule = await import('../../core/project/index.js');
    mockConfigManager = {
      view: vi.fn(async () => ({
        sonarUrl: 'http://localhost:9000',
        projectKey: 'test-project',
        hasToken: true,
        token: '****'
      })),
      validate: vi.fn(async () => ({
        isValid: true,
        issues: []
      })),
      reset: vi.fn(async () => ({
        success: true,
        message: 'Configuration reset successfully'
      }))
    };
    vi.mocked(projectModule.ConfigManager).mockImplementation(function() { return mockConfigManager; });

    // Mock static format methods
    vi.mocked(projectModule.ConfigManager.formatConfigInfo).mockImplementation(function() {
      return 'Configuration:\nSonar URL: http://localhost:9000\nProject Key: test-project';
    });
    vi.mocked(projectModule.ConfigManager.formatValidationResult).mockImplementation(function() {
      return 'Validation: PASSED\nAll checks successful';
    });
    vi.mocked(projectModule.ConfigManager.formatResetResult).mockImplementation(function() {
      return 'Configuration reset successfully';
    });
  });

  describe('Success cases - view action', () => {
    it('should call ConfigManager.view with correct parameters', async () => {
      const args = { action: 'view', showToken: false };

      const result = await handleConfigManager(args);

      expect(mockConfigManager.view).toHaveBeenCalledWith({ showToken: false });
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
    });

    it('should call view with showToken true', async () => {
      const args = { action: 'view', showToken: true };

      await handleConfigManager(args);

      expect(mockConfigManager.view).toHaveBeenCalledWith({ showToken: true });
    });

    it('should format config info as text', async () => {
      const ConfigManager = (await import('../../core/project/index.js')).ConfigManager;
      const args = { action: 'view', showToken: false };

      const result = await handleConfigManager(args);

      expect(ConfigManager.formatConfigInfo).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Configuration');
    });

    it('should default showToken to false when not provided', async () => {
      const args = { action: 'view' };

      await handleConfigManager(args);

      expect(mockConfigManager.view).toHaveBeenCalledWith({ showToken: false });
    });
  });

  describe('Success cases - validate action', () => {
    it('should call ConfigManager.validate', async () => {
      const args = { action: 'validate' };

      const result = await handleConfigManager(args);

      expect(mockConfigManager.validate).toHaveBeenCalled();
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
    });

    it('should format validation result as text', async () => {
      const ConfigManager = (await import('../../core/project/index.js')).ConfigManager;
      const args = { action: 'validate' };

      const result = await handleConfigManager(args);

      expect(ConfigManager.formatValidationResult).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Validation');
    });
  });

  describe('Success cases - reset action', () => {
    it('should call ConfigManager.reset', async () => {
      const args = { action: 'reset' };

      const result = await handleConfigManager(args);

      expect(mockConfigManager.reset).toHaveBeenCalled();
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
    });

    it('should format reset result as text', async () => {
      const ConfigManager = (await import('../../core/project/index.js')).ConfigManager;
      const args = { action: 'reset' };

      const result = await handleConfigManager(args);

      expect(ConfigManager.formatResetResult).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Configuration reset');
    });
  });

  describe('Error handling', () => {
    it('should throw error for unknown action', async () => {
      const args = { action: 'unknown' };

      await expect(handleConfigManager(args)).rejects.toThrow('Unknown config action: unknown');
    });

    it('should propagate view errors', async () => {
      mockConfigManager.view = vi.fn(async () => {
        throw new Error('View failed');
      });
      const args = { action: 'view' };

      await expect(handleConfigManager(args)).rejects.toThrow('View failed');
    });

    it('should propagate validate errors', async () => {
      mockConfigManager.validate = vi.fn(async () => {
        throw new Error('Validation failed');
      });
      const args = { action: 'validate' };

      await expect(handleConfigManager(args)).rejects.toThrow('Validation failed');
    });

    it('should propagate reset errors', async () => {
      mockConfigManager.reset = vi.fn(async () => {
        throw new Error('Reset failed');
      });
      const args = { action: 'reset' };

      await expect(handleConfigManager(args)).rejects.toThrow('Reset failed');
    });
  });
});
