import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScanFallbackService } from './ScanFallbackService';
import { ScanErrorCategory } from '../../../shared/types/index.js';
import * as fs from 'fs/promises';

// Mock fs/promises for ProjectStructureAnalyzer
vi.mock('fs/promises');

describe('ScanFallbackService', () => {
  let service: ScanFallbackService;
  const mockProjectPath = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ScanFallbackService();

    // Setup basic mock for ProjectStructureAnalyzer
    vi.mocked(fs.readdir).mockImplementation(async (dir: any, options: any) => {
      const dirStr = dir.toString();
      if (dirStr.includes(mockProjectPath)) {
        return [
          { name: 'package.json', isDirectory: () => false, isFile: () => true },
          { name: 'src', isDirectory: () => true, isFile: () => false },
        ] as any;
      }
      if (dirStr.includes('src')) {
        return [
          { name: 'index.ts', isDirectory: () => false, isFile: () => true },
        ] as any;
      }
      return [];
    });

    vi.mocked(fs.access).mockImplementation(async (path: any) => {
      if (path.toString().includes('src')) {
        return undefined;
      }
      throw new Error('Not found');
    });
  });

  describe('analyze', () => {
    it('should analyze recoverable error', async () => {
      const result = await service.analyze(
        'No sources found for analysis',
        mockProjectPath
      );

      expect(result.parsedError.category).toBe(ScanErrorCategory.SOURCES_NOT_FOUND);
      expect(result.recoverable).toBe(true);
      expect(result.projectStructure).toBeDefined();
      expect(result.suggestedTemplate).toBeDefined();
      expect(result.recommendation).toBeDefined();
    });

    it('should analyze non-recoverable error', async () => {
      const result = await service.analyze(
        'Permission denied: 403',
        mockProjectPath
      );

      expect(result.parsedError.category).toBe(ScanErrorCategory.PERMISSION_DENIED);
      expect(result.recoverable).toBe(false);
    });

    it('should generate suggested template', async () => {
      const result = await service.analyze(
        'No sources found',
        mockProjectPath
      );

      expect(result.suggestedTemplate).toContain('sonar.projectKey=');
      expect(result.suggestedTemplate).toContain('sonar.sources=');
    });

    it('should include project structure analysis', async () => {
      const result = await service.analyze(
        'No sources found',
        mockProjectPath
      );

      expect(result.projectStructure.rootPath).toContain(mockProjectPath);
      expect(result.projectStructure.projectType).toBeDefined();
      expect(result.projectStructure.modules).toBeDefined();
    });

    it('should include recovery recommendation', async () => {
      const result = await service.analyze(
        'No sources found',
        mockProjectPath
      );

      expect(result.recommendation).toContain('sonar_generate_config');
    });
  });

  describe('formatForOutput', () => {
    it('should format output for Claude', async () => {
      const result = await service.analyze(
        'No sources found for analysis',
        mockProjectPath
      );

      const output = service.formatForOutput(result);

      expect(output).toContain('SCAN FAILED');
      expect(output).toContain('## Error Analysis');
      expect(output).toContain('## Project Structure Detected');
      expect(output).toContain('## Directory Tree');
      expect(output).toContain('## Recovery Instructions');
      expect(output).toContain('## Suggested Configuration Template');
    });

    it('should include error category and message', async () => {
      const result = await service.analyze(
        'No sources found for analysis',
        mockProjectPath
      );

      const output = service.formatForOutput(result);

      expect(output.toLowerCase()).toContain('category: sources_not_found');
      expect(output).toContain('No sources found');
    });

    it('should show recoverable status for recoverable errors', async () => {
      const result = await service.analyze(
        'No sources found',
        mockProjectPath
      );

      const output = service.formatForOutput(result);

      expect(output).toContain('✅ This error is recoverable');
    });

    it('should show warning for non-recoverable errors', async () => {
      const result = await service.analyze(
        'Permission denied',
        mockProjectPath
      );

      const output = service.formatForOutput(result);

      expect(output).toContain('⚠️ This error may require manual intervention');
    });

    it('should include suggested template as code block', async () => {
      const result = await service.analyze(
        'No sources found',
        mockProjectPath
      );

      const output = service.formatForOutput(result);

      expect(output).toContain('```properties');
      expect(output).toContain('sonar.projectKey=');
    });

    it('should truncate long error messages', async () => {
      const longMessage = 'A'.repeat(300);
      const result = await service.analyze(longMessage, mockProjectPath);

      const output = service.formatForOutput(result);

      // Should be truncated
      expect(output).toContain('...');
    });

    it('should include modules info', async () => {
      const result = await service.analyze(
        'No sources found',
        mockProjectPath
      );

      const output = service.formatForOutput(result);

      expect(output).toContain('Modules:');
    });
  });

  describe('isRecoverable', () => {
    it('should return true for SOURCES_NOT_FOUND', async () => {
      const result = await service.analyze(
        'No sources found',
        mockProjectPath
      );

      expect(service.isRecoverable(result.parsedError)).toBe(true);
    });

    it('should return true for MODULE_CONFIG_ERROR', async () => {
      const result = await service.analyze(
        'Module not found',
        mockProjectPath
      );

      expect(service.isRecoverable(result.parsedError)).toBe(true);
    });

    it('should return false for PERMISSION_DENIED', async () => {
      const result = await service.analyze(
        'Permission denied',
        mockProjectPath
      );

      expect(service.isRecoverable(result.parsedError)).toBe(false);
    });
  });

  describe('multi-module template generation', () => {
    beforeEach(() => {
      // Mock multi-module project structure
      vi.mocked(fs.readdir).mockImplementation(async (dir: any, options: any) => {
        const dirStr = dir.toString();
        if (dirStr.includes(mockProjectPath) && !dirStr.includes('backend') && !dirStr.includes('frontend')) {
          return [
            { name: 'pom.xml', isDirectory: () => false, isFile: () => true },
            { name: 'backend', isDirectory: () => true, isFile: () => false },
            { name: 'frontend', isDirectory: () => true, isFile: () => false },
          ] as any;
        }
        if (dirStr.includes('backend')) {
          return [
            { name: 'pom.xml', isDirectory: () => false, isFile: () => true },
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as any;
        }
        if (dirStr.includes('frontend')) {
          return [
            { name: 'pom.xml', isDirectory: () => false, isFile: () => true },
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as any;
        }
        if (dirStr.includes('src')) {
          return [] as any;
        }
        return [];
      });
    });

    it('should generate multi-module template', async () => {
      const result = await service.analyze(
        'No sources found',
        mockProjectPath
      );

      if (result.projectStructure.projectType === 'multi-module') {
        expect(result.suggestedTemplate).toContain('sonar.modules=');
        expect(result.suggestedTemplate).toContain('.sonar.projectBaseDir=');
      }
    });
  });
});
