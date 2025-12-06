import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigValidationService } from './ConfigValidationService.js';
import * as fs from 'fs/promises';

vi.mock('fs/promises');

describe('ConfigValidationService', () => {
  let service: ConfigValidationService;

  beforeEach(() => {
    service = new ConfigValidationService();
    vi.resetAllMocks();
  });

  describe('readExistingConfig', () => {
    it('should parse properties file correctly', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(`
# Comment line
sonar.projectKey=my-project
sonar.sources=src/main/java
sonar.java.binaries=target/classes
      `);

      const result = await service.readExistingConfig('/project');

      expect(result).not.toBeNull();
      expect(result!['sonar.projectKey']).toBe('my-project');
      expect(result!['sonar.sources']).toBe('src/main/java');
      expect(result!['sonar.java.binaries']).toBe('target/classes');
    });

    it('should return null when file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await service.readExistingConfig('/project');

      expect(result).toBeNull();
    });

    it('should skip empty lines and comments', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(`
# This is a comment

sonar.projectKey=test

# Another comment
sonar.sources=src
      `);

      const result = await service.readExistingConfig('/project');

      expect(Object.keys(result!)).toHaveLength(2);
    });
  });

  describe('validateExistingConfig', () => {
    const detectedProperties = [
      { key: 'sonar.sources', value: 'src', confidence: 'high' as const, source: 'detected' },
      { key: 'sonar.java.binaries', value: 'target/classes', confidence: 'high' as const, source: 'detected' },
      { key: 'sonar.tests', value: 'test', confidence: 'high' as const, source: 'detected' }
    ];

    const criticalProperties = ['sonar.sources', 'sonar.java.binaries'];
    const recommendedProperties = ['sonar.tests'];

    it('should return exists=false when no config file', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await service.validateExistingConfig(
        '/project',
        detectedProperties,
        criticalProperties,
        recommendedProperties
      );

      expect(result.exists).toBe(false);
      expect(result.completenessScore).toBe(0);
    });

    it('should identify missing critical properties', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(`
sonar.projectKey=test
sonar.sources=src
      `);

      const result = await service.validateExistingConfig(
        '/project',
        detectedProperties,
        criticalProperties,
        recommendedProperties
      );

      expect(result.missingCritical).toContain('sonar.java.binaries');
      expect(result.missingCritical).not.toContain('sonar.sources');
    });

    it('should identify missing recommended properties', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(`
sonar.projectKey=test
sonar.sources=src
sonar.java.binaries=target/classes
      `);

      const result = await service.validateExistingConfig(
        '/project',
        detectedProperties,
        criticalProperties,
        recommendedProperties
      );

      expect(result.missingRecommended).toContain('sonar.tests');
    });

    it('should calculate completeness score', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(`
sonar.projectKey=test
sonar.sources=src
sonar.java.binaries=target/classes
sonar.tests=test
      `);

      const result = await service.validateExistingConfig(
        '/project',
        detectedProperties,
        criticalProperties,
        recommendedProperties
      );

      expect(result.completenessScore).toBe(100);
    });

    it('should return partial score when some properties missing', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(`
sonar.projectKey=test
sonar.sources=src
      `);

      const result = await service.validateExistingConfig(
        '/project',
        detectedProperties,
        criticalProperties,
        recommendedProperties
      );

      // 1/2 critical (30%) + 0/1 recommended (0%) = 30%
      expect(result.completenessScore).toBe(30);
    });
  });

  describe('formatAnalysisOutput', () => {
    it('should format output for missing config file', () => {
      const analysis = {
        exists: false,
        path: '/project/sonar-project.properties',
        properties: {},
        missingCritical: ['sonar.sources', 'sonar.java.binaries'],
        missingRecommended: [],
        completenessScore: 0
      };

      const output = service.formatAnalysisOutput(analysis);

      expect(output).toContain('No sonar-project.properties file found');
      expect(output).toContain('sonar.sources');
    });

    it('should format output for existing config with missing properties', () => {
      const analysis = {
        exists: true,
        path: '/project/sonar-project.properties',
        properties: { 'sonar.sources': 'src' },
        missingCritical: ['sonar.java.binaries'],
        missingRecommended: ['sonar.tests'],
        completenessScore: 50
      };

      const output = service.formatAnalysisOutput(analysis);

      expect(output).toContain('Completeness: 50%');
      expect(output).toContain('Missing critical');
      expect(output).toContain('sonar.java.binaries');
      expect(output).toContain('Recommended');
      expect(output).toContain('sonar.tests');
    });
  });
});
