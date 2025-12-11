import { describe, it, expect, beforeAll } from 'vitest';
import { SonarQubeClient } from '../../src/sonar/client.js';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('JavaScript/TypeScript Support', () => {
  const fixtureDir = path.join(__dirname, 'fixtures', 'javascript');
  let client: SonarQubeClient;

  beforeAll(() => {
    client = new SonarQubeClient(
      'http://localhost:9000',
      'test-token',
      'test-project'
    );
  });

  describe('detectTsConfig', () => {
    it('should detect tsconfig.json in project root', async () => {
      // Arrange
      const detectTsConfig = (client as any).detectTsConfig?.bind(client);

      if (!detectTsConfig) {
        expect(detectTsConfig).toBeDefined();
        return;
      }

      // Act
      const hasTsConfig = await detectTsConfig(fixtureDir);

      // Assert
      expect(hasTsConfig).toBe(true);
    });

    it('should return false if tsconfig.json does not exist', async () => {
      // Arrange
      const detectTsConfig = (client as any).detectTsConfig?.bind(client);

      if (!detectTsConfig) {
        expect(detectTsConfig).toBeDefined();
        return;
      }

      // Act
      const hasTsConfig = await detectTsConfig('/nonexistent/path');

      // Assert
      expect(hasTsConfig).toBe(false);
    });
  });

  describe('addJavaScriptTypeScriptParameters', () => {
    it('should add correct source patterns for JavaScript/TypeScript', async () => {
      // Arrange
      const params: string[] = [];
      const addJavaScriptParameters = (client as any).addJavaScriptParameters?.bind(client);

      if (!addJavaScriptParameters) {
        expect(addJavaScriptParameters).toBeDefined();
        return;
      }

      // Act
      await addJavaScriptParameters(params, fixtureDir);

      // Assert
      const sourcesParam = params.find(p => p.startsWith('-Dsonar.sources='));
      expect(sourcesParam).toBeDefined();
      // Default to src if it exists, otherwise current directory
      expect(sourcesParam).toMatch(/(-Dsonar\.sources=src|-Dsonar\.sources=\.)/);
    });

    it('should exclude node_modules and dist directories', async () => {
      // Arrange
      const params: string[] = [];
      const addJavaScriptParameters = (client as any).addJavaScriptParameters?.bind(client);

      if (!addJavaScriptParameters) {
        expect(addJavaScriptParameters).toBeDefined();
        return;
      }

      // Act
      await addJavaScriptParameters(params, fixtureDir);

      // Assert
      const exclusionsParam = params.find(p => p.startsWith('-Dsonar.exclusions='));
      expect(exclusionsParam).toBeDefined();
      expect(exclusionsParam).toContain('**/node_modules/**');
      expect(exclusionsParam).toContain('**/dist/**');
      expect(exclusionsParam).toContain('**/build/**');
    });

    it('should configure test file patterns', async () => {
      // Arrange
      const params: string[] = [];
      const addJavaScriptParameters = (client as any).addJavaScriptParameters?.bind(client);

      if (!addJavaScriptParameters) {
        expect(addJavaScriptParameters).toBeDefined();
        return;
      }

      // Act
      await addJavaScriptParameters(params, fixtureDir);

      // Assert
      const testInclusionsParam = params.find(p => p.startsWith('-Dsonar.test.inclusions='));
      expect(testInclusionsParam).toBeDefined();
      expect(testInclusionsParam).toContain('**/*.test.ts');
      expect(testInclusionsParam).toContain('**/*.spec.ts');
      expect(testInclusionsParam).toContain('**/*.test.js');
      expect(testInclusionsParam).toContain('**/*.spec.js');
    });

    it('should add TypeScript config path when tsconfig.json exists', async () => {
      // Arrange
      const params: string[] = [];
      const addJavaScriptParameters = (client as any).addJavaScriptParameters?.bind(client);

      if (!addJavaScriptParameters) {
        expect(addJavaScriptParameters).toBeDefined();
        return;
      }

      // Act
      await addJavaScriptParameters(params, fixtureDir);

      // Assert
      const tsConfigParam = params.find(p => p.startsWith('-Dsonar.typescript.tsconfigPath='));
      expect(tsConfigParam).toBeDefined();
      expect(tsConfigParam).toContain('tsconfig.json');
    });

    it('should not add TypeScript config path when tsconfig.json does not exist', async () => {
      // Arrange
      const params: string[] = [];
      const tempDir = path.join(__dirname, 'fixtures', 'temp-js-no-tsconfig');
      await fs.mkdir(tempDir, { recursive: true });

      const addJavaScriptParameters = (client as any).addJavaScriptParameters?.bind(client);

      if (!addJavaScriptParameters) {
        expect(addJavaScriptParameters).toBeDefined();
        await fs.rm(tempDir, { recursive: true });
        return;
      }

      // Act
      await addJavaScriptParameters(params, tempDir);

      // Assert
      const tsConfigParam = params.find(p => p.startsWith('-Dsonar.typescript.tsconfigPath='));
      expect(tsConfigParam).toBeUndefined();

      // Cleanup
      await fs.rm(tempDir, { recursive: true });
    });

    it('should configure file suffixes for both JavaScript and TypeScript', async () => {
      // Arrange
      const params: string[] = [];
      const addJavaScriptParameters = (client as any).addJavaScriptParameters?.bind(client);

      if (!addJavaScriptParameters) {
        expect(addJavaScriptParameters).toBeDefined();
        return;
      }

      // Act
      await addJavaScriptParameters(params, fixtureDir);

      // Assert
      const jsSuffixesParam = params.find(p => p.startsWith('-Dsonar.javascript.file.suffixes='));
      const tsSuffixesParam = params.find(p => p.startsWith('-Dsonar.typescript.file.suffixes='));

      expect(jsSuffixesParam).toBeDefined();
      expect(jsSuffixesParam).toContain('.js');
      expect(jsSuffixesParam).toContain('.jsx');

      expect(tsSuffixesParam).toBeDefined();
      expect(tsSuffixesParam).toContain('.ts');
      expect(tsSuffixesParam).toContain('.tsx');
    });

    it('should handle projects with src directory', async () => {
      // Arrange
      const params: string[] = [];
      const tempDir = path.join(__dirname, 'fixtures', 'temp-js-with-src');
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'src', 'index.ts'), 'export const foo = 42;');

      const addJavaScriptParameters = (client as any).addJavaScriptParameters?.bind(client);

      if (!addJavaScriptParameters) {
        expect(addJavaScriptParameters).toBeDefined();
        await fs.rm(tempDir, { recursive: true });
        return;
      }

      // Act
      await addJavaScriptParameters(params, tempDir);

      // Assert
      const sourcesParam = params.find(p => p.startsWith('-Dsonar.sources='));
      expect(sourcesParam).toBeDefined();
      expect(sourcesParam).toContain('src');

      // Cleanup
      await fs.rm(tempDir, { recursive: true });
    });

    it('should handle projects without src directory', async () => {
      // Arrange
      const params: string[] = [];
      const tempDir = path.join(__dirname, 'fixtures', 'temp-js-no-src');
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(path.join(tempDir, 'index.ts'), 'export const foo = 42;');

      const addJavaScriptParameters = (client as any).addJavaScriptParameters?.bind(client);

      if (!addJavaScriptParameters) {
        expect(addJavaScriptParameters).toBeDefined();
        await fs.rm(tempDir, { recursive: true });
        return;
      }

      // Act
      await addJavaScriptParameters(params, tempDir);

      // Assert
      const sourcesParam = params.find(p => p.startsWith('-Dsonar.sources='));
      expect(sourcesParam).toBeDefined();
      expect(sourcesParam).toBe('-Dsonar.sources=.');

      // Cleanup
      await fs.rm(tempDir, { recursive: true });
    });
  });

  describe('integration with buildLanguageSpecificParams', () => {
    it('should build full scanner parameters for JavaScript/TypeScript project', async () => {
      // Arrange
      const buildLanguageSpecificParams = (client as any).buildLanguageSpecificParams?.bind(client);

      if (!buildLanguageSpecificParams) {
        expect(buildLanguageSpecificParams).toBeDefined();
        return;
      }

      (client as any).projectContext = {
        language: 'javascript',
        buildTool: null
      };

      // Act
      const params = await buildLanguageSpecificParams(fixtureDir);

      // Assert
      const sourcesParam = params.find((p: string) => p.startsWith('-Dsonar.sources='));
      expect(sourcesParam).toBeDefined();

      const exclusionsParam = params.find((p: string) => p.startsWith('-Dsonar.exclusions='));
      expect(exclusionsParam).toBeDefined();
      expect(exclusionsParam).toContain('**/node_modules/**');

      const tsConfigParam = params.find((p: string) => p.startsWith('-Dsonar.typescript.tsconfigPath='));
      expect(tsConfigParam).toBeDefined();
    });
  });
});
