/**
 * Security Hotspot Details Handler
 *
 * MCP handler for sonar_get_security_hotspot_details tool.
 * Uses dependency injection for testability.
 */

import { injectable, inject } from 'tsyringe';
import { SecurityAnalyzer } from '../../core/analysis/index.js';
import { IProjectManager } from '../../infrastructure/interfaces/index.js';
import { TOKENS } from '../../infrastructure/di/tokens.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { validateInput, SonarGetSecurityHotspotDetailsSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse } from '../../shared/types/index.js';
import { IHandler } from './IHandler.js';

/**
 * Arguments for security hotspot details handler
 */
export interface SecurityHotspotDetailsArgs {
  hotspotKey: string;
  includeRuleDetails?: boolean;
  includeFilePath?: boolean;
  contextLines?: number;
}

/**
 * Injectable security hotspot details handler class
 */
@injectable()
export class SecurityHotspotDetailsHandler implements IHandler<SecurityHotspotDetailsArgs> {
  constructor(
    @inject(TOKENS.ProjectManager) private readonly projectManager: IProjectManager
  ) {}

  async handle(args: SecurityHotspotDetailsArgs, correlationId?: string): Promise<MCPResponse> {
    // Validate input
    const validatedArgs = validateInput(SonarGetSecurityHotspotDetailsSchema, args, 'sonar_get_security_hotspot_details');

    const service = new SecurityAnalyzer(this.projectManager as any);

    // Get hotspot details
    const report = await service.getHotspotDetails(
      {
        hotspotKey: validatedArgs.hotspotKey,
        includeRuleDetails: validatedArgs.includeRuleDetails,
        includeFilePath: validatedArgs.includeFilePath,
        contextLines: validatedArgs.contextLines,
      },
      correlationId
    );

    return {
      content: [{ type: 'text', text: report }],
    };
  }
}

/**
 * Handle get security hotspot details MCP tool request
 *
 * @deprecated Use SecurityHotspotDetailsHandler class with DI instead
 */
export async function handleGetSecurityHotspotDetails(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  // Validate input
  const validatedArgs = validateInput(SonarGetSecurityHotspotDetailsSchema, args, 'sonar_get_security_hotspot_details');

  // Initialize dependencies (legacy approach)
  const projectManager = new ProjectManager();
  const service = new SecurityAnalyzer(projectManager as any);

  // Get hotspot details
  const report = await service.getHotspotDetails(
    {
      hotspotKey: validatedArgs.hotspotKey,
      includeRuleDetails: validatedArgs.includeRuleDetails,
      includeFilePath: validatedArgs.includeFilePath,
      contextLines: validatedArgs.contextLines,
    },
    correlationId
  );

  return {
    content: [{ type: 'text', text: report }],
  };
}
