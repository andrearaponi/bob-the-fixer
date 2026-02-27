/**
 * Duplication Summary Handler
 *
 * MCP handler for sonar_get_duplication_summary tool.
 * Uses dependency injection for testability.
 */

import { injectable, inject } from 'tsyringe';
import { QualityAnalyzer } from '../../core/analysis/index.js';
import { IProjectManager } from '../../infrastructure/interfaces/index.js';
import { TOKENS } from '../../infrastructure/di/tokens.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { validateInput, SonarGetDuplicationSummarySchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse } from '../../shared/types/index.js';
import { IHandler } from './IHandler.js';

/**
 * Arguments for duplication summary handler
 */
export interface DuplicationSummaryArgs {
  sortBy?: 'density' | 'lines' | 'blocks';
  maxResults?: number;
  pageSize?: number;
}

/**
 * Injectable duplication summary handler class
 */
@injectable()
export class DuplicationSummaryHandler implements IHandler<DuplicationSummaryArgs> {
  constructor(
    @inject(TOKENS.ProjectManager) private readonly projectManager: IProjectManager
  ) {}

  async handle(args: DuplicationSummaryArgs, correlationId?: string): Promise<MCPResponse> {
    try {
      // Validate input
      const validatedArgs = validateInput(SonarGetDuplicationSummarySchema, args, 'sonar_get_duplication_summary');

      const service = new QualityAnalyzer(this.projectManager as any);

      // Get duplication summary
      const report = await service.getDuplicationSummary(
        {
          sortBy: validatedArgs.sortBy as any,
          maxResults: validatedArgs.maxResults,
          pageSize: validatedArgs.pageSize,
        },
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
            text: `Error getting duplication summary: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
}

/**
 * Handle get duplication summary MCP tool request
 *
 * @deprecated Use DuplicationSummaryHandler class with DI instead
 */
export async function handleGetDuplicationSummary(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  try {
    // Validate input
    const validatedArgs = validateInput(SonarGetDuplicationSummarySchema, args, 'sonar_get_duplication_summary');

    // Initialize dependencies (legacy approach)
    const projectManager = new ProjectManager();
    const service = new QualityAnalyzer(projectManager as any);

    // Get duplication summary
    const report = await service.getDuplicationSummary(
      {
        sortBy: validatedArgs.sortBy as any,
        maxResults: validatedArgs.maxResults,
        pageSize: validatedArgs.pageSize,
      },
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
          text: `Error getting duplication summary: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
