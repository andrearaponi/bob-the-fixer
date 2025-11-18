/**
 * Thin MCP handler for sonar_delete_project
 * Delegates to ProjectDeletionService
 */

import { ProjectDeletionService } from '../../core/admin/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { SonarAdmin } from '../../universal/sonar-admin.js';
import { MCPResponse } from '../../shared/types/index.js';
import { sanitizeUrl } from '../../infrastructure/security/input-sanitization.js';

/**
 * Handle delete project MCP tool request
 */
export async function handleDeleteProject(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  try {
    const { projectKey, confirm } = args;

    // Initialize dependencies
    const projectManager = new ProjectManager();
    const sonarUrl = sanitizeUrl(process.env.SONAR_URL ?? 'http://localhost:9000');
    const sonarToken = process.env.SONAR_TOKEN;
    const sonarAdmin = new SonarAdmin(sonarUrl, sonarToken);

    const service = new ProjectDeletionService(projectManager, sonarAdmin);

    // Delete project
    const report = await service.deleteProject(
      { projectKey, confirm },
      correlationId
    );

    return {
      content: [{ type: 'text', text: report }]
    };
  } catch (error: any) {
    return {
      content: [{
        type: 'text',
        text: `PROJECT DELETION ERROR\n\n${error.message}\n\nThe project could not be deleted. Check your permissions and try again.`
      }]
    };
  }
}
