/**
 * Issue Details Handler
 *
 * MCP handler for sonar_get_issue_details tool.
 * Uses dependency injection for testability.
 */

import { IssueAnalyzer } from '../../core/analysis/index.js';
import { IProjectManager } from '../../infrastructure/interfaces/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { validateInput, SonarGetIssueDetailsSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse } from '../../shared/types/index.js';
import { IHandler } from './IHandler.js';

/**
 * Arguments for issue details handler
 */
export interface IssueDetailsArgs {
  issueKey: string;
  contextLines?: number;
  includeRuleDetails?: boolean;
  includeCodeExamples?: boolean;
  includeFilePath?: boolean;
  includeFileHeader?: boolean;
  headerMaxLines?: number;
  includeDataFlow?: 'auto' | boolean;
  maxFlows?: number;
  maxFlowSteps?: number;
  flowContextLines?: number;
  includeSimilarFixed?: boolean;
  maxSimilarIssues?: number;
  includeRelatedTests?: boolean;
  includeCoverageHints?: boolean;
  includeScmHints?: boolean;
}

/**
 * Injectable issue details handler class
 */
/**
 * Handle get issue details MCP tool request
 *
 */
export async function handleGetIssueDetails(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  // Validate input
  const validatedArgs = validateInput(SonarGetIssueDetailsSchema, args, 'sonar_get_issue_details');

  // Initialize dependencies (legacy approach)
  const projectManager = new ProjectManager();
  const service = new IssueAnalyzer(projectManager as any);

  // Get issue details
  const report = await service.getIssueDetails(
    {
      issueKey: validatedArgs.issueKey,
      contextLines: validatedArgs.contextLines,
      includeRuleDetails: validatedArgs.includeRuleDetails,
      includeCodeExamples: validatedArgs.includeCodeExamples,
      includeFilePath: validatedArgs.includeFilePath,
      includeFileHeader: validatedArgs.includeFileHeader,
      headerMaxLines: validatedArgs.headerMaxLines,
      includeDataFlow: validatedArgs.includeDataFlow,
      maxFlows: validatedArgs.maxFlows,
      maxFlowSteps: validatedArgs.maxFlowSteps,
      flowContextLines: validatedArgs.flowContextLines,
      includeSimilarFixed: validatedArgs.includeSimilarFixed,
      maxSimilarIssues: validatedArgs.maxSimilarIssues,
      includeRelatedTests: validatedArgs.includeRelatedTests,
      includeCoverageHints: validatedArgs.includeCoverageHints,
      includeScmHints: validatedArgs.includeScmHints,
    },
    correlationId
  );

  return {
    content: [{ type: 'text', text: report }],
  };
}
