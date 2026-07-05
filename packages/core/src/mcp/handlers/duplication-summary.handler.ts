/**
 * Duplication Summary Handler
 *
 * MCP handler for sonar_get_duplication_summary tool.
 * Uses dependency injection for testability.
 */

import { QualityAnalyzer } from '../../core/analysis/index.js';
import { IProjectManager } from '../../infrastructure/interfaces/index.js';
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
/**
 * Handle get duplication summary MCP tool request
 *
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
