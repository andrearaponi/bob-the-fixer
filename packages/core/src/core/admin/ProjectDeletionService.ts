/**
 * ProjectDeletionService
 * Handles safe deletion of SonarQube projects
 */

import { ProjectManager } from '../../universal/project-manager.js';
import { SonarAdmin } from '../../universal/sonar-admin.js';
import { getLogger, StructuredLogger } from '../../shared/logger/structured-logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface DeleteProjectOptions {
  projectKey: string;
  confirm: boolean;
}

export class ProjectDeletionService {
  private readonly logger: StructuredLogger;

  constructor(
    private readonly projectManager: ProjectManager,
    private readonly sonarAdmin: SonarAdmin
  ) {
    this.logger = getLogger();
  }

  /**
   * Delete a project with safety checks
   */
  async deleteProject(
    options: DeleteProjectOptions,
    correlationId?: string
  ): Promise<string> {
    this.logger.info('Deleting project', { projectKey: options.projectKey }, correlationId);

    // Validation
    const validationError = this.validateArgs(options);
    if (validationError) return validationError;

    const { projectKey, confirm } = options;

    const config = await this.projectManager.getOrCreateConfig();

    // Verify project exists
    const existsError = await this.verifyProjectExists(projectKey);
    if (existsError) return existsError;

    let report = `DELETING SONARQUBE PROJECT\n\nTarget Project: ${projectKey}\n`;
    report += `Status: Project exists and will be deleted\n\n`;

    // Fetch details
    report += await this.fetchProjectDetails(projectKey);

    // Revoke tokens
    const revokedTokens = await this.revokeProjectTokens(projectKey);
    report += this.buildTokenRevocationReport(revokedTokens);

    // Delete project
    const deleted = await this.sonarAdmin.deleteProject(projectKey);
    report += await this.buildDeletionReport(projectKey, deleted, revokedTokens, config);

    return report;
  }

  private validateArgs(options: DeleteProjectOptions): string | null {
    const { projectKey, confirm } = options;

    if (!projectKey) {
      return 'PROJECT DELETION CANCELLED\n\n' +
             'Project key must be specified explicitly for safety.\n' +
             'Use: sonar_delete_project(projectKey: "your-project-key", confirm: true)\n\n' +
             'WARNING: This operation cannot be undone!';
    }

    if (!confirm) {
      return `PROJECT DELETION CANCELLED\n\n` +
             `Deletion requires explicit confirmation.\n` +
             `Use: sonar_delete_project(projectKey: "${projectKey}", confirm: true)\n\n` +
             `WARNING: This operation cannot be undone!`;
    }

    return null;
  }

  private async verifyProjectExists(projectKey: string): Promise<string | null> {
    const projectExists = await this.sonarAdmin.projectExists(projectKey);
    if (!projectExists) {
      return `PROJECT NOT FOUND\n\n` +
             `Project '${projectKey}' does not exist in SonarQube.\n` +
             `Nothing to delete.`;
    }
    return null;
  }

  private async fetchProjectDetails(projectKey: string): Promise<string> {
    try {
      const projectResponse = await this.sonarAdmin.client.get('/api/projects/search', {
        params: { projects: projectKey }
      });

      if (projectResponse.data.components?.length > 0) {
        const project = projectResponse.data.components[0];
        return `PROJECT DETAILS:\n` +
               `Name: ${project.name}\n` +
               `Key: ${project.key}\n` +
               `Last Analysis: ${project.lastAnalysisDate ?? 'Never'}\n` +
               `Visibility: ${project.visibility}\n\n`;
      }
    } catch (error) {
      this.logger.warn('Could not fetch project details', error as any);
      return `Could not fetch project details, continuing with deletion...\n\n`;
    }
    return '';
  }

  private async revokeProjectTokens(projectKey: string): Promise<{ revoked: string[], failed: string[] }> {
    const tokens = await this.sonarAdmin.listTokens();
    const projectTokens = tokens.filter(token => token.name.includes(projectKey));

    const revoked: string[] = [];
    const failed: string[] = [];

    for (const token of projectTokens) {
      const success = await this.sonarAdmin.revokeToken(token.name);
      if (success) {
        revoked.push(token.name);
      } else {
        failed.push(token.name);
      }
    }

    return { revoked, failed };
  }

  private buildTokenRevocationReport(result: { revoked: string[], failed: string[] }): string {
    let report = `REVOKING PROJECT TOKENS:\n`;

    result.revoked.forEach(name => {
      report += `- Revoked: ${name}\n`;
    });

    result.failed.forEach(name => {
      report += `- Failed to revoke: ${name}\n`;
    });

    if (result.revoked.length === 0 && result.failed.length === 0) {
      report += `No associated tokens found to revoke\n`;
    }

    return report + `\n`;
  }

  private async buildDeletionReport(
    projectKey: string,
    deleted: boolean,
    tokenResult: { revoked: string[], failed: string[] },
    config: any
  ): Promise<string> {
    let report = `DELETING PROJECT:\n`;

    if (deleted) {
      report += `Project '${projectKey}' deleted successfully\n\n`;
      report += await this.cleanupLocalConfig(projectKey, config);
      report += `DELETION COMPLETE\n\nSummary:\n`;
      report += `Project Deleted: ${projectKey}\n`;
      report += `Tokens Revoked: ${tokenResult.revoked.length}\n`;
      report += `Local Config: ${projectKey === config.sonarProjectKey ? 'Removed' : 'Unchanged'}\n\n`;
      report += `NOTE: This operation cannot be undone. All project data,\n` +
                `analysis history, and settings have been permanently removed.`;
    } else {
      report += `DELETION FAILED\n\nCould not delete project '${projectKey}'.\n`;
      report += `Possible reasons:\n- Insufficient permissions\n- Project has dependencies\n- SonarQube server error\n\n`;
      report += `Check SonarQube logs for detailed error information.`;
    }

    return report;
  }

  private async cleanupLocalConfig(projectKey: string, config: any): Promise<string> {
    if (projectKey !== config.sonarProjectKey) {
      return '';
    }

    try {
      const configPath = path.join(this.projectManager.getWorkingDirectory(), 'bobthefixer.env');
      await fs.unlink(configPath);
      return `Local configuration file removed\n`;
    } catch (error) {
      this.logger.warn('Local configuration file not found', error as any);
      return `Local configuration file not found (already clean)\n`;
    }
  }
}
