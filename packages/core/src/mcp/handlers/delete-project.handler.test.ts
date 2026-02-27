import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleDeleteProject, DeleteProjectHandler } from './delete-project.handler';

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

describe('DeleteProjectHandler (DI class)', () => {
  let mockProjectDeletionService: any;
  let mockProjectManager: any;
  let mockSonarAdmin: any;

  beforeEach(async () => {
    // Mock ProjectDeletionService
    const admin = await import('../../core/admin/index.js');
    mockProjectDeletionService = {
      deleteProject: vi.fn(async () =>
        'PROJECT DELETED\n\nProject Key: test-project\nStatus: Successfully deleted'
      ),
    };
    vi.mocked(admin.ProjectDeletionService).mockImplementation(function() { return mockProjectDeletionService; });

    // Mock dependencies
    mockProjectManager = {};
    mockSonarAdmin = {};
  });

  it('should handle delete project successfully', async () => {
    const handler = new DeleteProjectHandler(mockProjectManager, mockSonarAdmin);
    const result = await handler.handle({ projectKey: 'test-project', confirm: true });

    expect(mockProjectDeletionService.deleteProject).toHaveBeenCalledWith(
      { projectKey: 'test-project', confirm: true },
      undefined
    );
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('PROJECT DELETED');
  });

  it('should pass correlation ID through', async () => {
    const handler = new DeleteProjectHandler(mockProjectManager, mockSonarAdmin);
    await handler.handle({ projectKey: 'test-project', confirm: true }, 'test-corr-del');

    expect(mockProjectDeletionService.deleteProject).toHaveBeenCalledWith(
      expect.anything(),
      'test-corr-del'
    );
  });

  it('should handle projectKey parameter', async () => {
    const handler = new DeleteProjectHandler(mockProjectManager, mockSonarAdmin);
    await handler.handle({ projectKey: 'my-custom-project', confirm: true });

    expect(mockProjectDeletionService.deleteProject).toHaveBeenCalledWith(
      expect.objectContaining({ projectKey: 'my-custom-project' }),
      undefined
    );
  });

  it('should handle confirm false', async () => {
    const handler = new DeleteProjectHandler(mockProjectManager, mockSonarAdmin);
    await handler.handle({ projectKey: 'test-project', confirm: false });

    expect(mockProjectDeletionService.deleteProject).toHaveBeenCalledWith(
      expect.objectContaining({ confirm: false }),
      undefined
    );
  });

  it('should catch and return service errors gracefully', async () => {
    mockProjectDeletionService.deleteProject = vi.fn(async () => {
      throw new Error('DI Project not found');
    });

    const handler = new DeleteProjectHandler(mockProjectManager, mockSonarAdmin);
    const result = await handler.handle({ projectKey: 'missing-project', confirm: true });

    expect(result.content[0].text).toContain('PROJECT DELETION ERROR');
    expect(result.content[0].text).toContain('DI Project not found');
    expect(result.content[0].text).toContain('could not be deleted');
  });

  it('should not throw on service errors', async () => {
    mockProjectDeletionService.deleteProject = vi.fn(async () => {
      throw new Error('Permission denied');
    });

    const handler = new DeleteProjectHandler(mockProjectManager, mockSonarAdmin);
    await expect(
      handler.handle({ projectKey: 'test-project', confirm: true })
    ).resolves.toHaveProperty('content');
  });
});
