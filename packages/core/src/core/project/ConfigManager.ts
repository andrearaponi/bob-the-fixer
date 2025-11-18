/**
 * ConfigManager Service
 * Manages Bob the Fixer configuration
 */

import { ProjectManager } from '../../universal/project-manager.js';
import { getLogger, StructuredLogger } from '../../shared/logger/structured-logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export type ConfigAction = 'view' | 'validate' | 'reset' | 'update';

export interface ConfigViewOptions {
  showToken?: boolean;
}

export interface ConfigInfo {
  sonarUrl: string;
  projectKey: string;
  token: string;
  createdAt: string;
  language?: string;
  framework?: string;
  isValid: boolean;
}

export class ConfigManager {
  private readonly logger: StructuredLogger;

  constructor(private readonly projectManager: ProjectManager) {
    this.logger = getLogger();
  }

  /**
   * View current configuration
   */
  async view(options: ConfigViewOptions = {}): Promise<ConfigInfo> {
    const config = await this.projectManager.getOrCreateConfig();

    return {
      sonarUrl: config.sonarUrl,
      projectKey: config.sonarProjectKey,
      token: options.showToken ? config.sonarToken : this.maskToken(config.sonarToken),
      createdAt: config.createdAt,
      language: config.language,
      framework: config.framework,
      isValid: config.sonarToken !== 'temp-token-will-be-generated'
    };
  }

  /**
   * Validate configuration
   */
  async validate(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const config = await this.projectManager.getOrCreateConfig();

      // Check required fields
      if (!config.sonarUrl) {
        errors.push('Missing SonarQube URL');
      }

      if (!config.sonarProjectKey) {
        errors.push('Missing project key');
      }

      if (!config.sonarToken || config.sonarToken === 'temp-token-will-be-generated') {
        errors.push('Missing or invalid token');
      }

      // Check if config file exists
      const configPath = path.join(this.projectManager.getWorkingDirectory(), 'bobthefixer.env');
      try {
        await fs.access(configPath);
      } catch {
        errors.push('Configuration file not found');
      }

      this.logger.info('Configuration validation completed', {
        valid: errors.length === 0,
        errorCount: errors.length
      });

      return {
        valid: errors.length === 0,
        errors
      };
    } catch (error: any) {
      errors.push(`Validation error: ${error.message}`);
      return {
        valid: false,
        errors
      };
    }
  }

  /**
   * Reset configuration (delete config file)
   */
  async reset(): Promise<{ success: boolean; message: string }> {
    try {
      const configPath = path.join(this.projectManager.getWorkingDirectory(), 'bobthefixer.env');

      try {
        await fs.unlink(configPath);
        this.logger.info('Configuration reset successfully', { configPath });
        return {
          success: true,
          message: 'Configuration reset successfully. Run sonar_auto_setup to reconfigure.'
        };
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          return {
            success: false,
            message: 'No configuration file found to reset.'
          };
        }
        throw error;
      }
    } catch (error: any) {
      this.logger.error('Failed to reset configuration', error);
      return {
        success: false,
        message: `Reset failed: ${error.message}`
      };
    }
  }

  /**
   * Mask token for display
   */
  private maskToken(token: string): string {
    if (token.length <= 4) {
      return '****';
    }
    return '***' + token.slice(-4);
  }

  /**
   * Format configuration info for display
   */
  static formatConfigInfo(info: ConfigInfo): string {
    let text = `SONARGUARD CONFIGURATION\n\n`;
    text += `SonarQube URL: ${info.sonarUrl}\n`;
    text += `Project Key: ${info.projectKey}\n`;
    text += `Token: ${info.token}\n`;
    text += `Created: ${info.createdAt}\n`;

    if (info.language) {
      text += `Language: ${info.language}\n`;
    }

    if (info.framework) {
      text += `Framework: ${info.framework}\n`;
    }

    text += `\nStatus: ${info.isValid ? '✅ Valid' : '⚠️ Invalid (temp token)'}`;

    return text;
  }

  /**
   * Format validation result for display
   */
  static formatValidationResult(result: { valid: boolean; errors: string[] }): string {
    if (result.valid) {
      return `✅ CONFIGURATION VALID\n\nAll required fields are present and configuration file exists.`;
    }

    let text = `❌ CONFIGURATION INVALID\n\n`;
    text += `Found ${result.errors.length} error(s):\n\n`;
    result.errors.forEach((error, idx) => {
      text += `${idx + 1}. ${error}\n`;
    });
    text += `\nRun sonar_auto_setup to fix configuration.`;

    return text;
  }

  /**
   * Format reset result for display
   */
  static formatResetResult(result: { success: boolean; message: string }): string {
    const icon = result.success ? '✅' : '❌';
    return `${icon} ${result.message}`;
  }
}
