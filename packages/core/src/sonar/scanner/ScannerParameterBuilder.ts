/**
 * Scanner Parameter Builder
 *
 * Builds language-specific SonarQube scanner parameters (Java/JS/Python/Go/C++,
 * version detection, source/test dirs, Maven/Gradle library resolution).
 * Extracted verbatim from SonarQubeClient: depends only on the project context
 * and the filesystem — no HTTP client, token or project key.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectContext } from '../../universal/project-manager';

const execAsync = promisify(exec);

export class ScannerParameterBuilder {
  constructor(private readonly projectContext?: ProjectContext) {}

  async build(projectPath: string, params: string[]): Promise<string[]> {

    if (!this.projectContext) {
      // Fallback to basic parameters
      params.push(`-Dsonar.sources=${projectPath}`);
      return params;
    }

    const language = this.projectContext.language;
    const buildTool = this.projectContext.buildTool;

    // IMPORTANT: Check JavaScript/TypeScript BEFORE Java
    // because 'javascript' contains 'java' as substring
    if (language.includes('javascript') || language.includes('typescript')) {
      await this.addJavaScriptParameters(params, projectPath);
    }
    // Java-specific parameters
    else if (language.includes('java')) {
      await this.addJavaParameters(params, projectPath, buildTool);
    }
    // C/C++ parameters
    else if (language.includes('c++') || language.includes('cpp') || language.includes('c')) {
      await this.addCCppParameters(params, projectPath);
    }
    // Python parameters
    else if (language.includes('python')) {
      await this.addPythonParameters(params, projectPath);
    }
    // Go parameters
    else if (language.includes('go')) {
      await this.addGoParameters(params, projectPath);
    }
    // Generic parameters
    else {
      params.push(`-Dsonar.sources=${projectPath}`);
    }

    return params;
  }


  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a directory contains Python files (recursively, max 2 levels)
   */
  private async directoryContainsPythonFiles(dirPath: string): Promise<boolean> {
    try {
      await fs.access(dirPath);
    } catch {
      return false; // Directory doesn't exist
    }

    const checkDir = async (dir: string, depth: number): Promise<boolean> => {
      if (depth > 2) return false;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === '__pycache__' ||
              entry.name === 'venv' || entry.name === 'env' || entry.name === 'node_modules') {
            continue;
          }

          if (entry.isFile() && entry.name.endsWith('.py')) {
            return true;
          }

          if (entry.isDirectory()) {
            if (await checkDir(path.join(dir, entry.name), depth + 1)) {
              return true;
            }
          }
        }
      } catch {
        // Ignore errors
      }

      return false;
    };

    return checkDir(dirPath, 0);
  }

  /**
   * Add Java-specific parameters
   */
  private async addJavaParameters(params: string[], projectPath: string, buildTool?: string): Promise<void> {
    // Add source and binary parameters based on build tool
    if (buildTool === 'maven') {
      await this.addMavenJavaParameters(params, projectPath);
    } else if (buildTool === 'gradle') {
      await this.addGradleJavaParameters(params, projectPath);
    } else {
      await this.addGenericJavaParameters(params, projectPath);
    }

    // Add Java version detection from build configuration (pom.xml/build.gradle)
    await this.addJavaVersionParameter(params, projectPath, buildTool);
  }

  /**
   * Add Maven-specific Java parameters
   */
  private async addMavenJavaParameters(params: string[], projectPath: string): Promise<void> {
    params.push('-Dsonar.sources=src/main/java');

    await this.addDirectoryIfExists(
      params,
      projectPath,
      'src/test/java',
      '-Dsonar.tests=src/test/java',
      'Maven test directory'
    );

    await this.addDirectoryIfExists(
      params,
      projectPath,
      'target/classes',
      '-Dsonar.java.binaries=target/classes',
      'Maven target/classes'
    );

    await this.addDirectoryIfExists(
      params,
      projectPath,
      'target/test-classes',
      '-Dsonar.java.test.binaries=target/test-classes',
      'Maven target/test-classes'
    );

    // Add Maven dependencies (libraries)
    await this.addMavenLibraries(params, projectPath);

    // Add JaCoCo coverage report paths if they exist
    await this.addJacocoCoverageParams(params, projectPath);
  }

  /**
   * Add JaCoCo coverage report paths for Maven/Gradle projects
   */
  private async addJacocoCoverageParams(params: string[], projectPath: string): Promise<void> {
    // Common JaCoCo report paths to check
    const jacocoPaths = [
      'target/site/jacoco/jacoco.xml',
      'target/jacoco-report/jacoco.xml',
      'target/jacoco/jacoco.xml',
      'build/reports/jacoco/test/jacocoTestReport.xml',
      'build/jacoco/test.xml'
    ];

    const foundPaths: string[] = [];
    for (const jacocoPath of jacocoPaths) {
      if (await this.fileExists(path.join(projectPath, jacocoPath))) {
        foundPaths.push(jacocoPath);
      }
    }

    if (foundPaths.length > 0) {
      params.push(`-Dsonar.coverage.jacoco.xmlReportPaths=${foundPaths.join(',')}`);
      console.error(`📊 Found JaCoCo reports: ${foundPaths.join(', ')}`);
    }
  }

  /**
   * Add Gradle-specific Java parameters
   */
  private async addGradleJavaParameters(params: string[], projectPath: string): Promise<void> {
    params.push('-Dsonar.sources=src/main/java');

    await this.addDirectoryIfExists(
      params,
      projectPath,
      'src/test/java',
      '-Dsonar.tests=src/test/java',
      'Gradle test directory'
    );

    await this.addDirectoryIfExists(
      params,
      projectPath,
      'build/classes/java/main',
      '-Dsonar.java.binaries=build/classes/java/main',
      'Gradle build/classes'
    );

    await this.addDirectoryIfExists(
      params,
      projectPath,
      'build/classes/java/test',
      '-Dsonar.java.test.binaries=build/classes/java/test',
      'Gradle build test classes'
    );

    // Add Gradle dependencies (libraries)
    await this.addGradleLibraries(params, projectPath);

    // Add JaCoCo coverage report paths if they exist
    await this.addJacocoCoverageParams(params, projectPath);
  }

  /**
   * Add generic Java parameters with auto-detection
   */
  private async addGenericJavaParameters(params: string[], projectPath: string): Promise<void> {
    const javaSources = await this.detectJavaSourceDirs(projectPath);
    const javaTests = await this.detectJavaTestDirs(projectPath);

    if (javaSources.length > 0) {
      params.push(`-Dsonar.sources=${javaSources.join(',')}`);
      console.error(`Detected Java sources: ${javaSources.join(', ')}`);
    } else {
      params.push(`-Dsonar.sources=${projectPath}`);
      console.error('Using project root as Java source');
    }

    if (javaTests.length > 0) {
      params.push(`-Dsonar.tests=${javaTests.join(',')}`);
      console.error(`Detected Java tests: ${javaTests.join(', ')}`);
    }

    params.push('-Dsonar.java.source=8'); // Default Java version
  }

  /**
   * Helper to add directory parameter if it exists
   */
  private async addDirectoryIfExists(
    params: string[],
    projectPath: string,
    relativeDir: string,
    sonarParam: string,
    description: string
  ): Promise<void> {
    const dirPath = path.join(projectPath, relativeDir);
    try {
      await fs.access(dirPath);
      params.push(sonarParam);
      console.error(`${description} found: ${relativeDir}`);
    } catch {
      console.error(`${description} not found: ${relativeDir}`);
    }
  }


  /**
   * Add Java version parameter based on build tool configuration
   * This method provides more accurate version detection than runtime java -version
   */
  private async addJavaVersionParameter(params: string[], projectPath: string, buildTool?: string): Promise<void> {
    let version: string | null = null;

    // Try to detect version from build configuration
    if (buildTool === 'maven') {
      version = await this.detectJavaVersionFromPom(projectPath);
    } else if (buildTool === 'gradle') {
      version = await this.detectJavaVersionFromGradle(projectPath);
    }

    // If detected, add parameter
    if (version) {
      params.push(`-Dsonar.java.source=${version}`);
      console.error(`✅ Detected Java version: ${version}`);
    }
  }

  /**
   * Detect Java version from pom.xml
   * Looks for maven.compiler.source or maven.compiler.target properties
   */
  private async detectJavaVersionFromPom(projectPath: string): Promise<string | null> {
    try {
      const pomPath = path.join(projectPath, 'pom.xml');
      const pomContent = await fs.readFile(pomPath, 'utf-8');

      // Look for maven.compiler.source
      const sourceMatch = /<maven\.compiler\.source>(\d+(?:\.\d+)?)<\/maven\.compiler\.source>/.exec(pomContent);
      if (sourceMatch) {
        return sourceMatch[1];
      }

      // Look for maven.compiler.target as fallback
      const targetMatch = /<maven\.compiler\.target>(\d+(?:\.\d+)?)<\/maven\.compiler\.target>/.exec(pomContent);
      if (targetMatch) {
        return targetMatch[1];
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Detect Java version from build.gradle or build.gradle.kts
   * Looks for sourceCompatibility or targetCompatibility
   */
  private async detectJavaVersionFromGradle(projectPath: string): Promise<string | null> {
    try {
      // Try build.gradle first
      let gradlePath = path.join(projectPath, 'build.gradle');
      let gradleContent: string;

      try {
        gradleContent = await fs.readFile(gradlePath, 'utf-8');
      } catch {
        // Try build.gradle.kts (Kotlin DSL)
        gradlePath = path.join(projectPath, 'build.gradle.kts');
        gradleContent = await fs.readFile(gradlePath, 'utf-8');
      }

      // Look for sourceCompatibility
      const sourceMatch = /sourceCompatibility\s*=\s*['"']?(\d+(?:\.\d+)?)['"']?/.exec(gradleContent);
      if (sourceMatch) {
        return sourceMatch[1];
      }

      // Look for targetCompatibility as fallback
      const targetMatch = /targetCompatibility\s*=\s*['"']?(\d+(?:\.\d+)?)['"']?/.exec(gradleContent);
      if (targetMatch) {
        return targetMatch[1];
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check if Java project is compiled and provide helpful error if not
   */
  async checkJavaCompilation(projectPath: string): Promise<void> {
    if (!this.projectContext || !this.projectContext.language.includes('java')) {
      return; // Not a Java project, skip check
    }

    // Skip check if sonar-project.properties exists (user has custom config)
    const propsFile = path.join(projectPath, 'sonar-project.properties');
    if (await this.fileExists(propsFile)) {
      console.error('📄 sonar-project.properties found, skipping compilation check');
      return;
    }

    const buildTool = this.projectContext.buildTool;
    let compileCommand: string;
    let possibleBinaryDirs: string[];

    // Determine possible compiled classes directories (including multi-module)
    if (buildTool === 'maven') {
      possibleBinaryDirs = [
        path.join(projectPath, 'target', 'classes'),
        // Multi-module: look for any module with target/classes
      ];
      compileCommand = 'mvn compile -q';
    } else if (buildTool === 'gradle') {
      possibleBinaryDirs = [
        path.join(projectPath, 'build', 'classes', 'java', 'main'),
        path.join(projectPath, 'build', 'classes', 'kotlin', 'main'),
        // Multi-module: look for any module with build/classes
      ];
      compileCommand = './gradlew compileJava';
    } else {
      // Unknown build tool, skip check
      return;
    }

    // Check standard locations first
    for (const dir of possibleBinaryDirs) {
      if (await this.fileExists(dir)) {
        return; // Found compiled classes
      }
    }

    // For multi-module projects, search for any compiled classes in subdirectories
    const hasCompiledClasses = await this.findCompiledClassesRecursive(projectPath, buildTool);
    if (hasCompiledClasses) {
      console.error('📦 Found compiled classes in multi-module structure');
      return;
    }

    // No compiled classes found - throw error
    const expectedDir = possibleBinaryDirs[0];
    throw new Error(
      `❌ Java project not compiled\n\n` +
      `SonarQube requires compiled classes to analyze Java projects.\n\n` +
      `📝 Please compile your project first:\n` +
      `   ${compileCommand}\n\n` +
      `💡 This ensures SonarQube can:\n` +
      `   - Analyze bytecode for deeper insights\n` +
      `   - Detect runtime issues and dependencies\n` +
      `   - Provide accurate code coverage metrics\n\n` +
      `Expected directory: ${expectedDir}\n\n` +
      `💡 For multi-module projects, you can also use sonar_generate_config\n` +
      `   to create a custom configuration with correct binary paths.\n\n` +
      `After compiling, run the scan again.`
    );
  }

  /**
   * Recursively search for compiled classes in multi-module projects
   */
  private async findCompiledClassesRecursive(projectPath: string, buildTool?: string): Promise<boolean> {
    const maxDepth = 3;

    const searchDir = async (dir: string, depth: number): Promise<boolean> => {
      if (depth > maxDepth) return false;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;

          const fullPath = path.join(dir, entry.name);

          // Skip common non-module directories
          if (['node_modules', '.git', '.idea', '.vscode', 'src'].includes(entry.name)) {
            continue;
          }

          // Check if this directory contains compiled classes
          if (buildTool === 'maven' && entry.name === 'target') {
            const classesDir = path.join(fullPath, 'classes');
            if (await this.fileExists(classesDir)) {
              return true;
            }
          } else if (buildTool === 'gradle' && entry.name === 'build') {
            const classesDir = path.join(fullPath, 'classes', 'java', 'main');
            const kotlinClassesDir = path.join(fullPath, 'classes', 'kotlin', 'main');
            if (await this.fileExists(classesDir) || await this.fileExists(kotlinClassesDir)) {
              return true;
            }
          }

          // Recurse into subdirectories
          if (await searchDir(fullPath, depth + 1)) {
            return true;
          }
        }
      } catch {
        // Ignore permission errors
      }

      return false;
    };

    return searchDir(projectPath, 0);
  }

  /**
   * Detect Java source directories
   */
  private async detectJavaSourceDirs(projectPath: string): Promise<string[]> {
    const commonSourcePaths = [
      'src/main/java',
      'src/java',
      'src',
      'java',
      'source',
      'sources'
    ];
    
    const existingSources: string[] = [];
    
    for (const srcPath of commonSourcePaths) {
      try {
        const fullPath = path.join(projectPath, srcPath);
        await fs.access(fullPath);
        // Check if it contains .java files
        if (await this.containsJavaFiles(fullPath)) {
          existingSources.push(srcPath);
        }
      } catch {
        // Directory doesn't exist, skip
      }
    }
    
    return existingSources;
  }

  /**
   * Detect Java test directories
   */
  private async detectJavaTestDirs(projectPath: string): Promise<string[]> {
    const commonTestPaths = [
      'src/test/java',
      'test/java',
      'tests/java',
      'src/tests/java',
      'test',
      'tests'
    ];
    
    const existingTests: string[] = [];
    
    for (const testPath of commonTestPaths) {
      try {
        const fullPath = path.join(projectPath, testPath);
        await fs.access(fullPath);
        // Check if it contains .java files
        if (await this.containsJavaFiles(fullPath)) {
          existingTests.push(testPath);
        }
      } catch {
        // Directory doesn't exist, skip
      }
    }
    
    return existingTests;
  }

  /**
   * Check if directory contains Java files
   */
  private async containsJavaFiles(dirPath: string): Promise<boolean> {
    try {
      // Recursively search for .java files without using shell
      const hasJavaFile = async (dir: string): Promise<boolean> => {
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              if (await hasJavaFile(fullPath)) return true;
            } else if (entry.isFile() && entry.name.endsWith('.java')) {
              return true;
            }
          }
          return false;
        } catch {
          return false;
        }
      };
      return await hasJavaFile(dirPath);
    } catch {
      return false;
    }
  }

  /**
   * Add JavaScript/TypeScript-specific parameters
   */
  private async addJavaScriptParameters(params: string[], projectPath: string): Promise<void> {
    console.error('🔍 Configuring JavaScript/TypeScript project...');

    // Check if TypeScript is used
    const hasTsConfig = await this.detectTsConfig(projectPath);
    if (hasTsConfig) {
      console.error('✅ Found tsconfig.json - TypeScript project detected');
      params.push('-Dsonar.typescript.tsconfigPath=tsconfig.json');
    }

    // Determine source directory (prefer src if it exists)
    const srcPath = path.join(projectPath, 'src');
    let sourcesDir = '.';
    try {
      await fs.access(srcPath);
      sourcesDir = 'src';
      console.error('✅ Using src directory as source root');
    } catch {
      console.error('ℹ️  Using project root as source directory');
    }
    params.push(`-Dsonar.sources=${sourcesDir}`);

    // Exclusions - common directories to exclude
    const exclusions = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/*.min.js',
      '**/*.bundle.js'
    ];
    params.push(`-Dsonar.exclusions=${exclusions.join(',')}`);

    // Test file patterns
    const testInclusions = [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/*.test.js',
      '**/*.test.jsx',
      '**/*.spec.js',
      '**/*.spec.jsx'
    ];
    params.push(`-Dsonar.test.inclusions=${testInclusions.join(',')}`);

    // Configure file suffixes
    params.push('-Dsonar.javascript.file.suffixes=.js,.jsx');
    params.push('-Dsonar.typescript.file.suffixes=.ts,.tsx');

    console.error('✅ JavaScript/TypeScript project configured successfully');
  }

  /**
   * Add Python-specific parameters
   */
  private async addPythonParameters(params: string[], projectPath: string): Promise<void> {
    // Python source directories - check common patterns
    // Must contain actual Python files, not just exist
    // Note: '.' is checked last and only used if no specific dirs found
    const specificDirs = ['src', 'app', 'lib'];
    const dirsWithPython: string[] = [];

    for (const dir of specificDirs) {
      const fullPath = path.join(projectPath, dir);
      if (await this.directoryContainsPythonFiles(fullPath)) {
        dirsWithPython.push(dir);
      }
    }

    if (dirsWithPython.length > 0) {
      // Use specific directories that contain Python files
      params.push(`-Dsonar.sources=${dirsWithPython.join(',')}`);
      console.error(`✅ Python sources found in: ${dirsWithPython.join(', ')}`);
    } else if (await this.directoryContainsPythonFiles(projectPath)) {
      // Fallback to project root only if it has Python files and no specific dirs
      params.push(`-Dsonar.sources=.`);
      console.error('✅ Python sources found in project root');
    } else {
      // Last resort
      params.push(`-Dsonar.sources=.`);
      console.error('⚠️ No Python source directories found, using project root');
    }

    // Check if test directory exists
    let testDir: string | null = null;
    const testDirs = ['test', 'tests'];
    for (const dir of testDirs) {
      try {
        await fs.access(path.join(projectPath, dir));
        testDir = dir;
        break;
      } catch {
        // Directory doesn't exist
      }
    }

    // Python exclusions - IMPORTANT: Do NOT exclude test files if we have a test directory
    // SonarQube doesn't allow files to be both in exclusions and in sonar.tests
    const exclusions = [
      '**/__pycache__/**',
      '**/venv/**',
      '**/env/**',
      '**/.venv/**',
      '**/site-packages/**'
    ];

    // Only exclude test files from sources if there's NO separate test directory
    // If there IS a test directory, use sonar.tests instead (which properly separates test code)
    if (!testDir) {
      exclusions.push('**/test_*.py');
      exclusions.push('**/*_test.py');
      console.error('ℹ️  No test directory found - excluding test files from sources');
    }

    params.push(`-Dsonar.exclusions=${exclusions.join(',')}`);

    // Add test directory if found
    if (testDir) {
      params.push(`-Dsonar.tests=${testDir}`);
      // Also add test file patterns for proper test identification
      params.push('-Dsonar.test.inclusions=**/test_*.py,**/*_test.py');
      console.error(`✅ Found test directory: ${testDir}`);
    }

    // Add Python version detection (CRITICAL for accurate analysis)
    await this.addPythonVersionParameter(params, projectPath);
  }

  /**
   * Add Python version parameter
   * Critical for avoiding false positives on version-specific features
   */
  private async addPythonVersionParameter(params: string[], projectPath: string): Promise<void> {
    const versions = await this.detectPythonVersion(projectPath);

    if (versions && versions.length > 0) {
      params.push(`-Dsonar.python.version=${versions.join(',')}`);
      console.error(`✅ Detected Python versions: ${versions.join(', ')}`);
    }
  }

  /**
   * Detect Python version from various sources
   * Priority: pyproject.toml > .python-version > runtime.txt
   */
  private async detectPythonVersion(projectPath: string): Promise<string[] | null> {
    // Try pyproject.toml first (most accurate - can specify multiple versions)
    const pyprojectVersions = await this.detectPythonVersionFromPyproject(projectPath);
    if (pyprojectVersions) {
      return pyprojectVersions;
    }

    // Fallback to .python-version (single version)
    const pythonVersionFile = await this.detectPythonVersionFromPythonVersion(projectPath);
    if (pythonVersionFile) {
      return [pythonVersionFile];
    }

    // Could add runtime.txt for Heroku projects here

    return null;
  }

  /**
   * Detect Python versions from pyproject.toml requires-python
   * Examples: ">=3.8" -> [3.8], ">=3.8,<3.12" -> [3.8, 3.9, 3.10, 3.11]
   */
  private async detectPythonVersionFromPyproject(projectPath: string): Promise<string[] | null> {
    try {
      const pyprojectPath = path.join(projectPath, 'pyproject.toml');
      const content = await fs.readFile(pyprojectPath, 'utf-8');

      // Look for requires-python in [project] or [tool.poetry.dependencies]
      const requiresPythonMatch = /requires-python\s*=\s*["']([^"']+)["']/.exec(content);
      if (!requiresPythonMatch) {
        return null;
      }

      const requiresPython = requiresPythonMatch[1];

      // Parse version constraints
      // Examples: ">=3.8", ">=3.8,<3.12", "^3.8", "~=3.8"
      const minVersionMatch = />=?(\d+)\.(\d+)/.exec(requiresPython);
      const maxVersionMatch = /<(\d+)\.(\d+)/.exec(requiresPython);

      if (!minVersionMatch) {
        return null;
      }

      const minMajor = parseInt(minVersionMatch[1]);
      const minMinor = parseInt(minVersionMatch[2]);

      let maxMajor = minMajor;
      let maxMinor = minMinor + 1; // Default: one minor version up

      if (maxVersionMatch) {
        maxMajor = parseInt(maxVersionMatch[1]);
        maxMinor = parseInt(maxVersionMatch[2]);
      }

      // Generate list of versions (e.g., 3.8, 3.9, 3.10, 3.11)
      const versions: string[] = [];

      for (let major = minMajor; major <= maxMajor; major++) {
        const startMinor = (major === minMajor) ? minMinor : 0;
        const endMinor = (major === maxMajor) ? maxMinor : 100;

        for (let minor = startMinor; minor < endMinor; minor++) {
          if (major >= 3) { // Only Python 3+
            versions.push(`${major}.${minor}`);
          }
        }
      }

      return versions.length > 0 ? versions : null;
    } catch {
      return null;
    }
  }

  /**
   * Detect Python version from .python-version file
   * Used by pyenv and other Python version managers
   */
  private async detectPythonVersionFromPythonVersion(projectPath: string): Promise<string | null> {
    try {
      const pythonVersionPath = path.join(projectPath, '.python-version');
      const content = await fs.readFile(pythonVersionPath, 'utf-8');

      // Extract version (e.g., "3.9.18" -> "3.9")
      const versionMatch = /^(\d+\.\d+)/.exec(content.trim());
      if (versionMatch) {
        return versionMatch[1];
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Add Go-specific parameters
   * Go projects are simpler - they analyze source code directly without compilation
   */
  private async addGoParameters(params: string[], projectPath: string): Promise<void> {
    // Check for go.mod (important for accurate analysis)
    const goModPath = path.join(projectPath, 'go.mod');

    try {
      await fs.access(goModPath);
      console.error('✅ Found go.mod - Go module detected');
    } catch {
      console.warn('⚠️  go.mod not found - analysis may be less accurate');
      console.warn('   Consider initializing a Go module with: go mod init');
    }

    // Source configuration
    // Go convention: analyze current directory
    params.push('-Dsonar.sources=.');

    // Exclude test files from sources and vendor directory
    const exclusions = [
      '**/*_test.go',  // Test files
      '**/vendor/**'   // Vendor dependencies (excluded by default but explicit is better)
    ];
    params.push(`-Dsonar.exclusions=${exclusions.join(',')}`);

    // Test configuration
    params.push('-Dsonar.tests=.');
    params.push('-Dsonar.test.inclusions=**/*_test.go');

    // Check for coverage report (optional)
    const coveragePath = path.join(projectPath, 'coverage.out');
    try {
      await fs.access(coveragePath);
      params.push('-Dsonar.go.coverage.reportPaths=coverage.out');
      console.error('✅ Found coverage.out - test coverage will be included');
    } catch {
      // Coverage is optional - don't log warning
    }

    console.error('✅ Go project configured successfully');
  }

  /**
   * Detect if TypeScript configuration exists
   */
  private async detectTsConfig(projectPath: string): Promise<boolean> {
    try {
      const tsConfigPath = path.join(projectPath, 'tsconfig.json');
      await fs.access(tsConfigPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Detect if compile_commands.json exists (for C/C++ projects)
   */
  private async detectCompileCommands(projectPath: string): Promise<boolean> {
    try {
      const compileCommandsPath = path.join(projectPath, 'compile_commands.json');
      await fs.access(compileCommandsPath);
      return true;
    } catch {
      // Also check in build directory
      try {
        const buildCompileCommandsPath = path.join(projectPath, 'build', 'compile_commands.json');
        await fs.access(buildCompileCommandsPath);
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Add C/C++-specific parameters
   */
  private async addCCppParameters(params: string[], projectPath: string): Promise<void> {
    console.error('🔍 Configuring C/C++ project...');

    // Check for compile_commands.json (important for accurate analysis)
    const hasCompileCommands = await this.detectCompileCommands(projectPath);
    if (hasCompileCommands) {
      // Check if it's in root or build directory
      const rootPath = path.join(projectPath, 'compile_commands.json');
      try {
        await fs.access(rootPath);
        params.push('-Dsonar.cfamily.compile-commands=compile_commands.json');
        console.error('✅ Found compile_commands.json - enabling precise analysis');
      } catch {
        params.push('-Dsonar.cfamily.compile-commands=build/compile_commands.json');
        console.error('✅ Found build/compile_commands.json - enabling precise analysis');
      }
    } else {
      console.warn('⚠️  compile_commands.json not found - analysis may be less accurate');
      console.warn('   For CMake projects: cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=ON');
      console.warn('   For other projects: use Bear (bear -- make)');
    }

    // Determine source directories
    const sourceDirs: string[] = [];
    const potentialSourceDirs = ['src', 'source', 'include', 'inc'];

    for (const dir of potentialSourceDirs) {
      try {
        const dirPath = path.join(projectPath, dir);
        await fs.access(dirPath);
        sourceDirs.push(dir);
      } catch {
        // Directory doesn't exist
      }
    }

    if (sourceDirs.length > 0) {
      params.push(`-Dsonar.sources=${sourceDirs.join(',')}`);
      console.error(`✅ Using source directories: ${sourceDirs.join(', ')}`);
    } else {
      params.push('-Dsonar.sources=.');
      console.error('ℹ️  Using project root as source directory');
    }

    // Exclusions - common directories to exclude
    const exclusions = [
      '**/build/**',
      '**/Build/**',
      '**/cmake-build-*/**',
      '**/third_party/**',
      '**/thirdparty/**',
      '**/vendor/**',
      '**/external/**',
      '**/.git/**',
      '**/node_modules/**'
    ];
    params.push(`-Dsonar.exclusions=${exclusions.join(',')}`);

    // Configure file suffixes for C and C++
    // C file suffixes
    params.push('-Dsonar.c.file.suffixes=.c,.h');

    // C++ file suffixes (more comprehensive list)
    params.push('-Dsonar.cpp.file.suffixes=.cpp,.hpp,.cc,.cxx,.c++,.hh,.hxx,.h++');

    console.error('✅ C/C++ project configured successfully');
  }

  /**
   * Add Maven libraries (dependencies) to scanner parameters
   * Uses Maven's dependency:build-classpath to get all runtime dependencies
   */
  private async addMavenLibraries(params: string[], projectPath: string): Promise<void> {
    try {
      console.error('🔍 Resolving Maven dependencies...');

      // Use Maven to get the full classpath with all dependencies
      // Note: Do NOT use -q flag as it suppresses classpath output
      const { stdout } = await execAsync(
        'mvn dependency:build-classpath -DincludeScope=compile',
        {
          cwd: projectPath,
          timeout: 60000, // 1 minute timeout
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        }
      );

      // Parse the classpath output
      // Maven outputs the classpath mixed with [INFO] lines and download progress
      // We need to filter out Maven's logging and extract only the classpath
      //
      // IMPORTANT: When dependencies are downloaded for the first time, Maven outputs
      // progress messages like "Downloading from central: ...", "Downloaded from central: ...",
      // "Progress (1),...", etc. These must be filtered out or they corrupt the classpath.
      const lines = stdout.split('\n');
      const classpathLines = lines.filter(line => {
        const trimmed = line.trim();
        if (trimmed.length === 0) return false;

        // Filter out Maven log lines
        if (trimmed.includes('[INFO]')) return false;
        if (trimmed.includes('[WARNING]')) return false;
        if (trimmed.includes('[ERROR]')) return false;

        // Filter out Maven download progress messages (critical for first-time dependency downloads)
        if (trimmed.startsWith('Downloading from ')) return false;
        if (trimmed.startsWith('Downloaded from ')) return false;
        if (trimmed.startsWith('Progress ')) return false;
        if (trimmed.includes('Downloading from ')) return false;
        if (trimmed.includes('Downloaded from ')) return false;

        // Filter out lines with URL patterns (http://, https://, repo.maven.apache.org)
        if (trimmed.includes('://')) return false;
        if (trimmed.includes('repo.maven.apache.org')) return false;
        if (trimmed.includes('central:')) return false;

        // Filter out lines with download speed/progress indicators
        if (/\d+\s*(kB|MB|B)\s*(at|\/s)/i.test(trimmed)) return false;
        if (/\(\d+\s*(kB|MB|B)\s*(at|\/s)/i.test(trimmed)) return false;

        // Classpath must contain valid file paths with /
        if (!trimmed.includes('/')) return false;

        // Valid classpath lines should start with a path (absolute path starting with /)
        // or be a continuation of paths separated by : (Unix) or ; (Windows)
        // Check that the line looks like valid file paths
        const pathParts = trimmed.split(/[:;]/);
        const hasValidPaths = pathParts.some(part => {
          const p = part.trim();
          // Valid path should start with / (Unix) or drive letter (Windows)
          // and should end with .jar or be a directory
          return (p.startsWith('/') || /^[A-Za-z]:/.test(p)) &&
                 (p.endsWith('.jar') || p.includes('.m2/repository') || p.includes('target/'));
        });

        return hasValidPaths;
      });

      if (classpathLines.length === 0) {
        console.error('⚠️  No Maven dependencies found in classpath output');
        console.error(`   Maven stdout had ${lines.length} lines, none matched classpath pattern`);
        return;
      }

      // Join all classpath lines and split by path separator (: on Unix, ; on Windows)
      const separator = path.delimiter; // Platform-specific
      const classpath = classpathLines.join('');
      const libraryPaths = classpath
        .split(separator)
        .filter(p => p.trim().length > 0 && p.includes('.jar'));

      if (libraryPaths.length === 0) {
        console.error('⚠️  No Maven libraries found after parsing classpath');
        return;
      }

      // Join all libraries with comma (SonarQube format)
      const libraries = libraryPaths.join(',');
      params.push(`-Dsonar.java.libraries=${libraries}`);

      console.error(`✅ Added ${libraryPaths.length} Maven libraries to SonarQube analysis`);
      console.error(`   Example libraries: ${libraryPaths.slice(0, 3).join(', ')}${libraryPaths.length > 3 ? '...' : ''}`);
    } catch (error: any) {
      // Don't fail the entire analysis if we can't get dependencies
      console.error(`⚠️  Could not resolve Maven dependencies: ${error.message}`);
      console.error('   Analysis will continue without library classpath');
      console.error('   This may result in less accurate analysis results');

      // Check for common issues
      if (error.message.includes('mvn: not found') || error.message.includes('command not found')) {
        console.error('   💡 Tip: Ensure Maven is installed and in PATH');
      } else if (error.message.includes('timeout')) {
        console.error('   💡 Tip: Dependency resolution took too long - consider running "mvn dependency:resolve" first');
      } else if (error.message.includes('pom.xml')) {
        console.error('   💡 Tip: Ensure pom.xml is valid and all dependencies are available');
      }
    }
  }

  /**
   * Add Gradle libraries (dependencies) to scanner parameters
   * Uses Gradle's dependencies task to get all runtime dependencies
   */
  private async addGradleLibraries(params: string[], projectPath: string): Promise<void> {
    try {
      console.error('🔍 Resolving Gradle dependencies...');

      // Determine Gradle wrapper or command
      const gradleCmd = await this.getGradleCommand(projectPath);

      // Use a custom Gradle task to print classpath
      // We'll create a temporary task that prints the runtime classpath
      const { stderr } = await execAsync(
        `${gradleCmd} dependencies --configuration compileClasspath -q`,
        {
          cwd: projectPath,
          timeout: 60000, // 1 minute timeout
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        }
      );

      if (stderr && stderr.length > 0) {
        console.error(`Gradle dependency resolution warnings: ${stderr.substring(0, 500)}`);
      }

      // Parse Gradle dependencies output to find JAR files
      // This is a best-effort approach - we'll look for .jar references
      const jarFiles = await this.findGradleDependencyJars(projectPath);

      if (jarFiles.length === 0) {
        console.error('⚠️  No Gradle libraries found');
        return;
      }

      // Join all libraries with comma (SonarQube format)
      const libraries = jarFiles.join(',');
      params.push(`-Dsonar.java.libraries=${libraries}`);

      console.error(`✅ Added ${jarFiles.length} Gradle libraries to SonarQube analysis`);
      console.error(`   Example libraries: ${jarFiles.slice(0, 3).join(', ')}${jarFiles.length > 3 ? '...' : ''}`);
    } catch (error: any) {
      // Don't fail the entire analysis if we can't get dependencies
      console.error(`⚠️  Could not resolve Gradle dependencies: ${error.message}`);
      console.error('   Analysis will continue without library classpath');
      console.error('   This may result in less accurate analysis results');

      // Check for common issues
      if (error.message.includes('gradle: not found') || error.message.includes('command not found')) {
        console.error('   💡 Tip: Ensure Gradle wrapper (gradlew) exists or Gradle is installed');
      } else if (error.message.includes('timeout')) {
        console.error('   💡 Tip: Dependency resolution took too long - consider running "gradle dependencies" first');
      }
    }
  }

  /**
   * Get the appropriate Gradle command (wrapper or system gradle)
   */
  private async getGradleCommand(projectPath: string): Promise<string> {
    // Check for Gradle wrapper (preferred)
    const wrapperUnix = path.join(projectPath, 'gradlew');
    const wrapperWindows = path.join(projectPath, 'gradlew.bat');

    try {
      await fs.access(wrapperUnix, fs.constants.X_OK);
      return './gradlew';
    } catch {
      // Try Windows wrapper
      try {
        await fs.access(wrapperWindows);
        return 'gradlew.bat';
      } catch {
        // Fall back to system gradle
        return 'gradle';
      }
    }
  }

  /**
   * Find Gradle dependency JARs from the cache
   * This looks in the Gradle cache directory for resolved dependencies
   */
  private async findGradleDependencyJars(projectPath: string): Promise<string[]> {
    const jarFiles: string[] = [];

    try {
      // Common Gradle cache locations
      const userHome = process.env.HOME || process.env.USERPROFILE || '';
      const gradleCachePath = path.join(userHome, '.gradle', 'caches', 'modules-2', 'files-2.1');

      // Try to read build.gradle or build.gradle.kts to understand dependencies
      // For now, we'll scan the cache directory for recent JARs
      // This is a simplified approach - a full implementation would parse build files

      try {
        await fs.access(gradleCachePath);
        // Recursively find all .jar files in cache (limited depth to avoid performance issues)
        const jars = await this.findJarFilesInDirectory(gradleCachePath, 3);
        jarFiles.push(...jars);
      } catch {
        console.error('   ℹ️  Gradle cache not accessible, trying alternative approach');
      }

    } catch (error: any) {
      console.error(`   Could not scan Gradle cache: ${error.message}`);
    }

    return jarFiles;
  }

  /**
   * Recursively find JAR files in a directory (with depth limit)
   */
  private async findJarFilesInDirectory(dir: string, maxDepth: number): Promise<string[]> {
    if (maxDepth <= 0) return [];

    const jarFiles: string[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries.slice(0, 100)) { // Limit entries per directory
        const fullPath = path.join(dir, entry.name);

        if (entry.isFile() && entry.name.endsWith('.jar')) {
          jarFiles.push(fullPath);
        } else if (entry.isDirectory() && maxDepth > 1) {
          const subJars = await this.findJarFilesInDirectory(fullPath, maxDepth - 1);
          jarFiles.push(...subJars);

          // Limit total JARs to avoid performance issues
          if (jarFiles.length > 500) break;
        }
      }
    } catch (error) {
      // Ignore errors for individual directories
    }

    return jarFiles;
  }
}
