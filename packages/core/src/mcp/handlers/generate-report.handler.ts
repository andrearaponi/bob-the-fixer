/**
 * Generate Report Handler
 *
 * MCP handler for sonar_generate_report tool.
 * Uses dependency injection for testability.
 */

import { injectable, inject } from 'tsyringe';
import { ReportGenerator } from '../../core/reporting/index.js';
import { IProjectManager } from '../../infrastructure/interfaces/index.js';
import { TOKENS } from '../../infrastructure/di/tokens.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { MCPResponse } from '../../shared/types/index.js';
import { getLogger } from '../../shared/logger/structured-logger.js';
import { IHandler } from './IHandler.js';

/**
 * Arguments for generate report handler
 */
export interface GenerateReportArgs {
  format?: 'summary' | 'detailed' | 'json';
}

/**
 * Injectable generate report handler class
 */
@injectable()
export class GenerateReportHandler implements IHandler<GenerateReportArgs> {
  constructor(
    @inject(TOKENS.ProjectManager) private readonly projectManager: IProjectManager
  ) {}

  async handle(args: GenerateReportArgs, correlationId?: string): Promise<MCPResponse> {
    const logger = getLogger();

    try {
      const { format = 'summary' } = args;

      const service = new ReportGenerator(this.projectManager as any);

      // Generate report
      const report = await service.generateReport(
        { format },
        correlationId
      );

      return {
        content: [{ type: 'text', text: report }],
      };
    } catch (error: any) {
      logger.error('Error generating report', error, {}, correlationId);
      return {
        content: [
          {
            type: 'text',
            text: `Report generation failed: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
}

/**
 * Handle generate report MCP tool request
 *
 * @deprecated Use GenerateReportHandler class with DI instead
 */
export async function handleGenerateReport(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  const logger = getLogger();

  try {
    const { format = 'summary' } = args;

    // Initialize dependencies (legacy approach)
    const projectManager = new ProjectManager();
    const service = new ReportGenerator(projectManager as any);

    // Generate report
    const report = await service.generateReport(
      { format },
      correlationId
    );

    return {
      content: [{ type: 'text', text: report }],
    };
  } catch (error: any) {
    logger.error('Error generating report', error, {}, correlationId);
    return {
      content: [
        {
          type: 'text',
          text: `Report generation failed: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
