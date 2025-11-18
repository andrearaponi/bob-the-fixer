/**
 * Thin MCP handler for sonar_diagnose_permissions
 * Delegates to DiagnosticsService
 */

import { DiagnosticsService } from '../../core/admin/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { SonarAdmin } from '../../universal/sonar-admin.js';
import { MCPResponse } from '../../shared/types/index.js';
import { sanitizeUrl } from '../../infrastructure/security/input-sanitization.js';

/**
 * Handle diagnose permissions MCP tool request
 */
export async function handleDiagnosePermissions(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  try {
    const { verbose = true } = args;

    // Initialize dependencies
    const projectManager = new ProjectManager();
    const sonarUrl = sanitizeUrl(process.env.SONAR_URL ?? 'http://localhost:9000');
    const sonarToken = process.env.SONAR_TOKEN;
    const sonarAdmin = new SonarAdmin(sonarUrl, sonarToken);

    const service = new DiagnosticsService(projectManager, sonarAdmin);

    // Run diagnostics
    const report = await service.diagnose({ verbose }, correlationId);

    return {
      content: [{ type: 'text', text: report }]
    };
  } catch (error: any) {
    return {
      content: [{
        type: 'text',
        text: `DIAGNOSTIC ERROR: ${error.message}`
      }]
    };
  }
}
