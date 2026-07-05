/**
 * Delete Project Handler
 *
 * MCP handler for sonar_delete_project tool.
 * Uses dependency injection for testability.
 */

import { ProjectDeletionService } from '../../core/admin/index.js';
import { IProjectManager, ISonarAdmin } from '../../infrastructure/interfaces/index.js';
import { MCPResponse } from '../../shared/types/index.js';
import { sanitizeUrl } from '../../infrastructure/security/input-sanitization.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { SonarAdmin } from '../../universal/sonar-admin.js';
import { validateInput, SonarDeleteProjectSchema } from '../../shared/validators/mcp-schemas.js';
import { IHandler } from './IHandler.js';

/**
 * Arguments for delete project handler
 */
export interface DeleteProjectArgs {
  projectKey: string;
  confirm: boolean;
}

/**
 * Injectable delete project handler class
 */
/**
 * Handle delete project MCP tool request
 *
 */
export async function handleDeleteProject(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  try {
    // Validate input and enforce the confirmation guard before deleting.
    const { projectKey, confirm } = validateInput(
      SonarDeleteProjectSchema,
      args,
      'sonar_delete_project'
    );

    // Initialize dependencies (legacy approach)
    const projectManager = new ProjectManager();
    const sonarUrl = sanitizeUrl(process.env.SONAR_URL ?? 'http://localhost:9000');
    const sonarToken = process.env.SONAR_TOKEN;
    const sonarAdmin = new SonarAdmin(sonarUrl, sonarToken);

    const service = new ProjectDeletionService(
      projectManager as any,
      sonarAdmin as any
    );

    const report = await service.deleteProject(
      { projectKey, confirm },
      correlationId
    );

    return {
      content: [{ type: 'text', text: report }],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `PROJECT DELETION ERROR\n\n${error.message}\n\nThe project could not be deleted. Check your permissions and try again.`,
        },
      ],
      isError: true,
    };
  }
}
