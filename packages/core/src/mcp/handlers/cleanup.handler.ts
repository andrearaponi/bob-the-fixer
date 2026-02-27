/**
 * Cleanup Handler
 *
 * MCP handler for sonar_cleanup tool.
 * Uses dependency injection for testability.
 */

import { injectable, inject } from 'tsyringe';
import { CleanupService } from '../../core/admin/index.js';
import { ISonarAdmin } from '../../infrastructure/interfaces/index.js';
import { TOKENS } from '../../infrastructure/di/tokens.js';
import { MCPResponse } from '../../shared/types/index.js';
import { sanitizeUrl } from '../../infrastructure/security/input-sanitization.js';
import { SonarAdmin } from '../../universal/sonar-admin.js';
import { IHandler } from './IHandler.js';

/**
 * Arguments for cleanup handler
 */
export interface CleanupArgs {
  olderThanDays?: number;
  dryRun?: boolean;
}

/**
 * Injectable cleanup handler class
 */
@injectable()
export class CleanupHandler implements IHandler<CleanupArgs> {
  constructor(
    @inject(TOKENS.SonarAdmin) private readonly sonarAdmin: ISonarAdmin
  ) {}

  async handle(args: CleanupArgs, correlationId?: string): Promise<MCPResponse> {
    const { olderThanDays = 30, dryRun = false } = args;

    const service = new CleanupService(this.sonarAdmin as any);

    const report = await service.cleanup(
      { olderThanDays, dryRun },
      correlationId
    );

    return {
      content: [{ type: 'text', text: report }],
    };
  }
}

/**
 * Handle cleanup MCP tool request
 *
 * @deprecated Use CleanupHandler class with DI instead
 */
export async function handleCleanup(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  const { olderThanDays = 30, dryRun = false } = args;

  // Initialize dependencies (legacy approach)
  const sonarUrl = sanitizeUrl(process.env.SONAR_URL ?? 'http://localhost:9000');
  const sonarToken = process.env.SONAR_TOKEN;
  const sonarAdmin = new SonarAdmin(sonarUrl, sonarToken);

  const service = new CleanupService(sonarAdmin as any);

  const report = await service.cleanup(
    { olderThanDays, dryRun },
    correlationId
  );

  return {
    content: [{ type: 'text', text: report }],
  };
}
