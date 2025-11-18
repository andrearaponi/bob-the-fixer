/**
 * Thin MCP handler for sonar_analyze_patterns
 * Delegates to PatternAnalysisService
 */

import { PatternAnalysisService } from '../../core/analysis/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { validateInput, SonarAnalyzePatternsSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse } from '../../shared/types/index.js';

/**
 * Handle pattern analysis MCP tool request
 */
export async function handleAnalyzePatterns(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  // Validate input
  const validatedArgs = validateInput(SonarAnalyzePatternsSchema, args, 'sonar_analyze_patterns');

  // Initialize dependencies
  const projectManager = new ProjectManager();
  const service = new PatternAnalysisService(projectManager);

  // Analyze patterns
  const result = await service.analyze(
    {
      groupBy: validatedArgs.groupBy,
      includeImpact: validatedArgs.includeImpact,
      includeCorrelations: validatedArgs.includeCorrelations
    },
    correlationId
  );

  return {
    content: [{ type: 'text', text: result.report }]
  };
}
