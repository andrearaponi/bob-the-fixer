/**
 * Thin MCP handler for sonar_project_discovery
 * Delegates to ProjectDiscovery service
 */

import { ProjectDiscovery } from '../../core/project/index.js';
import { IProjectManager, ISonarAdmin } from '../../infrastructure/interfaces/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { SonarAdmin } from '../../universal/sonar-admin.js';
import { validateInput, SonarProjectDiscoverySchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse } from '../../shared/types/index.js';
import { sanitizeUrl } from '../../infrastructure/security/input-sanitization.js';
import { IHandler } from './IHandler.js';

/**
 * Arguments for project discovery handler
 */
export interface ProjectDiscoveryArgs {
  path?: string;
  deep?: boolean;
}

/**
 * Injectable project discovery handler class
 */
/**
 * Handle project discovery MCP tool request
 *
 */
export async function handleProjectDiscovery(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  // Validate input
  const validatedArgs = validateInput(SonarProjectDiscoverySchema, args, 'sonar_project_discovery');

  // Initialize dependencies (legacy approach)
  const projectManager = new ProjectManager();
  const sonarUrl = sanitizeUrl(process.env.SONAR_URL ?? 'http://localhost:9000');
  const sonarToken = process.env.SONAR_TOKEN;
  const sonarAdmin = new SonarAdmin(sonarUrl, sonarToken);

  // Create service and execute discovery
  const service = new ProjectDiscovery(projectManager, sonarAdmin);
  const result = await service.execute(
    {
      path: validatedArgs.path,
      deep: validatedArgs.deep
    },
    correlationId
  );

  // Format result
  const text = ProjectDiscovery.formatDiscoveryResult(result);

  return {
    content: [{ type: 'text', text }]
  };
}
