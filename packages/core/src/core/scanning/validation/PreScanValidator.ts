/**
 * PreScanValidator
 * Universal pre-scan validation orchestrator for all languages
 * Coordinates language analyzers and validates project configuration
 */

import {
  ILanguageAnalyzer,
  LanguageAnalysisResult,
  DetectedProperty,
  ValidationWarning,
  PreScanValidationResult,
  ExistingConfigAnalysis
} from '../../../shared/types/index.js';

import { JavaAnalyzer } from './analyzers/JavaAnalyzer.js';
import { PythonAnalyzer } from './analyzers/PythonAnalyzer.js';
import { JsAnalyzer } from './analyzers/JsAnalyzer.js';
import { GoAnalyzer } from './analyzers/GoAnalyzer.js';
import { CppAnalyzer } from './analyzers/CppAnalyzer.js';
import { ConfigValidationService } from './ConfigValidationService.js';

export class PreScanValidator {
  private analyzers: Map<string, ILanguageAnalyzer> = new Map();
  private configValidationService: ConfigValidationService;

  constructor() {
    this.configValidationService = new ConfigValidationService();

    // Register default analyzers
    this.registerAnalyzer(new JavaAnalyzer());
    this.registerAnalyzer(new PythonAnalyzer());
    this.registerAnalyzer(new JsAnalyzer());
    this.registerAnalyzer(new GoAnalyzer());
    this.registerAnalyzer(new CppAnalyzer());
  }

  /**
   * Register a language analyzer
   */
  registerAnalyzer(analyzer: ILanguageAnalyzer): void {
    this.analyzers.set(analyzer.language, analyzer);
  }

  /**
   * Get list of registered analyzer languages
   */
  getRegisteredAnalyzers(): string[] {
    return Array.from(this.analyzers.keys());
  }

  /**
   * Validate a project - main entry point
   */
  async validate(projectPath: string): Promise<PreScanValidationResult> {
    const languages: LanguageAnalysisResult[] = [];
    const allProperties: DetectedProperty[] = [];
    const allWarnings: ValidationWarning[] = [];
    const allCriticalProperties: string[] = [];
    const allRecommendedProperties: string[] = [];

    // Run detection and analysis for all analyzers
    for (const [, analyzer] of this.analyzers) {
      try {
        const detected = await analyzer.detect(projectPath);
        if (detected) {
          const analysisResult = await analyzer.analyze(projectPath);
          languages.push(analysisResult);

          // Aggregate properties
          allProperties.push(...analysisResult.properties);

          // Aggregate warnings
          allWarnings.push(...analysisResult.warnings);

          // Collect critical and recommended properties
          allCriticalProperties.push(...analyzer.getCriticalProperties());
          allRecommendedProperties.push(...analyzer.getRecommendedProperties());
        }
      } catch (error) {
        // Add warning for analyzer failure but continue
        allWarnings.push({
          code: 'ANALYZER_ERROR',
          severity: 'warning',
          message: `Analyzer ${analyzer.language} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          suggestion: 'Check project structure and permissions'
        });
      }
    }

    // Validate existing config if present
    const existingConfig = await this.validateExistingConfig(
      projectPath,
      allProperties,
      allCriticalProperties,
      allRecommendedProperties
    );

    // Calculate missing properties
    const presentPropertyKeys = new Set(allProperties.map(p => p.key));
    const missingCritical = allCriticalProperties.filter(prop =>
      !presentPropertyKeys.has(prop)
    );
    const missingRecommended = allRecommendedProperties.filter(prop =>
      !presentPropertyKeys.has(prop)
    );

    // Determine scan quality
    const scanQuality = this.calculateScanQuality(
      languages,
      missingCritical,
      allWarnings
    );

    // Determine if scan can proceed
    const canProceed = true; // Best-effort approach - always try to scan

    return {
      languages,
      existingConfig: existingConfig.exists ? existingConfig : undefined,
      detectedProperties: allProperties,
      missingCritical,
      missingRecommended,
      warnings: allWarnings,
      scanQuality,
      canProceed
    };
  }

  /**
   * Validate existing sonar-project.properties against detected properties
   */
  private async validateExistingConfig(
    projectPath: string,
    detectedProperties: DetectedProperty[],
    criticalProperties: string[],
    recommendedProperties: string[]
  ): Promise<ExistingConfigAnalysis> {
    return this.configValidationService.validateExistingConfig(
      projectPath,
      detectedProperties,
      criticalProperties,
      recommendedProperties
    );
  }

  /**
   * Calculate scan quality based on detected properties and warnings
   */
  private calculateScanQuality(
    languages: LanguageAnalysisResult[],
    missingCritical: string[],
    warnings: ValidationWarning[]
  ): 'full' | 'partial' | 'degraded' {
    // No languages detected = degraded
    if (languages.length === 0) {
      return 'degraded';
    }

    // Count error-level warnings
    const errorWarnings = warnings.filter(w => w.severity === 'error').length;

    // Missing critical properties or error warnings = partial
    if (missingCritical.length > 0 || errorWarnings > 0) {
      return 'partial';
    }

    // Only info/warning level warnings = full
    return 'full';
  }

  /**
   * Format validation output for display
   */
  formatValidationOutput(result: PreScanValidationResult): string {
    const lines: string[] = [];

    lines.push('PRE-SCAN VALIDATION RESULTS');
    lines.push('============================');
    lines.push('');

    // Languages section
    if (result.languages.length === 0) {
      lines.push('No languages detected in this project');
    } else {
      lines.push('Languages Detected:');
      for (const lang of result.languages) {
        const versionInfo = lang.version ? ` ${lang.version}` : '';
        const buildInfo = lang.buildTool ? ` (${lang.buildTool})` : '';
        const moduleInfo = lang.modules.length > 1 ? ` - ${lang.modules.length} modules` : '';
        lines.push(`  - ${lang.buildTool || 'Unknown'}${versionInfo}${buildInfo}${moduleInfo}`);
      }
    }
    lines.push('');

    // Detected properties section
    if (result.detectedProperties.length > 0) {
      lines.push('DETECTED PROPERTIES:');
      for (const prop of result.detectedProperties) {
        const truncatedValue = prop.value.length > 50
          ? prop.value.substring(0, 47) + '...'
          : prop.value;
        lines.push(`  ${prop.key} = ${truncatedValue} [confidence: ${prop.confidence}]`);
      }
      lines.push('');
    }

    // Warnings section
    if (result.warnings.length > 0) {
      lines.push('WARNINGS (scan will proceed):');
      for (const warning of result.warnings) {
        const prefix = warning.severity === 'error' ? '[ERROR]'
          : warning.severity === 'warning' ? '[WARN]'
          : '[INFO]';
        lines.push(`  ${prefix} ${warning.code}: ${warning.message}`);
        if (warning.suggestion) {
          lines.push(`    Suggestion: ${warning.suggestion}`);
        }
      }
      lines.push('');
    }

    // Existing config section
    if (result.existingConfig) {
      lines.push('CONFIG ANALYSIS (sonar-project.properties exists):');
      lines.push(`  Completeness: ${result.existingConfig.completenessScore}%`);

      if (result.existingConfig.missingCritical.length > 0) {
        lines.push('  Missing critical (will be added automatically):');
        for (const prop of result.existingConfig.missingCritical) {
          lines.push(`    - ${prop}`);
        }
      }

      if (result.existingConfig.missingRecommended.length > 0) {
        lines.push('  Recommended additions:');
        for (const prop of result.existingConfig.missingRecommended) {
          lines.push(`    - ${prop}`);
        }
      }
      lines.push('');
    }

    // Scan quality section
    lines.push(`Scan Quality: ${result.scanQuality.toUpperCase()}`);
    lines.push(`Can Proceed: ${result.canProceed ? 'YES' : 'NO'}`);

    return lines.join('\n');
  }
}
