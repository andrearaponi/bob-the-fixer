/**
 * Thin MCP handler for sonar_get_technical_debt
 * Delegates to QualityAnalyzer service
 */

import { QualityAnalyzer } from '../../core/analysis/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { validateInput, SonarGetTechnicalDebtSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse } from '../../shared/types/index.js';

/**
 * Handle get technical debt MCP tool request
 */
export async function handleGetTechnicalDebt(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  try {
    // Validate input
    const validatedArgs = validateInput(SonarGetTechnicalDebtSchema, args, 'sonar_get_technical_debt');

    // Initialize dependencies
    const projectManager = new ProjectManager();
    const service = new QualityAnalyzer(projectManager);

    // Get technical debt analysis
    const report = await service.getTechnicalDebt(
      {
        includeBudgetAnalysis: validatedArgs.includeBudgetAnalysis
      },
      correlationId
    );

    return {
      content: [{ type: 'text', text: report }]
    };
  } catch (error: any) {
    return {
      content: [{
        type: 'text',
        text: `Error getting technical debt analysis: ${error.message}`
      }],
      isError: true
    };
  }
}
