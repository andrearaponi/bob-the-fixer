/**
 * Thin MCP handler for sonar_get_issue_details
 * Delegates to IssueAnalyzer service
 */

import { IssueAnalyzer } from '../../core/analysis/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { validateInput, SonarGetIssueDetailsSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse } from '../../shared/types/index.js';

/**
 * Handle get issue details MCP tool request
 */
export async function handleGetIssueDetails(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  // Validate input
  const validatedArgs = validateInput(SonarGetIssueDetailsSchema, args, 'sonar_get_issue_details');

  // Initialize dependencies
  const projectManager = new ProjectManager();
  const service = new IssueAnalyzer(projectManager);

  // Get issue details
  const report = await service.getIssueDetails(
    {
      issueKey: validatedArgs.issueKey,
      contextLines: validatedArgs.contextLines,
      includeRuleDetails: validatedArgs.includeRuleDetails,
      includeCodeExamples: validatedArgs.includeCodeExamples,
      includeFilePath: validatedArgs.includeFilePath
    },
    correlationId
  );

  return {
    content: [{ type: 'text', text: report }]
  };
}
