/**
 * BaseAnalyzer - Abstract base class for language analyzers
 * Provides common functionality for detecting and analyzing language-specific properties
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  ILanguageAnalyzer,
  LanguageAnalysisResult,
  DetectedProperty,
  ValidationWarning,
  ModuleInfo
} from '../../../../shared/types/index.js';

/**
 * Abstract base class that all language analyzers must extend
 */
export abstract class BaseAnalyzer implements ILanguageAnalyzer {
  /**
   * Language name this analyzer handles (e.g., 'java', 'python')
   */
  abstract readonly language: string;

  /**
   * Get the list of critical properties for this language
   */
  abstract getCriticalProperties(): string[];

  /**
   * Get the list of recommended properties for this language
   */
  abstract getRecommendedProperties(): string[];

  /**
   * Language-specific detection logic
   * @param projectPath - Path to the project root
   * @returns True if the language is detected
   */
  protected abstract detectLanguage(projectPath: string): Promise<boolean>;

  /**
   * Language-specific analysis logic
   * @param projectPath - Path to the project root
   * @returns Detected properties and warnings
   */
  protected abstract analyzeLanguage(projectPath: string): Promise<{
    properties: DetectedProperty[];
    warnings: ValidationWarning[];
    version?: string;
    buildTool?: string;
    modules?: ModuleInfo[];
  }>;

  /**
   * Detect if this language is present in the project
   */
  async detect(projectPath: string): Promise<boolean> {
    try {
      return await this.detectLanguage(projectPath);
    } catch {
      return false;
    }
  }

  /**
   * Analyze the project for this language
   */
  async analyze(projectPath: string): Promise<LanguageAnalysisResult> {
    const detected = await this.detect(projectPath);

    if (!detected) {
      return {
        detected: false,
        language: this.language,
        modules: [],
        properties: [],
        warnings: []
      };
    }

    try {
      const analysis = await this.analyzeLanguage(projectPath);

      return {
        detected: true,
        language: this.language,
        version: analysis.version,
        buildTool: analysis.buildTool,
        modules: analysis.modules ?? [],
        properties: analysis.properties,
        warnings: analysis.warnings
      };
    } catch (error: any) {
      return {
        detected: true,
        language: this.language,
        modules: [],
        properties: [],
        warnings: [{
          code: `${this.language.toUpperCase()}-ERR-001`,
          severity: 'warning',
          message: `Error analyzing ${this.language} project: ${error.message}`,
          suggestion: 'Check project structure and try again'
        }]
      };
    }
  }

  // ============ Helper Methods ============

  /**
   * Check if a file or directory exists
   */
  protected async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read file contents as string
   */
  protected async readFile(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Read and parse JSON file
   */
  protected async readJsonFile<T>(filePath: string): Promise<T | null> {
    const content = await this.readFile(filePath);
    if (!content) return null;

    try {
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  /**
   * Find files matching a pattern in a directory
   * @param dirPath - Directory to search
   * @param pattern - Glob-like pattern (supports * and **)
   * @param maxDepth - Maximum directory depth to search
   */
  protected async findFiles(
    dirPath: string,
    pattern: string,
    maxDepth: number = 3
  ): Promise<string[]> {
    const results: string[] = [];
    await this.findFilesRecursive(dirPath, pattern, maxDepth, 0, results);
    return results;
  }

  private async findFilesRecursive(
    dirPath: string,
    pattern: string,
    maxDepth: number,
    currentDepth: number,
    results: string[]
  ): Promise<void> {
    if (currentDepth > maxDepth) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isFile() && this.matchesPattern(entry.name, pattern)) {
          results.push(fullPath);
        } else if (entry.isDirectory() && !this.isExcludedDir(entry.name)) {
          await this.findFilesRecursive(fullPath, pattern, maxDepth, currentDepth + 1, results);
        }
      }
    } catch {
      // Ignore errors (permission denied, etc.)
    }
  }

  /**
   * Simple pattern matching (supports * wildcard)
   */
  private matchesPattern(filename: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`).test(filename);
  }

  /**
   * Check if directory should be excluded from search
   */
  private isExcludedDir(dirName: string): boolean {
    const excluded = [
      'node_modules',
      '.git',
      '.svn',
      'target',
      'build',
      'dist',
      'out',
      '__pycache__',
      '.venv',
      'venv',
      '.idea',
      '.vscode',
      'vendor'
    ];
    return excluded.includes(dirName) || dirName.startsWith('.');
  }

  /**
   * Find directories matching a name
   */
  protected async findDirectories(
    dirPath: string,
    dirName: string,
    maxDepth: number = 3
  ): Promise<string[]> {
    const results: string[] = [];
    await this.findDirsRecursive(dirPath, dirName, maxDepth, 0, results);
    return results;
  }

  private async findDirsRecursive(
    dirPath: string,
    targetName: string,
    maxDepth: number,
    currentDepth: number,
    results: string[]
  ): Promise<void> {
    if (currentDepth > maxDepth) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (this.isExcludedDir(entry.name)) continue;

        const fullPath = path.join(dirPath, entry.name);

        if (entry.name === targetName) {
          results.push(fullPath);
        }

        await this.findDirsRecursive(fullPath, targetName, maxDepth, currentDepth + 1, results);
      }
    } catch {
      // Ignore errors
    }
  }

  /**
   * Execute a command and return output (with timeout)
   */
  protected async execCommand(
    command: string,
    cwd: string,
    timeoutMs: number = 30000
  ): Promise<{ stdout: string; stderr: string } | null> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const result = await execAsync(command, {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024 // 10MB
      });
      return result;
    } catch {
      return null;
    }
  }

  /**
   * Create a detected property with standard structure
   */
  protected createProperty(
    key: string,
    value: string,
    confidence: 'high' | 'medium' | 'low',
    source: string
  ): DetectedProperty {
    return { key, value, confidence, source };
  }

  /**
   * Create a validation warning with standard structure
   */
  protected createWarning(
    code: string,
    severity: 'error' | 'warning' | 'info',
    message: string,
    suggestion?: string
  ): ValidationWarning {
    return { code, severity, message, suggestion };
  }
}
