/**
 * Project Metrics Handler
 *
 * MCP handler for sonar_get_project_metrics tool.
 * Uses dependency injection for testability.
 */

import { injectable, inject } from 'tsyringe';
import { QualityAnalyzer } from '../../core/analysis/index.js';
import { IProjectManager } from '../../infrastructure/interfaces/index.js';
import { TOKENS } from '../../infrastructure/di/tokens.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { validateInput, SonarGetProjectMetricsSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse } from '../../shared/types/index.js';
import { getLogger } from '../../shared/logger/structured-logger.js';
import { IHandler } from './IHandler.js';

/**
 * Arguments for project metrics handler
 */
export interface ProjectMetricsArgs {
  metrics?: string[];
}

/**
 * Injectable project metrics handler class
 */
@injectable()
export class ProjectMetricsHandler implements IHandler<ProjectMetricsArgs> {
  constructor(
    @inject(TOKENS.ProjectManager) private readonly projectManager: IProjectManager
  ) {}

  async handle(args: ProjectMetricsArgs, correlationId?: string): Promise<MCPResponse> {
    const logger = getLogger();

    try {
      // Validate input
      const validatedArgs = validateInput(SonarGetProjectMetricsSchema, args, 'sonar_get_project_metrics');

      const service = new QualityAnalyzer(this.projectManager as any);

      // Get project metrics
      const report = await service.getProjectMetrics(
        {
          metrics: validatedArgs.metrics,
        },
        correlationId
      );

      return {
        content: [{ type: 'text', text: report }],
      };
    } catch (error: any) {
      logger.error('Error fetching project metrics', error, {}, correlationId);
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching project metrics: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
}

/**
 * Handle get project metrics MCP tool request
 *
 * @deprecated Use ProjectMetricsHandler class with DI instead
 */
export async function handleGetProjectMetrics(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  const logger = getLogger();

  try {
    // Validate input
    const validatedArgs = validateInput(SonarGetProjectMetricsSchema, args, 'sonar_get_project_metrics');

    // Initialize dependencies (legacy approach)
    const projectManager = new ProjectManager();
    const service = new QualityAnalyzer(projectManager as any);

    // Get project metrics
    const report = await service.getProjectMetrics(
      {
        metrics: validatedArgs.metrics,
      },
      correlationId
    );

    return {
      content: [{ type: 'text', text: report }],
    };
  } catch (error: any) {
    logger.error('Error fetching project metrics', error, {}, correlationId);
    return {
      content: [
        {
          type: 'text',
          text: `Error fetching project metrics: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
