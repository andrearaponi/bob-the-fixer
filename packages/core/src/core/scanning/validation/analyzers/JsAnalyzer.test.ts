import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JsAnalyzer } from './JsAnalyzer.js';
import * as fs from 'fs/promises';

vi.mock('fs/promises');

describe('JsAnalyzer', () => {
  let analyzer: JsAnalyzer;

  beforeEach(() => {
    analyzer = new JsAnalyzer();
    vi.resetAllMocks();
  });

  describe('language property', () => {
    it('should have language set to "javascript"', () => {
      expect(analyzer.language).toBe('javascript');
    });
  });

  describe('getCriticalProperties', () => {
    it('should include sonar.sources', () => {
      expect(analyzer.getCriticalProperties()).toContain('sonar.sources');
    });
  });

  describe('getRecommendedProperties', () => {
    it('should include sonar.javascript.lcov.reportPaths', () => {
      expect(analyzer.getRecommendedProperties()).toContain('sonar.javascript.lcov.reportPaths');
    });

    it('should include sonar.typescript.tsconfigPath', () => {
      expect(analyzer.getRecommendedProperties()).toContain('sonar.typescript.tsconfigPath');
    });
  });

  describe('detect', () => {
    it('should return true when package.json exists', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('package.json')) return undefined;
        throw new Error('ENOENT');
      });

      expect(await analyzer.detect('/project')).toBe(true);
    });

    it('should return false when no package.json exists', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      expect(await analyzer.detect('/project')).toBe(false);
    });
  });

  describe('analyze', () => {
    it('should detect npm as build tool', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('package.json') || path.endsWith('package-lock.json')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      vi.mocked(fs.readFile).mockResolvedValue('{}');

      const result = await analyzer.analyze('/project');
      expect(result.buildTool).toBe('npm');
    });

    it('should detect yarn as build tool', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('package.json') || path.endsWith('yarn.lock')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      vi.mocked(fs.readFile).mockResolvedValue('{}');

      const result = await analyzer.analyze('/project');
      expect(result.buildTool).toBe('yarn');
    });

    it('should detect TypeScript project', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('package.json') || path.endsWith('tsconfig.json')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      vi.mocked(fs.readFile).mockResolvedValue('{}');

      const result = await analyzer.analyze('/project');
      const tsconfigProp = result.properties.find(p => p.key === 'sonar.typescript.tsconfigPath');
      expect(tsconfigProp).toBeDefined();
      expect(tsconfigProp?.value).toBe('tsconfig.json');
    });

    it('should detect src directory as sources', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('package.json') || path.endsWith('src')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      vi.mocked(fs.readFile).mockResolvedValue('{}');

      const result = await analyzer.analyze('/project');
      const sourcesProp = result.properties.find(p => p.key === 'sonar.sources');
      expect(sourcesProp?.value).toBe('src');
    });

    it('should detect lcov coverage report', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('package.json') || path.endsWith('coverage/lcov.info')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      vi.mocked(fs.readFile).mockResolvedValue('{}');

      const result = await analyzer.analyze('/project');
      const coverageProp = result.properties.find(p => p.key === 'sonar.javascript.lcov.reportPaths');
      expect(coverageProp).toBeDefined();
      expect(coverageProp?.value).toBe('coverage/lcov.info');
    });
  });
});
