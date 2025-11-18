/**
 * DiagnosticsService
 * Diagnoses permission and connectivity issues
 */

import { ProjectManager } from '../../universal/project-manager.js';
import { SonarAdmin } from '../../universal/sonar-admin.js';
import { SonarQubeClient } from '../../sonar/index.js';
import { getLogger, StructuredLogger } from '../../shared/logger/structured-logger.js';

export interface DiagnosticsOptions {
  verbose?: boolean;
}

export class DiagnosticsService {
  private readonly logger: StructuredLogger;

  constructor(
    private readonly projectManager: ProjectManager,
    private readonly sonarAdmin: SonarAdmin
  ) {
    this.logger = getLogger();
  }

  /**
   * Run diagnostics
   */
  async diagnose(
    options: DiagnosticsOptions,
    correlationId?: string
  ): Promise<string> {
    const verbose = options.verbose ?? true;

    this.logger.info('Running diagnostics', { verbose }, correlationId);

    const config = await this.projectManager.getOrCreateConfig();
    const projectContext = await this.projectManager.analyzeProject();

    let report = 'SONARGUARD PERMISSION DIAGNOSTICS\n\n';
    report += this.buildConfigSection(config);
    report += await this.testConnectivity();
    report += await this.testTokenPermissions(config, projectContext);
    report += await this.testProjectStatus(config, projectContext);
    report += this.buildRecommendations();
    report += this.buildManualCommands(config, verbose);

    return report;
  }

  private buildConfigSection(config: any): string {
    let report = 'CONFIGURATION\n\n';
    report += `- SonarQube URL: ${config.sonarUrl}\n`;
    report += `- Project Key: ${config.sonarProjectKey}\n`;
    report += `- Token: ${config.sonarToken.substring(0, 10)}...\n`;
    report += `- Project Path: ${this.projectManager.getWorkingDirectory()}\n\n`;
    return report;
  }

  private async testConnectivity(): Promise<string> {
    let report = 'CONNECTIVITY TESTS\n\n';

    try {
      const isValid = await this.sonarAdmin.validateConnection();
      report += isValid
        ? 'Connection Test: PASS - SonarQube server is reachable\n'
        : 'Connection Test: FAIL - Failed to connect to SonarQube server\n';
    } catch (error: any) {
      report += `Connection Test: FAIL - ${error.message}\n`;
    }

    return report;
  }

  private async testTokenPermissions(config: any, projectContext: any): Promise<string> {
    let report = '\nTOKEN PERMISSION TESTS\n\n';
    const sonarClient = new SonarQubeClient(
      config.sonarUrl,
      config.sonarToken,
      config.sonarProjectKey,
      projectContext
    );

    report += await this.testBasicApiAccess(sonarClient);
    report += await this.testProjectBrowse(sonarClient, config.sonarProjectKey);
    report += await this.testComputeEngine(sonarClient, config.sonarProjectKey);
    report += await this.testIssuesApi(sonarClient);
    report += await this.testUserPermissions(sonarClient);

    return report;
  }

  private async testBasicApiAccess(sonarClient: SonarQubeClient): Promise<string> {
    try {
      await sonarClient.client.get('/api/system/ping');
      return 'Basic API Access: PASS - Token can access SonarQube API\n';
    } catch (error: any) {
      return `Basic API Access: FAIL - ${error.response?.status} - ${error.message}\n`;
    }
  }

  private async testProjectBrowse(sonarClient: SonarQubeClient, projectKey: string): Promise<string> {
    try {
      await sonarClient.client.get('/api/projects/search', { params: { projects: projectKey } });
      return 'Project Browse: PASS - Token can browse project information\n';
    } catch (error: any) {
      let result = `Project Browse: FAIL - ${error.response?.status} - ${error.response?.data?.message ?? error.message}\n`;
      if (error.response?.status === 403) {
        result += '   NOTE: Token needs "Browse" permission on the project\n';
      }
      return result;
    }
  }

  private async testComputeEngine(sonarClient: SonarQubeClient, projectKey: string): Promise<string> {
    try {
      await sonarClient.client.get('/api/ce/activity', { params: { component: projectKey, ps: 1 } });
      return 'Compute Engine: PASS - Token can access analysis queue\n';
    } catch (error: any) {
      let result = `Compute Engine: FAIL - ${error.response?.status} - ${error.response?.data?.message ?? error.message}\n`;
      if (error.response?.status === 403) {
        result += '   NOTE: Token needs "Execute Analysis" permission\n';
      }
      return result;
    }
  }

  private async testIssuesApi(sonarClient: SonarQubeClient): Promise<string> {
    try {
      await sonarClient.getIssues();
      return 'Issues API: PASS - Token can fetch project issues\n';
    } catch (error: any) {
      return `Issues API: FAIL - ${error.message}\n`;
    }
  }

  private async testUserPermissions(sonarClient: SonarQubeClient): Promise<string> {
    try {
      const userResponse = await sonarClient.client.get('/api/users/current');
      const user = userResponse.data;
      let result = `User Info: PASS - Authenticated as "${user.name}" (${user.login})\n`;

      if (user.permissions?.global) {
        result += `   - Global permissions: ${user.permissions.global.join(', ')}\n`;
      }
      return result;
    } catch (error: any) {
      return `User Info: FAIL - ${error.response?.status} - ${error.message}\n`;
    }
  }

  private async testProjectStatus(config: any, projectContext: any): Promise<string> {
    let report = '\nPROJECT STATUS\n\n';
    const sonarClient = new SonarQubeClient(
      config.sonarUrl,
      config.sonarToken,
      config.sonarProjectKey,
      projectContext
    );

    try {
      const projectResponse = await sonarClient.client.get('/api/projects/search', {
        params: { projects: config.sonarProjectKey }
      });

      if (projectResponse.data.components?.length > 0) {
        const project = projectResponse.data.components[0];
        report += `Project Exists: PASS - "${project.name}" (${project.key})\n`;
        report += `   - Last analysis: ${project.lastAnalysisDate ?? 'Never'}\n`;
        report += `   - Visibility: ${project.visibility}\n`;
      } else {
        report += 'Project Status: FAIL - Project not found or no access\n';
      }
    } catch (error: any) {
      report += `Project Status: FAIL - ${error.response?.status} - ${error.message}\n`;
    }

    return report;
  }

  private buildRecommendations(): string {
    let report = '\nRECOMMENDATIONS\n\n';
    report += 'Based on the diagnostic results:\n\n';
    report += '1. If you see 403 errors:\n';
    report += '   - Regenerate token with admin permissions\n';
    report += '   - Check user has "Browse" and "Execute Analysis" permissions\n';
    report += '   - Verify project exists and is accessible\n\n';
    report += '2. If project not found:\n';
    report += '   - Run `sonar_auto_setup` to create the project\n';
    report += '   - Check project key spelling\n';
    report += '   - Verify token has project creation permissions\n\n';
    report += '3. If connection fails:\n';
    report += '   - Check SonarQube server is running\n';
    report += '   - Verify URL is correct\n';
    report += '   - Check network connectivity\n\n';
    return report;
  }

  private buildManualCommands(config: any, verbose: boolean): string {
    if (!verbose) return '';

    let report = 'MANUAL TEST COMMANDS\n\n';
    report += 'Test these commands manually:\n\n';
    report += '```bash\n';
    report += `# Basic connectivity\n`;
    report += `curl -u "${config.sonarToken}:" "${config.sonarUrl}/api/system/ping"\n\n`;
    report += `# Project search\n`;
    report += `curl -u "${config.sonarToken}:" "${config.sonarUrl}/api/projects/search?projects=${config.sonarProjectKey}"\n\n`;
    report += `# User info\n`;
    report += `curl -u "${config.sonarToken}:" "${config.sonarUrl}/api/users/current"\n`;
    report += '```\n';
    return report;
  }
}
