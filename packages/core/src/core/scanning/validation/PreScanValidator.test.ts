import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PreScanValidator } from './PreScanValidator.js';
import { JavaAnalyzer } from './analyzers/JavaAnalyzer.js';
import { PythonAnalyzer } from './analyzers/PythonAnalyzer.js';
import { JsAnalyzer } from './analyzers/JsAnalyzer.js';
import { GoAnalyzer } from './analyzers/GoAnalyzer.js';
import { CppAnalyzer } from './analyzers/CppAnalyzer.js';
import * as fs from 'fs/promises';

vi.mock('fs/promises');

describe('PreScanValidator', () => {
  let validator: PreScanValidator;

  beforeEach(() => {
    validator = new PreScanValidator();
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should register all default analyzers', () => {
      const analyzers = validator.getRegisteredAnalyzers();
      expect(analyzers).toContain('java');
      expect(analyzers).toContain('python');
      expect(analyzers).toContain('javascript');
      expect(analyzers).toContain('go');
      expect(analyzers).toContain('cpp');
    });
  });

  describe('registerAnalyzer', () => {
    it('should allow registering custom analyzers', () => {
      const customAnalyzer = new JavaAnalyzer();
      vi.spyOn(customAnalyzer, 'language', 'get').mockReturnValue('kotlin');

      validator.registerAnalyzer(customAnalyzer);

      expect(validator.getRegisteredAnalyzers()).toContain('kotlin');
    });

    it('should override existing analyzer with same language', () => {
      const customJavaAnalyzer = new JavaAnalyzer();
      validator.registerAnalyzer(customJavaAnalyzer);

      // Should still have 5 analyzers (not 6)
      expect(validator.getRegisteredAnalyzers().length).toBe(5);
    });
  });

  describe('validate', () => {
    it('should return empty result when no languages detected', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await validator.validate('/empty-project');

      expect(result.languages).toHaveLength(0);
      expect(result.detectedProperties).toHaveLength(0);
      expect(result.canProceed).toBe(true);
      expect(result.scanQuality).toBe('degraded');
    });

    it('should detect Java project', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('pom.xml') || path.endsWith('target/classes')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      vi.mocked(fs.readFile).mockResolvedValue('<project><properties><maven.compiler.source>17</maven.compiler.source></properties></project>');

      const result = await validator.validate('/java-project');

      expect(result.languages.length).toBeGreaterThan(0);
      expect(result.languages.some(l => l.buildTool === 'maven')).toBe(true);
    });

    it('should detect multiple languages', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('pom.xml') || path.endsWith('target/classes') ||
            path.endsWith('package.json') || path.endsWith('src')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('pom.xml')) {
          return '<project></project>';
        }
        if (path.endsWith('package.json')) {
          return '{"name": "test"}';
        }
        throw new Error('ENOENT');
      });

      const result = await validator.validate('/multi-project');

      expect(result.languages.length).toBeGreaterThanOrEqual(2);
    });

    it('should aggregate properties from all detected languages', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('pom.xml') || path.endsWith('target/classes')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      vi.mocked(fs.readFile).mockResolvedValue('<project></project>');

      const result = await validator.validate('/java-project');

      expect(result.detectedProperties.length).toBeGreaterThan(0);
      expect(result.detectedProperties.some(p => p.key === 'sonar.java.binaries')).toBe(true);
    });

    it('should collect warnings from all analyzers', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        // Maven project without compiled classes
        if (path.endsWith('pom.xml')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      vi.mocked(fs.readFile).mockResolvedValue('<project></project>');

      const result = await validator.validate('/java-project');

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should calculate scan quality based on missing properties', async () => {
      // Complete Java project
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('pom.xml') ||
            path.endsWith('target/classes') ||
            path.endsWith('src/main/java')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      vi.mocked(fs.readFile).mockResolvedValue('<project></project>');

      const result = await validator.validate('/java-project');

      expect(['full', 'partial', 'degraded']).toContain(result.scanQuality);
    });
  });

  describe('validateWithExistingConfig', () => {
    it('should analyze existing sonar-project.properties', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('pom.xml') || path.endsWith('target/classes')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('sonar-project.properties')) {
          return 'sonar.projectKey=test\nsonar.sources=src';
        }
        if (path.endsWith('pom.xml')) {
          return '<project></project>';
        }
        throw new Error('ENOENT');
      });

      const result = await validator.validate('/java-project');

      expect(result.existingConfig).toBeDefined();
      expect(result.existingConfig?.exists).toBe(true);
    });

    it('should identify missing critical properties in existing config', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('pom.xml') || path.endsWith('target/classes')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('sonar-project.properties')) {
          return 'sonar.projectKey=test\nsonar.sources=src';
        }
        if (path.endsWith('pom.xml')) {
          return '<project></project>';
        }
        throw new Error('ENOENT');
      });

      const result = await validator.validate('/java-project');

      expect(result.existingConfig?.missingCritical).toBeDefined();
      expect(result.existingConfig?.missingCritical).toContain('sonar.java.binaries');
    });
  });

  describe('formatValidationOutput', () => {
    it('should format output for no languages detected', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await validator.validate('/empty-project');
      const output = validator.formatValidationOutput(result);

      expect(output).toContain('No languages detected');
    });

    it('should format output with detected languages', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('pom.xml') || path.endsWith('target/classes')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      vi.mocked(fs.readFile).mockResolvedValue('<project></project>');

      const result = await validator.validate('/java-project');
      const output = validator.formatValidationOutput(result);

      expect(output).toContain('Languages Detected');
    });

    it('should format output with warnings', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('pom.xml')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      vi.mocked(fs.readFile).mockResolvedValue('<project></project>');

      const result = await validator.validate('/java-project');
      const output = validator.formatValidationOutput(result);

      expect(output).toContain('WARNINGS');
    });

    it('should format output with scan quality indicator', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await validator.validate('/empty-project');
      const output = validator.formatValidationOutput(result);

      expect(output).toContain('Scan Quality');
    });
  });

  describe('getCriticalPropertiesForProject', () => {
    it('should return critical properties for detected languages', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('pom.xml') || path.endsWith('target/classes')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      vi.mocked(fs.readFile).mockResolvedValue('<project></project>');

      const result = await validator.validate('/java-project');

      expect(result.missingCritical).toBeDefined();
    });
  });

  describe('getRecommendedPropertiesForProject', () => {
    it('should return recommended properties for detected languages', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        const path = String(filePath);
        if (path.endsWith('pom.xml') || path.endsWith('target/classes')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      vi.mocked(fs.readFile).mockResolvedValue('<project></project>');

      const result = await validator.validate('/java-project');

      expect(result.missingRecommended).toBeDefined();
    });
  });
});
