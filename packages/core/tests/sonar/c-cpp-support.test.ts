import { describe, it, expect, beforeAll } from 'vitest';
import { SonarQubeClient } from '../../src/sonar/client.js';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('C/C++ Language Support', () => {
  const cFixtureDir = path.join(__dirname, 'fixtures', 'c');
  const cppFixtureDir = path.join(__dirname, 'fixtures', 'cpp');
  let client: SonarQubeClient;

  beforeAll(() => {
    client = new SonarQubeClient(
      'http://localhost:9000',
      'test-token',
      'test-project'
    );
  });

  describe('C project detection', () => {
    it('should detect C project by CMakeLists.txt', async () => {
      // Arrange
      const hasCMake = await fs.access(path.join(cFixtureDir, 'CMakeLists.txt'))
        .then(() => true)
        .catch(() => false);

      // Assert
      expect(hasCMake).toBe(true);
    });

    it('should detect compile_commands.json', async () => {
      // Arrange
      const hasCompileCommands = await fs.access(path.join(cFixtureDir, 'compile_commands.json'))
        .then(() => true)
        .catch(() => false);

      // Assert
      expect(hasCompileCommands).toBe(true);
    });
  });

  describe('C++ project detection', () => {
    it('should detect C++ project by CMakeLists.txt', async () => {
      // Arrange
      const hasCMake = await fs.access(path.join(cppFixtureDir, 'CMakeLists.txt'))
        .then(() => true)
        .catch(() => false);

      // Assert
      expect(hasCMake).toBe(true);
    });

    it('should detect compile_commands.json', async () => {
      // Arrange
      const hasCompileCommands = await fs.access(path.join(cppFixtureDir, 'compile_commands.json'))
        .then(() => true)
        .catch(() => false);

      // Assert
      expect(hasCompileCommands).toBe(true);
    });
  });

  describe('detectCompileCommands', () => {
    it('should detect compile_commands.json in project root', async () => {
      // Arrange
      const detectCompileCommands = (client as any).detectCompileCommands?.bind(client);

      if (!detectCompileCommands) {
        expect(detectCompileCommands).toBeDefined();
        return;
      }

      // Act
      const hasCompileCommands = await detectCompileCommands(cFixtureDir);

      // Assert
      expect(hasCompileCommands).toBe(true);
    });

    it('should return false if compile_commands.json does not exist', async () => {
      // Arrange
      const detectCompileCommands = (client as any).detectCompileCommands?.bind(client);

      if (!detectCompileCommands) {
        expect(detectCompileCommands).toBeDefined();
        return;
      }

      // Act
      const hasCompileCommands = await detectCompileCommands('/nonexistent/path');

      // Assert
      expect(hasCompileCommands).toBe(false);
    });

    it('should detect compile_commands.json in build directory', async () => {
      // Arrange
      const tempDir = path.join(__dirname, 'fixtures', 'temp-c-build-compile-commands');
      await fs.mkdir(path.join(tempDir, 'build'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'build', 'compile_commands.json'),
        '[]'
      );

      const detectCompileCommands = (client as any).detectCompileCommands?.bind(client);

      if (!detectCompileCommands) {
        expect(detectCompileCommands).toBeDefined();
        await fs.rm(tempDir, { recursive: true });
        return;
      }

      // Act
      const hasCompileCommands = await detectCompileCommands(tempDir);

      // Assert
      expect(hasCompileCommands).toBe(true);

      // Cleanup
      await fs.rm(tempDir, { recursive: true });
    });
  });

  describe('addCCppParameters', () => {
    it('should add correct source parameters for C project', async () => {
      // Arrange
      const params: string[] = [];
      const addCCppParameters = (client as any).addCCppParameters?.bind(client);

      if (!addCCppParameters) {
        expect(addCCppParameters).toBeDefined();
        return;
      }

      // Act
      await addCCppParameters(params, cFixtureDir);

      // Assert
      const sourcesParam = params.find(p => p.startsWith('-Dsonar.sources='));
      expect(sourcesParam).toBeDefined();
      expect(sourcesParam).toContain('src');
    });

    it('should add correct source parameters for C++ project', async () => {
      // Arrange
      const params: string[] = [];
      const addCCppParameters = (client as any).addCCppParameters?.bind(client);

      if (!addCCppParameters) {
        expect(addCCppParameters).toBeDefined();
        return;
      }

      // Act
      await addCCppParameters(params, cppFixtureDir);

      // Assert
      const sourcesParam = params.find(p => p.startsWith('-Dsonar.sources='));
      expect(sourcesParam).toBeDefined();
      expect(sourcesParam).toContain('src');
    });

    it('should exclude build directories', async () => {
      // Arrange
      const params: string[] = [];
      const addCCppParameters = (client as any).addCCppParameters?.bind(client);

      if (!addCCppParameters) {
        expect(addCCppParameters).toBeDefined();
        return;
      }

      // Act
      await addCCppParameters(params, cFixtureDir);

      // Assert
      const exclusionsParam = params.find(p => p.startsWith('-Dsonar.exclusions='));
      expect(exclusionsParam).toBeDefined();
      expect(exclusionsParam).toContain('**/build/**');
      expect(exclusionsParam).toContain('**/third_party/**');
      expect(exclusionsParam).toContain('**/vendor/**');
    });

    it('should add compile_commands.json path when it exists', async () => {
      // Arrange
      const params: string[] = [];
      const addCCppParameters = (client as any).addCCppParameters?.bind(client);

      if (!addCCppParameters) {
        expect(addCCppParameters).toBeDefined();
        return;
      }

      // Act
      await addCCppParameters(params, cFixtureDir);

      // Assert
      const compileCommandsParam = params.find(p => p.startsWith('-Dsonar.cfamily.compile-commands='));
      expect(compileCommandsParam).toBeDefined();
      expect(compileCommandsParam).toContain('compile_commands.json');
    });

    it('should not add compile_commands.json path when it does not exist', async () => {
      // Arrange
      const params: string[] = [];
      const tempDir = path.join(__dirname, 'fixtures', 'temp-c-no-compile-commands');
      await fs.mkdir(tempDir, { recursive: true });
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

      const addCCppParameters = (client as any).addCCppParameters?.bind(client);

      if (!addCCppParameters) {
        expect(addCCppParameters).toBeDefined();
        await fs.rm(tempDir, { recursive: true });
        return;
      }

      // Act
      await addCCppParameters(params, tempDir);

      // Assert
      const compileCommandsParam = params.find(p => p.startsWith('-Dsonar.cfamily.compile-commands='));
      expect(compileCommandsParam).toBeUndefined();

      // Cleanup
      await fs.rm(tempDir, { recursive: true });
    });

    it('should add build/compile_commands.json path when it exists in build directory', async () => {
      // Arrange
      const params: string[] = [];
      const tempDir = path.join(__dirname, 'fixtures', 'temp-c-build-compile-commands-param');
      await fs.mkdir(path.join(tempDir, 'build'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'build', 'compile_commands.json'),
        '[]'
      );

      const addCCppParameters = (client as any).addCCppParameters?.bind(client);

      if (!addCCppParameters) {
        expect(addCCppParameters).toBeDefined();
        await fs.rm(tempDir, { recursive: true });
        return;
      }

      // Act
      await addCCppParameters(params, tempDir);

      // Assert
      const compileCommandsParam = params.find(p => p.startsWith('-Dsonar.cfamily.compile-commands='));
      expect(compileCommandsParam).toBeDefined();
      expect(compileCommandsParam).toBe('-Dsonar.cfamily.compile-commands=build/compile_commands.json');

      // Cleanup
      await fs.rm(tempDir, { recursive: true });
    });

    it('should configure C file suffixes', async () => {
      // Arrange
      const params: string[] = [];
      const addCCppParameters = (client as any).addCCppParameters?.bind(client);

      if (!addCCppParameters) {
        expect(addCCppParameters).toBeDefined();
        return;
      }

      // Act
      await addCCppParameters(params, cFixtureDir);

      // Assert
      const cSuffixesParam = params.find(p => p.startsWith('-Dsonar.c.file.suffixes='));
      expect(cSuffixesParam).toBeDefined();
      expect(cSuffixesParam).toContain('.c');
      expect(cSuffixesParam).toContain('.h');
    });

    it('should configure C++ file suffixes', async () => {
      // Arrange
      const params: string[] = [];
      const addCCppParameters = (client as any).addCCppParameters?.bind(client);

      if (!addCCppParameters) {
        expect(addCCppParameters).toBeDefined();
        return;
      }

      // Act
      await addCCppParameters(params, cppFixtureDir);

      // Assert
      const cppSuffixesParam = params.find(p => p.startsWith('-Dsonar.cpp.file.suffixes='));
      expect(cppSuffixesParam).toBeDefined();
      expect(cppSuffixesParam).toContain('.cpp');
      expect(cppSuffixesParam).toContain('.hpp');
      expect(cppSuffixesParam).toContain('.cc');
      expect(cppSuffixesParam).toContain('.cxx');
    });

    it('should handle projects with src and include directories', async () => {
      // Arrange
      const params: string[] = [];
      const addCCppParameters = (client as any).addCCppParameters?.bind(client);

      if (!addCCppParameters) {
        expect(addCCppParameters).toBeDefined();
        return;
      }

      // Act
      await addCCppParameters(params, cFixtureDir);

      // Assert
      const sourcesParam = params.find(p => p.startsWith('-Dsonar.sources='));
      expect(sourcesParam).toBeDefined();
      expect(sourcesParam).toContain('src');
      expect(sourcesParam).toContain('include');
    });

    it('should handle projects without src directory', async () => {
      // Arrange
      const params: string[] = [];
      const tempDir = path.join(__dirname, 'fixtures', 'temp-c-no-src');
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(path.join(tempDir, 'main.c'), 'int main() { return 0; }');

      const addCCppParameters = (client as any).addCCppParameters?.bind(client);

      if (!addCCppParameters) {
        expect(addCCppParameters).toBeDefined();
        await fs.rm(tempDir, { recursive: true });
        return;
      }

      // Act
      await addCCppParameters(params, tempDir);

      // Assert
      const sourcesParam = params.find(p => p.startsWith('-Dsonar.sources='));
      expect(sourcesParam).toBeDefined();
      expect(sourcesParam).toBe('-Dsonar.sources=.');

      // Cleanup
      await fs.rm(tempDir, { recursive: true });
    });
  });

  describe('integration with buildScannerParameters', () => {
    it('should build full scanner parameters for C project', async () => {
      // Arrange
      const buildScannerParameters = (client as any).buildScannerParameters?.bind(client);

      if (!buildScannerParameters) {
        expect(buildScannerParameters).toBeDefined();
        return;
      }

      (client as any).projectContext = {
        language: 'c',
        buildTool: null
      };

      // Act
      const params = await buildScannerParameters(cFixtureDir);

      // Assert
      const sourcesParam = params.find((p: string) => p.startsWith('-Dsonar.sources='));
      expect(sourcesParam).toBeDefined();

      const exclusionsParam = params.find((p: string) => p.startsWith('-Dsonar.exclusions='));
      expect(exclusionsParam).toBeDefined();
      expect(exclusionsParam).toContain('**/build/**');

      const compileCommandsParam = params.find((p: string) => p.startsWith('-Dsonar.cfamily.compile-commands='));
      expect(compileCommandsParam).toBeDefined();
    });

    it('should build full scanner parameters for C++ project', async () => {
      // Arrange
      const buildScannerParameters = (client as any).buildScannerParameters?.bind(client);

      if (!buildScannerParameters) {
        expect(buildScannerParameters).toBeDefined();
        return;
      }

      (client as any).projectContext = {
        language: 'cpp',
        buildTool: null
      };

      // Act
      const params = await buildScannerParameters(cppFixtureDir);

      // Assert
      const sourcesParam = params.find((p: string) => p.startsWith('-Dsonar.sources='));
      expect(sourcesParam).toBeDefined();

      const exclusionsParam = params.find((p: string) => p.startsWith('-Dsonar.exclusions='));
      expect(exclusionsParam).toBeDefined();

      const cppSuffixesParam = params.find((p: string) => p.startsWith('-Dsonar.cpp.file.suffixes='));
      expect(cppSuffixesParam).toBeDefined();
    });
  });
});
