/**
 * PythonAnalyzer - Analyzer for Python projects
 * Detects Python-specific properties for SonarQube scanning
 */

import * as path from 'path';
import { BaseAnalyzer } from './BaseAnalyzer.js';
import { DetectedProperty, ValidationWarning, ModuleInfo } from '../../../../shared/types/index.js';

export class PythonAnalyzer extends BaseAnalyzer {
  readonly language = 'python';

  getCriticalProperties(): string[] {
    return ['sonar.sources'];
  }

  getRecommendedProperties(): string[] {
    return [
      'sonar.python.version',
      'sonar.tests',
      'sonar.python.coverage.reportPaths',
      'sonar.exclusions'
    ];
  }

  protected async detectLanguage(projectPath: string): Promise<boolean> {
    // Check for Python project files
    const pythonFiles = [
      'pyproject.toml',
      'setup.py',
      'setup.cfg',
      'requirements.txt',
      'Pipfile',
      'poetry.lock'
    ];

    for (const file of pythonFiles) {
      if (await this.fileExists(path.join(projectPath, file))) {
        return true;
      }
    }

    return false;
  }

  protected async analyzeLanguage(projectPath: string): Promise<{
    properties: DetectedProperty[];
    warnings: ValidationWarning[];
    version?: string;
    buildTool?: string;
    modules?: ModuleInfo[];
  }> {
    const properties: DetectedProperty[] = [];
    const warnings: ValidationWarning[] = [];
    let version: string | undefined;
    let buildTool: string | undefined;

    // Detect package manager / build tool
    if (await this.fileExists(path.join(projectPath, 'pyproject.toml'))) {
      const content = await this.readFile(path.join(projectPath, 'pyproject.toml'));
      if (content?.includes('[tool.poetry]')) {
        buildTool = 'poetry';
      } else {
        buildTool = 'pyproject';
      }

      // Extract Python version from pyproject.toml
      version = this.extractPythonVersionFromPyproject(content);
    } else if (await this.fileExists(path.join(projectPath, 'Pipfile'))) {
      buildTool = 'pipenv';
    } else if (await this.fileExists(path.join(projectPath, 'setup.py'))) {
      buildTool = 'setuptools';
    } else if (await this.fileExists(path.join(projectPath, 'requirements.txt'))) {
      buildTool = 'pip';
    }

    // Try .python-version file
    if (!version) {
      const pythonVersionFile = await this.readFile(path.join(projectPath, '.python-version'));
      if (pythonVersionFile) {
        version = pythonVersionFile.trim().split('\n')[0];
      }
    }

    // Add Python version property
    if (version) {
      properties.push(this.createProperty(
        'sonar.python.version',
        version,
        'high',
        'detected from project configuration'
      ));
    }

    // Detect source directories
    const sourceDirs = await this.detectSourceDirectories(projectPath);
    if (sourceDirs.length > 0) {
      properties.push(this.createProperty(
        'sonar.sources',
        sourceDirs.join(','),
        'high',
        'detected Python source directories'
      ));
    } else {
      // Default to current directory
      properties.push(this.createProperty(
        'sonar.sources',
        '.',
        'low',
        'defaulting to project root'
      ));
      warnings.push(this.createWarning(
        'PYTHON-WARN-001',
        'info',
        'No standard Python source directory found (src/, lib/)',
        'Consider organizing code in a src/ directory'
      ));
    }

    // Detect test directories
    const testDirs = await this.detectTestDirectories(projectPath);
    if (testDirs.length > 0) {
      properties.push(this.createProperty(
        'sonar.tests',
        testDirs.join(','),
        'high',
        'detected Python test directories'
      ));
    }

    // Detect coverage reports
    const coverageProps = await this.detectCoverageReports(projectPath);
    properties.push(...coverageProps);

    // Add standard exclusions
    properties.push(this.createProperty(
      'sonar.exclusions',
      '**/__pycache__/**,**/venv/**,**/.venv/**,**/env/**,**/*.pyc',
      'medium',
      'standard Python exclusions'
    ));

    return { properties, warnings, version, buildTool };
  }

  private extractPythonVersionFromPyproject(content: string | null): string | undefined {
    if (!content) return undefined;

    // Try requires-python
    const requiresMatch = /requires-python\s*=\s*["']([^"']+)["']/.exec(content);
    if (requiresMatch) {
      // Extract minimum version from constraint (e.g., ">=3.8" -> "3.8")
      const constraint = requiresMatch[1];
      const versionMatch = /(\d+\.\d+)/.exec(constraint);
      if (versionMatch) {
        return versionMatch[1];
      }
    }

    // Try python in tool.poetry.dependencies
    const poetryMatch = /python\s*=\s*["'][\^~]?(\d+\.\d+)/.exec(content);
    if (poetryMatch) {
      return poetryMatch[1];
    }

    return undefined;
  }

  private async detectSourceDirectories(projectPath: string): Promise<string[]> {
    const dirs: string[] = [];
    const candidates = ['src', 'lib', 'app'];

    for (const dir of candidates) {
      const dirPath = path.join(projectPath, dir);
      if (await this.fileExists(dirPath)) {
        dirs.push(dir);
      }
    }

    return dirs;
  }

  private async detectTestDirectories(projectPath: string): Promise<string[]> {
    const dirs: string[] = [];
    const candidates = ['tests', 'test', 'spec'];

    for (const dir of candidates) {
      const dirPath = path.join(projectPath, dir);
      if (await this.fileExists(dirPath)) {
        dirs.push(dir);
      }
    }

    return dirs;
  }

  private async detectCoverageReports(projectPath: string): Promise<DetectedProperty[]> {
    const properties: DetectedProperty[] = [];

    // Check for coverage.xml (pytest-cov standard output)
    if (await this.fileExists(path.join(projectPath, 'coverage.xml'))) {
      properties.push(this.createProperty(
        'sonar.python.coverage.reportPaths',
        'coverage.xml',
        'high',
        'detected coverage.xml report'
      ));
      return properties;
    }

    // Check for htmlcov/coverage.xml
    if (await this.fileExists(path.join(projectPath, 'htmlcov', 'coverage.xml'))) {
      properties.push(this.createProperty(
        'sonar.python.coverage.reportPaths',
        'htmlcov/coverage.xml',
        'high',
        'detected coverage report in htmlcov/'
      ));
      return properties;
    }

    // Check for .coverage file (coverage.py raw data)
    if (await this.fileExists(path.join(projectPath, '.coverage'))) {
      properties.push(this.createProperty(
        'sonar.python.coverage.reportPaths',
        'coverage.xml',
        'low',
        '.coverage found - run "coverage xml" to generate XML report'
      ));
    }

    return properties;
  }
}
