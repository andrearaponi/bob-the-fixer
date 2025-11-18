/**
 * Thin MCP handler for sonar_get_security_hotspots
 * Delegates to SecurityAnalyzer service
 */

import { SecurityAnalyzer } from '../../core/analysis/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { validateInput, SonarGetSecurityHotspotsSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse } from '../../shared/types/index.js';

/**
 * Handle get security hotspots MCP tool request
 */
export async function handleGetSecurityHotspots(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  // Validate input
  const validatedArgs = validateInput(SonarGetSecurityHotspotsSchema, args, 'sonar_get_security_hotspots');

  // Initialize dependencies
  const projectManager = new ProjectManager();
  const service = new SecurityAnalyzer(projectManager);

  // Get security hotspots
  const report = await service.getSecurityHotspots(
    {
      statuses: validatedArgs.statuses,
      resolutions: validatedArgs.resolutions,
      severities: validatedArgs.severities
    },
    correlationId
  );

  return {
    content: [{ type: 'text', text: report }]
  };
}
