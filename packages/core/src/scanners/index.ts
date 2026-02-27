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
  ScannerConfig,
  ScannerHealthStatus,
  IScannerFactory,
} from './IScanner.js';

// Base implementation
export { BaseScannerImpl } from './IScanner.js';
