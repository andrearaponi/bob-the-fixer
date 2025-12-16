/**
 * ProjectSetup Service
 * Handles automatic project setup with SonarQube
 */

import { ProjectManager, ProjectConfig, ProjectContext } from '../../universal/project-manager.js';
import { SonarAdmin } from '../../universal/sonar-admin.js';
import { getLogger, StructuredLogger } from '../../shared/logger/structured-logger.js';
import { saveConfigToFile } from '../../shared/utils/server-utils.js';
import { verifyProjectSetup } from '../../sonar/index.js';
import * as path from 'path';

export interface SetupOptions {
  force?: boolean;
  projectPath?: string;
  template?: 'strict' | 'balanced' | 'permissive';
}

export interface SetupResult {
  projectKey: string;
  projectName: string;
  languages: string[];
  framework?: string;
  buildTool?: string;
  qualityGateName: string;
  conditionsCount: number;
  configPath: string;
  isNewSetup: boolean;
}

export class ProjectSetup {
  private readonly logger: StructuredLogger;

  constructor(
    private readonly projectManager: ProjectManager,
    private readonly sonarAdmin: SonarAdmin
  ) {
    this.logger = getLogger();
  }

  /**
   * Execute project setup workflow
   */
  async execute(options: SetupOptions, correlationId?: string): Promise<SetupResult> {
    this.logger.info('Starting project setup', { options }, correlationId);

    // Set working directory if specified
    if (options.projectPath) {
      this.projectManager.setWorkingDirectory(options.projectPath);
    }

    // Check if already configured
    const existingConfig = await this.checkExistingConfiguration(options.force);
    if (existingConfig) {
      return existingConfig;
    }

    // Analyze project
    const projectContext = await this.projectManager.analyzeProject();

    // Validate SonarQube connection
    await this.validateConnection();

    // Setup project in SonarQube
    const setup = await this.sonarAdmin.setupProject(projectContext);

    // Save configuration
    await this.saveConfiguration(setup, projectContext);

    // Verify setup
    await verifyProjectSetup(setup.project.key, setup.token.token);

    this.logger.info('Project setup completed successfully', { projectKey: setup.project.key }, correlationId);

    return {
      projectKey: setup.project.key,
      projectName: setup.project.name,
      languages: projectContext.language,
      framework: projectContext.framework,
      buildTool: projectContext.buildTool,
      qualityGateName: setup.qualityGate.name,
      conditionsCount: setup.qualityGate.conditions.length,
      configPath: path.join(this.projectManager.getWorkingDirectory(), 'bobthefixer.env'),
      isNewSetup: true
    };
  }

  /**
   * Check if configuration already exists
   */
  private async checkExistingConfiguration(force?: boolean): Promise<SetupResult | null> {
    try {
      const config = await this.projectManager.getOrCreateConfig();

      // If force is set or config is incomplete, proceed with setup
      if (force || config.sonarToken === 'temp-token-will-be-generated') {
        return null;
      }

      // Configuration exists and is valid
      this.logger.info('Using existing configuration', { projectKey: config.sonarProjectKey });

      const projectContext = await this.projectManager.analyzeProject();

      return {
        projectKey: config.sonarProjectKey,
        projectName: projectContext.name,
        languages: config.language?.split(',') || projectContext.language,
        framework: config.framework || projectContext.framework,
        buildTool: projectContext.buildTool,
        qualityGateName: 'Default',
        conditionsCount: 0,
        configPath: path.join(this.projectManager.getWorkingDirectory(), 'bobthefixer.env'),
        isNewSetup: false
      };
    } catch (error) {
      // No configuration exists, proceed with setup
      return null;
    }
  }

  /**
   * Validate SonarQube connection
   */
  private async validateConnection(): Promise<void> {
    const connectionValid = await this.sonarAdmin.validateConnection();
    if (!connectionValid) {
      throw new Error('Cannot connect to SonarQube. Ensure it is running and token is valid.');
    }
    this.logger.debug('SonarQube connection validated');
  }

  /**
   * Save configuration to file
   */
  private async saveConfiguration(
    setup: any,
    projectContext: ProjectContext
  ): Promise<ProjectConfig> {
    const config = await this.projectManager.getOrCreateConfig();

    const updatedConfig: ProjectConfig = {
      ...config,
      sonarToken: setup.token.token,
      sonarProjectKey: setup.project.key,
      language: projectContext.language.join(','),
      framework: projectContext.framework
    };

    const configPath = path.join(this.projectManager.getWorkingDirectory(), 'bobthefixer.env');
    await saveConfigToFile(configPath, updatedConfig);

    this.logger.info('Configuration saved', { configPath });

    return updatedConfig;
  }

  /**
   * Get setup summary for display
   */
  static formatSetupResult(result: SetupResult): string {
    if (!result.isNewSetup) {
      return `SONARGUARD ALREADY CONFIGURED\n\n` +
             `Project: ${result.projectKey}\n` +
             `Languages: ${result.languages.join(', ')}\n` +
             `Framework: ${result.framework ?? 'Generic'}\n` +
             `Build Tool: ${result.buildTool ?? 'None detected'}\n\n` +
             `Use force: true to recreate the configuration.`;
    }

    return `BOB THE BUILDER AUTO-SETUP COMPLETE!\n\n` +
           `PROJECT DETAILS:\n` +
           `Name: ${result.projectName}\n` +
           `Key: ${result.projectKey}\n` +
           `Languages: ${result.languages.join(', ')}\n` +
           `Framework: ${result.framework ?? 'Generic'}\n` +
           `Build Tool: ${result.buildTool ?? 'None detected'}\n\n` +
           `QUALITY GATE: ${result.qualityGateName}\n` +
           `${result.conditionsCount} quality conditions applied\n\n` +
           `CONFIGURATION: Saved to bobthefixer.env\n` +
           `Added to .gitignore automatically\n` +
           `Token: Generated and secured\n\n` +
           `READY TO ANALYZE! Try: sonar_scan_project`;
  }
}
