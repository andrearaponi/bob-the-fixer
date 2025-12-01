import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectStructureAnalyzer } from './ProjectStructureAnalyzer';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs/promises
vi.mock('fs/promises');

describe('ProjectStructureAnalyzer', () => {
  let analyzer: ProjectStructureAnalyzer;
  const mockProjectPath = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    analyzer = new ProjectStructureAnalyzer();
  });

  describe('analyze', () => {
    it('should analyze a simple npm project', async () => {
      // Mock directory structure
      const mockRootFiles = [
        { name: 'package.json', isDirectory: () => false, isFile: () => true },
        { name: 'src', isDirectory: () => true, isFile: () => false },
        { name: 'tsconfig.json', isDirectory: () => false, isFile: () => true },
      ];

      vi.mocked(fs.readdir).mockImplementation(async (dir: any, options: any) => {
        const dirStr = dir.toString();
        if (dirStr === mockProjectPath || dirStr === path.resolve(mockProjectPath)) {
          // Return with or without options
          if (options?.withFileTypes) {
            return mockRootFiles as any;
          }
          return mockRootFiles.map(f => f.name) as any;
        }
        if (dirStr.includes('src')) {
          const srcFiles = [
            { name: 'index.ts', isDirectory: () => false, isFile: () => true },
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
          ];
          if (options?.withFileTypes) {
            return srcFiles as any;
          }
          return srcFiles.map(f => f.name) as any;
        }
        return [];
      });

      vi.mocked(fs.access).mockImplementation(async (path: any) => {
        if (path.toString().includes('src')) {
          return undefined;
        }
        throw new Error('Not found');
      });

      const result = await analyzer.analyze(mockProjectPath);

      expect(result.projectType).toBe('single');
      expect(result.buildFiles).toContain('package.json');
      expect(result.configFiles).toContain('tsconfig.json');
    });

    it('should detect multi-module Maven project', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dir: any, options: any) => {
        const dirStr = dir.toString();
        if (dirStr === mockProjectPath || dirStr === path.resolve(mockProjectPath)) {
          return [
            { name: 'pom.xml', isDirectory: () => false, isFile: () => true },
            { name: 'backend', isDirectory: () => true, isFile: () => false },
            { name: 'frontend', isDirectory: () => true, isFile: () => false },
          ] as any;
        }
        if (dirStr.includes('backend')) {
          return [
            { name: 'pom.xml', isDirectory: () => false, isFile: () => true },
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as any;
        }
        if (dirStr.includes('frontend')) {
          return [
            { name: 'pom.xml', isDirectory: () => false, isFile: () => true },
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as any;
        }
        if (dirStr.includes('src')) {
          return [
            { name: 'main', isDirectory: () => true, isFile: () => false },
          ] as any;
        }
        if (dirStr.includes('main')) {
          return [
            { name: 'java', isDirectory: () => true, isFile: () => false },
          ] as any;
        }
        if (dirStr.includes('java')) {
          return [
            { name: 'App.java', isDirectory: () => false, isFile: () => true },
          ] as any;
        }
        return [];
      });

      vi.mocked(fs.access).mockImplementation(async (path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('src/main/java') || pathStr.includes('src')) {
          return undefined;
        }
        throw new Error('Not found');
      });

      const result = await analyzer.analyze(mockProjectPath);

      expect(result.projectType).toBe('multi-module');
      expect(result.modules.length).toBeGreaterThan(1);
    });

    it('should detect languages from file extensions', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dir: any, options: any) => {
        const dirStr = dir.toString();
        if (dirStr === mockProjectPath || dirStr === path.resolve(mockProjectPath)) {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as any;
        }
        if (dirStr.includes('src')) {
          return [
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
            { name: 'config.js', isDirectory: () => false, isFile: () => true },
          ] as any;
        }
        return [];
      });

      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));

      const result = await analyzer.analyze(mockProjectPath);

      expect(result.detectedLanguages.length).toBeGreaterThan(0);
      const tsLang = result.detectedLanguages.find(l => l.name === 'typescript');
      expect(tsLang).toBeDefined();
      expect(tsLang?.filesCount).toBe(2);
    });

    it('should generate directory tree', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dir: any, options: any) => {
        const dirStr = dir.toString();
        if (dirStr === mockProjectPath || dirStr === path.resolve(mockProjectPath)) {
          return [
            { name: 'package.json', isDirectory: () => false, isFile: () => true },
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as any;
        }
        if (dirStr.includes('src')) {
          return [
            { name: 'index.ts', isDirectory: () => false, isFile: () => true },
          ] as any;
        }
        return [];
      });

      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));

      const result = await analyzer.analyze(mockProjectPath);

      expect(result.directoryTree).toContain('project/');
      expect(result.directoryTree).toContain('src/');
      expect(result.directoryTree).toContain('package.json');
    });

    it('should include default exclusions', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([]);
      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));

      const result = await analyzer.analyze(mockProjectPath);

      expect(result.globalExclusions).toContain('**/node_modules/**');
      expect(result.globalExclusions).toContain('**/target/**');
      expect(result.globalExclusions).toContain('**/.git/**');
    });

    it('should skip excluded directories', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dir: any, options: any) => {
        const dirStr = dir.toString();
        if (dirStr === mockProjectPath || dirStr === path.resolve(mockProjectPath)) {
          return [
            { name: 'node_modules', isDirectory: () => true, isFile: () => false },
            { name: '.git', isDirectory: () => true, isFile: () => false },
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as any;
        }
        if (dirStr.includes('src')) {
          return [
            { name: 'index.ts', isDirectory: () => false, isFile: () => true },
          ] as any;
        }
        // Should not be called for node_modules or .git
        if (dirStr.includes('node_modules') || dirStr.includes('.git')) {
          throw new Error('Should not scan excluded directories');
        }
        return [];
      });

      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));

      // Should not throw
      await expect(analyzer.analyze(mockProjectPath)).resolves.toBeDefined();
    });

    it('should handle Python projects', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dir: any, options: any) => {
        const dirStr = dir.toString();
        if (dirStr === mockProjectPath || dirStr === path.resolve(mockProjectPath)) {
          return [
            { name: 'requirements.txt', isDirectory: () => false, isFile: () => true },
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as any;
        }
        if (dirStr.includes('src')) {
          return [
            { name: 'main.py', isDirectory: () => false, isFile: () => true },
            { name: 'utils.py', isDirectory: () => false, isFile: () => true },
          ] as any;
        }
        return [];
      });

      vi.mocked(fs.access).mockImplementation(async (path: any) => {
        if (path.toString().includes('src')) {
          return undefined;
        }
        throw new Error('Not found');
      });

      const result = await analyzer.analyze(mockProjectPath);

      expect(result.buildFiles).toContain('requirements.txt');
      const pythonLang = result.detectedLanguages.find(l => l.name === 'python');
      expect(pythonLang).toBeDefined();
      expect(pythonLang?.filesCount).toBe(2);
    });

    it('should handle Go projects', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dir: any, options: any) => {
        const dirStr = dir.toString();
        if (dirStr === mockProjectPath || dirStr === path.resolve(mockProjectPath)) {
          return [
            { name: 'go.mod', isDirectory: () => false, isFile: () => true },
            { name: 'main.go', isDirectory: () => false, isFile: () => true },
            { name: 'pkg', isDirectory: () => true, isFile: () => false },
          ] as any;
        }
        if (dirStr.includes('pkg')) {
          return [
            { name: 'handler.go', isDirectory: () => false, isFile: () => true },
          ] as any;
        }
        return [];
      });

      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));

      const result = await analyzer.analyze(mockProjectPath);

      expect(result.buildFiles).toContain('go.mod');
      const goLang = result.detectedLanguages.find(l => l.name === 'go');
      expect(goLang).toBeDefined();
      expect(goLang?.filesCount).toBe(2);
    });

    it('should handle .NET projects', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dir: any, options: any) => {
        const dirStr = dir.toString();
        if (dirStr === mockProjectPath || dirStr === path.resolve(mockProjectPath)) {
          return [
            { name: 'MyApp.csproj', isDirectory: () => false, isFile: () => true },
            { name: 'Program.cs', isDirectory: () => false, isFile: () => true },
          ] as any;
        }
        return [];
      });

      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));

      const result = await analyzer.analyze(mockProjectPath);

      expect(result.buildFiles).toContain('MyApp.csproj');
      const csharpLang = result.detectedLanguages.find(l => l.name === 'csharp');
      expect(csharpLang).toBeDefined();
    });

    it('should create default module when no build files found', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([]);
      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));

      const result = await analyzer.analyze(mockProjectPath);

      expect(result.modules.length).toBe(1);
      expect(result.modules[0].relativePath).toBe('.');
      expect(result.modules[0].sourcesDirs).toContain('src');
    });

    it('should handle permission errors gracefully', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('Permission denied'));
      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));

      const result = await analyzer.analyze(mockProjectPath);

      expect(result).toBeDefined();
      expect(result.modules.length).toBe(1);
    });

    it('should find config files in root', async () => {
      const mockFiles = [
        { name: 'sonar-project.properties', isDirectory: () => false, isFile: () => true },
        { name: 'tsconfig.json', isDirectory: () => false, isFile: () => true },
        { name: '.eslintrc.json', isDirectory: () => false, isFile: () => true },
        { name: 'jest.config.js', isDirectory: () => false, isFile: () => true },
      ];

      vi.mocked(fs.readdir).mockImplementation(async (dir: any, options: any) => {
        const dirStr = dir.toString();
        if (dirStr === mockProjectPath || dirStr === path.resolve(mockProjectPath)) {
          // Return with or without options
          if (options?.withFileTypes) {
            return mockFiles as any;
          }
          return mockFiles.map(f => f.name) as any;
        }
        return [];
      });

      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));

      const result = await analyzer.analyze(mockProjectPath);

      expect(result.configFiles).toContain('sonar-project.properties');
      expect(result.configFiles).toContain('tsconfig.json');
      expect(result.configFiles).toContain('.eslintrc.json');
      expect(result.configFiles).toContain('jest.config.js');
    });
  });
});
