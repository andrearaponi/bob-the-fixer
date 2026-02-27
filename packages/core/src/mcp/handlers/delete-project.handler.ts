/**
 * Delete Project Handler
 *
 * MCP handler for sonar_delete_project tool.
 * Uses dependency injection for testability.
 */

import { injectable, inject } from 'tsyringe';
import { ProjectDeletionService } from '../../core/admin/index.js';
import { IProjectManager, ISonarAdmin } from '../../infrastructure/interfaces/index.js';
import { TOKENS } from '../../infrastructure/di/tokens.js';
import { MCPResponse } from '../../shared/types/index.js';
import { sanitizeUrl } from '../../infrastructure/security/input-sanitization.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { SonarAdmin } from '../../universal/sonar-admin.js';
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
@injectable()
export class DeleteProjectHandler implements IHandler<DeleteProjectArgs> {
  constructor(
    @inject(TOKENS.ProjectManager) private readonly projectManager: IProjectManager,
    @inject(TOKENS.SonarAdmin) private readonly sonarAdmin: ISonarAdmin
  ) {}

  async handle(args: DeleteProjectArgs, correlationId?: string): Promise<MCPResponse> {
    try {
      const { projectKey, confirm } = args;

      const service = new ProjectDeletionService(
        this.projectManager as any,
        this.sonarAdmin as any
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
      };
    }
  }
}

/**
 * Handle delete project MCP tool request
 *
 * @deprecated Use DeleteProjectHandler class with DI instead
 */
export async function handleDeleteProject(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  try {
    const { projectKey, confirm } = args;

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
    };
  }
}
