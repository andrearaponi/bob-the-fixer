import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetSecurityHotspots } from './security-hotspots.handler';

// Mock all dependencies
vi.mock('../../core/analysis/index.js');
vi.mock('../../universal/project-manager');
vi.mock('../../shared/validators/mcp-schemas');

describe('handleGetSecurityHotspots', () => {
  let mockSecurityAnalyzer: any;
  let mockProjectManager: any;
  let mockValidateInput: any;

  beforeEach(async () => {
    // Mock validateInput
    const validators = await import('../../shared/validators/mcp-schemas');
    mockValidateInput = vi.mocked(validators.validateInput);
    mockValidateInput.mockImplementation(() => ({
      statuses: ['TO_REVIEW'],
      resolutions: [],
      severities: ['HIGH', 'MEDIUM']
    }));

    // Mock ProjectManager
    const projectManagerModule = await import('../../universal/project-manager');
    mockProjectManager = {};
    vi.mocked(projectManagerModule.ProjectManager).mockImplementation(function() { return mockProjectManager; });

    // Mock SecurityAnalyzer
    const analysisModule = await import('../../core/analysis/index.js');
    mockSecurityAnalyzer = {
      getSecurityHotspots: vi.fn(async () =>
        'SECURITY HOTSPOTS\n\nTotal: 5\n\n1. SQL Injection - HIGH\n2. XSS - MEDIUM'
      )
    };
    vi.mocked(analysisModule.SecurityAnalyzer).mockImplementation(function() { return mockSecurityAnalyzer; });
  });

  describe('Success cases', () => {
    it('should validate input and call SecurityAnalyzer', async () => {
      const args = {
        statuses: ['TO_REVIEW'],
        resolutions: [],
        severities: ['HIGH', 'MEDIUM']
      };

      const result = await handleGetSecurityHotspots(args);

      expect(mockValidateInput).toHaveBeenCalledWith(
        expect.anything(),
        args,
        'sonar_get_security_hotspots'
      );
      expect(mockSecurityAnalyzer.getSecurityHotspots).toHaveBeenCalledWith(
        {
          statuses: ['TO_REVIEW'],
          resolutions: [],
          severities: ['HIGH', 'MEDIUM']
        },
        undefined
      );
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
    });

    it('should pass correlation ID through', async () => {
      const correlationId = 'test-corr-123';
      await handleGetSecurityHotspots({}, correlationId);

      expect(mockSecurityAnalyzer.getSecurityHotspots).toHaveBeenCalledWith(
        expect.anything(),
        correlationId
      );
    });

    it('should return security hotspots report', async () => {
      const result = await handleGetSecurityHotspots({});

      expect(result.content[0].text).toContain('SECURITY HOTSPOTS');
      expect(result.content[0].text).toContain('Total');
    });

    it('should handle TO_REVIEW status', async () => {
      mockValidateInput.mockImplementation(() => ({
        statuses: ['TO_REVIEW']
      }));

      await handleGetSecurityHotspots({});

      expect(mockSecurityAnalyzer.getSecurityHotspots).toHaveBeenCalledWith(
        expect.objectContaining({
          statuses: ['TO_REVIEW']
        }),
        undefined
      );
    });

    it('should handle REVIEWED status', async () => {
      mockValidateInput.mockImplementation(() => ({
        statuses: ['REVIEWED']
      }));

      await handleGetSecurityHotspots({});

      expect(mockSecurityAnalyzer.getSecurityHotspots).toHaveBeenCalledWith(
        expect.objectContaining({
          statuses: ['REVIEWED']
        }),
        undefined
      );
    });

    it('should handle multiple statuses', async () => {
      mockValidateInput.mockImplementation(() => ({
        statuses: ['TO_REVIEW', 'REVIEWED']
      }));

      await handleGetSecurityHotspots({});

      expect(mockSecurityAnalyzer.getSecurityHotspots).toHaveBeenCalledWith(
        expect.objectContaining({
          statuses: ['TO_REVIEW', 'REVIEWED']
        }),
        undefined
      );
    });

    it('should handle resolutions', async () => {
      mockValidateInput.mockImplementation(() => ({
        resolutions: ['FIXED', 'SAFE']
      }));

      await handleGetSecurityHotspots({});

      expect(mockSecurityAnalyzer.getSecurityHotspots).toHaveBeenCalledWith(
        expect.objectContaining({
          resolutions: ['FIXED', 'SAFE']
        }),
        undefined
      );
    });

    it('should handle HIGH severity', async () => {
      mockValidateInput.mockImplementation(() => ({
        severities: ['HIGH']
      }));

      await handleGetSecurityHotspots({});

      expect(mockSecurityAnalyzer.getSecurityHotspots).toHaveBeenCalledWith(
        expect.objectContaining({
          severities: ['HIGH']
        }),
        undefined
      );
    });

    it('should handle multiple severities', async () => {
      mockValidateInput.mockImplementation(() => ({
        severities: ['HIGH', 'MEDIUM', 'LOW']
      }));

      await handleGetSecurityHotspots({});

      expect(mockSecurityAnalyzer.getSecurityHotspots).toHaveBeenCalledWith(
        expect.objectContaining({
          severities: ['HIGH', 'MEDIUM', 'LOW']
        }),
        undefined
      );
    });
  });

  describe('Error handling', () => {
    it('should propagate validation errors', async () => {
      mockValidateInput.mockImplementation(function() {
        throw new Error('Invalid status');
      });

      await expect(handleGetSecurityHotspots({})).rejects.toThrow('Invalid status');
    });

    it('should propagate analyzer errors', async () => {
      mockSecurityAnalyzer.getSecurityHotspots = vi.fn(async () => {
        throw new Error('Failed to fetch hotspots');
      });

      await expect(handleGetSecurityHotspots({})).rejects.toThrow('Failed to fetch hotspots');
    });

    it('should propagate API errors', async () => {
      mockSecurityAnalyzer.getSecurityHotspots = vi.fn(async () => {
        throw new Error('SonarQube API error');
      });

      await expect(handleGetSecurityHotspots({})).rejects.toThrow('SonarQube API error');
    });
  });
});
