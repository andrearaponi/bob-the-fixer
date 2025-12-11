import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { SonarQubeClient } from '../../src/sonar/client.js';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('Java Version Detection', () => {
  const fixtureDir = path.join(__dirname, 'fixtures', 'java-maven');
  let client: SonarQubeClient;

  beforeAll(() => {
    client = new SonarQubeClient(
      'http://localhost:9000',
      'test-token',
      'test-project'
    );
  });

  describe('detectJavaVersionFromPom', () => {
    it('should detect Java version from pom.xml maven.compiler.source', async () => {
      // Arrange
      const detectJavaVersionFromPom = (client as any).detectJavaVersionFromPom?.bind(client);

      if (!detectJavaVersionFromPom) {
        // Method not implemented yet - this is expected in RED phase
        expect(detectJavaVersionFromPom).toBeDefined();
        return;
      }

      // Act
      const version = await detectJavaVersionFromPom(fixtureDir);

      // Assert
      expect(version).toBe('11'); // Our fixture has Java 11
    });

    it('should return null if pom.xml does not exist', async () => {
      // Arrange
      const detectJavaVersionFromPom = (client as any).detectJavaVersionFromPom?.bind(client);

      if (!detectJavaVersionFromPom) {
        expect(detectJavaVersionFromPom).toBeDefined();
        return;
      }

      // Act
      const version = await detectJavaVersionFromPom('/nonexistent/path');

      // Assert
      expect(version).toBeNull();
    });

    it('should handle pom.xml without compiler source property', async () => {
      // Arrange
      const detectJavaVersionFromPom = (client as any).detectJavaVersionFromPom?.bind(client);

      if (!detectJavaVersionFromPom) {
        expect(detectJavaVersionFromPom).toBeDefined();
        return;
      }

      // Create a temporary pom.xml without version
      const tempDir = path.join(__dirname, 'fixtures', 'temp-no-version');
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'pom.xml'),
        '<?xml version="1.0"?><project></project>'
      );

      // Act
      const version = await detectJavaVersionFromPom(tempDir);

      // Assert
      expect(version).toBeNull();

      // Cleanup
      await fs.rm(tempDir, { recursive: true });
    });
  });

  describe('addJavaVersionParameter', () => {
    it('should add sonar.java.source parameter when version is detected', async () => {
      // Arrange
      const params: string[] = [];
      const addJavaVersionParameter = (client as any).addJavaVersionParameter?.bind(client);

      if (!addJavaVersionParameter) {
        expect(addJavaVersionParameter).toBeDefined();
        return;
      }

      // Act
      await addJavaVersionParameter(params, fixtureDir, 'maven');

      // Assert
      const versionParam = params.find(p => p.startsWith('-Dsonar.java.source='));
      expect(versionParam).toBeDefined();
      expect(versionParam).toBe('-Dsonar.java.source=11');
    });

    it('should not add parameter if version cannot be detected', async () => {
      // Arrange
      const params: string[] = [];
      const addJavaVersionParameter = (client as any).addJavaVersionParameter?.bind(client);

      if (!addJavaVersionParameter) {
        expect(addJavaVersionParameter).toBeDefined();
        return;
      }

      // Act
      await addJavaVersionParameter(params, '/nonexistent', 'maven');

      // Assert
      const versionParam = params.find(p => p.startsWith('-Dsonar.java.source='));
      expect(versionParam).toBeUndefined();
    });
  });

  describe('integration with buildLanguageSpecificParams', () => {
    it('should include Java version in final scanner parameters', async () => {
      // Arrange - Mock the addMavenLibraries method to prevent Maven execution
      const originalAddMavenLibraries = (client as any).addMavenLibraries;
      if (originalAddMavenLibraries) {
        (client as any).addMavenLibraries = vi.fn().mockResolvedValue(undefined);
      }

      const buildLanguageSpecificParams = (client as any).buildLanguageSpecificParams?.bind(client);

      if (!buildLanguageSpecificParams) {
        expect(buildLanguageSpecificParams).toBeDefined();
        return;
      }

      (client as any).projectContext = {
        language: 'java',
        buildTool: 'maven'
      };

      // Act
      const params = await buildLanguageSpecificParams(fixtureDir);

      // Assert
      const versionParam = params.find((p: string) => p.startsWith('-Dsonar.java.source='));

      // Verify Java version was detected from pom.xml
      expect(versionParam).toBeDefined();
      expect(versionParam).toBe('-Dsonar.java.source=11');

      // Cleanup - Restore original method
      if (originalAddMavenLibraries) {
        (client as any).addMavenLibraries = originalAddMavenLibraries;
      }
    });
  });
});
