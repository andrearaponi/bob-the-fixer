import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { JavaAnalyzer } from './JavaAnalyzer.js';
import * as fs from 'fs/promises';

vi.mock('fs/promises');

describe('JavaAnalyzer', () => {
  let analyzer: JavaAnalyzer;

  beforeEach(() => {
    analyzer = new JavaAnalyzer();
    vi.resetAllMocks();

    // Mock execCommand to return null (command failed/not found)
    // This prevents actual Maven/Gradle execution
    vi.spyOn(analyzer as any, 'execCommand').mockResolvedValue(null);
  });

  describe('language property', () => {
    it('should have language set to "java"', () => {
      expect(analyzer.language).toBe('java');
    });
  });

  describe('getCriticalProperties', () => {
    it('should include sonar.java.binaries', () => {
      const props = analyzer.getCriticalProperties();
      expect(props).toContain('sonar.java.binaries');
    });

    it('should include sonar.sources', () => {
      const props = analyzer.getCriticalProperties();
      expect(props).toContain('sonar.sources');
    });
  });

  describe('getRecommendedProperties', () => {
    it('should include sonar.java.libraries', () => {
      const props = analyzer.getRecommendedProperties();
      expect(props).toContain('sonar.java.libraries');
    });

    it('should include sonar.java.source', () => {
      const props = analyzer.getRecommendedProperties();
      expect(props).toContain('sonar.java.source');
    });

    it('should include sonar.tests', () => {
      const props = analyzer.getRecommendedProperties();
      expect(props).toContain('sonar.tests');
    });

    it('should include sonar.coverage.jacoco.xmlReportPaths', () => {
      const props = analyzer.getRecommendedProperties();
      expect(props).toContain('sonar.coverage.jacoco.xmlReportPaths');
    });
  });

  describe('detect', () => {
    it('should return true when pom.xml exists', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('pom.xml')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const result = await analyzer.detect('/project');
      expect(result).toBe(true);
    });

    it('should return true when build.gradle exists', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('build.gradle')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const result = await analyzer.detect('/project');
      expect(result).toBe(true);
    });

    it('should return true when build.gradle.kts exists', async () => {
      vi.mocked(fs.access).mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('build.gradle.kts')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const result = await analyzer.detect('/project');
      expect(result).toBe(true);
    });

    it('should return false when no Java build files exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await analyzer.detect('/project');
      expect(result).toBe(false);
    });
  });

  describe('analyze', () => {
    describe('Maven project', () => {
      beforeEach(() => {
        // Setup Maven project detection
        vi.mocked(fs.access).mockImplementation(async (filePath) => {
          const path = String(filePath);
          if (path.endsWith('pom.xml') ||
              path.endsWith('src/main/java') ||
              path.endsWith('target/classes')) {
            return undefined;
          }
          throw new Error('ENOENT');
        });
      });

      it('should detect Maven as build tool', async () => {
        vi.mocked(fs.readFile).mockResolvedValue(`
          <project>
            <modelVersion>4.0.0</modelVersion>
            <groupId>com.example</groupId>
            <artifactId>test</artifactId>
          </project>
        `);

        const result = await analyzer.analyze('/project');
        expect(result.buildTool).toBe('maven');
      });

      it('should detect sonar.sources for Maven standard layout', async () => {
        vi.mocked(fs.readFile).mockResolvedValue('<project></project>');

        const result = await analyzer.analyze('/project');
        const sourcesProp = result.properties.find(p => p.key === 'sonar.sources');

        expect(sourcesProp).toBeDefined();
        expect(sourcesProp?.value).toBe('src/main/java');
      });

      it('should detect sonar.java.binaries for Maven', async () => {
        vi.mocked(fs.readFile).mockResolvedValue('<project></project>');

        const result = await analyzer.analyze('/project');
        const binariesProp = result.properties.find(p => p.key === 'sonar.java.binaries');

        expect(binariesProp).toBeDefined();
        expect(binariesProp?.value).toBe('target/classes');
      });

      it('should detect Java version from pom.xml', async () => {
        vi.mocked(fs.readFile).mockResolvedValue(`
          <project>
            <properties>
              <maven.compiler.source>17</maven.compiler.source>
              <maven.compiler.target>17</maven.compiler.target>
            </properties>
          </project>
        `);

        const result = await analyzer.analyze('/project');
        expect(result.version).toBe('17');
      });

      it('should detect Java version from java.version property', async () => {
        vi.mocked(fs.readFile).mockResolvedValue(`
          <project>
            <properties>
              <java.version>11</java.version>
            </properties>
          </project>
        `);

        const result = await analyzer.analyze('/project');
        expect(result.version).toBe('11');
      });

      it('should warn when target/classes does not exist', async () => {
        vi.mocked(fs.access).mockImplementation(async (filePath) => {
          const path = String(filePath);
          if (path.endsWith('pom.xml') || path.endsWith('src/main/java')) {
            return undefined;
          }
          throw new Error('ENOENT');
        });
        vi.mocked(fs.readFile).mockResolvedValue('<project></project>');

        const result = await analyzer.analyze('/project');
        const warning = result.warnings.find(w => w.message.includes('compiled classes'));

        expect(warning).toBeDefined();
        expect(warning?.severity).toBe('warning');
      });

      it('should detect Maven modules from pom.xml', async () => {
        vi.mocked(fs.readFile).mockResolvedValue(`
          <project>
            <modules>
              <module>core</module>
              <module>api</module>
              <module>web</module>
            </modules>
          </project>
        `);

        const result = await analyzer.analyze('/project');
        expect(result.modules.length).toBe(3);
        expect(result.modules.map(m => m.name)).toContain('core');
        expect(result.modules.map(m => m.name)).toContain('api');
        expect(result.modules.map(m => m.name)).toContain('web');
      });
    });

    describe('Gradle project', () => {
      beforeEach(() => {
        vi.mocked(fs.access).mockImplementation(async (filePath) => {
          const path = String(filePath);
          if (path.endsWith('build.gradle') ||
              path.endsWith('src/main/java') ||
              path.endsWith('build/classes/java/main')) {
            return undefined;
          }
          throw new Error('ENOENT');
        });
      });

      it('should detect Gradle as build tool', async () => {
        vi.mocked(fs.readFile).mockResolvedValue(`
          plugins {
            id 'java'
          }
        `);

        const result = await analyzer.analyze('/project');
        expect(result.buildTool).toBe('gradle');
      });

      it('should detect sonar.java.binaries for Gradle', async () => {
        vi.mocked(fs.readFile).mockResolvedValue('plugins { id "java" }');

        const result = await analyzer.analyze('/project');
        const binariesProp = result.properties.find(p => p.key === 'sonar.java.binaries');

        expect(binariesProp).toBeDefined();
        expect(binariesProp?.value).toBe('build/classes/java/main');
      });

      it('should detect Java version from sourceCompatibility', async () => {
        vi.mocked(fs.readFile).mockResolvedValue(`
          plugins {
            id 'java'
          }
          sourceCompatibility = '21'
        `);

        const result = await analyzer.analyze('/project');
        expect(result.version).toBe('21');
      });

      it('should detect Java version from JavaVersion enum', async () => {
        vi.mocked(fs.readFile).mockResolvedValue(`
          plugins {
            id 'java'
          }
          sourceCompatibility = JavaVersion.VERSION_17
        `);

        const result = await analyzer.analyze('/project');
        expect(result.version).toBe('17');
      });

      it('should detect Gradle modules from settings.gradle', async () => {
        vi.mocked(fs.access).mockImplementation(async (filePath) => {
          const path = String(filePath);
          if (path.endsWith('build.gradle') ||
              path.endsWith('settings.gradle') ||
              path.endsWith('src/main/java') ||
              path.endsWith('build/classes/java/main')) {
            return undefined;
          }
          throw new Error('ENOENT');
        });
        vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
          if (String(filePath).endsWith('settings.gradle')) {
            return `
              include 'core'
              include 'api'
              include ':web'
            `;
          }
          return 'plugins { id "java" }';
        });

        const result = await analyzer.analyze('/project');
        expect(result.modules.length).toBe(3);
        expect(result.modules.map(m => m.name)).toContain('core');
        expect(result.modules.map(m => m.name)).toContain('api');
        expect(result.modules.map(m => m.name)).toContain('web');
      });
    });

    describe('Coverage detection', () => {
      it('should detect JaCoCo coverage report for Maven', async () => {
        vi.mocked(fs.access).mockImplementation(async (filePath) => {
          const path = String(filePath);
          if (path.endsWith('pom.xml') ||
              path.endsWith('src/main/java') ||
              path.endsWith('target/classes') ||
              path.endsWith('target/site/jacoco/jacoco.xml')) {
            return undefined;
          }
          throw new Error('ENOENT');
        });
        vi.mocked(fs.readFile).mockResolvedValue('<project></project>');

        const result = await analyzer.analyze('/project');
        const coverageProp = result.properties.find(p =>
          p.key === 'sonar.coverage.jacoco.xmlReportPaths'
        );

        expect(coverageProp).toBeDefined();
        expect(coverageProp?.value).toBe('target/site/jacoco/jacoco.xml');
      });

      it('should detect JaCoCo coverage report for Gradle', async () => {
        vi.mocked(fs.access).mockImplementation(async (filePath) => {
          const path = String(filePath);
          if (path.endsWith('build.gradle') ||
              path.endsWith('src/main/java') ||
              path.endsWith('build/classes/java/main') ||
              path.endsWith('build/reports/jacoco/test/jacocoTestReport.xml')) {
            return undefined;
          }
          throw new Error('ENOENT');
        });
        vi.mocked(fs.readFile).mockResolvedValue('plugins { id "java" }');

        const result = await analyzer.analyze('/project');
        const coverageProp = result.properties.find(p =>
          p.key === 'sonar.coverage.jacoco.xmlReportPaths'
        );

        expect(coverageProp).toBeDefined();
        expect(coverageProp?.value).toBe('build/reports/jacoco/test/jacocoTestReport.xml');
      });
    });

    describe('error handling', () => {
      it('should handle read errors gracefully', async () => {
        vi.mocked(fs.access).mockResolvedValue(undefined);
        vi.mocked(fs.readFile).mockRejectedValue(new Error('Read error'));

        const result = await analyzer.analyze('/project');

        // Should still return a valid result
        expect(result.detected).toBe(true);
        expect(result.language).toBe('java');
      });

      it('should return detected=false when no build file found', async () => {
        vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

        const result = await analyzer.analyze('/project');

        expect(result.detected).toBe(false);
        expect(result.properties).toHaveLength(0);
      });
    });
  });
});
