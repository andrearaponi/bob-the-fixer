/**
 * Scanner Interfaces Module
 *
 * This module exports all scanner-related interfaces and types.
 */

// Issue types
export type {
  IIssue,
  IssueSeverity,
  IssueType,
  IssueStatus,
  IssueSource,
  IssueLocation,
  IssueRemediation,
  IssueFilter,
  IssueCountsByDimension,
  IssueSummary,
} from './IIssue.js';

// Scan result types
export type {
  IScanResult,
  ScanStatus,
  ScannerType,
  ScanParams,
  QualityGateCondition,
  QualityGateResult,
  ScanMetrics,
  SBOMReference,
  ScanRecord,
  ScanHistoryOptions,
} from './IScanResult.js';

// Scanner interface
export type {
  IScanner,
  IQueryableScanner,
  ScannerConfig,
  ScannerHealthStatus,
} from './IScanner.js';

// Base implementation + runtime helpers
export { BaseScannerImpl, isQueryableScanner } from './IScanner.js';

// Registry
export { ScannerRegistry } from './ScannerRegistry.js';
