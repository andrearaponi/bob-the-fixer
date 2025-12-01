/**
 * ProjectStructureAnalyzer
 * Deep analysis of project structure for intelligent configuration generation
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectStructure, ModuleInfo, LanguageInfo } from '../../../shared/types/index.js';

interface BuildFileInfo {
  file: string;
  type: 'maven' | 'gradle' | 'npm' | 'dotnet' | 'cargo' | 'go' | 'python';
  language: string[];
}

const BUILD_FILES: BuildFileInfo[] = [
  { file: 'pom.xml', type: 'maven', language: ['java'] },
  { file: 'build.gradle', type: 'gradle', language: ['java', 'kotlin'] },
  { file: 'build.gradle.kts', type: 'gradle', language: ['kotlin', 'java'] },
  { file: 'package.json', type: 'npm', language: ['javascript', 'typescript'] },
  { file: '*.csproj', type: 'dotnet', language: ['csharp'] },
  { file: '*.sln', type: 'dotnet', language: ['csharp'] },
  { file: 'Cargo.toml', type: 'cargo', language: ['rust'] },
  { file: 'go.mod', type: 'go', language: ['go'] },
  { file: 'pyproject.toml', type: 'python', language: ['python'] },
  { file: 'requirements.txt', type: 'python', language: ['python'] },
  { file: 'setup.py', type: 'python', language: ['python'] }
];

const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  java: ['.java'],
  kotlin: ['.kt', '.kts'],
  javascript: ['.js', '.jsx', '.mjs'],
  typescript: ['.ts', '.tsx'],
  python: ['.py'],
  go: ['.go'],
  rust: ['.rs'],
  csharp: ['.cs'],
  cpp: ['.cpp', '.cc', '.cxx', '.c', '.h', '.hpp']
};

const DEFAULT_EXCLUSIONS = [
  '**/node_modules/**',
  '**/target/**',
  '**/build/**',
  '**/dist/**',
  '**/out/**',
  '**/bin/**',
  '**/obj/**',
  '**/.git/**',
  '**/.idea/**',
  '**/.vscode/**',
  '**/vendor/**',
  '**/__pycache__/**',
  '**/*.min.js',
  '**/*.min.css'
];

const SOURCE_PATTERNS: Record<string, { sources: string[]; tests: string[]; binaries?: string[] }> = {
  maven: {
    sources: ['src/main/java', 'src/main/kotlin', 'src/main/scala'],
    tests: ['src/test/java', 'src/test/kotlin', 'src/test/scala'],
    binaries: ['target/classes']
  },
  gradle: {
    sources: ['src/main/java', 'src/main/kotlin', 'src/main/groovy'],
    tests: ['src/test/java', 'src/test/kotlin', 'src/test/groovy'],
    binaries: ['build/classes/java/main', 'build/classes/kotlin/main']
  },
  npm: {
    sources: ['src', 'lib', 'app'],
    tests: ['test', 'tests', '__tests__', 'spec']
  },
  dotnet: {
    sources: ['.'],
    tests: ['Tests', 'Test', '*.Tests'],
    binaries: ['bin/Debug', 'bin/Release']
  },
  cargo: {
    sources: ['src'],
    tests: ['tests']
  },
  go: {
    sources: ['.'],
    tests: ['.']
  },
  python: {
    sources: ['src', '.'],
    tests: ['tests', 'test']
  }
};

export class ProjectStructureAnalyzer {
  private readonly maxDepth = 5;
  private readonly maxTreeLines = 100;

  /**
   * Analyze project structure
   */
  async analyze(projectPath: string): Promise<ProjectStructure> {
    const absolutePath = path.resolve(projectPath);

    // Find all build files
    const buildFiles = await this.findBuildFiles(absolutePath);

    // Detect modules
    const modules = await this.detectModules(absolutePath, buildFiles);

    // Determine project type
    const projectType = modules.length > 1 ? 'multi-module' : 'single';

    // Analyze languages
    const detectedLanguages = await this.analyzeLanguages(absolutePath);

    // Find config files
    const configFiles = await this.findConfigFiles(absolutePath);

    // Generate directory tree
    const directoryTree = await this.generateDirectoryTree(absolutePath);

    // Calculate global exclusions
    const globalExclusions = this.calculateExclusions(absolutePath);

    return {
      rootPath: absolutePath,
      projectType,
      modules,
      globalExclusions,
      detectedLanguages,
      directoryTree,
      buildFiles: buildFiles.map(bf => bf.relativePath),
      configFiles
    };
  }

  /**
   * Find all build files in project
   */
  private async findBuildFiles(projectPath: string): Promise<Array<{ file: string; relativePath: string; type: string }>> {
    const found: Array<{ file: string; relativePath: string; type: string }> = [];

    const scanDir = async (dir: string, depth: number = 0) => {
      if (depth > this.maxDepth) return;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(projectPath, fullPath);

          // Skip excluded directories
          if (entry.isDirectory()) {
            if (this.shouldSkipDirectory(entry.name)) continue;
            await scanDir(fullPath, depth + 1);
          } else {
            // Check if it's a build file
            for (const buildFile of BUILD_FILES) {
              if (this.matchBuildFile(entry.name, buildFile.file)) {
                found.push({
                  file: entry.name,
                  relativePath,
                  type: buildFile.type
                });
              }
            }
          }
        }
      } catch {
        // Ignore permission errors
      }
    };

    await scanDir(projectPath);
    return found;
  }

  /**
   * Detect modules in multi-module project
   */
  private async detectModules(
    projectPath: string,
    buildFiles: Array<{ file: string; relativePath: string; type: string }>
  ): Promise<ModuleInfo[]> {
    const modules: ModuleInfo[] = [];

    // Group build files by directory
    const buildFilesByDir = new Map<string, typeof buildFiles[0]>();
    for (const bf of buildFiles) {
      const dir = path.dirname(bf.relativePath);
      if (!buildFilesByDir.has(dir)) {
        buildFilesByDir.set(dir, bf);
      }
    }

    for (const [dir, buildFile] of buildFilesByDir) {
      const modulePath = path.join(projectPath, dir);
      const patterns = SOURCE_PATTERNS[buildFile.type] || SOURCE_PATTERNS.npm;

      // Find actual source directories
      const sourcesDirs = await this.findExistingPaths(modulePath, patterns.sources);
      const testsDirs = await this.findExistingPaths(modulePath, patterns.tests);
      const binaryDirs = patterns.binaries
        ? await this.findExistingPaths(modulePath, patterns.binaries)
        : undefined;

      // Determine language from build file type
      const buildFileInfo = BUILD_FILES.find(bf => this.matchBuildFile(buildFile.file, bf.file));
      const language = buildFileInfo?.language || [];

      modules.push({
        name: dir === '.' ? path.basename(projectPath) : path.basename(dir),
        relativePath: dir === '.' ? '.' : dir,
        language,
        sourcesDirs: sourcesDirs.length > 0 ? sourcesDirs : ['src'],
        testsDirs,
        binaryDirs,
        buildFile: buildFile.file,
        buildTool: buildFile.type
      });
    }

    // If no modules found, create a default one
    if (modules.length === 0) {
      modules.push({
        name: path.basename(projectPath),
        relativePath: '.',
        language: [],
        sourcesDirs: ['src'],
        testsDirs: ['test', 'tests']
      });
    }

    return modules;
  }

  /**
   * Analyze languages in project
   */
  private async analyzeLanguages(projectPath: string): Promise<LanguageInfo[]> {
    const languageCounts: Record<string, { count: number; extensions: Set<string> }> = {};
    let totalFiles = 0;

    const scanDir = async (dir: string, depth: number = 0) => {
      if (depth > this.maxDepth) return;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (this.shouldSkipDirectory(entry.name)) continue;
            await scanDir(path.join(dir, entry.name), depth + 1);
          } else {
            const ext = path.extname(entry.name).toLowerCase();
            for (const [lang, extensions] of Object.entries(LANGUAGE_EXTENSIONS)) {
              if (extensions.includes(ext)) {
                if (!languageCounts[lang]) {
                  languageCounts[lang] = { count: 0, extensions: new Set() };
                }
                languageCounts[lang].count++;
                languageCounts[lang].extensions.add(ext);
                totalFiles++;
              }
            }
          }
        }
      } catch {
        // Ignore permission errors
      }
    };

    await scanDir(projectPath);

    return Object.entries(languageCounts)
      .map(([name, { count, extensions }]) => ({
        name,
        filesCount: count,
        percentage: totalFiles > 0 ? Math.round((count / totalFiles) * 100) : 0,
        extensions: Array.from(extensions)
      }))
      .sort((a, b) => b.filesCount - a.filesCount);
  }

  /**
   * Find configuration files
   */
  private async findConfigFiles(projectPath: string): Promise<string[]> {
    const configPatterns = [
      'sonar-project.properties',
      'tsconfig.json',
      'jsconfig.json',
      '.eslintrc*',
      '.prettierrc*',
      'pytest.ini',
      'phpunit.xml',
      'jest.config.*'
    ];

    const found: string[] = [];

    try {
      const entries = await fs.readdir(projectPath);
      for (const entry of entries) {
        for (const pattern of configPatterns) {
          if (this.matchPattern(entry, pattern)) {
            found.push(entry);
          }
        }
      }
    } catch {
      // Ignore errors
    }

    return found;
  }

  /**
   * Generate ASCII directory tree for LLM context
   */
  private async generateDirectoryTree(projectPath: string): Promise<string> {
    const lines: string[] = [];
    const projectName = path.basename(projectPath);
    lines.push(`${projectName}/`);

    const generateTree = async (dir: string, prefix: string = '', depth: number = 0) => {
      if (depth > 3 || lines.length > this.maxTreeLines) return;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const filtered = entries.filter(e => !this.shouldSkipDirectory(e.name));

        // Sort: directories first, then files
        filtered.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

        for (let i = 0; i < filtered.length && lines.length < this.maxTreeLines; i++) {
          const entry = filtered[i];
          const isLast = i === filtered.length - 1;
          const connector = isLast ? '└── ' : '├── ';
          const childPrefix = isLast ? '    ' : '│   ';

          if (entry.isDirectory()) {
            lines.push(`${prefix}${connector}${entry.name}/`);
            await generateTree(path.join(dir, entry.name), prefix + childPrefix, depth + 1);
          } else {
            // Only show important files
            if (this.isImportantFile(entry.name)) {
              lines.push(`${prefix}${connector}${entry.name}`);
            }
          }
        }
      } catch {
        // Ignore errors
      }
    };

    await generateTree(projectPath);

    if (lines.length >= this.maxTreeLines) {
      lines.push('... (truncated)');
    }

    return lines.join('\n');
  }

  /**
   * Calculate appropriate exclusions
   */
  private calculateExclusions(projectPath: string): string[] {
    return [...DEFAULT_EXCLUSIONS];
  }

  /**
   * Check if directory should be skipped
   */
  private shouldSkipDirectory(name: string): boolean {
    const skipDirs = [
      'node_modules', 'target', 'build', 'dist', 'out', 'bin', 'obj',
      '.git', '.svn', '.hg', '.idea', '.vscode', 'vendor', '__pycache__',
      '.gradle', '.m2', 'coverage', '.next', '.nuxt'
    ];
    return skipDirs.includes(name) || name.startsWith('.');
  }

  /**
   * Check if file is important for tree display
   */
  private isImportantFile(name: string): boolean {
    const importantFiles = [
      'pom.xml', 'build.gradle', 'build.gradle.kts', 'package.json',
      'tsconfig.json', 'go.mod', 'Cargo.toml', 'requirements.txt',
      'pyproject.toml', 'setup.py', 'sonar-project.properties',
      'bobthefixer.env', '.gitignore', 'README.md'
    ];
    return importantFiles.includes(name) || name.endsWith('.csproj') || name.endsWith('.sln');
  }

  /**
   * Match build file pattern
   */
  private matchBuildFile(filename: string, pattern: string): boolean {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace('.', '\\.').replace('*', '.*') + '$');
      return regex.test(filename);
    }
    return filename === pattern;
  }

  /**
   * Match general file pattern
   */
  private matchPattern(filename: string, pattern: string): boolean {
    if (pattern.endsWith('*')) {
      return filename.startsWith(pattern.slice(0, -1));
    }
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace('.', '\\.').replace('*', '.*') + '$');
      return regex.test(filename);
    }
    return filename === pattern;
  }

  /**
   * Find existing paths from list of candidates
   */
  private async findExistingPaths(basePath: string, candidates: string[]): Promise<string[]> {
    const existing: string[] = [];
    for (const candidate of candidates) {
      try {
        const fullPath = path.join(basePath, candidate);
        await fs.access(fullPath);
        existing.push(candidate);
      } catch {
        // Path doesn't exist
      }
    }
    return existing;
  }
}
