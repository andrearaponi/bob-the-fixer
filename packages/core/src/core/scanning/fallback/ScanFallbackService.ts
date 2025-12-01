/**
 * ScanFallbackService
 * Orchestrates the fallback process when scan fails
 * Coordinates error parsing, structure analysis, and provides actionable output for Claude
 */

import { ScanErrorParser } from './ScanErrorParser.js';
import { ProjectStructureAnalyzer } from './ProjectStructureAnalyzer.js';
import {
  FallbackAnalysisResult,
  ParsedScanError,
  ProjectStructure,
  ScanErrorCategory
} from '../../../shared/types/index.js';

export class ScanFallbackService {
  private readonly errorParser: ScanErrorParser;
  private readonly structureAnalyzer: ProjectStructureAnalyzer;

  constructor() {
    this.errorParser = new ScanErrorParser();
    this.structureAnalyzer = new ProjectStructureAnalyzer();
  }

  /**
   * Analyze scan failure and prepare actionable output
   */
  async analyze(errorMessage: string, projectPath: string): Promise<FallbackAnalysisResult> {
    // Parse the error
    const parsedError = this.errorParser.parse(errorMessage);

    // Analyze project structure
    const projectStructure = await this.structureAnalyzer.analyze(projectPath);

    // Check if recoverable
    const recoverable = this.errorParser.isRecoverable(parsedError);

    // Generate suggested template
    const suggestedTemplate = this.generateSuggestedTemplate(parsedError, projectStructure);

    // Get recovery recommendation
    const recommendation = this.errorParser.getRecoveryRecommendation(parsedError);

    return {
      parsedError,
      projectStructure,
      suggestedTemplate,
      recoverable,
      recommendation
    };
  }

  /**
   * Generate a suggested sonar-project.properties template
   */
  private generateSuggestedTemplate(
    error: ParsedScanError,
    structure: ProjectStructure
  ): string {
    const lines: string[] = [
      '# Suggested sonar-project.properties',
      '# Generated based on error analysis and project structure',
      ''
    ];

    // Project key placeholder
    lines.push('sonar.projectKey=<YOUR_PROJECT_KEY>');
    lines.push('');

    if (structure.projectType === 'multi-module' && structure.modules.length > 1) {
      // Multi-module configuration
      lines.push('# Multi-module project detected');
      lines.push(`sonar.modules=${structure.modules.map(m => m.name).join(',')}`);
      lines.push('');

      for (const module of structure.modules) {
        lines.push(`# Module: ${module.name}`);
        lines.push(`${module.name}.sonar.projectBaseDir=${module.relativePath}`);

        if (module.sourcesDirs.length > 0) {
          lines.push(`${module.name}.sonar.sources=${module.sourcesDirs.join(',')}`);
        }

        if (module.testsDirs.length > 0) {
          lines.push(`${module.name}.sonar.tests=${module.testsDirs.join(',')}`);
        }

        if (module.binaryDirs && module.binaryDirs.length > 0) {
          lines.push(`${module.name}.sonar.java.binaries=${module.binaryDirs.join(',')}`);
        }

        lines.push('');
      }
    } else {
      // Single module
      const module = structure.modules[0];

      if (module?.sourcesDirs?.length > 0) {
        lines.push(`sonar.sources=${module.sourcesDirs.join(',')}`);
      } else {
        lines.push('sonar.sources=src');
      }

      if (module?.testsDirs?.length > 0) {
        lines.push(`sonar.tests=${module.testsDirs.join(',')}`);
      }

      if (module?.binaryDirs && module.binaryDirs.length > 0) {
        lines.push(`sonar.java.binaries=${module.binaryDirs.join(',')}`);
      }

      lines.push('');
    }

    // Exclusions
    lines.push('# Exclusions');
    lines.push(`sonar.exclusions=${structure.globalExclusions.join(',')}`);
    lines.push('');

    // Encoding
    lines.push('# Encoding');
    lines.push('sonar.sourceEncoding=UTF-8');

    return lines.join('\n');
  }

  /**
   * Format the fallback result for Claude output
   */
  formatForOutput(result: FallbackAnalysisResult): string {
    const lines: string[] = [];

    // Header
    lines.push('❌ SCAN FAILED - Configuration Recovery Available');
    lines.push('');

    // Error Analysis
    lines.push('## Error Analysis');
    lines.push(`Category: ${result.parsedError.category}`);
    lines.push(`Message: ${this.truncate(result.parsedError.rawMessage, 200)}`);

    if (result.parsedError.suggestedFix) {
      lines.push(`Suggested Fix: ${result.parsedError.suggestedFix}`);
    }

    if (result.parsedError.missingParameters && result.parsedError.missingParameters.length > 0) {
      lines.push(`Missing Parameters: ${result.parsedError.missingParameters.join(', ')}`);
    }

    lines.push('');

    // Project Structure
    lines.push('## Project Structure Detected');
    lines.push(`Type: ${result.projectStructure.projectType}`);
    lines.push(`Root: ${result.projectStructure.rootPath}`);
    lines.push('');

    // Languages
    if (result.projectStructure.detectedLanguages.length > 0) {
      lines.push('Languages:');
      for (const lang of result.projectStructure.detectedLanguages.slice(0, 5)) {
        lines.push(`  - ${lang.name}: ${lang.filesCount} files (${lang.percentage}%)`);
      }
      lines.push('');
    }

    // Modules
    if (result.projectStructure.modules.length > 0) {
      lines.push('Modules:');
      for (const module of result.projectStructure.modules) {
        const langStr = module.language.length > 0 ? ` (${module.language.join(', ')})` : '';
        const buildStr = module.buildTool ? ` - ${module.buildTool}` : '';
        lines.push(`  - ${module.name}${langStr}${buildStr}`);
        if (module.sourcesDirs.length > 0) {
          lines.push(`    Sources: ${module.sourcesDirs.join(', ')}`);
        }
        if (module.testsDirs.length > 0) {
          lines.push(`    Tests: ${module.testsDirs.join(', ')}`);
        }
      }
      lines.push('');
    }

    // Directory Tree
    lines.push('## Directory Tree');
    lines.push('```');
    lines.push(result.projectStructure.directoryTree);
    lines.push('```');
    lines.push('');

    // Recovery Instructions
    lines.push('## Recovery Instructions');
    if (result.recoverable) {
      lines.push('✅ This error is recoverable with proper configuration.');
      lines.push('');
      lines.push(result.recommendation);
      lines.push('');
      lines.push('Use `sonar_generate_config` with the appropriate parameters based on the project structure above.');
    } else {
      lines.push('⚠️ This error may require manual intervention.');
      lines.push(result.recommendation);
    }

    lines.push('');

    // Suggested Template
    lines.push('## Suggested Configuration Template');
    lines.push('```properties');
    lines.push(result.suggestedTemplate);
    lines.push('```');

    return lines.join('\n');
  }

  /**
   * Truncate string to specified length
   */
  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
  }

  /**
   * Check if error is recoverable
   */
  isRecoverable(error: ParsedScanError): boolean {
    return this.errorParser.isRecoverable(error);
  }
}
