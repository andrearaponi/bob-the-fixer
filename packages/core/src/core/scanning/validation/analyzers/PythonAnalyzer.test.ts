import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PythonAnalyzer } from './PythonAnalyzer.js';
import * as fs from 'fs/promises';

vi.mock('fs/promises');

describe('PythonAnalyzer', () => {
  let analyzer: PythonAnalyzer;

  beforeEach(() => {
    analyzer = new PythonAnalyzer();
    vi.resetAllMocks();
  });

  describe('language property', () => {
    it('should have language set to "python"', () => {
      expect(analyzer.language).toBe('python');
    });
  });

  describe('getCriticalProperties', () => {
    it('should include sonar.sources', () => {
      expect(analyzer.getCriticalProperties()).toContain('sonar.sources');
    });
  });

  describe('getRecommendedProperties', () => {
    it('should include sonar.python.version', () => {
      expect(analyzer.getRecommendedProperties()).toContain('sonar.python.version');
    });

    it('should include sonar.python.coverage.reportPaths', () => {
      expect(analyzer.getRecommendedProperties()).toContain('sonar.python.coverage.reportPaths');
    });
  });

  describe('detect', () => {
    it('should return true when pyproject.toml exists', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('pyproject.toml')) return undefined;
        throw new Error('ENOENT');
      });

      expect(await analyzer.detect('/project')).toBe(true);
    });

    it('should return true when requirements.txt exists', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('requirements.txt')) return undefined;
        throw new Error('ENOENT');
      });

      expect(await analyzer.detect('/project')).toBe(true);
    });

    it('should return false when no Python files exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      expect(await analyzer.detect('/project')).toBe(false);
    });
  });

  describe('analyze', () => {
    it('should detect Poetry as build tool', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(`
        [tool.poetry]
        name = "my-project"
      `);

      const result = await analyzer.analyze('/project');
      expect(result.buildTool).toBe('poetry');
    });

    it('should detect Python version from pyproject.toml', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(`
        [project]
        requires-python = ">=3.9"
      `);

      const result = await analyzer.analyze('/project');
      expect(result.version).toBe('3.9');
    });

    it('should detect src directory as sources', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('pyproject.toml') || path.endsWith('src')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      vi.mocked(fs.readFile).mockResolvedValue('[project]');

      const result = await analyzer.analyze('/project');
      const sourcesProp = result.properties.find(p => p.key === 'sonar.sources');
      expect(sourcesProp?.value).toBe('src');
    });

    it('should detect coverage.xml', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('pyproject.toml') || path.endsWith('coverage.xml')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      vi.mocked(fs.readFile).mockResolvedValue('[project]');

      const result = await analyzer.analyze('/project');
      const coverageProp = result.properties.find(p => p.key === 'sonar.python.coverage.reportPaths');
      expect(coverageProp).toBeDefined();
      expect(coverageProp?.value).toBe('coverage.xml');
    });
  });
});
