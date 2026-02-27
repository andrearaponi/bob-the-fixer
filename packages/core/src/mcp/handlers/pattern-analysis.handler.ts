/**
 * Pattern Analysis Handler
 *
 * MCP handler for sonar_analyze_patterns tool.
 * Uses dependency injection for testability.
 */

import { injectable, inject } from 'tsyringe';
import { PatternAnalysisService } from '../../core/analysis/index.js';
import { IProjectManager } from '../../infrastructure/interfaces/index.js';
import { TOKENS } from '../../infrastructure/di/tokens.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { validateInput, SonarAnalyzePatternsSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse } from '../../shared/types/index.js';
import { IHandler } from './IHandler.js';

/**
 * Arguments for pattern analysis handler
 */
export interface PatternAnalysisArgs {
  groupBy?: 'pattern' | 'file' | 'severity' | 'fixability';
  includeImpact?: boolean;
  includeCorrelations?: boolean;
}

/**
 * Injectable pattern analysis handler class
 */
@injectable()
export class PatternAnalysisHandler implements IHandler<PatternAnalysisArgs> {
  constructor(
    @inject(TOKENS.ProjectManager) private readonly projectManager: IProjectManager
  ) {}

  async handle(args: PatternAnalysisArgs, correlationId?: string): Promise<MCPResponse> {
    // Validate input
    const validatedArgs = validateInput(SonarAnalyzePatternsSchema, args, 'sonar_analyze_patterns');

    const service = new PatternAnalysisService(this.projectManager as any);

    // Analyze patterns
    const result = await service.analyze(
      {
        groupBy: validatedArgs.groupBy,
        includeImpact: validatedArgs.includeImpact,
        includeCorrelations: validatedArgs.includeCorrelations,
      },
      correlationId
    );

    return {
      content: [{ type: 'text', text: result.report }],
    };
  }
}

/**
 * Handle pattern analysis MCP tool request
 *
 * @deprecated Use PatternAnalysisHandler class with DI instead
 */
export async function handleAnalyzePatterns(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  // Validate input
  const validatedArgs = validateInput(SonarAnalyzePatternsSchema, args, 'sonar_analyze_patterns');

  // Initialize dependencies (legacy approach)
  const projectManager = new ProjectManager();
  const service = new PatternAnalysisService(projectManager as any);

  // Analyze patterns
  const result = await service.analyze(
    {
      groupBy: validatedArgs.groupBy,
      includeImpact: validatedArgs.includeImpact,
      includeCorrelations: validatedArgs.includeCorrelations,
    },
    correlationId
  );

  return {
    content: [{ type: 'text', text: result.report }],
  };
}
