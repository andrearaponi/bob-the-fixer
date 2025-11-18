/**
 * Thin MCP handler for sonar_auto_setup
 * Delegates to ProjectSetup service
 */

import { ProjectSetup } from '../../core/project/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { SonarAdmin } from '../../universal/sonar-admin.js';
import { validateInput, SonarAutoSetupSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse } from '../../shared/types/index.js';
import { sanitizeUrl } from '../../infrastructure/security/input-sanitization.js';

/**
 * Handle auto setup MCP tool request
 */
export async function handleAutoSetup(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  // Validate input
  const validatedArgs = validateInput(SonarAutoSetupSchema, args, 'sonar_auto_setup');

  // Initialize dependencies
  const projectManager = new ProjectManager();
  const sonarUrl = sanitizeUrl(process.env.SONAR_URL ?? 'http://localhost:9000');
  const sonarToken = process.env.SONAR_TOKEN;
  const sonarAdmin = new SonarAdmin(sonarUrl, sonarToken);

  // Create service and execute setup
  const service = new ProjectSetup(projectManager, sonarAdmin);
  const result = await service.execute(
    {
      force: validatedArgs.force,
      template: validatedArgs.template
    },
    correlationId
  );

  // Format result
  const text = ProjectSetup.formatSetupResult(result);

  return {
    content: [{ type: 'text', text }]
  };
}
