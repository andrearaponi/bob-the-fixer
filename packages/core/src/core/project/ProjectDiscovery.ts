/**
 * ProjectDiscovery Service
 * Analyzes project structure and recommends configuration
 */

import { ProjectManager } from '../../universal/project-manager.js';
import { SonarAdmin, QualityGateTemplate } from '../../universal/sonar-admin.js';
import { getLogger, StructuredLogger } from '../../shared/logger/structured-logger.js';
import { generateProjectKey } from '../../shared/utils/server-utils.js';
import { sanitizePath } from '../../infrastructure/security/input-sanitization.js';

export interface DiscoveryOptions {
  path?: string;
  deep?: boolean;
}

export interface DiscoveryResult {
  projectName: string;
  projectPath: string;
  languages: string[];
  framework?: string;
  buildTool?: string;
  packageManager?: string;
  recommendedProjectKey: string;
  qualityGateTemplate: QualityGateTemplate;
}

export class ProjectDiscovery {
  private readonly logger: StructuredLogger;

  constructor(
    private readonly projectManager: ProjectManager,
    private readonly sonarAdmin: SonarAdmin
  ) {
    this.logger = getLogger();
  }

  /**
   * Execute project discovery
   */
  async execute(options: DiscoveryOptions, correlationId?: string): Promise<DiscoveryResult> {
    this.logger.info('Starting project discovery', { options }, correlationId);

    // Set working directory if specified
    if (options.path) {
      const safePath = sanitizePath(options.path);
      this.projectManager.setWorkingDirectory(safePath);
    }

    // Analyze project
    const projectContext = await this.projectManager.analyzeProject();

    // Get recommended quality gate
    const qualityTemplate = this.sonarAdmin.getQualityGateTemplate(projectContext);

    // Generate recommended project key
    const recommendedProjectKey = generateProjectKey(projectContext);

    this.logger.info('Project discovery completed', {
      projectName: projectContext.name,
      languages: projectContext.language,
      recommendedKey: recommendedProjectKey
    }, correlationId);

    return {
      projectName: projectContext.name,
      projectPath: projectContext.path,
      languages: projectContext.language,
      framework: projectContext.framework,
      buildTool: projectContext.buildTool,
      packageManager: projectContext.packageManager,
      recommendedProjectKey,
      qualityGateTemplate: qualityTemplate
    };
  }

  /**
   * Format discovery result for display
   */
  static formatDiscoveryResult(result: DiscoveryResult): string {
    let text = `PROJECT DISCOVERY RESULTS\n\n`;
    text += `Project: ${result.projectName}\n`;
    text += `Path: ${result.projectPath}\n\n`;

    text += `LANGUAGES DETECTED:\n`;
    result.languages.forEach(lang => {
      text += `- ${lang.charAt(0).toUpperCase() + lang.slice(1)}\n`;
    });

    if (result.framework) {
      text += `\nFramework: ${result.framework}\n`;
    }

    if (result.buildTool) {
      text += `Build Tool: ${result.buildTool}\n`;
    }

    if (result.packageManager) {
      text += `Package Manager: ${result.packageManager}\n`;
    }

    text += `\nRECOMMENDED QUALITY GATE: ${result.qualityGateTemplate.name}\n`;
    text += `QUALITY CONDITIONS:\n`;
    result.qualityGateTemplate.conditions.forEach(condition => {
      text += `- ${condition.metric}: ${condition.op} ${condition.error}\n`;
    });

    text += `\nRECOMMENDED PROJECT KEY: ${result.recommendedProjectKey}\n`;

    text += `\nNEXT STEPS:\n`;
    text += `1. Run sonar_auto_setup to configure SonarQube\n`;
    text += `2. Use sonar_scan_project to analyze code quality\n`;

    return text;
  }
}
