/**
 * Thin MCP handler for sonar_get_coverage_gaps
 * Delegates to CoverageAnalyzer service
 */

import { CoverageAnalyzer } from '../../core/analysis/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { SonarQubeClient } from '../../sonar/index.js';
import { validateInput, SonarGetCoverageGapsSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse } from '../../shared/types/index.js';

/**
 * Handle get coverage gaps MCP tool request
 */
export async function handleGetCoverageGaps(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  // Validate input
  const validatedArgs = validateInput(SonarGetCoverageGapsSchema, args, 'sonar_get_coverage_gaps');

  // Initialize dependencies
  const projectManager = new ProjectManager();
  const config = await projectManager.getOrCreateConfig();
  const projectContext = await projectManager.analyzeProject();

  const sonarClient = new SonarQubeClient(
    config.sonarUrl,
    config.sonarToken,
    config.sonarProjectKey,
    projectContext
  );

  // Fetch line coverage from SonarQube
  const lineCoverage = await sonarClient.getLineCoverage(validatedArgs.componentKey);

  // Analyze coverage gaps
  const analyzer = new CoverageAnalyzer();
  const result = analyzer.analyzeCoverage(validatedArgs.componentKey, lineCoverage);

  // Return the summary (already formatted for LLM)
  return {
    content: [{ type: 'text', text: result.summary }]
  };
}
