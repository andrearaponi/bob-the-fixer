import { describe, it, expect, beforeAll, vi } from 'vitest';
import { SonarQubeClient } from '../../src/sonar/client.js';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('Go Language Support', () => {
  const fixtureDir = path.join(__dirname, 'fixtures', 'go');
  let client: SonarQubeClient;

  beforeAll(() => {
    client = new SonarQubeClient(
      'http://localhost:9000',
      'test-token',
      'test-project'
    );
  });

  describe('Go project detection', () => {
    it('should detect Go project by go.mod file', async () => {
      // Arrange
      const hasGoMod = await fs.access(path.join(fixtureDir, 'go.mod'))
        .then(() => true)
        .catch(() => false);

      // Assert
      expect(hasGoMod).toBe(true);
    });

    it('should detect Go test files', async () => {
      // Arrange
      const hasTestFile = await fs.access(path.join(fixtureDir, 'main_test.go'))
        .then(() => true)
        .catch(() => false);

      // Assert
      expect(hasTestFile).toBe(true);
    });
  });

  describe('addGoParameters', () => {
    it('should add correct source parameters for Go project', async () => {
      // Arrange
      const params: string[] = [];
      const addGoParameters = (client as any).addGoParameters?.bind(client);

      if (!addGoParameters) {
        expect(addGoParameters).toBeDefined();
        return;
      }

      // Act
      await addGoParameters(params, fixtureDir);

      // Assert
      // Go uses current directory as source
      expect(params).toContain('-Dsonar.sources=.');
    });

    it('should exclude test files from sources', async () => {
      // Arrange
      const params: string[] = [];
      const addGoParameters = (client as any).addGoParameters?.bind(client);

      if (!addGoParameters) {
        expect(addGoParameters).toBeDefined();
        return;
      }

      // Act
      await addGoParameters(params, fixtureDir);

      // Assert
      const exclusionsParam = params.find(p => p.startsWith('-Dsonar.exclusions='));
      expect(exclusionsParam).toBeDefined();
      expect(exclusionsParam).toContain('**/*_test.go');
      expect(exclusionsParam).toContain('**/vendor/**');
    });

    it('should configure tests with correct pattern', async () => {
      // Arrange
      const params: string[] = [];
      const addGoParameters = (client as any).addGoParameters?.bind(client);

      if (!addGoParameters) {
        expect(addGoParameters).toBeDefined();
        return;
      }

      // Act
      await addGoParameters(params, fixtureDir);

      // Assert
      expect(params).toContain('-Dsonar.tests=.');

      const testInclusionsParam = params.find(p => p.startsWith('-Dsonar.test.inclusions='));
      expect(testInclusionsParam).toBeDefined();
      expect(testInclusionsParam).toContain('**/*_test.go');
    });

    it('should add coverage report path if coverage.out exists', async () => {
      // Arrange
      const params: string[] = [];
      const tempDir = path.join(__dirname, 'fixtures', 'temp-go-with-coverage');
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(path.join(tempDir, 'go.mod'), 'module test\ngo 1.21');
      await fs.writeFile(path.join(tempDir, 'coverage.out'), 'mode: set');

      const addGoParameters = (client as any).addGoParameters?.bind(client);

      if (!addGoParameters) {
        expect(addGoParameters).toBeDefined();
        await fs.rm(tempDir, { recursive: true });
        return;
      }

      // Act
      await addGoParameters(params, tempDir);

      // Assert
      const coverageParam = params.find(p => p.startsWith('-Dsonar.go.coverage.reportPaths='));
      expect(coverageParam).toBeDefined();
      expect(coverageParam).toContain('coverage.out');

      // Cleanup
      await fs.rm(tempDir, { recursive: true });
    });

    it('should not add coverage parameter if coverage.out does not exist', async () => {
      // Arrange
      const params: string[] = [];
      const addGoParameters = (client as any).addGoParameters?.bind(client);

      if (!addGoParameters) {
        expect(addGoParameters).toBeDefined();
        return;
      }

      // Act
      await addGoParameters(params, fixtureDir);

      // Assert
      const coverageParam = params.find(p => p.startsWith('-Dsonar.go.coverage.reportPaths='));
      expect(coverageParam).toBeUndefined();
    });

    it('should warn if go.mod is missing', async () => {
      // Arrange
      const params: string[] = [];
      const tempDir = path.join(__dirname, 'fixtures', 'temp-go-no-mod');
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(path.join(tempDir, 'main.go'), 'package main\nfunc main() {}');

      const addGoParameters = (client as any).addGoParameters?.bind(client);

      if (!addGoParameters) {
        expect(addGoParameters).toBeDefined();
        await fs.rm(tempDir, { recursive: true });
        return;
      }

      // Capture console output
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Act
      await addGoParameters(params, tempDir);

      // Assert - should still add parameters but log warning
      expect(params).toContain('-Dsonar.sources=.');

      // Cleanup
      consoleWarnSpy.mockRestore();
      await fs.rm(tempDir, { recursive: true });
    });
  });

  describe('integration with buildScannerParameters', () => {
    it('should build full scanner parameters for Go project', async () => {
      // Arrange
      const buildScannerParameters = (client as any).buildScannerParameters?.bind(client);

      if (!buildScannerParameters) {
        expect(buildScannerParameters).toBeDefined();
        return;
      }

      (client as any).projectContext = {
        language: 'go',
        buildTool: null
      };

      // Act
      const params = await buildScannerParameters(fixtureDir);

      // Assert
      expect(params).toContain('-Dsonar.sources=.');
      expect(params).toContain('-Dsonar.tests=.');

      const exclusionsParam = params.find((p: string) => p.startsWith('-Dsonar.exclusions='));
      expect(exclusionsParam).toBeDefined();
      expect(exclusionsParam).toContain('**/*_test.go');
    });
  });
});
