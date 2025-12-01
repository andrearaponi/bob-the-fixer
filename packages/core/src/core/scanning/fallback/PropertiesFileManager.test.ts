import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PropertiesFileManager } from './PropertiesFileManager';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs/promises
vi.mock('fs/promises');

describe('PropertiesFileManager', () => {
  let manager: PropertiesFileManager;
  const mockProjectPath = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new PropertiesFileManager();
  });

  describe('writeConfig', () => {
    beforeEach(() => {
      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Not found'));
      vi.mocked(fs.appendFile).mockResolvedValue(undefined);
    });

    it('should write simple config', async () => {
      const config = {
        projectKey: 'my-project',
        sources: 'src'
      };

      const result = await manager.writeConfig(mockProjectPath, config);

      expect(result.success).toBe(true);
      expect(result.configPath).toBe(path.join(mockProjectPath, 'sonar-project.properties'));
      expect(fs.writeFile).toHaveBeenCalled();

      const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      expect(writtenContent).toContain('sonar.projectKey=my-project');
      expect(writtenContent).toContain('sonar.sources=src');
    });

    it('should include project name and version', async () => {
      const config = {
        projectKey: 'my-project',
        projectName: 'My Project',
        projectVersion: '1.0.0',
        sources: 'src'
      };

      const result = await manager.writeConfig(mockProjectPath, config);

      expect(result.success).toBe(true);
      expect(result.generatedContent).toContain('sonar.projectName=My Project');
      expect(result.generatedContent).toContain('sonar.projectVersion=1.0.0');
    });

    it('should include tests directory', async () => {
      const config = {
        projectKey: 'my-project',
        sources: 'src',
        tests: 'tests'
      };

      const result = await manager.writeConfig(mockProjectPath, config);

      expect(result.generatedContent).toContain('sonar.tests=tests');
    });

    it('should include Java binaries', async () => {
      const config = {
        projectKey: 'my-project',
        sources: 'src/main/java',
        javaBinaries: 'target/classes',
        javaLibraries: 'lib/*.jar'
      };

      const result = await manager.writeConfig(mockProjectPath, config);

      expect(result.generatedContent).toContain('sonar.java.binaries=target/classes');
      expect(result.generatedContent).toContain('sonar.java.libraries=lib/*.jar');
    });

    it('should include exclusions', async () => {
      const config = {
        projectKey: 'my-project',
        sources: 'src',
        exclusions: '**/node_modules/**,**/test/**'
      };

      const result = await manager.writeConfig(mockProjectPath, config);

      expect(result.generatedContent).toContain('sonar.exclusions=**/node_modules/**,**/test/**');
    });

    it('should include encoding', async () => {
      const config = {
        projectKey: 'my-project',
        sources: 'src',
        encoding: 'UTF-8'
      };

      const result = await manager.writeConfig(mockProjectPath, config);

      expect(result.generatedContent).toContain('sonar.sourceEncoding=UTF-8');
    });

    it('should include coverage report paths', async () => {
      const config = {
        projectKey: 'my-project',
        sources: 'src',
        coverageReportPaths: 'target/site/jacoco/jacoco.xml'
      };

      const result = await manager.writeConfig(mockProjectPath, config);

      expect(result.generatedContent).toContain('sonar.coverage.jacoco.xmlReportPaths=target/site/jacoco/jacoco.xml');
    });

    it('should include additional properties', async () => {
      const config = {
        projectKey: 'my-project',
        sources: 'src',
        additionalProperties: {
          'sonar.custom.property': 'value',
          'sonar.another.property': 'another-value'
        }
      };

      const result = await manager.writeConfig(mockProjectPath, config);

      expect(result.generatedContent).toContain('sonar.custom.property=value');
      expect(result.generatedContent).toContain('sonar.another.property=another-value');
    });

    it('should handle multi-module configuration', async () => {
      const config = {
        projectKey: 'my-project',
        sources: '.',
        modules: [
          {
            name: 'backend',
            baseDir: 'backend',
            sources: 'src/main/java',
            tests: 'src/test/java',
            binaries: 'target/classes'
          },
          {
            name: 'frontend',
            baseDir: 'frontend',
            sources: 'src'
          }
        ]
      };

      const result = await manager.writeConfig(mockProjectPath, config);

      expect(result.generatedContent).toContain('sonar.modules=backend,frontend');
      expect(result.generatedContent).toContain('backend.sonar.projectBaseDir=backend');
      expect(result.generatedContent).toContain('backend.sonar.sources=src/main/java');
      expect(result.generatedContent).toContain('backend.sonar.tests=src/test/java');
      expect(result.generatedContent).toContain('backend.sonar.java.binaries=target/classes');
      expect(result.generatedContent).toContain('frontend.sonar.projectBaseDir=frontend');
      expect(result.generatedContent).toContain('frontend.sonar.sources=src');
    });

    it('should include module exclusions and language', async () => {
      const config = {
        projectKey: 'my-project',
        sources: '.',
        modules: [
          {
            name: 'api',
            baseDir: 'api',
            sources: 'src',
            exclusions: '**/generated/**',
            language: 'java'
          }
        ]
      };

      const result = await manager.writeConfig(mockProjectPath, config);

      expect(result.generatedContent).toContain('api.sonar.exclusions=**/generated/**');
      expect(result.generatedContent).toContain('api.sonar.language=java');
    });

    it('should create backup of existing file', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

      const config = {
        projectKey: 'my-project',
        sources: 'src'
      };

      const result = await manager.writeConfig(mockProjectPath, config);

      expect(result.backupPath).toBeDefined();
      expect(result.backupPath).toContain('.backup.');
      expect(fs.copyFile).toHaveBeenCalled();
    });

    it('should add to .gitignore if not present', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('node_modules/\n');

      const config = {
        projectKey: 'my-project',
        sources: 'src'
      };

      await manager.writeConfig(mockProjectPath, config);

      expect(fs.appendFile).toHaveBeenCalledWith(
        path.join(mockProjectPath, '.gitignore'),
        expect.stringContaining('sonar-project.properties')
      );
    });

    it('should not add to .gitignore if already present', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('node_modules/\nsonar-project.properties\n');

      const config = {
        projectKey: 'my-project',
        sources: 'src'
      };

      await manager.writeConfig(mockProjectPath, config);

      expect(fs.appendFile).not.toHaveBeenCalled();
    });

    it('should generate header with timestamp', async () => {
      const config = {
        projectKey: 'my-project',
        sources: 'src'
      };

      const result = await manager.writeConfig(mockProjectPath, config);

      expect(result.generatedContent).toContain('# SonarQube Project Configuration');
      expect(result.generatedContent).toContain('# Generated by Bob the Fixer');
    });
  });

  describe('exists', () => {
    it('should return true when file exists', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await manager.exists(mockProjectPath);

      expect(result).toBe(true);
    });

    it('should return false when file does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));

      const result = await manager.exists(mockProjectPath);

      expect(result).toBe(false);
    });
  });

  describe('read', () => {
    it('should parse properties file', async () => {
      const content = `
# Comment
sonar.projectKey=my-project
sonar.sources=src
sonar.tests=tests
`;
      vi.mocked(fs.readFile).mockResolvedValue(content);

      const result = await manager.read(mockProjectPath);

      expect(result).toEqual({
        'sonar.projectKey': 'my-project',
        'sonar.sources': 'src',
        'sonar.tests': 'tests'
      });
    });

    it('should skip comments and empty lines', async () => {
      const content = `
# This is a comment
sonar.projectKey=my-project

# Another comment
sonar.sources=src
`;
      vi.mocked(fs.readFile).mockResolvedValue(content);

      const result = await manager.read(mockProjectPath);

      expect(Object.keys(result!)).toHaveLength(2);
    });

    it('should handle values with equals signs', async () => {
      const content = `sonar.custom.prop=value=with=equals`;
      vi.mocked(fs.readFile).mockResolvedValue(content);

      const result = await manager.read(mockProjectPath);

      expect(result!['sonar.custom.prop']).toBe('value=with=equals');
    });

    it('should return null when file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Not found'));

      const result = await manager.read(mockProjectPath);

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete the file', async () => {
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await manager.delete(mockProjectPath);

      expect(fs.unlink).toHaveBeenCalledWith(
        path.join(mockProjectPath, 'sonar-project.properties')
      );
    });

    it('should not throw when file does not exist', async () => {
      vi.mocked(fs.unlink).mockRejectedValue(new Error('Not found'));

      await expect(manager.delete(mockProjectPath)).resolves.not.toThrow();
    });
  });

  describe('content validation', () => {
    beforeEach(() => {
      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Not found'));
      vi.mocked(fs.appendFile).mockResolvedValue(undefined);
    });

    it('should not produce warnings for valid content', async () => {
      const config = {
        projectKey: 'my-project',
        sources: 'src'
      };

      const result = await manager.writeConfig(mockProjectPath, config);

      expect(result.warnings).toBeUndefined();
    });

    it('should use valid property key format', async () => {
      const config = {
        projectKey: 'my-project',
        sources: 'src',
        additionalProperties: {
          'sonar.valid-property_123': 'value'
        }
      };

      const result = await manager.writeConfig(mockProjectPath, config);

      // Should have no warnings about invalid property keys
      expect(result.warnings).toBeUndefined();
    });
  });
});
