import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CppAnalyzer } from './CppAnalyzer.js';
import * as fs from 'fs/promises';

vi.mock('fs/promises');

describe('CppAnalyzer', () => {
  let analyzer: CppAnalyzer;

  beforeEach(() => {
    analyzer = new CppAnalyzer();
    vi.resetAllMocks();
  });

  describe('language property', () => {
    it('should have language set to "cpp"', () => {
      expect(analyzer.language).toBe('cpp');
    });
  });

  describe('getCriticalProperties', () => {
    it('should include sonar.sources', () => {
      expect(analyzer.getCriticalProperties()).toContain('sonar.sources');
    });

    it('should include sonar.cfamily.compile-commands', () => {
      expect(analyzer.getCriticalProperties()).toContain('sonar.cfamily.compile-commands');
    });
  });

  describe('getRecommendedProperties', () => {
    it('should include sonar.cfamily.build-wrapper-output', () => {
      expect(analyzer.getRecommendedProperties()).toContain('sonar.cfamily.build-wrapper-output');
    });
  });

  describe('detect', () => {
    it('should return true when CMakeLists.txt exists', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('CMakeLists.txt')) return undefined;
        throw new Error('ENOENT');
      });

      expect(await analyzer.detect('/project')).toBe(true);
    });

    it('should return true when Makefile exists', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('Makefile')) return undefined;
        throw new Error('ENOENT');
      });

      expect(await analyzer.detect('/project')).toBe(true);
    });

    it('should return true when compile_commands.json exists', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('compile_commands.json')) return undefined;
        throw new Error('ENOENT');
      });

      expect(await analyzer.detect('/project')).toBe(true);
    });

    it('should return false when no C++ files exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      expect(await analyzer.detect('/project')).toBe(false);
    });
  });

  describe('analyze', () => {
    it('should detect cmake as build tool', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('CMakeLists.txt')) return undefined;
        throw new Error('ENOENT');
      });

      const result = await analyzer.analyze('/project');
      expect(result.buildTool).toBe('cmake');
    });

    it('should detect compile_commands.json', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('CMakeLists.txt') || path.endsWith('compile_commands.json')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const result = await analyzer.analyze('/project');
      const compileCommandsProp = result.properties.find(p => p.key === 'sonar.cfamily.compile-commands');
      expect(compileCommandsProp).toBeDefined();
      expect(compileCommandsProp?.value).toBe('compile_commands.json');
    });

    it('should detect src directory as sources', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('CMakeLists.txt') || path.endsWith('src')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const result = await analyzer.analyze('/project');
      const sourcesProp = result.properties.find(p => p.key === 'sonar.sources');
      expect(sourcesProp?.value).toContain('src');
    });

    it('should warn when compile_commands.json not found', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('CMakeLists.txt')) return undefined;
        throw new Error('ENOENT');
      });

      const result = await analyzer.analyze('/project');
      const warning = result.warnings.find(w => w.message.includes('compile_commands.json'));
      expect(warning).toBeDefined();
    });

    it('should detect build-wrapper output directory', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('CMakeLists.txt') || path.endsWith('bw-output')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const result = await analyzer.analyze('/project');
      const bwProp = result.properties.find(p => p.key === 'sonar.cfamily.build-wrapper-output');
      expect(bwProp).toBeDefined();
      expect(bwProp?.value).toBe('bw-output');
    });
  });
});
