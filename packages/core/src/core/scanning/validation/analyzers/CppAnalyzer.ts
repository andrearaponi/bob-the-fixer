/**
 * CppAnalyzer - Analyzer for C/C++ projects
 * Detects C/C++-specific properties for SonarQube scanning
 */

import * as path from 'path';
import { BaseAnalyzer } from './BaseAnalyzer.js';
import { DetectedProperty, ValidationWarning, ModuleInfo } from '../../../../shared/types/index.js';

export class CppAnalyzer extends BaseAnalyzer {
  readonly language = 'cpp';

  getCriticalProperties(): string[] {
    return [
      'sonar.sources',
      'sonar.cfamily.compile-commands'
    ];
  }

  getRecommendedProperties(): string[] {
    return [
      'sonar.cfamily.build-wrapper-output',
      'sonar.tests',
      'sonar.exclusions'
    ];
  }

  protected async detectLanguage(projectPath: string): Promise<boolean> {
    // Check for build system files
    const buildFiles = [
      'CMakeLists.txt',
      'Makefile',
      'meson.build',
      'configure.ac',
      'BUILD.bazel'
    ];

    for (const file of buildFiles) {
      if (await this.fileExists(path.join(projectPath, file))) {
        return true;
      }
    }

    // Check for compile_commands.json
    if (await this.fileExists(path.join(projectPath, 'compile_commands.json'))) {
      return true;
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
    let buildTool: string | undefined;

    // Detect build system
    if (await this.fileExists(path.join(projectPath, 'CMakeLists.txt'))) {
      buildTool = 'cmake';
    } else if (await this.fileExists(path.join(projectPath, 'meson.build'))) {
      buildTool = 'meson';
    } else if (await this.fileExists(path.join(projectPath, 'Makefile'))) {
      buildTool = 'make';
    } else if (await this.fileExists(path.join(projectPath, 'BUILD.bazel'))) {
      buildTool = 'bazel';
    }

    // Detect source directories
    const sourceDirs = await this.detectSourceDirectories(projectPath);
    if (sourceDirs.length > 0) {
      properties.push(this.createProperty(
        'sonar.sources',
        sourceDirs.join(','),
        'high',
        'detected C/C++ source directories'
      ));
    } else {
      properties.push(this.createProperty(
        'sonar.sources',
        'src',
        'low',
        'defaulting to src/'
      ));
      warnings.push(this.createWarning(
        'CPP-WARN-001',
        'warning',
        'No standard source directory found',
        'Configure sonar.sources to point to your source directories'
      ));
    }

    // Detect compile_commands.json
    const compileCommandsPath = await this.findCompileCommands(projectPath);
    if (compileCommandsPath) {
      properties.push(this.createProperty(
        'sonar.cfamily.compile-commands',
        compileCommandsPath,
        'high',
        'detected compile_commands.json'
      ));
    } else {
      warnings.push(this.createWarning(
        'CPP-WARN-002',
        'warning',
        'No compile_commands.json found',
        buildTool === 'cmake'
          ? 'Run "cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=ON ." to generate'
          : 'Use bear or intercept-build to generate compile_commands.json'
      ));
    }

    // Detect build-wrapper output
    const bwOutput = await this.findBuildWrapperOutput(projectPath);
    if (bwOutput) {
      properties.push(this.createProperty(
        'sonar.cfamily.build-wrapper-output',
        bwOutput,
        'high',
        'detected build-wrapper output directory'
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

    // Add standard exclusions
    properties.push(this.createProperty(
      'sonar.exclusions',
      '**/build/**,**/cmake-build-*/**,**/third_party/**,**/vendor/**',
      'medium',
      'standard C/C++ exclusions'
    ));

    return { properties, warnings, buildTool };
  }

  private async detectSourceDirectories(projectPath: string): Promise<string[]> {
    const dirs: string[] = [];
    const candidates = ['src', 'source', 'lib', 'include'];

    for (const dir of candidates) {
      if (await this.fileExists(path.join(projectPath, dir))) {
        dirs.push(dir);
      }
    }

    return dirs;
  }

  private async detectTestDirectories(projectPath: string): Promise<string[]> {
    const dirs: string[] = [];
    const candidates = ['test', 'tests', 'unittest', 'unit_tests'];

    for (const dir of candidates) {
      if (await this.fileExists(path.join(projectPath, dir))) {
        dirs.push(dir);
      }
    }

    return dirs;
  }

  private async findCompileCommands(projectPath: string): Promise<string | undefined> {
    const paths = [
      'compile_commands.json',
      'build/compile_commands.json',
      'cmake-build-debug/compile_commands.json',
      'cmake-build-release/compile_commands.json'
    ];

    for (const p of paths) {
      if (await this.fileExists(path.join(projectPath, p))) {
        return p;
      }
    }

    return undefined;
  }

  private async findBuildWrapperOutput(projectPath: string): Promise<string | undefined> {
    const paths = [
      'bw-output',
      'build-wrapper-output',
      '.sonar/bw-output'
    ];

    for (const p of paths) {
      if (await this.fileExists(path.join(projectPath, p))) {
        return p;
      }
    }

    return undefined;
  }
}
