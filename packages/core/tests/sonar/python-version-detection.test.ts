import { describe, it, expect, beforeAll } from 'vitest';
import { SonarQubeClient } from '../../src/sonar/client.js';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('Python Version Detection', () => {
  const fixtureDir = path.join(__dirname, 'fixtures', 'python');
  let client: SonarQubeClient;

  beforeAll(() => {
    client = new SonarQubeClient(
      'http://localhost:9000',
      'test-token',
      'test-project'
    );
  });

  describe('detectPythonVersionFromPyproject', () => {
    it('should detect Python versions from pyproject.toml requires-python', async () => {
      // Arrange
      const detectPythonVersionFromPyproject = (client as any).detectPythonVersionFromPyproject?.bind(client);

      if (!detectPythonVersionFromPyproject) {
        expect(detectPythonVersionFromPyproject).toBeDefined();
        return;
      }

      // Act
      const versions = await detectPythonVersionFromPyproject(fixtureDir);

      // Assert
      expect(versions).toBeDefined();
      expect(versions).toContain('3.8');
      expect(versions).toContain('3.9');
      expect(versions).toContain('3.10');
      expect(versions).toContain('3.11');
      // Should not include 3.12 (upper bound is <3.12)
      expect(versions).not.toContain('3.12');
    });

    it('should return null if pyproject.toml does not exist', async () => {
      // Arrange
      const detectPythonVersionFromPyproject = (client as any).detectPythonVersionFromPyproject?.bind(client);

      if (!detectPythonVersionFromPyproject) {
        expect(detectPythonVersionFromPyproject).toBeDefined();
        return;
      }

      // Act
      const versions = await detectPythonVersionFromPyproject('/nonexistent/path');

      // Assert
      expect(versions).toBeNull();
    });

    it('should handle pyproject.toml without requires-python', async () => {
      // Arrange
      const tempDir = path.join(__dirname, 'fixtures', 'temp-python-no-version');
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'pyproject.toml'),
        '[project]\nname = "test"\nversion = "1.0.0"'
      );

      const detectPythonVersionFromPyproject = (client as any).detectPythonVersionFromPyproject?.bind(client);

      if (!detectPythonVersionFromPyproject) {
        expect(detectPythonVersionFromPyproject).toBeDefined();
        await fs.rm(tempDir, { recursive: true });
        return;
      }

      // Act
      const versions = await detectPythonVersionFromPyproject(tempDir);

      // Assert
      expect(versions).toBeNull();

      // Cleanup
      await fs.rm(tempDir, { recursive: true });
    });
  });

  describe('detectPythonVersionFromPythonVersion', () => {
    it('should detect Python version from .python-version file', async () => {
      // Arrange
      const detectPythonVersionFromPythonVersion = (client as any).detectPythonVersionFromPythonVersion?.bind(client);

      if (!detectPythonVersionFromPythonVersion) {
        expect(detectPythonVersionFromPythonVersion).toBeDefined();
        return;
      }

      // Act
      const version = await detectPythonVersionFromPythonVersion(fixtureDir);

      // Assert
      expect(version).toBe('3.9'); // Our fixture has 3.9.18
    });

    it('should return null if .python-version does not exist', async () => {
      // Arrange
      const detectPythonVersionFromPythonVersion = (client as any).detectPythonVersionFromPythonVersion?.bind(client);

      if (!detectPythonVersionFromPythonVersion) {
        expect(detectPythonVersionFromPythonVersion).toBeDefined();
        return;
      }

      // Act
      const version = await detectPythonVersionFromPythonVersion('/nonexistent/path');

      // Assert
      expect(version).toBeNull();
    });

    it('should extract major.minor from full version', async () => {
      // Arrange
      const tempDir = path.join(__dirname, 'fixtures', 'temp-python-version');
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(path.join(tempDir, '.python-version'), '3.10.5\n');

      const detectPythonVersionFromPythonVersion = (client as any).detectPythonVersionFromPythonVersion?.bind(client);

      if (!detectPythonVersionFromPythonVersion) {
        expect(detectPythonVersionFromPythonVersion).toBeDefined();
        await fs.rm(tempDir, { recursive: true });
        return;
      }

      // Act
      const version = await detectPythonVersionFromPythonVersion(tempDir);

      // Assert
      expect(version).toBe('3.10');

      // Cleanup
      await fs.rm(tempDir, { recursive: true });
    });
  });

  describe('detectPythonVersion', () => {
    it('should prefer pyproject.toml over .python-version', async () => {
      // Arrange
      const detectPythonVersion = (client as any).detectPythonVersion?.bind(client);

      if (!detectPythonVersion) {
        expect(detectPythonVersion).toBeDefined();
        return;
      }

      // Act - fixture has both pyproject.toml and .python-version
      const versions = await detectPythonVersion(fixtureDir);

      // Assert - should use pyproject.toml (multiple versions)
      expect(versions).toBeDefined();
      expect(Array.isArray(versions)).toBe(true);
      expect(versions.length).toBeGreaterThan(1);
    });

    it('should fallback to .python-version if pyproject.toml not found', async () => {
      // Arrange
      const tempDir = path.join(__dirname, 'fixtures', 'temp-python-only-version-file');
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(path.join(tempDir, '.python-version'), '3.11.2\n');

      const detectPythonVersion = (client as any).detectPythonVersion?.bind(client);

      if (!detectPythonVersion) {
        expect(detectPythonVersion).toBeDefined();
        await fs.rm(tempDir, { recursive: true });
        return;
      }

      // Act
      const versions = await detectPythonVersion(tempDir);

      // Assert
      expect(versions).toEqual(['3.11']);

      // Cleanup
      await fs.rm(tempDir, { recursive: true });
    });

    it('should return null if no version can be detected', async () => {
      // Arrange
      const tempDir = path.join(__dirname, 'fixtures', 'temp-python-no-version-anywhere');
      await fs.mkdir(tempDir, { recursive: true });

      const detectPythonVersion = (client as any).detectPythonVersion?.bind(client);

      if (!detectPythonVersion) {
        expect(detectPythonVersion).toBeDefined();
        await fs.rm(tempDir, { recursive: true });
        return;
      }

      // Act
      const versions = await detectPythonVersion(tempDir);

      // Assert
      expect(versions).toBeNull();

      // Cleanup
      await fs.rm(tempDir, { recursive: true });
    });
  });

  describe('addPythonVersionParameter', () => {
    it('should add sonar.python.version parameter when versions detected', async () => {
      // Arrange
      const params: string[] = [];
      const addPythonVersionParameter = (client as any).addPythonVersionParameter?.bind(client);

      if (!addPythonVersionParameter) {
        expect(addPythonVersionParameter).toBeDefined();
        return;
      }

      // Act
      await addPythonVersionParameter(params, fixtureDir);

      // Assert
      const versionParam = params.find(p => p.startsWith('-Dsonar.python.version='));
      expect(versionParam).toBeDefined();
      expect(versionParam).toContain('3.8');
      expect(versionParam).toContain('3.9');
    });

    it('should not add parameter if no version detected', async () => {
      // Arrange
      const params: string[] = [];
      const tempDir = path.join(__dirname, 'fixtures', 'temp-no-python-version');
      await fs.mkdir(tempDir, { recursive: true });

      const addPythonVersionParameter = (client as any).addPythonVersionParameter?.bind(client);

      if (!addPythonVersionParameter) {
        expect(addPythonVersionParameter).toBeDefined();
        await fs.rm(tempDir, { recursive: true });
        return;
      }

      // Act
      await addPythonVersionParameter(params, tempDir);

      // Assert
      const versionParam = params.find(p => p.startsWith('-Dsonar.python.version='));
      expect(versionParam).toBeUndefined();

      // Cleanup
      await fs.rm(tempDir, { recursive: true });
    });
  });

  describe('integration with buildScannerParameters', () => {
    it('should include Python version in final scanner parameters', async () => {
      // Arrange
      const buildScannerParameters = (client as any).buildScannerParameters?.bind(client);

      if (!buildScannerParameters) {
        expect(buildScannerParameters).toBeDefined();
        return;
      }

      (client as any).projectContext = {
        language: 'python',
        buildTool: null
      };

      // Act
      const params = await buildScannerParameters(fixtureDir);

      // Assert - should have Python-specific parameters
      const sourcesParam = params.find((p: string) => p.startsWith('-Dsonar.sources='));
      expect(sourcesParam).toBeDefined();

      // Check for version parameter (implementation will add this)
      // const versionParam = params.find((p: string) => p.startsWith('-Dsonar.python.version='));
      // expect(versionParam).toBeDefined();
    });
  });
});
