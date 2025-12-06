/**
 * GoAnalyzer - Analyzer for Go projects
 * Detects Go-specific properties for SonarQube scanning
 */

import * as path from 'path';
import { BaseAnalyzer } from './BaseAnalyzer.js';
import { DetectedProperty, ValidationWarning, ModuleInfo } from '../../../../shared/types/index.js';

export class GoAnalyzer extends BaseAnalyzer {
  readonly language = 'go';

  getCriticalProperties(): string[] {
    return ['sonar.sources'];
  }

  getRecommendedProperties(): string[] {
    return [
      'sonar.go.coverage.reportPaths',
      'sonar.tests',
      'sonar.exclusions'
    ];
  }

  protected async detectLanguage(projectPath: string): Promise<boolean> {
    return this.fileExists(path.join(projectPath, 'go.mod'));
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

    // Read go.mod
    const goModContent = await this.readFile(path.join(projectPath, 'go.mod'));
    if (goModContent) {
      // Extract Go version
      const versionMatch = /^go\s+(\d+\.\d+)/m.exec(goModContent);
      if (versionMatch) {
        version = versionMatch[1];
      }
    }

    // Go projects typically have sources in root
    properties.push(this.createProperty(
      'sonar.sources',
      '.',
      'high',
      'Go project root directory'
    ));

    // Detect test files (Go tests are in same directory as source)
    properties.push(this.createProperty(
      'sonar.tests',
      '.',
      'medium',
      'Go tests are co-located with source files'
    ));

    // Detect coverage reports
    const coverageProps = await this.detectCoverageReports(projectPath);
    properties.push(...coverageProps);
    if (coverageProps.length === 0) {
      warnings.push(this.createWarning(
        'GO-INFO-001',
        'info',
        'No coverage report found',
        'Run "go test -coverprofile=coverage.out ./..." to generate coverage'
      ));
    }

    // Add standard exclusions
    properties.push(this.createProperty(
      'sonar.exclusions',
      '**/vendor/**,**/*_test.go',
      'high',
      'standard Go exclusions (vendor and test files from sources)'
    ));

    // Set test inclusions to only include test files
    properties.push(this.createProperty(
      'sonar.test.inclusions',
      '**/*_test.go',
      'high',
      'Go test file pattern'
    ));

    return { properties, warnings, version, buildTool: 'go' };
  }

  private async detectCoverageReports(projectPath: string): Promise<DetectedProperty[]> {
    const properties: DetectedProperty[] = [];

    // Check for coverage.out (standard Go coverage output)
    const coveragePaths = [
      'coverage.out',
      'cover.out',
      'coverage.txt'
    ];

    for (const coverPath of coveragePaths) {
      if (await this.fileExists(path.join(projectPath, coverPath))) {
        properties.push(this.createProperty(
          'sonar.go.coverage.reportPaths',
          coverPath,
          'high',
          `detected Go coverage report at ${coverPath}`
        ));
        return properties;
      }
    }

    return properties;
  }
}
