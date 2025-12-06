import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScannerType, selectScanner, buildMavenCommand, buildGradleCommand } from './scanner-selection.js';
import { ProjectContext } from '../universal/project-manager.js';

describe('Scanner Selection', () => {
  describe('selectScanner', () => {
    it('should select MAVEN for Java Maven projects', () => {
      const context: ProjectContext = {
        name: 'test-project',
        path: '/test',
        language: ['java'],
        buildTool: 'maven'
      };

      expect(selectScanner(context)).toBe(ScannerType.MAVEN);
    });

    it('should select MAVEN for Kotlin Maven projects', () => {
      const context: ProjectContext = {
        name: 'test-project',
        path: '/test',
        language: ['kotlin'],
        buildTool: 'maven'
      };

      expect(selectScanner(context)).toBe(ScannerType.MAVEN);
    });

    it('should select GRADLE for Java Gradle projects', () => {
      const context: ProjectContext = {
        name: 'test-project',
        path: '/test',
        language: ['java'],
        buildTool: 'gradle'
      };

      expect(selectScanner(context)).toBe(ScannerType.GRADLE);
    });

    it('should select GRADLE for Kotlin Gradle projects', () => {
      const context: ProjectContext = {
        name: 'test-project',
        path: '/test',
        language: ['kotlin'],
        buildTool: 'gradle'
      };

      expect(selectScanner(context)).toBe(ScannerType.GRADLE);
    });

    it('should select CLI for JavaScript projects', () => {
      const context: ProjectContext = {
        name: 'test-project',
        path: '/test',
        language: ['javascript'],
        buildTool: 'npm'
      };

      expect(selectScanner(context)).toBe(ScannerType.CLI);
    });

    it('should select CLI for TypeScript projects', () => {
      const context: ProjectContext = {
        name: 'test-project',
        path: '/test',
        language: ['typescript'],
        buildTool: 'npm'
      };

      expect(selectScanner(context)).toBe(ScannerType.CLI);
    });

    it('should select CLI for Python projects', () => {
      const context: ProjectContext = {
        name: 'test-project',
        path: '/test',
        language: ['python'],
        buildTool: 'pip'
      };

      expect(selectScanner(context)).toBe(ScannerType.CLI);
    });

    it('should select CLI for Java projects without Maven/Gradle', () => {
      const context: ProjectContext = {
        name: 'test-project',
        path: '/test',
        language: ['java'],
        buildTool: undefined
      };

      expect(selectScanner(context)).toBe(ScannerType.CLI);
    });

    it('should select CLI when no project context', () => {
      expect(selectScanner(undefined)).toBe(ScannerType.CLI);
    });

    it('should select MAVEN for mixed Java/Kotlin Maven projects', () => {
      const context: ProjectContext = {
        name: 'test-project',
        path: '/test',
        language: ['java', 'kotlin'],
        buildTool: 'maven'
      };

      expect(selectScanner(context)).toBe(ScannerType.MAVEN);
    });
  });

  describe('buildMavenCommand', () => {
    it('should build basic Maven sonar command', () => {
      const result = buildMavenCommand({
        hostUrl: 'http://localhost:9000',
        token: 'test-token',
        projectKey: 'my-project'
      });

      expect(result.command).toBe('mvn');
      expect(result.args).toContain('sonar:sonar');
      expect(result.args).toContain('-Dsonar.host.url=http://localhost:9000');
      expect(result.args).toContain('-Dsonar.login=test-token');
      expect(result.args).toContain('-Dsonar.projectKey=my-project');
    });

    it('should include -q flag for quiet mode', () => {
      const result = buildMavenCommand({
        hostUrl: 'http://localhost:9000',
        token: 'test-token',
        projectKey: 'my-project'
      });

      expect(result.args).toContain('-q');
    });

    it('should include project version', () => {
      const result = buildMavenCommand({
        hostUrl: 'http://localhost:9000',
        token: 'test-token',
        projectKey: 'my-project'
      });

      const versionArg = result.args.find(arg => arg.startsWith('-Dsonar.projectVersion='));
      expect(versionArg).toBeDefined();
    });

    it('should include extra properties when provided', () => {
      const result = buildMavenCommand({
        hostUrl: 'http://localhost:9000',
        token: 'test-token',
        projectKey: 'my-project',
        extraProperties: {
          'sonar.exclusions': '**/test/**',
          'sonar.coverage.jacoco.xmlReportPaths': 'target/jacoco.xml'
        }
      });

      expect(result.args).toContain('-Dsonar.exclusions=**/test/**');
      expect(result.args).toContain('-Dsonar.coverage.jacoco.xmlReportPaths=target/jacoco.xml');
    });
  });

  describe('buildGradleCommand', () => {
    it('should build basic Gradle sonar command', () => {
      const result = buildGradleCommand({
        hostUrl: 'http://localhost:9000',
        token: 'test-token',
        projectKey: 'my-project'
      });

      expect(result.command).toBe('./gradlew');
      expect(result.args).toContain('sonar');
      expect(result.args).toContain('-Dsonar.host.url=http://localhost:9000');
      expect(result.args).toContain('-Dsonar.login=test-token');
      expect(result.args).toContain('-Dsonar.projectKey=my-project');
    });

    it('should include -q flag for quiet mode', () => {
      const result = buildGradleCommand({
        hostUrl: 'http://localhost:9000',
        token: 'test-token',
        projectKey: 'my-project'
      });

      expect(result.args).toContain('-q');
    });

    it('should include project version', () => {
      const result = buildGradleCommand({
        hostUrl: 'http://localhost:9000',
        token: 'test-token',
        projectKey: 'my-project'
      });

      const versionArg = result.args.find(arg => arg.startsWith('-Dsonar.projectVersion='));
      expect(versionArg).toBeDefined();
    });

    it('should include extra properties when provided', () => {
      const result = buildGradleCommand({
        hostUrl: 'http://localhost:9000',
        token: 'test-token',
        projectKey: 'my-project',
        extraProperties: {
          'sonar.exclusions': '**/test/**'
        }
      });

      expect(result.args).toContain('-Dsonar.exclusions=**/test/**');
    });
  });
});
