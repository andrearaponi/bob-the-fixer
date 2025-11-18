import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleDiagnosePermissions } from './diagnose-permissions.handler';

// Mock all dependencies
vi.mock('../../core/admin/index.js');
vi.mock('../../universal/project-manager');
vi.mock('../../universal/sonar-admin');
vi.mock('../../infrastructure/security/input-sanitization');

describe('handleDiagnosePermissions', () => {
  let mockDiagnosticsService: any;
  let mockSanitizeUrl: any;

  beforeEach(async () => {
    // Mock sanitizeUrl
    const security = await import('../../infrastructure/security/input-sanitization');
    mockSanitizeUrl = vi.mocked(security.sanitizeUrl);
    mockSanitizeUrl.mockImplementation(() => 'http://localhost:9000');

    // Mock DiagnosticsService
    const admin = await import('../../core/admin/index.js');
    mockDiagnosticsService = {
      diagnose: vi.fn(async () =>
        'DIAGNOSTICS REPORT\n\nToken: Valid\nPermissions: OK\nAPI Access: Success'
      ),
    };
    vi.mocked(admin.DiagnosticsService).mockImplementation(function() { return mockDiagnosticsService; });

    // Set environment variables
    process.env.SONAR_URL = 'http://localhost:9000';
    process.env.SONAR_TOKEN = 'test-token';
  });

  describe('Success cases', () => {
    it('should call DiagnosticsService with default verbose true', async () => {
      const args = {};

      const result = await handleDiagnosePermissions(args);

      expect(mockDiagnosticsService.diagnose).toHaveBeenCalledWith(
        { verbose: true },
        undefined
      );
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('DIAGNOSTICS REPORT');
    });

    it('should pass custom verbose parameter', async () => {
      await handleDiagnosePermissions({ verbose: false });

      expect(mockDiagnosticsService.diagnose).toHaveBeenCalledWith(
        { verbose: false },
        undefined
      );
    });

    it('should pass correlation ID through', async () => {
      const correlationId = 'test-corr-123';
      await handleDiagnosePermissions({}, correlationId);

      expect(mockDiagnosticsService.diagnose).toHaveBeenCalledWith(
        expect.anything(),
        correlationId
      );
    });

    it('should sanitize SONAR_URL from environment', async () => {
      await handleDiagnosePermissions({});

      expect(mockSanitizeUrl).toHaveBeenCalledWith('http://localhost:9000');
    });

    it('should use default SONAR_URL when not set', async () => {
      delete process.env.SONAR_URL;
      await handleDiagnosePermissions({});

      expect(mockSanitizeUrl).toHaveBeenCalledWith('http://localhost:9000');
    });

    it('should format result as text', async () => {
      const result = await handleDiagnosePermissions({});

      expect(result.content[0].text).toContain('DIAGNOSTICS REPORT');
      expect(result.content[0].text).toContain('Token: Valid');
    });
  });

  describe('Error handling', () => {
    it('should catch and return service errors in content', async () => {
      mockDiagnosticsService.diagnose = vi.fn(async () => {
        throw new Error('Connection failed');
      });

      const result = await handleDiagnosePermissions({});

      expect(result.content[0].text).toContain('DIAGNOSTIC ERROR');
      expect(result.content[0].text).toContain('Connection failed');
    });

    it('should handle errors without throwing', async () => {
      mockDiagnosticsService.diagnose = vi.fn(async () => {
        throw new Error('Token invalid');
      });

      await expect(
        handleDiagnosePermissions({})
      ).resolves.toHaveProperty('content');
    });
  });

  describe('Parameter handling', () => {
    it('should handle verbose true', async () => {
      await handleDiagnosePermissions({ verbose: true });

      expect(mockDiagnosticsService.diagnose).toHaveBeenCalledWith(
        expect.objectContaining({ verbose: true }),
        undefined
      );
    });

    it('should handle verbose false', async () => {
      await handleDiagnosePermissions({ verbose: false });

      expect(mockDiagnosticsService.diagnose).toHaveBeenCalledWith(
        expect.objectContaining({ verbose: false }),
        undefined
      );
    });
  });
});
