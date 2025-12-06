import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGenerateConfig } from './generate-config.handler';
import * as fs from 'fs/promises';

// Mock dependencies
vi.mock('fs/promises');

const mockProjectManager = {
  setWorkingDirectory: vi.fn(),
  getOrCreateConfig: vi.fn().mockResolvedValue({
    sonarProjectKey: 'existing-project-key'
  }),
  analyzeProject: vi.fn().mockResolvedValue({
    name: 'test-project'
  })
};

vi.mock('../../universal/project-manager', () => ({
  ProjectManager: vi.fn(function() { return mockProjectManager; })
}));

vi.mock('../../infrastructure/security/input-sanitization', () => ({
  sanitizePath: vi.fn((path: string) => path)
}));

// Mock PreScanValidator for auto-detection
const mockValidationResult = {
  languages: [{ language: 'java', buildTool: 'maven', version: '17', modules: [], warnings: [] }],
  detectedProperties: [
    { key: 'sonar.sources', value: 'src/main/java', confidence: 'high', source: 'detected' },
    { key: 'sonar.java.binaries', value: 'target/classes', confidence: 'high', source: 'detected' }
  ],
  missingCritical: [],
  missingRecommended: [],
  warnings: [],
  scanQuality: 'full',
  canProceed: true
};

vi.mock('../../core/scanning/validation/PreScanValidator', () => ({
  PreScanValidator: vi.fn(function() {
    return {
      validate: vi.fn().mockResolvedValue(mockValidationResult)
    };
  })
}));

describe('handleGenerateConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock file system
    vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockRejectedValue(new Error('Not found'));
    vi.mocked(fs.appendFile).mockResolvedValue(undefined);
  });

  describe('basic functionality', () => {
    it('should generate config with required fields', async () => {
      const result = await handleGenerateConfig({
        config: {
          sources: 'src'
        }
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('✅ sonar-project.properties generated successfully');
    });

    it('should include project key in generated config', async () => {
      const result = await handleGenerateConfig({
        config: {
          projectKey: 'my-project',
          sources: 'src'
        }
      });

      expect(result.content[0].text).toContain('sonar.projectKey=my-project');
    });

    it('should use existing project key from bobthefixer.env', async () => {
      const result = await handleGenerateConfig({
        config: {
          sources: 'src'
        }
      });

      expect(result.content[0].text).toContain('existing-project-key');
    });

    it('should include sources in generated config', async () => {
      const result = await handleGenerateConfig({
        config: {
          sources: 'src,lib'
        }
      });

      expect(result.content[0].text).toContain('sonar.sources=src,lib');
    });

    it('should include tests in generated config', async () => {
      const result = await handleGenerateConfig({
        config: {
          sources: 'src',
          tests: 'tests'
        }
      });

      expect(result.content[0].text).toContain('sonar.tests=tests');
    });
  });

  describe('Java configuration', () => {
    it('should include Java binaries', async () => {
      const result = await handleGenerateConfig({
        config: {
          sources: 'src/main/java',
          javaBinaries: 'target/classes'
        }
      });

      expect(result.content[0].text).toContain('sonar.java.binaries=target/classes');
    });

    it('should include Java libraries', async () => {
      const result = await handleGenerateConfig({
        config: {
          sources: 'src/main/java',
          javaBinaries: 'target/classes',
          javaLibraries: 'lib/*.jar'
        }
      });

      expect(result.content[0].text).toContain('sonar.java.libraries=lib/*.jar');
    });
  });

  describe('multi-module configuration', () => {
    it('should generate multi-module config', async () => {
      const result = await handleGenerateConfig({
        config: {
          sources: '.',
          modules: [
            {
              name: 'backend',
              baseDir: 'backend',
              sources: 'src/main/java'
            },
            {
              name: 'frontend',
              baseDir: 'frontend',
              sources: 'src'
            }
          ]
        }
      });

      expect(result.content[0].text).toContain('sonar.modules=backend,frontend');
      expect(result.content[0].text).toContain('backend.sonar.projectBaseDir=backend');
      expect(result.content[0].text).toContain('backend.sonar.sources=src/main/java');
      expect(result.content[0].text).toContain('frontend.sonar.projectBaseDir=frontend');
      expect(result.content[0].text).toContain('frontend.sonar.sources=src');
    });

    it('should include module tests', async () => {
      const result = await handleGenerateConfig({
        config: {
          sources: '.',
          modules: [
            {
              name: 'api',
              baseDir: 'api',
              sources: 'src/main/java',
              tests: 'src/test/java'
            }
          ]
        }
      });

      expect(result.content[0].text).toContain('api.sonar.tests=src/test/java');
    });

    it('should include module binaries', async () => {
      const result = await handleGenerateConfig({
        config: {
          sources: '.',
          modules: [
            {
              name: 'service',
              baseDir: 'service',
              sources: 'src/main/java',
              binaries: 'target/classes'
            }
          ]
        }
      });

      expect(result.content[0].text).toContain('service.sonar.java.binaries=target/classes');
    });
  });

  describe('optional configuration', () => {
    it('should include exclusions', async () => {
      const result = await handleGenerateConfig({
        config: {
          sources: 'src',
          exclusions: '**/node_modules/**,**/test/**'
        }
      });

      expect(result.content[0].text).toContain('sonar.exclusions=**/node_modules/**,**/test/**');
    });

    it('should include encoding', async () => {
      const result = await handleGenerateConfig({
        config: {
          sources: 'src',
          encoding: 'UTF-8'
        }
      });

      expect(result.content[0].text).toContain('sonar.sourceEncoding=UTF-8');
    });

    it('should include coverage report paths', async () => {
      const result = await handleGenerateConfig({
        config: {
          sources: 'src',
          coverageReportPaths: 'coverage/lcov.info'
        }
      });

      expect(result.content[0].text).toContain('sonar.coverage.jacoco.xmlReportPaths=coverage/lcov.info');
    });

    it('should include additional properties', async () => {
      const result = await handleGenerateConfig({
        config: {
          sources: 'src',
          additionalProperties: {
            'sonar.custom.prop': 'value'
          }
        }
      });

      expect(result.content[0].text).toContain('sonar.custom.prop=value');
    });
  });

  describe('output formatting', () => {
    it('should include location in output', async () => {
      const result = await handleGenerateConfig({
        config: {
          sources: 'src'
        }
      });

      expect(result.content[0].text).toContain('📁 Location:');
      expect(result.content[0].text).toContain('sonar-project.properties');
    });

    it('should include next steps', async () => {
      const result = await handleGenerateConfig({
        config: {
          sources: 'src'
        }
      });

      expect(result.content[0].text).toContain('## Next Steps');
      expect(result.content[0].text).toContain('sonar_scan_project');
    });

    it('should show generated configuration', async () => {
      const result = await handleGenerateConfig({
        config: {
          sources: 'src'
        }
      });

      expect(result.content[0].text).toContain('## Generated Configuration');
      expect(result.content[0].text).toContain('```properties');
    });
  });

  describe('project key handling', () => {
    it('should warn when provided key differs from existing', async () => {
      const result = await handleGenerateConfig({
        config: {
          projectKey: 'different-project-key',
          sources: 'src'
        }
      });

      expect(result.content[0].text).toContain('⚠️');
      expect(result.content[0].text).toContain('differs from configured key');
    });

    it('should use provided project key', async () => {
      const result = await handleGenerateConfig({
        config: {
          projectKey: 'custom-key',
          sources: 'src'
        }
      });

      expect(result.content[0].text).toContain('sonar.projectKey=custom-key');
    });
  });

  describe('validation', () => {
    it('should use auto-detected sources when sources is empty', async () => {
      // With autoDetect=true (default), empty sources will use auto-detected value
      const result = await handleGenerateConfig({
        config: {
          sources: ''
        }
      });

      // Should use auto-detected sources
      expect(result.content[0].text).toContain('sonar.sources=src/main/java');
    });

    it('should work without config when autoDetect is true', async () => {
      // With autoDetect=true (default), config is optional
      const result = await handleGenerateConfig({});

      expect(result.content[0].text).toContain('✅ sonar-project.properties generated successfully');
      expect(result.content[0].text).toContain('Auto-Detection Summary');
    });

    it('should use default sources when autoDetect is false and no sources provided', async () => {
      const result = await handleGenerateConfig({
        autoDetect: false,
        config: {}
      });

      // Should fall back to default 'src'
      expect(result.content[0].text).toContain('sonar.sources=src');
    });
  });

  describe('auto-detection', () => {
    it('should show auto-detection summary', async () => {
      const result = await handleGenerateConfig({});

      expect(result.content[0].text).toContain('## Auto-Detection Summary');
      expect(result.content[0].text).toContain('Languages: java (maven)');
      expect(result.content[0].text).toContain('Properties detected:');
    });

    it('should allow user overrides of detected values', async () => {
      const result = await handleGenerateConfig({
        config: {
          sources: 'custom/src'  // Override detected value
        }
      });

      expect(result.content[0].text).toContain('sonar.sources=custom/src');
      expect(result.content[0].text).toContain('User overrides applied:');
    });

    it('should skip auto-detection when autoDetect is false', async () => {
      const result = await handleGenerateConfig({
        autoDetect: false,
        config: {
          sources: 'manual/src'
        }
      });

      expect(result.content[0].text).toContain('sonar.sources=manual/src');
      expect(result.content[0].text).not.toContain('## Auto-Detection Summary');
    });
  });

  describe('backup handling', () => {
    it('should create backup when file exists', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

      const result = await handleGenerateConfig({
        config: {
          sources: 'src'
        }
      });

      expect(result.content[0].text).toContain('📦 Backup:');
    });
  });
});
