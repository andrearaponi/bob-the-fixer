import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCleanup } from './cleanup.handler';

// Mock all dependencies
vi.mock('../../core/admin/index.js');
vi.mock('../../universal/sonar-admin');
vi.mock('../../infrastructure/security/input-sanitization');

describe('handleCleanup', () => {
  let mockCleanupService: any;
  let mockSanitizeUrl: any;

  beforeEach(async () => {
    // Mock sanitizeUrl
    const security = await import('../../infrastructure/security/input-sanitization');
    mockSanitizeUrl = vi.mocked(security.sanitizeUrl);
    mockSanitizeUrl.mockImplementation(() => 'http://localhost:9000');

    // Mock CleanupService
    const admin = await import('../../core/admin/index.js');
    mockCleanupService = {
      cleanup: vi.fn(async () =>
        'CLEANUP REPORT\n\nProjects cleaned: 3\nOlder than: 30 days\nDry run: false'
      ),
    };
    vi.mocked(admin.CleanupService).mockImplementation(function() { return mockCleanupService; });

    // Set environment variables
    process.env.SONAR_URL = 'http://localhost:9000';
    process.env.SONAR_TOKEN = 'test-token';
  });

  describe('Success cases', () => {
    it('should call CleanupService with default parameters', async () => {
      const args = {};

      const result = await handleCleanup(args);

      expect(mockCleanupService.cleanup).toHaveBeenCalledWith(
        { olderThanDays: 30, dryRun: false },
        undefined
      );
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('CLEANUP REPORT');
    });

    it('should pass custom parameters to service', async () => {
      const args = { olderThanDays: 60, dryRun: true };

      await handleCleanup(args);

      expect(mockCleanupService.cleanup).toHaveBeenCalledWith(
        { olderThanDays: 60, dryRun: true },
        undefined
      );
    });

    it('should pass correlation ID through', async () => {
      const correlationId = 'test-corr-123';
      await handleCleanup({}, correlationId);

      expect(mockCleanupService.cleanup).toHaveBeenCalledWith(
        expect.anything(),
        correlationId
      );
    });

    it('should sanitize SONAR_URL from environment', async () => {
      await handleCleanup({});

      expect(mockSanitizeUrl).toHaveBeenCalledWith('http://localhost:9000');
    });

    it('should use default SONAR_URL when not set', async () => {
      delete process.env.SONAR_URL;
      await handleCleanup({});

      expect(mockSanitizeUrl).toHaveBeenCalledWith('http://localhost:9000');
    });

    it('should format result as text', async () => {
      const result = await handleCleanup({});

      expect(result.content[0].text).toContain('CLEANUP REPORT');
      expect(result.content[0].text).toContain('Projects cleaned: 3');
    });
  });

  describe('Error handling', () => {
    it('should propagate service errors', async () => {
      mockCleanupService.cleanup = vi.fn(async () => {
        throw new Error('Cleanup failed');
      });

      await expect(handleCleanup({})).rejects.toThrow('Cleanup failed');
    });
  });

  describe('Parameter handling', () => {
    it('should handle olderThanDays parameter', async () => {
      await handleCleanup({ olderThanDays: 90 });

      expect(mockCleanupService.cleanup).toHaveBeenCalledWith(
        expect.objectContaining({ olderThanDays: 90 }),
        undefined
      );
    });

    it('should handle dryRun true', async () => {
      await handleCleanup({ dryRun: true });

      expect(mockCleanupService.cleanup).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true }),
        undefined
      );
    });

    it('should handle dryRun false', async () => {
      await handleCleanup({ dryRun: false });

      expect(mockCleanupService.cleanup).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: false }),
        undefined
      );
    });
  });
});
