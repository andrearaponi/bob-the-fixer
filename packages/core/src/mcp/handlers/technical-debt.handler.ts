/**
 * Technical Debt Handler
 *
 * MCP handler for sonar_get_technical_debt tool.
 * Uses dependency injection for testability.
 */

import { QualityAnalyzer } from '../../core/analysis/index.js';
import { IProjectManager } from '../../infrastructure/interfaces/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { validateInput, SonarGetTechnicalDebtSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse } from '../../shared/types/index.js';
import { IHandler } from './IHandler.js';

/**
 * Arguments for technical debt handler
 */
export interface TechnicalDebtArgs {
  includeBudgetAnalysis?: boolean;
}

/**
 * Injectable technical debt handler class
 */
/**
 * Handle get technical debt MCP tool request
 *
 */
export async function handleGetTechnicalDebt(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  try {
    // Validate input
    const validatedArgs = validateInput(SonarGetTechnicalDebtSchema, args, 'sonar_get_technical_debt');

    // Initialize dependencies (legacy approach)
    const projectManager = new ProjectManager();
    const service = new QualityAnalyzer(projectManager as any);

    // Get technical debt analysis
    const report = await service.getTechnicalDebt(
      {
        includeBudgetAnalysis: validatedArgs.includeBudgetAnalysis,
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
          text: `Error getting technical debt analysis: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
