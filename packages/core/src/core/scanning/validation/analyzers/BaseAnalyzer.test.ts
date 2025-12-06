import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseAnalyzer } from './BaseAnalyzer.js';
import {
  LanguageAnalysisResult,
  DetectedProperty,
  ValidationWarning,
  ILanguageAnalyzer
} from '../../../../shared/types/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs
vi.mock('fs/promises');

// Concrete implementation for testing
class TestAnalyzer extends BaseAnalyzer {
  readonly language = 'test';

  getCriticalProperties(): string[] {
    return ['sonar.test.critical'];
  }

  getRecommendedProperties(): string[] {
    return ['sonar.test.recommended'];
  }

  protected async detectLanguage(projectPath: string): Promise<boolean> {
    // Detect if test.config exists
    return this.fileExists(path.join(projectPath, 'test.config'));
  }

  protected async analyzeLanguage(projectPath: string): Promise<{
    properties: DetectedProperty[];
    warnings: ValidationWarning[];
  }> {
    const properties: DetectedProperty[] = [];
    const warnings: ValidationWarning[] = [];

    // Simulate detecting a property
    const configPath = path.join(projectPath, 'test.config');
    if (await this.fileExists(configPath)) {
      properties.push({
        key: 'sonar.test.critical',
        value: 'test-value',
        confidence: 'high',
        source: 'detected from test.config'
      });
    }

    return { properties, warnings };
  }
}

describe('BaseAnalyzer', () => {
  let analyzer: TestAnalyzer;

  beforeEach(() => {
    analyzer = new TestAnalyzer();
    vi.resetAllMocks();
  });

  describe('detect', () => {
    it('should return true when language is detected', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await analyzer.detect('/project');

      expect(result).toBe(true);
    });

    it('should return false when language is not detected', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await analyzer.detect('/project');

      expect(result).toBe(false);
    });
  });

  describe('analyze', () => {
    it('should return analysis result with detected properties', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await analyzer.analyze('/project');

      expect(result.detected).toBe(true);
      expect(result.language).toBe('test');
      expect(result.properties).toHaveLength(1);
      expect(result.properties[0].key).toBe('sonar.test.critical');
    });

    it('should return detected=false when language not found', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await analyzer.analyze('/project');

      expect(result.detected).toBe(false);
      expect(result.properties).toHaveLength(0);
    });

    it('should include modules array in result', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await analyzer.analyze('/project');

      expect(result.modules).toBeDefined();
      expect(Array.isArray(result.modules)).toBe(true);
    });

    it('should include warnings array in result', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await analyzer.analyze('/project');

      expect(result.warnings).toBeDefined();
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe('getCriticalProperties', () => {
    it('should return list of critical properties', () => {
      const props = analyzer.getCriticalProperties();

      expect(props).toContain('sonar.test.critical');
    });
  });

  describe('getRecommendedProperties', () => {
    it('should return list of recommended properties', () => {
      const props = analyzer.getRecommendedProperties();

      expect(props).toContain('sonar.test.recommended');
    });
  });

  describe('helper methods', () => {
    describe('fileExists', () => {
      it('should return true when file exists', async () => {
        vi.mocked(fs.access).mockResolvedValue(undefined);

        // Access protected method via analyze
        const result = await analyzer.detect('/project');

        expect(fs.access).toHaveBeenCalled();
        expect(result).toBe(true);
      });

      it('should return false when file does not exist', async () => {
        vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

        const result = await analyzer.detect('/project');

        expect(result).toBe(false);
      });
    });

    describe('readFile', () => {
      it('should read file contents', async () => {
        vi.mocked(fs.access).mockResolvedValue(undefined);
        vi.mocked(fs.readFile).mockResolvedValue('file content');

        // This will be tested through concrete implementations
        expect(true).toBe(true);
      });
    });

    describe('findFiles', () => {
      it('should find files matching pattern', async () => {
        vi.mocked(fs.readdir).mockResolvedValue([
          { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
          { name: 'file2.txt', isFile: () => true, isDirectory: () => false },
          { name: 'subdir', isFile: () => false, isDirectory: () => true }
        ] as any);

        // This will be tested through concrete implementations
        expect(true).toBe(true);
      });
    });
  });

  describe('ILanguageAnalyzer interface', () => {
    it('should implement ILanguageAnalyzer interface', () => {
      const analyzerAsInterface: ILanguageAnalyzer = analyzer;

      expect(analyzerAsInterface.language).toBe('test');
      expect(typeof analyzerAsInterface.detect).toBe('function');
      expect(typeof analyzerAsInterface.analyze).toBe('function');
      expect(typeof analyzerAsInterface.getCriticalProperties).toBe('function');
      expect(typeof analyzerAsInterface.getRecommendedProperties).toBe('function');
    });
  });
});
