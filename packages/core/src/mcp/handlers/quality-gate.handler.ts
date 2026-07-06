/**
 * Quality Gate Handler
 *
 * MCP handler for sonar_get_quality_gate tool.
 * Uses dependency injection for testability.
 */

import { QualityAnalyzer } from '../../core/analysis/index.js';
import { IProjectManager } from '../../infrastructure/interfaces/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { MCPResponse } from '../../shared/types/index.js';
import { IHandler } from './IHandler.js';

/**
 * Arguments for quality gate handler
 */
export type QualityGateArgs = Record<string, never>;

/**
 * Injectable quality gate handler class
 */
/**
 * Handle get quality gate MCP tool request
 *
 */
export async function handleGetQualityGate(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  try {
    // Initialize dependencies (legacy approach)
    const projectManager = new ProjectManager();
    const service = new QualityAnalyzer(projectManager as any);

    // Get quality gate status
    const report = await service.getQualityGate(correlationId);

    return {
      content: [{ type: 'text', text: report }],
    };
  } catch (error: any) {
    const errorMsg = error?.message || 'Unknown error';
    return {
      content: [
        {
          type: 'text',
          text: `Quality Gate Status Error\n\n${errorMsg}`,
        },
      ],
      isError: true,
    };
  }
}
