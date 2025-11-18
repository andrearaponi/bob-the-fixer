/**
 * Thin MCP handler for sonar_get_project_metrics
 * Delegates to QualityAnalyzer service
 */

import { QualityAnalyzer } from '../../core/analysis/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { validateInput, SonarGetProjectMetricsSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse } from '../../shared/types/index.js';
import { getLogger } from '../../shared/logger/structured-logger.js';

/**
 * Handle get project metrics MCP tool request
 */
export async function handleGetProjectMetrics(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  const logger = getLogger();

  try {
    // Validate input
    const validatedArgs = validateInput(SonarGetProjectMetricsSchema, args, 'sonar_get_project_metrics');

    // Initialize dependencies
    const projectManager = new ProjectManager();
    const service = new QualityAnalyzer(projectManager);

    // Get project metrics
    const report = await service.getProjectMetrics(
      {
        metrics: validatedArgs.metrics
      },
      correlationId
    );

    return {
      content: [{ type: 'text', text: report }]
    };
  } catch (error: any) {
    logger.error('Error fetching project metrics', error, {}, correlationId);
    return {
      content: [{
        type: 'text',
        text: `Error fetching project metrics: ${error.message}`
      }],
      isError: true
    };
  }
}
