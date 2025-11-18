/**
 * Thin MCP handler for sonar_cleanup
 * Delegates to CleanupService
 */

import { CleanupService } from '../../core/admin/index.js';
import { SonarAdmin } from '../../universal/sonar-admin.js';
import { MCPResponse } from '../../shared/types/index.js';
import { sanitizeUrl } from '../../infrastructure/security/input-sanitization.js';

/**
 * Handle cleanup MCP tool request
 */
export async function handleCleanup(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  const { olderThanDays = 30, dryRun = false } = args;

  // Initialize dependencies
  const sonarUrl = sanitizeUrl(process.env.SONAR_URL ?? 'http://localhost:9000');
  const sonarToken = process.env.SONAR_TOKEN;
  const sonarAdmin = new SonarAdmin(sonarUrl, sonarToken);

  const service = new CleanupService(sonarAdmin);

  // Run cleanup
  const report = await service.cleanup(
    { olderThanDays, dryRun },
    correlationId
  );

  return {
    content: [{ type: 'text', text: report }]
  };
}
