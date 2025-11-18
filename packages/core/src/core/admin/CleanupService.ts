/**
 * CleanupService
 * Handles cleanup of old projects and tokens
 */

import { SonarAdmin } from '../../universal/sonar-admin.js';
import { getLogger, StructuredLogger } from '../../shared/logger/structured-logger.js';

export interface CleanupOptions {
  olderThanDays?: number;
  dryRun?: boolean;
}

export interface CleanupResult {
  revokedTokens: string[];
  deletedProjects: string[];
}

export class CleanupService {
  private readonly logger: StructuredLogger;

  constructor(private readonly sonarAdmin: SonarAdmin) {
    this.logger = getLogger();
  }

  /**
   * Clean up old resources
   */
  async cleanup(
    options: CleanupOptions,
    correlationId?: string
  ): Promise<string> {
    const olderThanDays = options.olderThanDays ?? 30;
    const dryRun = options.dryRun ?? false;

    this.logger.info('Running cleanup', { olderThanDays, dryRun }, correlationId);

    if (dryRun) {
      return `CLEANUP DRY RUN\n\n` +
             `Would clean up resources older than ${olderThanDays} days.\n\n` +
             `Note: Cleanup functionality is not fully implemented yet.`;
    }

    const result = await this.sonarAdmin.cleanup(olderThanDays);

    return `CLEANUP COMPLETE\n\n` +
           `Tokens Revoked: ${result.revokedTokens.length}\n` +
           `Projects Deleted: ${result.deletedProjects.length}\n\n` +
           `Cleaned up resources older than ${olderThanDays} days.`;
  }
}
