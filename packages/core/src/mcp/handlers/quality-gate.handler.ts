/**
 * Thin MCP handler for sonar_get_quality_gate
 * Delegates to QualityAnalyzer service
 */

import { QualityAnalyzer } from '../../core/analysis/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { MCPResponse } from '../../shared/types/index.js';

/**
 * Handle get quality gate MCP tool request
 */
export async function handleGetQualityGate(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  try {
    // Initialize dependencies
    const projectManager = new ProjectManager();
    const service = new QualityAnalyzer(projectManager);

    // Get quality gate status
    const report = await service.getQualityGate(correlationId);

    return {
      content: [{ type: 'text', text: report }]
    };
  } catch (error: any) {
    const errorMsg = error?.message || 'Unknown error';
    return {
      content: [{
        type: 'text',
        text: `Quality Gate Status Error\n\n${errorMsg}`
      }],
      isError: true
    };
  }
}
