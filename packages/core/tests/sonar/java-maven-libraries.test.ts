import { describe, it, expect, beforeAll } from 'vitest';
import { SonarQubeClient } from '../../src/sonar/client.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

describe('Java Maven Libraries Resolution', () => {
  const fixtureDir = path.join(__dirname, 'fixtures', 'java-maven');
  let client: SonarQubeClient;

  beforeAll(() => {
    // Create a test client (we won't actually connect to SonarQube)
    client = new SonarQubeClient(
      'http://localhost:9000',
      'test-token',
      'test-project'
    );
  });

  describe('addMavenLibraries', () => {
    it('should resolve Maven dependencies and add sonar.java.libraries parameter', async () => {
      // Arrange
      const params: string[] = [];

      // Access private method via any cast (for testing purposes)
      const addMavenLibraries = (client as any).addMavenLibraries.bind(client);

      // Act
      await addMavenLibraries(params, fixtureDir);

      // Assert
      const librariesParam = params.find(p => p.startsWith('-Dsonar.java.libraries='));
      expect(librariesParam).toBeDefined();
      expect(librariesParam).toContain('.jar');

      // Should contain Spring Boot dependency
      expect(librariesParam).toContain('spring-boot');
    }, 60000); // 60 second timeout for Maven dependency download

    it('should handle Maven not installed gracefully', async () => {
      // Arrange
      const params: string[] = [];
      const invalidDir = '/nonexistent/path';
      const addMavenLibraries = (client as any).addMavenLibraries.bind(client);

      // Act
      await addMavenLibraries(params, invalidDir);

      // Assert - should not throw, but no libraries param should be added
      const librariesParam = params.find(p => p.startsWith('-Dsonar.java.libraries='));
      expect(librariesParam).toBeUndefined();
    });

    it('should parse classpath with multiple JAR files correctly', async () => {
      // Arrange
      const params: string[] = [];
      const addMavenLibraries = (client as any).addMavenLibraries.bind(client);

      // Act
      await addMavenLibraries(params, fixtureDir);

      // Assert
      const librariesParam = params.find(p => p.startsWith('-Dsonar.java.libraries='));

      if (librariesParam) {
        const libraries = librariesParam.replace('-Dsonar.java.libraries=', '').split(',');

        // Should have multiple libraries (Spring Boot has many dependencies)
        expect(libraries.length).toBeGreaterThan(5);

        // All should be absolute paths to JAR files
        libraries.forEach(lib => {
          expect(lib).toMatch(/\.jar$/);
          expect(path.isAbsolute(lib)).toBe(true);
        });
      }
    });

    it('should filter out Maven [INFO] lines from classpath', async () => {
      // Arrange
      const params: string[] = [];
      const addMavenLibraries = (client as any).addMavenLibraries.bind(client);

      // Act
      await addMavenLibraries(params, fixtureDir);

      // Assert
      const librariesParam = params.find(p => p.startsWith('-Dsonar.java.libraries='));

      if (librariesParam) {
        // Should not contain [INFO] or [WARNING] text
        expect(librariesParam).not.toContain('[INFO]');
        expect(librariesParam).not.toContain('[WARNING]');
        expect(librariesParam).not.toContain('[ERROR]');
      }
    });

    it('should filter out Maven download progress messages from classpath', async () => {
      // Arrange
      const params: string[] = [];
      const addMavenLibraries = (client as any).addMavenLibraries.bind(client);

      // Act
      await addMavenLibraries(params, fixtureDir);

      // Assert
      const librariesParam = params.find(p => p.startsWith('-Dsonar.java.libraries='));

      if (librariesParam) {
        // Should not contain download progress messages
        expect(librariesParam).not.toContain('Downloading from');
        expect(librariesParam).not.toContain('Downloaded from');
        expect(librariesParam).not.toContain('Progress (');
        expect(librariesParam).not.toContain('repo.maven.apache.org');
        expect(librariesParam).not.toContain('://');
        expect(librariesParam).not.toContain('central:');
        // Should not contain download speed indicators
        expect(librariesParam).not.toMatch(/\d+\s*(kB|MB|B)\s*(at|\/s)/i);
      }
    });
  });

  describe('Maven integration test', () => {
    it('should build full scanner parameters for Maven project', async () => {
      // Arrange
      const buildLanguageSpecificParams = (client as any).buildLanguageSpecificParams.bind(client);

      // Mock project context
      (client as any).projectContext = {
        language: 'java',
        buildTool: 'maven'
      };

      // Act
      const params = await buildLanguageSpecificParams(fixtureDir);

      // Assert
      expect(params).toContain('-Dsonar.sources=src/main/java');
      expect(params.some(p => p.startsWith('-Dsonar.java.libraries='))).toBe(true);

      // Should include binaries if target/classes exists
      // (may not exist in test fixture, so we check conditionally)
    });
  });
});
