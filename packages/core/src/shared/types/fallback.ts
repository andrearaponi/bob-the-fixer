/**
 * Fallback types for scan recovery
 * Used when SonarQube scan fails and needs intelligent configuration generation
 */

/**
 * Categories of scan errors that can be recovered
 */
export enum ScanErrorCategory {
  SOURCES_NOT_FOUND = 'sources_not_found',
  MODULE_CONFIG_ERROR = 'module_config_error',
  BINARY_PATH_MISSING = 'binary_path_missing',
  EXCLUSION_PATTERN_ERROR = 'exclusion_pattern_error',
  LANGUAGE_NOT_DETECTED = 'language_not_detected',
  PERMISSION_DENIED = 'permission_denied',
  SCANNER_NOT_FOUND = 'scanner_not_found',
  UNKNOWN = 'unknown'
}

/**
 * Parsed scan error with categorization
 */
export interface ParsedScanError {
  category: ScanErrorCategory;
  rawMessage: string;
  suggestedFix?: string;
  affectedPaths?: string[];
  missingParameters?: string[];
}

/**
 * Information about a detected module in multi-module projects
 */
export interface ModuleInfo {
  name: string;
  relativePath: string;
  language: string[];
  sourcesDirs: string[];
  testsDirs: string[];
  binaryDirs?: string[];
  buildFile?: string;
  buildTool?: string;
}

/**
 * Information about detected language
 */
export interface LanguageInfo {
  name: string;
  percentage: number;
  filesCount: number;
  extensions: string[];
}

/**
 * Complete project structure analysis result
 */
export interface ProjectStructure {
  rootPath: string;
  projectType: 'single' | 'multi-module';
  modules: ModuleInfo[];
  globalExclusions: string[];
  detectedLanguages: LanguageInfo[];
  directoryTree: string;
  buildFiles: string[];
  configFiles: string[];
}

/**
 * Result of fallback analysis for Claude
 */
export interface FallbackAnalysisResult {
  parsedError: ParsedScanError;
  projectStructure: ProjectStructure;
  suggestedTemplate: string;
  recoverable: boolean;
  recommendation: string;
}

/**
 * Configuration for a single module in sonar-project.properties
 */
export interface SonarModuleConfig {
  name: string;
  baseDir: string;
  sources: string;
  tests?: string;
  binaries?: string;
  exclusions?: string;
  language?: string;
}

/**
 * Full sonar-project.properties configuration
 */
export interface SonarPropertiesConfig {
  projectKey: string;
  projectName?: string;
  projectVersion?: string;
  sources: string;
  tests?: string;
  exclusions?: string;
  encoding?: string;
  // Multi-module support
  modules?: SonarModuleConfig[];
  // Language-specific
  javaBinaries?: string;
  javaLibraries?: string;
  // Coverage
  coverageReportPaths?: string;
  // Additional properties
  additionalProperties?: Record<string, string>;
}

/**
 * Result of generating sonar-project.properties
 */
export interface GenerateConfigResult {
  success: boolean;
  configPath: string;
  backupPath?: string;
  generatedContent: string;
  warnings?: string[];
}
