/**
 * Thin MCP handler for sonar_get_security_hotspot_details
 * Delegates to SecurityAnalyzer service
 */

import { SecurityAnalyzer } from '../../core/analysis/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { validateInput, SonarGetSecurityHotspotDetailsSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse } from '../../shared/types/index.js';

/**
 * Handle get security hotspot details MCP tool request
 */
export async function handleGetSecurityHotspotDetails(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  // Validate input
  const validatedArgs = validateInput(SonarGetSecurityHotspotDetailsSchema, args, 'sonar_get_security_hotspot_details');

  // Initialize dependencies
  const projectManager = new ProjectManager();
  const service = new SecurityAnalyzer(projectManager);

  // Get hotspot details
  const report = await service.getHotspotDetails(
    {
      hotspotKey: validatedArgs.hotspotKey,
      includeRuleDetails: validatedArgs.includeRuleDetails,
      includeFilePath: validatedArgs.includeFilePath,
      contextLines: validatedArgs.contextLines
    },
    correlationId
  );

  return {
    content: [{ type: 'text', text: report }]
  };
}
