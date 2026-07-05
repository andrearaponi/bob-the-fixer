/**
 * Security Hotspot Details Handler
 *
 * MCP handler for sonar_get_security_hotspot_details tool.
 * Uses dependency injection for testability.
 */

import { SecurityAnalyzer } from '../../core/analysis/index.js';
import { IProjectManager } from '../../infrastructure/interfaces/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { validateInput, SonarGetSecurityHotspotDetailsSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse } from '../../shared/types/index.js';
import { IHandler } from './IHandler.js';

/**
 * Arguments for security hotspot details handler
 */
export interface SecurityHotspotDetailsArgs {
  hotspotKey: string;
  includeRuleDetails?: boolean;
  includeFilePath?: boolean;
  contextLines?: number;
}

/**
 * Injectable security hotspot details handler class
 */
/**
 * Handle get security hotspot details MCP tool request
 *
 */
export async function handleGetSecurityHotspotDetails(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  // Validate input
  const validatedArgs = validateInput(SonarGetSecurityHotspotDetailsSchema, args, 'sonar_get_security_hotspot_details');

  // Initialize dependencies (legacy approach)
  const projectManager = new ProjectManager();
  const service = new SecurityAnalyzer(projectManager as any);

  // Get hotspot details
  const report = await service.getHotspotDetails(
    {
      hotspotKey: validatedArgs.hotspotKey,
      includeRuleDetails: validatedArgs.includeRuleDetails,
      includeFilePath: validatedArgs.includeFilePath,
      contextLines: validatedArgs.contextLines,
    },
    correlationId
  );

  return {
    content: [{ type: 'text', text: report }],
  };
}
