import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { SonarQubeClient } from '../../src/sonar/client.js';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('Python Source Detection', () => {
  const fixtureBaseDir = path.join(__dirname, 'fixtures', 'python-sources');
  let client: SonarQubeClient;

  beforeAll(() => {
    client = new SonarQubeClient(
      'http://localhost:9000',
      'test-token',
      'test-project'
    );
  });

  beforeEach(async () => {
    // Create fixture directory structure
    await fs.mkdir(fixtureBaseDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup fixture directory
    try {
      await fs.rm(fixtureBaseDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('directoryContainsPythonFiles', () => {
    it('should return true when directory contains Python files', async () => {
      // Arrange
      const srcDir = path.join(fixtureBaseDir, 'src');
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(path.join(srcDir, 'main.py'), '# Python file');

      const directoryContainsPythonFiles = (client as any).directoryContainsPythonFiles?.bind(client);

      if (!directoryContainsPythonFiles) {
        expect(directoryContainsPythonFiles).toBeDefined();
        return;
      }

      // Act
      const result = await directoryContainsPythonFiles(srcDir);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when directory does not exist', async () => {
      const directoryContainsPythonFiles = (client as any).directoryContainsPythonFiles?.bind(client);

      if (!directoryContainsPythonFiles) {
        expect(directoryContainsPythonFiles).toBeDefined();
        return;
      }

      // Act
      const result = await directoryContainsPythonFiles('/nonexistent/path');

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when directory exists but is empty', async () => {
      // Arrange
      const emptyDir = path.join(fixtureBaseDir, 'empty');
      await fs.mkdir(emptyDir, { recursive: true });

      const directoryContainsPythonFiles = (client as any).directoryContainsPythonFiles?.bind(client);

      if (!directoryContainsPythonFiles) {
        expect(directoryContainsPythonFiles).toBeDefined();
        return;
      }

      // Act
      const result = await directoryContainsPythonFiles(emptyDir);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when directory only contains __pycache__', async () => {
      // Arrange
      const dirWithPycache = path.join(fixtureBaseDir, 'with-pycache');
      await fs.mkdir(path.join(dirWithPycache, '__pycache__'), { recursive: true });
      await fs.writeFile(path.join(dirWithPycache, '__pycache__', 'cached.pyc'), '# Bytecode');

      const directoryContainsPythonFiles = (client as any).directoryContainsPythonFiles?.bind(client);

      if (!directoryContainsPythonFiles) {
        expect(directoryContainsPythonFiles).toBeDefined();
        return;
      }

      // Act
      const result = await directoryContainsPythonFiles(dirWithPycache);

      // Assert
      expect(result).toBe(false);
    });

    it('should find Python files in subdirectories (up to 2 levels)', async () => {
      // Arrange
      const baseDir = path.join(fixtureBaseDir, 'nested');
      await fs.mkdir(path.join(baseDir, 'sub1', 'sub2'), { recursive: true });
      await fs.writeFile(path.join(baseDir, 'sub1', 'sub2', 'deep.py'), '# Deep Python file');

      const directoryContainsPythonFiles = (client as any).directoryContainsPythonFiles?.bind(client);

      if (!directoryContainsPythonFiles) {
        expect(directoryContainsPythonFiles).toBeDefined();
        return;
      }

      // Act
      const result = await directoryContainsPythonFiles(baseDir);

      // Assert
      expect(result).toBe(true);
    });

    it('should skip venv directories', async () => {
      // Arrange
      const dirWithVenv = path.join(fixtureBaseDir, 'with-venv');
      await fs.mkdir(path.join(dirWithVenv, 'venv'), { recursive: true });
      await fs.writeFile(path.join(dirWithVenv, 'venv', 'some.py'), '# Venv Python file');

      const directoryContainsPythonFiles = (client as any).directoryContainsPythonFiles?.bind(client);

      if (!directoryContainsPythonFiles) {
        expect(directoryContainsPythonFiles).toBeDefined();
        return;
      }

      // Act
      const result = await directoryContainsPythonFiles(dirWithVenv);

      // Assert
      expect(result).toBe(false);
    });

    it('should skip node_modules directories', async () => {
      // Arrange
      const dirWithNodeModules = path.join(fixtureBaseDir, 'with-node-modules');
      await fs.mkdir(path.join(dirWithNodeModules, 'node_modules'), { recursive: true });
      await fs.writeFile(path.join(dirWithNodeModules, 'node_modules', 'some.py'), '# Python in node_modules');

      const directoryContainsPythonFiles = (client as any).directoryContainsPythonFiles?.bind(client);

      if (!directoryContainsPythonFiles) {
        expect(directoryContainsPythonFiles).toBeDefined();
        return;
      }

      // Act
      const result = await directoryContainsPythonFiles(dirWithNodeModules);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('addPythonParameters', () => {
    it('should use specific directory when it contains Python files', async () => {
      // Arrange
      const projectDir = path.join(fixtureBaseDir, 'project-with-app');
      await fs.mkdir(path.join(projectDir, 'app'), { recursive: true });
      await fs.writeFile(path.join(projectDir, 'app', 'main.py'), '# Main app');

      const addPythonParameters = (client as any).addPythonParameters?.bind(client);

      if (!addPythonParameters) {
        expect(addPythonParameters).toBeDefined();
        return;
      }

      const params: string[] = [];

      // Act
      await addPythonParameters(params, projectDir);

      // Assert
      const sourcesParam = params.find(p => p.startsWith('-Dsonar.sources='));
      expect(sourcesParam).toBe('-Dsonar.sources=app');
    });

    it('should use multiple directories when they contain Python files', async () => {
      // Arrange
      const projectDir = path.join(fixtureBaseDir, 'project-with-multiple');
      await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
      await fs.mkdir(path.join(projectDir, 'lib'), { recursive: true });
      await fs.writeFile(path.join(projectDir, 'src', 'main.py'), '# Main src');
      await fs.writeFile(path.join(projectDir, 'lib', 'utils.py'), '# Utils lib');

      const addPythonParameters = (client as any).addPythonParameters?.bind(client);

      if (!addPythonParameters) {
        expect(addPythonParameters).toBeDefined();
        return;
      }

      const params: string[] = [];

      // Act
      await addPythonParameters(params, projectDir);

      // Assert
      const sourcesParam = params.find(p => p.startsWith('-Dsonar.sources='));
      expect(sourcesParam).toContain('src');
      expect(sourcesParam).toContain('lib');
    });

    it('should NOT include "." when specific directories are found', async () => {
      // Arrange - this was the bug that caused double indexing
      const projectDir = path.join(fixtureBaseDir, 'project-no-dot');
      await fs.mkdir(path.join(projectDir, 'app'), { recursive: true });
      await fs.writeFile(path.join(projectDir, 'app', 'main.py'), '# App main');
      // Also put a Python file in root
      await fs.writeFile(path.join(projectDir, 'setup.py'), '# Setup file');

      const addPythonParameters = (client as any).addPythonParameters?.bind(client);

      if (!addPythonParameters) {
        expect(addPythonParameters).toBeDefined();
        return;
      }

      const params: string[] = [];

      // Act
      await addPythonParameters(params, projectDir);

      // Assert
      const sourcesParam = params.find(p => p.startsWith('-Dsonar.sources='));
      // Should be 'app' only, not 'app,.' which would cause double indexing
      expect(sourcesParam).toBe('-Dsonar.sources=app');
      expect(sourcesParam).not.toContain(',.');
    });

    it('should fallback to "." when no specific directories found but root has Python files', async () => {
      // Arrange
      const projectDir = path.join(fixtureBaseDir, 'project-root-only');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'main.py'), '# Root main');

      const addPythonParameters = (client as any).addPythonParameters?.bind(client);

      if (!addPythonParameters) {
        expect(addPythonParameters).toBeDefined();
        return;
      }

      const params: string[] = [];

      // Act
      await addPythonParameters(params, projectDir);

      // Assert
      const sourcesParam = params.find(p => p.startsWith('-Dsonar.sources='));
      expect(sourcesParam).toBe('-Dsonar.sources=.');
    });

    it('should skip empty src directory and use app if it has Python files', async () => {
      // Arrange - this was another reported bug scenario
      const projectDir = path.join(fixtureBaseDir, 'project-empty-src');
      await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
      // src exists but only has __tests__
      await fs.mkdir(path.join(projectDir, 'src', '__tests__'), { recursive: true });
      await fs.writeFile(path.join(projectDir, 'src', '__tests__', 'test.py'), '# Test');
      // app has actual Python files
      await fs.mkdir(path.join(projectDir, 'app'), { recursive: true });
      await fs.writeFile(path.join(projectDir, 'app', 'main.py'), '# Main');

      const addPythonParameters = (client as any).addPythonParameters?.bind(client);

      if (!addPythonParameters) {
        expect(addPythonParameters).toBeDefined();
        return;
      }

      const params: string[] = [];

      // Act
      await addPythonParameters(params, projectDir);

      // Assert
      const sourcesParam = params.find(p => p.startsWith('-Dsonar.sources='));
      // Should include app (has Python files) but not src (empty or only has tests)
      expect(sourcesParam).toContain('app');
    });

    it('should include test exclusions', async () => {
      // Arrange
      const projectDir = path.join(fixtureBaseDir, 'project-with-tests');
      await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(projectDir, 'src', 'main.py'), '# Main');

      const addPythonParameters = (client as any).addPythonParameters?.bind(client);

      if (!addPythonParameters) {
        expect(addPythonParameters).toBeDefined();
        return;
      }

      const params: string[] = [];

      // Act
      await addPythonParameters(params, projectDir);

      // Assert
      const exclusionsParam = params.find(p => p.startsWith('-Dsonar.exclusions='));
      expect(exclusionsParam).toBeDefined();
      expect(exclusionsParam).toContain('**/__pycache__/**');
      expect(exclusionsParam).toContain('**/venv/**');
    });

    it('should add tests directory parameter when tests exist', async () => {
      // Arrange
      const projectDir = path.join(fixtureBaseDir, 'project-with-tests-dir');
      await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
      await fs.mkdir(path.join(projectDir, 'tests'), { recursive: true });
      await fs.writeFile(path.join(projectDir, 'src', 'main.py'), '# Main');
      await fs.writeFile(path.join(projectDir, 'tests', 'test_main.py'), '# Test');

      const addPythonParameters = (client as any).addPythonParameters?.bind(client);

      if (!addPythonParameters) {
        expect(addPythonParameters).toBeDefined();
        return;
      }

      const params: string[] = [];

      // Act
      await addPythonParameters(params, projectDir);

      // Assert
      const testsParam = params.find(p => p.startsWith('-Dsonar.tests='));
      expect(testsParam).toBeDefined();
      expect(testsParam).toBe('-Dsonar.tests=tests');
    });
  });
});
