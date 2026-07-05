/**
 * Security Hotspots Handler
 *
 * MCP handler for sonar_get_security_hotspots tool.
 * Uses dependency injection for testability.
 */

import { SecurityAnalyzer } from '../../core/analysis/index.js';
import { IProjectManager } from '../../infrastructure/interfaces/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { validateInput, SonarGetSecurityHotspotsSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse } from '../../shared/types/index.js';
import { IHandler } from './IHandler.js';

/**
 * Arguments for security hotspots handler
 */
export interface SecurityHotspotsArgs {
  statuses?: string[];
  resolutions?: string[];
  severities?: string[];
}

/**
 * Injectable security hotspots handler class
 */
/**
 * Handle get security hotspots MCP tool request
 *
 */
export async function handleGetSecurityHotspots(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  // Validate input
  const validatedArgs = validateInput(SonarGetSecurityHotspotsSchema, args, 'sonar_get_security_hotspots');

  // Initialize dependencies (legacy approach)
  const projectManager = new ProjectManager();
  const service = new SecurityAnalyzer(projectManager as any);

  // Get security hotspots
  const report = await service.getSecurityHotspots(
    {
      statuses: validatedArgs.statuses,
      resolutions: validatedArgs.resolutions,
      severities: validatedArgs.severities,
    },
    correlationId
  );

  return {
    content: [{ type: 'text', text: report }],
  };
}
