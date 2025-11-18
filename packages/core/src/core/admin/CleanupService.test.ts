import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CleanupService, CleanupOptions } from './CleanupService';

// Create mock instances at module level
const mockSonarAdmin = {
  cleanup: vi.fn(() => Promise.resolve()),
};

const mockCleanupResult = {
  revokedTokens: ['token1', 'token2', 'token3'],
  deletedProjects: ['project1', 'project2'],
};

// Mock modules
vi.mock('../../universal/sonar-admin', () => ({
  SonarAdmin: vi.fn(function() { return mockSonarAdmin; }),
}));

vi.mock('../../shared/logger/structured-logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(() => {}),
    debug: vi.fn(() => {}),
    warn: vi.fn(() => {}),
    error: vi.fn(() => {}),
  })),
}));

describe('CleanupService', () => {
  let cleanupService: CleanupService;

  beforeEach(() => {
    vi.clearAllMocks();
    cleanupService = new CleanupService(mockSonarAdmin as any);

    // Default successful responses
    mockSonarAdmin.cleanup = vi.fn(async () => mockCleanupResult);
  });

  describe('cleanup', () => {
    it('should perform cleanup with default options', async () => {
      const options: CleanupOptions = {};
      const result = await cleanupService.cleanup(options);

      expect(mockSonarAdmin.cleanup).toHaveBeenCalledWith(30);
      expect(result).toContain('CLEANUP COMPLETE');
      expect(result).toContain('Tokens Revoked: 3');
      expect(result).toContain('Projects Deleted: 2');
      expect(result).toContain('30 days');
    });

    it('should perform cleanup with custom olderThanDays', async () => {
      const options: CleanupOptions = {
        olderThanDays: 60,
      };
      const result = await cleanupService.cleanup(options);

      expect(mockSonarAdmin.cleanup).toHaveBeenCalledWith(60);
      expect(result).toContain('60 days');
    });

    it('should perform dry run without actual cleanup', async () => {
      const options: CleanupOptions = {
        dryRun: true,
      };
      const result = await cleanupService.cleanup(options);

      expect(mockSonarAdmin.cleanup).not.toHaveBeenCalled();
      expect(result).toContain('CLEANUP DRY RUN');
      expect(result).toContain('Would clean up resources older than 30 days');
      expect(result).toContain('not fully implemented yet');
    });

    it('should perform dry run with custom days', async () => {
      const options: CleanupOptions = {
        olderThanDays: 45,
        dryRun: true,
      };
      const result = await cleanupService.cleanup(options);

      expect(mockSonarAdmin.cleanup).not.toHaveBeenCalled();
      expect(result).toContain('45 days');
    });

    it('should handle cleanup with no tokens or projects', async () => {
      mockSonarAdmin.cleanup = vi.fn(async () => ({
        revokedTokens: [],
        deletedProjects: [],
      }));

      const options: CleanupOptions = {};
      const result = await cleanupService.cleanup(options);

      expect(result).toContain('Tokens Revoked: 0');
      expect(result).toContain('Projects Deleted: 0');
    });

    it('should handle cleanup with only tokens', async () => {
      mockSonarAdmin.cleanup = vi.fn(async () => ({
        revokedTokens: ['token1', 'token2'],
        deletedProjects: [],
      }));

      const options: CleanupOptions = {};
      const result = await cleanupService.cleanup(options);

      expect(result).toContain('Tokens Revoked: 2');
      expect(result).toContain('Projects Deleted: 0');
    });

    it('should handle cleanup with only projects', async () => {
      mockSonarAdmin.cleanup = vi.fn(async () => ({
        revokedTokens: [],
        deletedProjects: ['project1', 'project2', 'project3'],
      }));

      const options: CleanupOptions = {};
      const result = await cleanupService.cleanup(options);

      expect(result).toContain('Tokens Revoked: 0');
      expect(result).toContain('Projects Deleted: 3');
    });

    it('should pass correlationId through logging', async () => {
      const correlationId = 'test-correlation-id';
      const options: CleanupOptions = {};

      await cleanupService.cleanup(options, correlationId);

      expect(mockSonarAdmin.cleanup).toHaveBeenCalled();
    });

    it('should handle cleanup with olderThanDays of 0', async () => {
      const options: CleanupOptions = {
        olderThanDays: 0,
      };
      const result = await cleanupService.cleanup(options);

      expect(mockSonarAdmin.cleanup).toHaveBeenCalledWith(0);
      expect(result).toContain('0 days');
    });

    it('should handle cleanup with large olderThanDays', async () => {
      const options: CleanupOptions = {
        olderThanDays: 365,
      };
      const result = await cleanupService.cleanup(options);

      expect(mockSonarAdmin.cleanup).toHaveBeenCalledWith(365);
      expect(result).toContain('365 days');
    });

    it('should handle error during cleanup', async () => {
      mockSonarAdmin.cleanup = vi.fn(async () => { throw new Error('Cleanup failed'); });

      const options: CleanupOptions = {};

      await expect(cleanupService.cleanup(options)).rejects.toThrow('Cleanup failed');
    });

    it('should not call cleanup when dryRun is explicitly true', async () => {
      const options: CleanupOptions = {
        dryRun: true,
        olderThanDays: 30,
      };

      await cleanupService.cleanup(options);

      expect(mockSonarAdmin.cleanup).not.toHaveBeenCalled();
    });

    it('should call cleanup when dryRun is explicitly false', async () => {
      const options: CleanupOptions = {
        dryRun: false,
        olderThanDays: 30,
      };

      await cleanupService.cleanup(options);

      expect(mockSonarAdmin.cleanup).toHaveBeenCalledWith(30);
    });
  });

  describe('edge cases', () => {
    it('should handle undefined options', async () => {
      const result = await cleanupService.cleanup({});

      expect(mockSonarAdmin.cleanup).toHaveBeenCalledWith(30);
      expect(result).toContain('CLEANUP COMPLETE');
    });

    it('should handle cleanup result with many items', async () => {
      const largeResult = {
        revokedTokens: Array.from({ length: 100 }, (_, i) => `token${i}`),
        deletedProjects: Array.from({ length: 50 }, (_, i) => `project${i}`),
      };
      mockSonarAdmin.cleanup = vi.fn(async () => largeResult);

      const result = await cleanupService.cleanup({});

      expect(result).toContain('Tokens Revoked: 100');
      expect(result).toContain('Projects Deleted: 50');
    });

    it('should format message consistently for dry run', async () => {
      const options: CleanupOptions = {
        dryRun: true,
        olderThanDays: 15,
      };

      const result = await cleanupService.cleanup(options);

      expect(result).toContain('CLEANUP DRY RUN');
      expect(result).not.toContain('CLEANUP COMPLETE');
    });

    it('should format message consistently for actual cleanup', async () => {
      const options: CleanupOptions = {
        dryRun: false,
      };

      const result = await cleanupService.cleanup(options);

      expect(result).toContain('CLEANUP COMPLETE');
      expect(result).not.toContain('DRY RUN');
    });
  });
});
