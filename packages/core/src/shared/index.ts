/**
 * Shared module exports
 * Provides centralized access to all shared functionality
 */

// Types
export * from './types/index.js';

// Errors
export * from './errors/custom-errors.js';

// Logger
export * from './logger/structured-logger.js';
export * from './logger/mcp-logger.js';

// Version checker
export * from './version/index.js';

// Validators (exports separately to avoid naming conflicts)
export {
  validateInput,
  validateEnvironment,
  SonarAutoSetupSchema,
  SonarProjectDiscoverySchema,
  SonarScanProjectSchema,
  SonarGetIssueDetailsSchema,
  SonarGetSecurityHotspotsSchema,
  SonarGetSecurityHotspotDetailsSchema,
  SonarGetProjectMetricsSchema,
  SonarGetDuplicationSummarySchema,
  SonarGetDuplicationDetailsSchema,
  SonarGetTechnicalDebtSchema,
  SonarAnalyzePatternsSchema
} from './validators/mcp-schemas.js';
