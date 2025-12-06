/**
 * Universal Pre-Scan Validation Types
 * Types for the language-agnostic validation system
 */

import { ModuleInfo } from './fallback.js';

/**
 * Confidence level for detected properties
 */
export type PropertyConfidence = 'high' | 'medium' | 'low';

/**
 * Severity level for validation warnings
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Scan quality level based on validation results
 */
export type ScanQuality = 'full' | 'partial' | 'degraded';

/**
 * A property detected by an analyzer
 */
export interface DetectedProperty {
  /** Property key (e.g., "sonar.java.binaries") */
  key: string;
  /** Detected value */
  value: string;
  /** Confidence level of the detection */
  confidence: PropertyConfidence;
  /** Source of detection (e.g., "detected from target/classes") */
  source: string;
}

/**
 * A validation warning or issue
 */
export interface ValidationWarning {
  /** Warning code (e.g., "WARN-001") */
  code: string;
  /** Severity level */
  severity: ValidationSeverity;
  /** Human-readable message */
  message: string;
  /** Suggested fix */
  suggestion?: string;
}

/**
 * Result of analyzing a specific language in the project
 */
export interface LanguageAnalysisResult {
  /** Whether the language was detected */
  detected: boolean;
  /** Language name (e.g., "java", "python") */
  language: string;
  /** Detected version (e.g., "17", "3.11") */
  version?: string;
  /** Build tool used (e.g., "maven", "gradle", "npm") */
  buildTool?: string;
  /** Detected modules */
  modules: ModuleInfo[];
  /** Detected properties for this language */
  properties: DetectedProperty[];
  /** Warnings specific to this language */
  warnings: ValidationWarning[];
}

/**
 * Analysis of an existing sonar-project.properties file
 */
export interface ExistingConfigAnalysis {
  /** Whether the file exists */
  exists: boolean;
  /** Path to the file */
  path: string;
  /** Parsed properties from the file */
  properties: Record<string, string>;
  /** Critical properties that are missing */
  missingCritical: string[];
  /** Recommended properties that are missing */
  missingRecommended: string[];
  /** Completeness score (0-100) */
  completenessScore: number;
}

/**
 * Complete result of pre-scan validation
 */
export interface PreScanValidationResult {
  /** Results for each detected language */
  languages: LanguageAnalysisResult[];
  /** Analysis of existing config file */
  existingConfig?: ExistingConfigAnalysis;
  /** All detected properties across languages */
  detectedProperties: DetectedProperty[];
  /** Critical properties that are missing */
  missingCritical: string[];
  /** Recommended properties that are missing */
  missingRecommended: string[];
  /** All warnings from validation */
  warnings: ValidationWarning[];
  /** Overall scan quality */
  scanQuality: ScanQuality;
  /** Whether the scan can proceed */
  canProceed: boolean;
}

/**
 * Interface that all language analyzers must implement
 */
export interface ILanguageAnalyzer {
  /** Language name this analyzer handles */
  readonly language: string;

  /**
   * Detect if this language is present in the project
   * @param projectPath - Path to the project root
   * @returns True if the language is detected
   */
  detect(projectPath: string): Promise<boolean>;

  /**
   * Analyze the project for this language
   * @param projectPath - Path to the project root
   * @returns Analysis result with detected properties and warnings
   */
  analyze(projectPath: string): Promise<LanguageAnalysisResult>;

  /**
   * Get the list of critical properties for this language
   * These properties are required for a complete scan
   */
  getCriticalProperties(): string[];

  /**
   * Get the list of recommended properties for this language
   * These properties improve scan quality but are not required
   */
  getRecommendedProperties(): string[];
}

/**
 * Options for the PreScanValidator
 */
export interface PreScanValidatorOptions {
  /** Skip validation for specific languages */
  skipLanguages?: string[];
  /** Timeout for external commands (e.g., mvn) in milliseconds */
  commandTimeout?: number;
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Build tool detection result
 */
export interface BuildToolInfo {
  /** Build tool name */
  name: string;
  /** Path to build file */
  buildFile: string;
  /** Detected version of the build tool */
  version?: string;
}
