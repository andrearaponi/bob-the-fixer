/**
 * JsAnalyzer - Analyzer for JavaScript/TypeScript projects
 * Detects JS/TS-specific properties for SonarQube scanning
 */

import * as path from 'path';
import { BaseAnalyzer } from './BaseAnalyzer.js';
import { DetectedProperty, ValidationWarning, ModuleInfo } from '../../../../shared/types/index.js';

export class JsAnalyzer extends BaseAnalyzer {
  readonly language = 'javascript';

  getCriticalProperties(): string[] {
    return ['sonar.sources'];
  }

  getRecommendedProperties(): string[] {
    return [
      'sonar.tests',
      'sonar.javascript.lcov.reportPaths',
      'sonar.typescript.tsconfigPath',
      'sonar.exclusions'
    ];
  }

  protected async detectLanguage(projectPath: string): Promise<boolean> {
    return this.fileExists(path.join(projectPath, 'package.json'));
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
    let buildTool: string | undefined;
    let isTypeScript = false;

    // Read package.json
    const packageJson = await this.readJsonFile<{
      main?: string;
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
      dependencies?: Record<string, string>;
    }>(path.join(projectPath, 'package.json'));

    // Detect package manager
    if (await this.fileExists(path.join(projectPath, 'pnpm-lock.yaml'))) {
      buildTool = 'pnpm';
    } else if (await this.fileExists(path.join(projectPath, 'yarn.lock'))) {
      buildTool = 'yarn';
    } else if (await this.fileExists(path.join(projectPath, 'package-lock.json'))) {
      buildTool = 'npm';
    } else {
      buildTool = 'npm';
    }

    // Check for TypeScript
    if (await this.fileExists(path.join(projectPath, 'tsconfig.json'))) {
      isTypeScript = true;
      properties.push(this.createProperty(
        'sonar.typescript.tsconfigPath',
        'tsconfig.json',
        'high',
        'detected TypeScript configuration'
      ));
    }

    // Detect source directories
    const sourceDirs = await this.detectSourceDirectories(projectPath);
    if (sourceDirs.length > 0) {
      properties.push(this.createProperty(
        'sonar.sources',
        sourceDirs.join(','),
        'high',
        'detected source directories'
      ));
    } else if (packageJson?.main) {
      // Use main field directory as source
      const mainDir = path.dirname(packageJson.main);
      properties.push(this.createProperty(
        'sonar.sources',
        mainDir === '.' ? 'src' : mainDir,
        'medium',
        'inferred from package.json main field'
      ));
    } else {
      properties.push(this.createProperty(
        'sonar.sources',
        'src',
        'low',
        'defaulting to src/'
      ));
    }

    // Detect test directories
    const testDirs = await this.detectTestDirectories(projectPath);
    if (testDirs.length > 0) {
      properties.push(this.createProperty(
        'sonar.tests',
        testDirs.join(','),
        'high',
        'detected test directories'
      ));
    }

    // Detect coverage reports
    const coverageProps = await this.detectCoverageReports(projectPath);
    properties.push(...coverageProps);
    if (coverageProps.length === 0) {
      warnings.push(this.createWarning(
        'JS-INFO-001',
        'info',
        'No coverage report found',
        'Run tests with --coverage flag to generate lcov.info'
      ));
    }

    // Add standard exclusions
    properties.push(this.createProperty(
      'sonar.exclusions',
      '**/node_modules/**,**/dist/**,**/build/**,**/*.min.js,**/coverage/**',
      'high',
      'standard JavaScript/TypeScript exclusions'
    ));

    return {
      properties,
      warnings,
      version: isTypeScript ? 'typescript' : undefined,
      buildTool
    };
  }

  private async detectSourceDirectories(projectPath: string): Promise<string[]> {
    const dirs: string[] = [];
    const candidates = ['src', 'lib', 'app', 'source'];

    for (const dir of candidates) {
      if (await this.fileExists(path.join(projectPath, dir))) {
        dirs.push(dir);
      }
    }

    return dirs;
  }

  private async detectTestDirectories(projectPath: string): Promise<string[]> {
    const dirs: string[] = [];
    const candidates = ['test', 'tests', '__tests__', 'spec', 'specs'];

    for (const dir of candidates) {
      if (await this.fileExists(path.join(projectPath, dir))) {
        dirs.push(dir);
      }
    }

    return dirs;
  }

  private async detectCoverageReports(projectPath: string): Promise<DetectedProperty[]> {
    const properties: DetectedProperty[] = [];

    // Check for lcov.info in common locations
    const lcovPaths = [
      'coverage/lcov.info',
      'coverage/lcov-report/lcov.info',
      '.nyc_output/lcov.info'
    ];

    for (const lcovPath of lcovPaths) {
      if (await this.fileExists(path.join(projectPath, lcovPath))) {
        properties.push(this.createProperty(
          'sonar.javascript.lcov.reportPaths',
          lcovPath,
          'high',
          `detected LCOV report at ${lcovPath}`
        ));
        return properties;
      }
    }

    return properties;
  }
}
