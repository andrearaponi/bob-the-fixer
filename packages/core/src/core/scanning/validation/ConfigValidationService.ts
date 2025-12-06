/**
 * ConfigValidationService
 * Validates existing sonar-project.properties files against detected properties
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { DetectedProperty, ExistingConfigAnalysis } from '../../../shared/types/index.js';

export class ConfigValidationService {
  /**
   * Read and parse existing sonar-project.properties file
   */
  async readExistingConfig(projectPath: string): Promise<Record<string, string> | null> {
    const configPath = path.join(projectPath, 'sonar-project.properties');

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return this.parseProperties(content);
    } catch {
      return null;
    }
  }

  /**
   * Parse properties file content into key-value pairs
   */
  private parseProperties(content: string): Record<string, string> {
    const properties: Record<string, string> = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const equalIndex = trimmed.indexOf('=');
      if (equalIndex > 0) {
        const key = trimmed.substring(0, equalIndex).trim();
        const value = trimmed.substring(equalIndex + 1).trim();
        properties[key] = value;
      }
    }

    return properties;
  }

  /**
   * Validate existing configuration against detected properties
   */
  async validateExistingConfig(
    projectPath: string,
    detectedProperties: DetectedProperty[],
    criticalProperties: string[],
    recommendedProperties: string[]
  ): Promise<ExistingConfigAnalysis> {
    const configPath = path.join(projectPath, 'sonar-project.properties');
    const existingProps = await this.readExistingConfig(projectPath);

    if (!existingProps) {
      return {
        exists: false,
        path: configPath,
        properties: {},
        missingCritical: criticalProperties,
        missingRecommended: recommendedProperties,
        completenessScore: 0
      };
    }

    // Find missing critical properties
    const missingCritical = criticalProperties.filter(prop => {
      return !existingProps[prop] && detectedProperties.some(d => d.key === prop);
    });

    // Find missing recommended properties
    const missingRecommended = recommendedProperties.filter(prop => {
      return !existingProps[prop] && detectedProperties.some(d => d.key === prop);
    });

    // Calculate completeness score
    const completenessScore = this.calculateCompletenessScore(
      existingProps,
      detectedProperties,
      criticalProperties,
      recommendedProperties
    );

    return {
      exists: true,
      path: configPath,
      properties: existingProps,
      missingCritical,
      missingRecommended,
      completenessScore
    };
  }

  /**
   * Calculate how complete the existing configuration is (0-100)
   */
  private calculateCompletenessScore(
    existingProps: Record<string, string>,
    detectedProperties: DetectedProperty[],
    criticalProperties: string[],
    recommendedProperties: string[]
  ): number {
    // Critical properties are worth 60% of the score
    // Recommended properties are worth 40% of the score

    const criticalWeight = 60;
    const recommendedWeight = 40;

    // Count how many critical properties are present
    const detectedCritical = criticalProperties.filter(prop =>
      detectedProperties.some(d => d.key === prop)
    );
    const presentCritical = detectedCritical.filter(prop => existingProps[prop]);
    const criticalScore = detectedCritical.length > 0
      ? (presentCritical.length / detectedCritical.length) * criticalWeight
      : criticalWeight;

    // Count how many recommended properties are present
    const detectedRecommended = recommendedProperties.filter(prop =>
      detectedProperties.some(d => d.key === prop)
    );
    const presentRecommended = detectedRecommended.filter(prop => existingProps[prop]);
    const recommendedScore = detectedRecommended.length > 0
      ? (presentRecommended.length / detectedRecommended.length) * recommendedWeight
      : recommendedWeight;

    return Math.round(criticalScore + recommendedScore);
  }

  /**
   * Format analysis results for output
   */
  formatAnalysisOutput(analysis: ExistingConfigAnalysis): string {
    const lines: string[] = [];

    if (!analysis.exists) {
      lines.push('No sonar-project.properties file found');
      lines.push('');
      lines.push('Missing critical properties:');
      for (const prop of analysis.missingCritical) {
        lines.push(`  - ${prop}`);
      }
      return lines.join('\n');
    }

    lines.push(`Config file: ${analysis.path}`);
    lines.push(`Completeness: ${analysis.completenessScore}%`);
    lines.push('');

    if (analysis.missingCritical.length > 0) {
      lines.push('Missing critical properties (will be added automatically):');
      for (const prop of analysis.missingCritical) {
        lines.push(`  - ${prop}`);
      }
      lines.push('');
    }

    if (analysis.missingRecommended.length > 0) {
      lines.push('Recommended additions:');
      for (const prop of analysis.missingRecommended) {
        lines.push(`  - ${prop}`);
      }
    }

    return lines.join('\n');
  }
}
