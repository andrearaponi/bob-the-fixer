import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoAnalyzer } from './GoAnalyzer.js';
import * as fs from 'fs/promises';

vi.mock('fs/promises');

describe('GoAnalyzer', () => {
  let analyzer: GoAnalyzer;

  beforeEach(() => {
    analyzer = new GoAnalyzer();
    vi.resetAllMocks();
  });

  describe('language property', () => {
    it('should have language set to "go"', () => {
      expect(analyzer.language).toBe('go');
    });
  });

  describe('getCriticalProperties', () => {
    it('should include sonar.sources', () => {
      expect(analyzer.getCriticalProperties()).toContain('sonar.sources');
    });
  });

  describe('getRecommendedProperties', () => {
    it('should include sonar.go.coverage.reportPaths', () => {
      expect(analyzer.getRecommendedProperties()).toContain('sonar.go.coverage.reportPaths');
    });
  });

  describe('detect', () => {
    it('should return true when go.mod exists', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('go.mod')) return undefined;
        throw new Error('ENOENT');
      });

      expect(await analyzer.detect('/project')).toBe(true);
    });

    it('should return false when no go.mod exists', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      expect(await analyzer.detect('/project')).toBe(false);
    });
  });

  describe('analyze', () => {
    it('should set build tool to go', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue('module example.com/myproject\n\ngo 1.21');

      const result = await analyzer.analyze('/project');
      expect(result.buildTool).toBe('go');
    });

    it('should detect Go version from go.mod', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue('module example.com/myproject\n\ngo 1.21');

      const result = await analyzer.analyze('/project');
      expect(result.version).toBe('1.21');
    });

    it('should set sources to current directory', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue('module example.com/myproject');

      const result = await analyzer.analyze('/project');
      const sourcesProp = result.properties.find(p => p.key === 'sonar.sources');
      expect(sourcesProp?.value).toBe('.');
    });

    it('should detect coverage.out', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('go.mod') || path.endsWith('coverage.out')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      vi.mocked(fs.readFile).mockResolvedValue('module example.com/myproject');

      const result = await analyzer.analyze('/project');
      const coverageProp = result.properties.find(p => p.key === 'sonar.go.coverage.reportPaths');
      expect(coverageProp).toBeDefined();
      expect(coverageProp?.value).toBe('coverage.out');
    });

    it('should set test exclusions for _test.go files', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue('module example.com/myproject');

      const result = await analyzer.analyze('/project');
      const exclusionsProp = result.properties.find(p => p.key === 'sonar.exclusions');
      expect(exclusionsProp?.value).toContain('*_test.go');
    });
  });
});
