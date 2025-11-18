import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleDeleteProject } from './delete-project.handler';

// Mock all dependencies
vi.mock('../../core/admin/index.js');
vi.mock('../../universal/project-manager');
vi.mock('../../universal/sonar-admin');
vi.mock('../../infrastructure/security/input-sanitization');

describe('handleDeleteProject', () => {
  let mockProjectDeletionService: any;
  let mockSanitizeUrl: any;

  beforeEach(async () => {
    // Mock sanitizeUrl
    const security = await import('../../infrastructure/security/input-sanitization');
    mockSanitizeUrl = vi.mocked(security.sanitizeUrl);
    mockSanitizeUrl.mockImplementation(() => 'http://localhost:9000');

    // Mock ProjectDeletionService
    const admin = await import('../../core/admin/index.js');
    mockProjectDeletionService = {
      deleteProject: vi.fn(async () =>
        'PROJECT DELETED\n\nProject Key: test-project\nStatus: Successfully deleted'
      ),
    };
    vi.mocked(admin.ProjectDeletionService).mockImplementation(function() { return mockProjectDeletionService; });

    // Set environment variables
    process.env.SONAR_URL = 'http://localhost:9000';
    process.env.SONAR_TOKEN = 'test-token';
  });

  describe('Success cases', () => {
    it('should call ProjectDeletionService with parameters', async () => {
      const args = { projectKey: 'test-project', confirm: true };

      const result = await handleDeleteProject(args);

      expect(mockProjectDeletionService.deleteProject).toHaveBeenCalledWith(
        { projectKey: 'test-project', confirm: true },
        undefined
      );
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('PROJECT DELETED');
    });

    it('should pass correlation ID through', async () => {
      const correlationId = 'test-corr-123';
      await handleDeleteProject({ projectKey: 'test-project' }, correlationId);

      expect(mockProjectDeletionService.deleteProject).toHaveBeenCalledWith(
        expect.anything(),
        correlationId
      );
    });

    it('should sanitize SONAR_URL from environment', async () => {
      await handleDeleteProject({ projectKey: 'test-project' });

      expect(mockSanitizeUrl).toHaveBeenCalledWith('http://localhost:9000');
    });

    it('should use default SONAR_URL when not set', async () => {
      delete process.env.SONAR_URL;
      await handleDeleteProject({ projectKey: 'test-project' });

      expect(mockSanitizeUrl).toHaveBeenCalledWith('http://localhost:9000');
    });

    it('should format result as text', async () => {
      const result = await handleDeleteProject({ projectKey: 'test-project' });

      expect(result.content[0].text).toContain('PROJECT DELETED');
      expect(result.content[0].text).toContain('test-project');
    });
  });

  describe('Error handling', () => {
    it('should catch and return service errors in content', async () => {
      mockProjectDeletionService.deleteProject = vi.fn(async () => {
        throw new Error('Project not found');
      });

      const result = await handleDeleteProject({ projectKey: 'missing-project' });

      expect(result.content[0].text).toContain('PROJECT DELETION ERROR');
      expect(result.content[0].text).toContain('Project not found');
      expect(result.content[0].text).toContain('could not be deleted');
    });

    it('should handle errors without throwing', async () => {
      mockProjectDeletionService.deleteProject = vi.fn(async () => {
        throw new Error('Permission denied');
      });

      await expect(
        handleDeleteProject({ projectKey: 'test-project' })
      ).resolves.toHaveProperty('content');
    });
  });

  describe('Parameter handling', () => {
    it('should handle projectKey parameter', async () => {
      await handleDeleteProject({ projectKey: 'my-project' });

      expect(mockProjectDeletionService.deleteProject).toHaveBeenCalledWith(
        expect.objectContaining({ projectKey: 'my-project' }),
        undefined
      );
    });

    it('should handle confirm true', async () => {
      await handleDeleteProject({ projectKey: 'test-project', confirm: true });

      expect(mockProjectDeletionService.deleteProject).toHaveBeenCalledWith(
        expect.objectContaining({ confirm: true }),
        undefined
      );
    });

    it('should handle confirm false', async () => {
      await handleDeleteProject({ projectKey: 'test-project', confirm: false });

      expect(mockProjectDeletionService.deleteProject).toHaveBeenCalledWith(
        expect.objectContaining({ confirm: false }),
        undefined
      );
    });
  });
});
