/**
 * Scan Result Interface
 *
 * Represents the result of a security scan from any scanner.
 */

import { IIssue, IssueSummary, IssueSource } from './IIssue.js';

/**
 * Scan status
 */
export type ScanStatus =
  | 'PENDING' // Scan is queued
  | 'RUNNING' // Scan is in progress
  | 'COMPLETED' // Scan completed successfully
  | 'FAILED' // Scan failed
  | 'CANCELLED'; // Scan was cancelled

/**
 * Scanner type classification
 */
export type ScannerType = 'sast' | 'sca' | 'unified';

/**
 * Scan parameters
 */
export interface ScanParams {
  /** Path to the project to scan */
  projectPath: string;

  /** Project key/identifier */
  projectKey?: string;

  /** Project name */
  projectName?: string;

  /** Branch to scan */
  branch?: string;

  /** Additional scanner-specific options */
  options?: Record<string, unknown>;
}

/**
 * Quality gate condition result
 */
export interface QualityGateCondition {
  /** Metric being measured */
  metric: string;

  /** Comparison operator */
  operator: 'LT' | 'GT' | 'EQ' | 'NE';

  /** Threshold value */
  threshold: string;

  /** Actual value */
  actualValue: string;

  /** Whether condition passed */
  passed: boolean;
}

/**
 * Quality gate result
 */
export interface QualityGateResult {
  /** Overall status */
  status: 'OK' | 'WARN' | 'ERROR';

  /** Individual conditions */
  conditions: QualityGateCondition[];
}

/**
 * Scan metrics
 */
export interface ScanMetrics {
  /** Number of files scanned */
  filesScanned: number;

  /** Lines of code analyzed */
  linesOfCode?: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Scanner-specific metrics */
  custom?: Record<string, number | string>;
}

/**
 * SBOM (Software Bill of Materials) reference
 */
export interface SBOMReference {
  /** SBOM format (cyclonedx, spdx) */
  format: 'cyclonedx' | 'spdx';

  /** SBOM version */
  version: string;

  /** Path to SBOM file */
  filePath?: string;

  /** Total number of components */
  componentCount: number;
}

/**
 * Scan result from any scanner
 */
export interface IScanResult {
  /** Unique scan identifier */
  scanId: string;

  /** Scanner that performed the scan */
  source: IssueSource;

  /** Scanner type */
  scannerType: ScannerType;

  /** Scan status */
  status: ScanStatus;

  /** When the scan started */
  startedAt: string;

  /** When the scan completed */
  completedAt?: string;

  /** Project that was scanned */
  project: {
    key: string;
    name: string;
    path: string;
  };

  /** Branch that was scanned */
  branch?: string;

  /** Issues found during the scan */
  issues: IIssue[];

  /** Summary of issues */
  summary: IssueSummary;

  /** Scan metrics */
  metrics: ScanMetrics;

  /** Quality gate result (if applicable) */
  qualityGate?: QualityGateResult;

  /** SBOM reference (for SCA scans) */
  sbom?: SBOMReference;

  /** Error message if scan failed */
  errorMessage?: string;

  /** Scanner-specific raw output */
  rawOutput?: unknown;
}

/**
 * Lightweight scan record for persistence/history
 */
export interface ScanRecord {
  /** Unique scan identifier */
  scanId: string;

  /** Project key */
  projectKey: string;

  /** Scanner source */
  source: IssueSource;

  /** Scanner type */
  scannerType: ScannerType;

  /** Scan status */
  status: ScanStatus;

  /** When the scan was performed */
  scannedAt: string;

  /** Summary statistics */
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };

  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Options for retrieving scan history
 */
export interface ScanHistoryOptions {
  /** Project key to filter by */
  projectKey?: string;

  /** Scanner source to filter by */
  source?: IssueSource;

  /** Scanner type to filter by */
  scannerType?: ScannerType;

  /** Maximum number of records */
  limit?: number;

  /** Offset for pagination */
  offset?: number;

  /** Start date for filtering */
  startDate?: string;

  /** End date for filtering */
  endDate?: string;
}
