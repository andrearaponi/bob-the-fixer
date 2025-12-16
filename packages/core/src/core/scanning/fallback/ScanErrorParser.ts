/**
 * ScanErrorParser
 * Parses and categorizes sonar-scanner error output for intelligent recovery
 */

import { ScanErrorCategory, ParsedScanError } from '../../../shared/types/index.js';

interface ErrorPattern {
  pattern: RegExp;
  category: ScanErrorCategory;
  extractInfo?: (match: RegExpMatchArray, message: string) => Partial<ParsedScanError>;
}

export class ScanErrorParser {
  private readonly errorPatterns: ErrorPattern[] = [
    // Sources not found
    {
      pattern: /Unable to find source files|No sources found|sonar\.sources.*does not exist|No source files found/i,
      category: ScanErrorCategory.SOURCES_NOT_FOUND,
      extractInfo: (match, message) => ({
        suggestedFix: 'Configure sonar.sources with the correct source directory path',
        missingParameters: ['sonar.sources']
      })
    },
    // Binary path missing (Java)
    {
      pattern: /Unable to find.*classes|sonar\.java\.binaries.*does not exist|No compiled classes found|Your project contains.*but sonar\.java\.binaries/i,
      category: ScanErrorCategory.BINARY_PATH_MISSING,
      extractInfo: () => ({
        suggestedFix: 'Run build first (mvn compile / gradle build) and configure sonar.java.binaries',
        missingParameters: ['sonar.java.binaries']
      })
    },
    // Module configuration error
    {
      pattern: /Module.*not found|Invalid module configuration|Unrecognized module|Unable to load module|sonar\.modules.*invalid/i,
      category: ScanErrorCategory.MODULE_CONFIG_ERROR,
      extractInfo: (match, message) => {
        const moduleMatch = message.match(/module[:\s]+['"]?([^'"]+)['"]?/i);
        return {
          suggestedFix: 'Review multi-module configuration in sonar-project.properties',
          affectedPaths: moduleMatch ? [moduleMatch[1]] : undefined,
          missingParameters: ['sonar.modules']
        };
      }
    },
    // Exclusion pattern error
    {
      pattern: /Invalid exclusion pattern|Exclusion.*error|Pattern.*is not valid/i,
      category: ScanErrorCategory.EXCLUSION_PATTERN_ERROR,
      extractInfo: (match, message) => {
        const patternMatch = message.match(/pattern[:\s]+['"]?([^'"]+)['"]?/i);
        return {
          suggestedFix: 'Fix exclusion pattern syntax (use **/*.ext format)',
          affectedPaths: patternMatch ? [patternMatch[1]] : undefined,
          missingParameters: ['sonar.exclusions']
        };
      }
    },
    // Language not detected
    {
      pattern: /No files nor directories matching|Unable to determine language|No analyzable files|Language not supported/i,
      category: ScanErrorCategory.LANGUAGE_NOT_DETECTED,
      extractInfo: () => ({
        suggestedFix: 'Verify source files exist and configure language-specific parameters',
        missingParameters: ['sonar.language', 'sonar.sources']
      })
    },
    // Permission denied
    {
      pattern: /403|Permission denied|Insufficient privileges|Access denied|Not authorized/i,
      category: ScanErrorCategory.PERMISSION_DENIED,
      extractInfo: () => ({
        suggestedFix: 'Check token permissions or regenerate with admin rights'
      })
    },
    // Scanner not found
    {
      pattern: /sonar-scanner.*not found|command not found.*sonar|Cannot find sonar-scanner/i,
      category: ScanErrorCategory.SCANNER_NOT_FOUND,
      extractInfo: () => ({
        suggestedFix: 'Install SonarQube Scanner: brew install sonar-scanner (macOS) or apt-get install sonar-scanner-cli (Linux)'
      })
    }
  ];

  /**
   * Parse error message and categorize it
   */
  parse(errorMessage: string): ParsedScanError {
    for (const { pattern, category, extractInfo } of this.errorPatterns) {
      const match = errorMessage.match(pattern);
      if (match) {
        const additionalInfo = extractInfo?.(match, errorMessage) ?? {};
        return {
          category,
          rawMessage: errorMessage,
          ...additionalInfo
        };
      }
    }

    // Unknown error
    return {
      category: ScanErrorCategory.UNKNOWN,
      rawMessage: errorMessage,
      suggestedFix: 'Review the error message and check SonarQube documentation'
    };
  }

  /**
   * Check if error is recoverable through configuration
   */
  isRecoverable(error: ParsedScanError): boolean {
    const recoverableCategories = [
      ScanErrorCategory.SOURCES_NOT_FOUND,
      ScanErrorCategory.MODULE_CONFIG_ERROR,
      ScanErrorCategory.BINARY_PATH_MISSING,
      ScanErrorCategory.EXCLUSION_PATTERN_ERROR,
      ScanErrorCategory.LANGUAGE_NOT_DETECTED
    ];

    return recoverableCategories.includes(error.category);
  }

  /**
   * Extract affected paths from error message
   */
  extractPaths(errorMessage: string): string[] {
    const paths: string[] = [];

    // Match quoted paths
    const quotedPaths = errorMessage.match(/['"]([\/\\][^'"]+)['"]/g);
    if (quotedPaths) {
      paths.push(...quotedPaths.map(p => p.replace(/['"]/g, '')));
    }

    // Match absolute paths (Unix and Windows)
    const absolutePaths = errorMessage.match(/(?:\/[\w.-]+)+|(?:[A-Z]:\\[\w.\\-]+)+/gi);
    if (absolutePaths) {
      paths.push(...absolutePaths);
    }

    return [...new Set(paths)];
  }

  /**
   * Get recovery recommendations based on error category
   */
  getRecoveryRecommendation(error: ParsedScanError): string {
    const recommendations: Record<ScanErrorCategory, string> = {
      [ScanErrorCategory.SOURCES_NOT_FOUND]:
        'Use sonar_generate_config to create a proper configuration with correct source paths.',
      [ScanErrorCategory.MODULE_CONFIG_ERROR]:
        'Use sonar_generate_config with modules parameter to configure multi-module project.',
      [ScanErrorCategory.BINARY_PATH_MISSING]:
        'Build the project first, then use sonar_generate_config with javaBinaries parameter.',
      [ScanErrorCategory.EXCLUSION_PATTERN_ERROR]:
        'Use sonar_generate_config with corrected exclusion patterns.',
      [ScanErrorCategory.LANGUAGE_NOT_DETECTED]:
        'Use sonar_generate_config to explicitly configure language and sources.',
      [ScanErrorCategory.PERMISSION_DENIED]:
        'Run sonar_auto_setup with force: true to regenerate project with fresh token.',
      [ScanErrorCategory.SCANNER_NOT_FOUND]:
        'Install sonar-scanner CLI tool before running scan.',
      [ScanErrorCategory.UNKNOWN]:
        'Review the error details and try sonar_generate_config with appropriate settings.'
    };

    return recommendations[error.category];
  }
}
